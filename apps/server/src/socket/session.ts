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
import type { AdmissionLimiter } from './admissionLimiter';
import {
  broadcastRoom,
  broadcastRoomById,
  privatePlayerRoomName,
  publicRoomName,
} from './broadcast';
import { clientKey } from './clientIdentity';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

// Behind a Cloudflare tunnel every visitor reaches the game port from the local
// connector, so the TCP peer cannot tell them apart. Admissions are limited per
// connection, per trusted client key (see clientIdentity.ts) and process-wide.
const CONNECTION_ADMISSION_WINDOW_MS = 60_000;
const MAX_ADMISSIONS_PER_CONNECTION = 8;

export interface SessionHandlerOptions {
  /** Whether this join request may create its room (Host authorization, never the peer address). */
  canCreateRoom: (roomCode: string, capability?: string) => boolean;
  admissions: AdmissionLimiter;
  /** See `tunnelHeaderTrusted`: only an Online Host trusts its local connector's visitor header. */
  trustTunnelHeader: boolean;
}

export function registerSessionHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
  options: SessionHandlerOptions,
): void {
  const connectionAttempts: number[] = [];
  const client = clientKey(socket.handshake.address, socket.handshake.headers, options.trustTunnelHeader);

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
        connectionAttempts[0] !== undefined
        && connectionAttempts[0] <= now - CONNECTION_ADMISSION_WINDOW_MS
      ) {
        connectionAttempts.shift();
      }
      if (
        connectionAttempts.length >= MAX_ADMISSIONS_PER_CONNECTION
        || options.admissions.attempt(client) !== 'ADMIT'
      ) {
        throw new CommandError(
          'CONFLICT',
          'Too many room admission attempts. Please wait and try again.',
          true,
        );
      }
      connectionAttempts.push(now);
      socket.data.pendingAdmission = true;
      ownsAdmissionLock = true;
      const request = parsePayload(joinRoomRequestSchema, rawRequest);
      const admission = await runtime.sessions.beginAdmission(
        request.name,
        request.roomCode,
        new Date(),
        options.canCreateRoom(request.roomCode, request.hostCapability),
      );
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

  // Only failed-operation room cleanup is serialized. Valid overlapping resumes can
  // still establish newer generations without waiting for an older session/join.
  let resumeRoomCleanup = Promise.resolve();

  socket.on('resume session', async (rawRequest, acknowledge) => {
    // Arrival order is independent of how long token validation or the room FIFO takes.
    const attempt = runtime.connections.beginResumeAttempt();
    let bound: { playerId: string; roomId: string; generation: number } | undefined;
    let acknowledged = false;
    const isLive = () => socket.connected && io.sockets.sockets.get(socket.id) === socket;
    const isCurrent = () => isLive() && bound !== undefined
      && runtime.connections.isCurrent(bound.playerId, socket.id, bound.generation);
    const assertLive = () => {
      if (!isLive()) throw new CommandError('SESSION_REPLACED', 'This connection is no longer active.');
    };
    const assertCurrent = () => {
      if (!isCurrent()) throw new CommandError('SESSION_REPLACED', 'This connection is no longer active.');
    };
    try {
      const request = parsePayload(resumeSessionRequestSchema, rawRequest);
      assertLive();
      const resumed = await runtime.sessions.resume(request.token);
      assertLive();
      if (socket.data.playerId && socket.data.playerId !== resumed.playerId) {
        throw new CommandError('CONFLICT', 'This socket is already bound to another player.');
      }

      const previousRoomId = socket.data.roomId;
      await runtime.commands.execute(
        resumed.room.id,
        async ({ original, transaction }) => {
          assertLive();
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
            throw new CommandError('SESSION_REVOKED', 'This player session is no longer active.');
          }
        },
        {
          persistRoom: false,
          afterCommit: () => {
            // No await separates liveness, ownership, SocketData and replacement. A disconnect
            // immediately after this block can therefore deactivate exactly this generation.
            assertLive();
            if (socket.data.playerId && socket.data.playerId !== resumed.playerId) {
              throw new CommandError('CONFLICT', 'This socket is already bound to another player.');
            }
            const active = runtime.connections.activateResume(resumed.playerId, socket.id, attempt);
            if (!active) throw new CommandError('SESSION_REPLACED', 'This connection is no longer active.');
            bound = { playerId: resumed.playerId, roomId: resumed.room.id, generation: active.generation };
            socket.data.roomId = resumed.room.id;
            socket.data.playerId = resumed.playerId;
            socket.data.role = 'PLAYER';
            socket.data.sessionId = resumed.session.id;
            socket.data.connectionGeneration = active.generation;
            delete socket.data.pendingAdmission;

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
          },
        },
      );
      assertCurrent();
      await resumeRoomCleanup;
      assertCurrent();
      if (previousRoomId && previousRoomId !== resumed.room.id) {
        await socket.leave(publicRoomName(previousRoomId));
        assertCurrent();
      }
      // Sequential joins leave no sibling join promise that could re-add a cancelled subscription.
      await socket.join(publicRoomName(resumed.room.id));
      assertCurrent();
      await socket.join(privatePlayerRoomName(resumed.playerId));
      assertCurrent();

      await reconcileTurnPresence(io, runtime, resumed.room.id, resumed.playerId, new Date(), isCurrent);
      assertCurrent();
      // Final validation, private reads and ACK stay in the room FIFO. A leave/kick
      // cannot invalidate this player between validation and successful publication.
      await runtime.commands.execute(resumed.room.id, async ({ original, transaction }) => {
        assertCurrent();
        const latestSession = await transaction.playerSessions.findById(resumed.session.id);
        const member = original.gameSnapshot.members[resumed.playerId];
        if (!latestSession || latestSession.status !== 'ACTIVE'
          || latestSession.roomId !== original.id || latestSession.playerId !== resumed.playerId
          || !member || member.membershipStatus === 'LEFT') {
          throw new CommandError('SESSION_REVOKED', 'This player session is no longer active.');
        }
        return transaction.tradeOffers.listPendingForPlayer(original.id, resumed.playerId);
      }, {
        persistRoom: false,
        afterCommit: ({ room, result: offerRecords }) => {
          assertCurrent();
          if (!room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
          const privatePlayerState = projectPrivatePlayerState(room, resumed.playerId);
          const result: ResumeSessionResult = {
            role: 'PLAYER',
            playerId: resumed.playerId,
            room: projectPublicRoomState(room, runtime.connections),
            pendingOffers: offerRecords.map((offer) => projectPrivateOffer(offer, room)),
            privatePlayerState,
            forcedSaleProposal: privatePlayerState.forcedSaleProposal,
            hostContinuityKey: runtime.continuity.publicKey,
          };
          acknowledged = true;
          acknowledge(successAck(result, room.aggregateVersion));
        },
      });
      const published = await runtime.persistence.rooms.findById(resumed.room.id);
      if (published && isCurrent()) broadcastRoom(io, runtime, published);
    } catch (error) {
      // A late handler on the same socket must not remove a newer generation's rooms or SocketData.
      if (!acknowledged && bound && (
        runtime.connections.get(bound.playerId)?.socketId !== socket.id
        || runtime.connections.isCurrent(bound.playerId, socket.id, bound.generation)
      )) {
        const cancelled = bound;
        deactivateConnection(cancelled.playerId, cancelled.roomId, cancelled.generation);
        if (socket.data.playerId === cancelled.playerId && socket.data.connectionGeneration === cancelled.generation) {
          delete socket.data.roomId;
          delete socket.data.playerId;
          delete socket.data.role;
          delete socket.data.sessionId;
          delete socket.data.connectionGeneration;
        }
        // Socket.IO normally leaves all rooms on disconnect; this also cleans an async join
        // that was already in flight. Failure here must not replace the original ACK error.
        const cleanup = resumeRoomCleanup.then(async () => {
          const departures: Array<Promise<void>> = [];
          for (const roomName of [publicRoomName(cancelled.roomId), privatePlayerRoomName(cancelled.playerId)]) {
            try { departures.push(Promise.resolve(socket.leave(roomName))); } catch { /* Preserve the original failure. */ }
          }
          await Promise.allSettled(departures);
        });
        resumeRoomCleanup = cleanup;
        await cleanup;
      }
      if (
        error instanceof CommandError
        && [
          'SESSION_INVALID', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'ROOM_GONE',
          'GAME_ALREADY_STARTED', 'ROOM_FULL',
        ].includes(error.code)
      ) {
        delete socket.data.pendingAdmission;
      }
      if (!acknowledged) acknowledgeFailure(acknowledge, error);
      else console.error('Resume broadcast failed', error);
    }
  });

  function deactivateConnection(playerId: string, roomId: string, generation: number): void {
    const deactivated = runtime.connections.deactivate(playerId, socket.id, generation);
    if (!deactivated || runtime.flags.shuttingDown) return;
    void armDisconnectedCurrentPlayer(io, runtime, roomId, playerId)
      .then(() => broadcastRoomById(io, runtime, roomId))
      .catch((error: unknown) => console.error('Disconnect recovery failed', error));
  }

  socket.on('disconnect', () => {
    const { playerId, roomId, connectionGeneration } = socket.data;
    // A pending two-step admission is socket-scoped. If the transport goes
    // away before activation, release that guard so the reconnect can either
    // resume the token it received or start a fresh admission.
    if (!playerId) delete socket.data.pendingAdmission;
    if (!playerId || !roomId || connectionGeneration === undefined) return;
    deactivateConnection(playerId, roomId, connectionGeneration);
  });
}
