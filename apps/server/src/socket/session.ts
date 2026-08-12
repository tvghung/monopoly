import {
  joinRoomRequestSchema,
  resumeSessionRequestSchema,
  type JoinRoomResult,
  type ResumeSessionResult,
} from '@monopoly/shared';
import {
  armDisconnectedCurrentPlayer,
  reconcileTurnPresence,
  recoverRoomIfDue,
} from '../services/deadlineScheduler';
import { projectPrivateOffer } from '../services/privateOffers';
import { projectPrivatePlayerState, projectPublicRoomState } from '../services/publicState';
import type { AppRuntime } from '../services/runtime';
import { assertSupportedRoomSnapshot } from '../rooms';
import {
  broadcastRoomById,
  privatePlayerRoomName,
  publicRoomName,
} from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

const ADMISSION_RATE_WINDOW_MS = 60_000;
// Leave room for a full seven-player lobby behind one NAT while still capping
// unauthenticated pending-row creation from a single peer.
const MAX_ADMISSIONS_PER_WINDOW = 30;

// Admission attempts are limited per runtime and peer address, not merely per
// Socket.IO object. This prevents opening a fresh socket for every pending row
// while keeping the limiter process-local like the rest of the connection
// registry (the deployment contract is one live process).
const admissionAttemptsByRuntime = new WeakMap<AppRuntime, Map<string, number[]>>();

function peerAdmissionAttempts(runtime: AppRuntime, socket: AppSocket): number[] {
  const byAddress = admissionAttemptsByRuntime.get(runtime) ?? new Map<string, number[]>();
  admissionAttemptsByRuntime.set(runtime, byAddress);
  const address = socket.handshake.address || 'unknown-peer';
  const attempts = byAddress.get(address) ?? [];
  byAddress.set(address, attempts);
  return attempts;
}

export function registerSessionHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  const admissionAttempts = peerAdmissionAttempts(runtime, socket);

  socket.on('join room', async (rawRequest, acknowledge) => {
    let ownsAdmissionLock = false;
    try {
      if (socket.data.role) {
        throw new CommandError('CONFLICT', 'This socket has already joined a room.');
      }
      if (socket.data.pendingAdmission) {
        throw new CommandError(
          'CONFLICT',
          'This connection already has a pending admission.',
          true,
        );
      }
      const now = Date.now();
      while (
        admissionAttempts[0] !== undefined
        && admissionAttempts[0] <= now - ADMISSION_RATE_WINDOW_MS
      ) {
        admissionAttempts.shift();
      }
      if (admissionAttempts.length >= MAX_ADMISSIONS_PER_WINDOW) {
        throw new CommandError(
          'CONFLICT',
          'Too many room admission attempts. Please wait and try again.',
          true,
        );
      }
      admissionAttempts.push(now);
      socket.data.pendingAdmission = true;
      ownsAdmissionLock = true;
      const request = parsePayload(joinRoomRequestSchema, rawRequest);
      const admission = await runtime.sessions.beginAdmission(request.name, request.roomCode);
      if (admission.kind === 'PENDING') {
        ownsAdmissionLock = false;
        const result: JoinRoomResult = {
          kind: 'PENDING',
          role: 'PLAYER',
          token: admission.token,
          expiresAt: admission.expiresAt.toISOString(),
        };
        acknowledge(successAck(result));
        return;
      }

      socket.data.roomId = admission.room.id;
      socket.data.role = 'SPECTATOR';
      delete socket.data.pendingAdmission;
      ownsAdmissionLock = false;
      await socket.join(publicRoomName(admission.room.id));
      await recoverRoomIfDue(io, runtime, admission.room.id);
      const room = await runtime.persistence.rooms.findById(admission.room.id);
      if (!room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      const result: JoinRoomResult = {
        kind: 'SPECTATOR',
        role: 'SPECTATOR',
        playerId: null,
        room: projectPublicRoomState(room, runtime.connections),
      };
      acknowledge(successAck(result, room.aggregateVersion));
    } catch (error) {
      if (ownsAdmissionLock) delete socket.data.pendingAdmission;
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('resume session', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(resumeSessionRequestSchema, rawRequest);
      const resumed = await runtime.sessions.resume(request.token);
      if (socket.data.playerId && socket.data.playerId !== resumed.playerId) {
        throw new CommandError('CONFLICT', 'This socket is already bound to another player.');
      }

      const previousRoomId = socket.data.roomId;
      let active: ReturnType<typeof runtime.connections.activate> | undefined;
      await runtime.commands.execute(
        resumed.room.id,
        async ({ original, transaction }) => {
          assertSupportedRoomSnapshot(original);
          const latestSession = await transaction.playerSessions.findById(resumed.session.id);
          const member = original.gameSnapshot.members[resumed.playerId];
          if (
            !latestSession
            || latestSession.status !== 'ACTIVE'
            || latestSession.roomId !== original.id
            || latestSession.playerId !== resumed.playerId
            || !member
            || member.membershipStatus === 'LEFT'
          ) {
            throw new CommandError(
              'SESSION_REVOKED',
              'This player session is no longer active.',
            );
          }
        },
        {
          persistRoom: false,
          afterCommit: () => {
            active = runtime.connections.activate(resumed.playerId, socket.id);
          },
        },
      );
      if (!active) throw new CommandError('INTERNAL_ERROR', 'Session binding failed.');
      // A second resume on the same socket can be queued behind this one. Do
      // not let an older handler overwrite SocketData after a newer generation
      // has already won the registry race.
      if (!runtime.connections.isCurrent(resumed.playerId, socket.id, active.generation)) {
        throw new CommandError('SESSION_REPLACED', 'This connection is no longer active.');
      }

      socket.data.roomId = resumed.room.id;
      socket.data.playerId = resumed.playerId;
      socket.data.role = 'PLAYER';
      socket.data.sessionId = resumed.session.id;
      socket.data.connectionGeneration = active.generation;
      delete socket.data.pendingAdmission;
      if (previousRoomId && previousRoomId !== resumed.room.id) {
        await socket.leave(publicRoomName(previousRoomId));
      }
      await Promise.all([
        socket.join(publicRoomName(resumed.room.id)),
        socket.join(privatePlayerRoomName(resumed.playerId)),
      ]);

      if (active.replacedSocketId) {
        const replaced = io.sockets.sockets.get(active.replacedSocketId);
        if (replaced) {
          replaced.emit('session replaced', {
            code: 'SESSION_REPLACED',
            message: 'This player session was resumed from a newer connection.',
          });
          replaced.disconnect(true);
        }
      }

      await reconcileTurnPresence(io, runtime, resumed.room.id, resumed.playerId);
      const room = await runtime.persistence.rooms.findById(resumed.room.id);
      if (!room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      const offerRecords = await runtime.persistence.tradeOffers.listPendingForPlayer(
        room.id,
        resumed.playerId,
      );
      const result: ResumeSessionResult = {
        role: 'PLAYER',
        playerId: resumed.playerId,
        room: projectPublicRoomState(room, runtime.connections),
        pendingOffers: offerRecords.map((offer) => projectPrivateOffer(offer, room)),
        privatePlayerState: projectPrivatePlayerState(room, resumed.playerId),
      };
      acknowledge(successAck(result, room.aggregateVersion));
      await broadcastRoomById(io, runtime, room.id);
    } catch (error) {
      if (
        error instanceof CommandError
        && [
          'SESSION_INVALID',
          'SESSION_REVOKED',
          'SESSION_EXPIRED',
          'ROOM_GONE',
          'GAME_ALREADY_STARTED',
          'ROOM_FULL',
        ].includes(error.code)
      ) {
        delete socket.data.pendingAdmission;
      }
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('disconnect', () => {
    const { playerId, roomId, connectionGeneration } = socket.data;
    // A pending two-step admission is socket-scoped. If the transport goes
    // away before activation, release that guard so the reconnect can either
    // resume the token it received or start a fresh admission.
    if (!playerId) delete socket.data.pendingAdmission;
    if (!playerId || !roomId || connectionGeneration === undefined) return;
    const deactivated = runtime.connections.deactivate(
      playerId,
      socket.id,
      connectionGeneration,
    );
    if (!deactivated || runtime.flags.shuttingDown) return;

    void armDisconnectedCurrentPlayer(io, runtime, roomId, playerId)
      .then(() => broadcastRoomById(io, runtime, roomId))
      .catch((error: unknown) => console.error('Disconnect recovery failed', error));
  });
}
