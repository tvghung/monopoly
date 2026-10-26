import { createHash } from 'node:crypto';

import type { ClientToServerEvents, JoinRoomResult, PrivatePlayerState, PublicRoomState } from '@monopoly/shared';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import type { RoomSnapshot } from './rooms.js';
import { projectPublicRoomState } from './services/publicState.js';
import { broadcastRoomById, privatePlayerRoomName, publicRoomName } from './socket/broadcast.js';
import {
  ack, addBot, appearance, connect, dataOf, mutateRoom, okOf, ready, resume, start,
  startServer, stored, useHarnessCleanup, type Player, type RunningServer,
} from './testing/teamHarness.js';

type TestSocket = Player['socket'];
useHarnessCleanup();

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Presence barrier timed out: ' + label)), 2_000);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function usingServer(run: (subject: RunningServer) => Promise<void>) {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const subject = await startServer(persistence);
  try {
    await run(subject);
  } finally {
    vi.restoreAllMocks();
    await subject.close();
    await persistence.close();
  }
}

/** ACK precedes resume's broadcast; wait for the actual handler before setting up a gate. */
async function completedResume(subject: RunningServer, socket: TestSocket, token: string) {
  const transport = subject.io.sockets.sockets.get(socket.id!)!;
  const handlers = transport.listeners('resume session');
  expect(handlers).toHaveLength(1);
  const original = handlers[0];
  const finished = deferred();
  let handlerError: unknown;
  const observed = (...args: Parameters<ClientToServerEvents['resume session']>) => {
    void Promise.resolve().then(() => original(...args)).then(
      () => finished.resolve(),
      (error: unknown) => { handlerError = error; finished.resolve(); },
    );
  };
  transport.off('resume session', original);
  transport.on('resume session', observed);
  try {
    const result = await resume(socket, token);
    await bounded(finished.promise, 'resume handler publication');
    if (handlerError !== undefined) throw new Error('Resume handler failed', { cause: handlerError });
    return result;
  } finally {
    transport.off('resume session', observed);
    transport.on('resume session', original);
  }
}

async function joined(subject: RunningServer, name: string, roomCode: string): Promise<Player> {
  const socket = await connect(subject.url);
  const admission = dataOf(await ack<JoinRoomResult>(callback => socket.emit('join room', { name, roomCode }, callback)));
  if (admission.kind !== 'PENDING') throw new Error('Expected pending player admission');
  const result = await completedResume(subject, socket, admission.token);
  return { socket, token: admission.token, playerId: result.playerId, room: result.room };
}

async function updateAfter(
  observer: TestSocket,
  predicate: (room: PublicRoomState) => boolean,
  action: () => void | Promise<void>,
): Promise<PublicRoomState> {
  const received = deferred<PublicRoomState>();
  const onUpdate = (room: PublicRoomState) => { if (predicate(room)) received.resolve(room); };
  observer.on('update', onUpdate);
  try {
    await action();
    return await bounded(received.promise, 'matching public packet');
  } finally {
    observer.off('update', onUpdate);
  }
}

async function packetFence(observer: TestSocket, roomCode: string) {
  expect(await ack<JoinRoomResult>(callback => observer.emit('join room', { name: 'Fence', roomCode }, callback)))
    .toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
}

async function playingPair(subject: RunningServer, roomCode: string, withBot = false) {
  const host = await joined(subject, 'Host', roomCode);
  const guest = await joined(subject, 'Guest', roomCode);
  okOf(await appearance(host.socket, { characterId: 'dog' }));
  okOf(await appearance(guest.socket, { characterId: 'cat' }));
  const botId = withBot ? dataOf(await addBot(host.socket)).playerId : undefined;
  okOf(await ready(host.socket));
  okOf(await ready(guest.socket));
  okOf(await start(host.socket));
  await mutateRoom(subject.runtime.persistence, host.room.roomId, room => {
    room.gameSnapshot.gameState.boardState.currentPlayer = { id: host.playerId, hasMoved: false };
    room.gameSnapshot.gameState.boardState.turnRecovery = null;
  });
  return { host, guest, botId, roomId: host.room.roomId };
}

const isConnected = (room: PublicRoomState, playerId: string) => room.players.find(player => player.playerId === playerId)?.connected;

describe('public presence synchronization ordering', () => {
  it('samples live ownership when an older disconnect broadcast finishes its room lookup after a newer resume', async () => {
    await usingServer(async subject => {
      const host = await joined(subject, 'Host', 'PRESENCE-LATE');
      const guest = await joined(subject, 'Guest', 'PRESENCE-LATE');
      const roomId = host.room.roomId;
      const before = await stored(subject.runtime.persistence, roomId);
      const originalOwner = subject.runtime.connections.get(guest.playerId)!;
      const find = subject.runtime.persistence.rooms.findById.bind(subject.runtime.persistence.rooms);
      const entered = deferred();
      const released = deferred();
      let offlineReads = 0;
      let paused = false;
      vi.spyOn(subject.runtime.persistence.rooms, 'findById').mockImplementation(async (...args) => {
        const room = await find(...args);
        if (!paused && room?.id === roomId && !subject.runtime.connections.isConnected(guest.playerId)) {
          offlineReads += 1;
          // First read is armDisconnectedCurrentPlayer (a lobby no-op); second is broadcastRoomById.
          if (offlineReads === 2) {
            paused = true;
            entered.resolve();
            await released.promise;
          }
        }
        return room;
      });
      let delayed: Promise<PublicRoomState> | undefined;
      try {
        guest.socket.disconnect();
        await bounded(entered.promise, 'disconnect broadcast captured its old room record');
        expect(subject.runtime.connections.isConnected(guest.playerId)).toBe(false);
        const replacement = await connect(subject.url);
        const resumed = await completedResume(subject, replacement, guest.token);
        expect(resumed.room.version).toBeGreaterThan(before.aggregateVersion);
        const newest = subject.runtime.connections.get(guest.playerId)!;
        expect(newest.socketId).toBe(replacement.id);
        expect(newest.generation).toBeGreaterThan(originalOwner.generation);
        delayed = updateAfter(host.socket, room => room.roomId === roomId && room.version === before.aggregateVersion,
          () => released.resolve());
        const packet = await delayed;
        // The room record is old, but presence is projected only at emit time, from the current registry.
        expect(packet.version).toBe(before.aggregateVersion);
        expect(isConnected(packet, guest.playerId)).toBe(true);
        expect(packet.gameState).toEqual(projectPublicRoomState(before, subject.runtime.connections).gameState);
        expect(subject.runtime.connections.deactivate(guest.playerId, originalOwner.socketId, originalOwner.generation)).toBe(false);
        expect(subject.runtime.connections.get(guest.playerId)).toEqual(newest);
        await packetFence(host.socket, 'PRESENCE-LATE');
        expect((await stored(subject.runtime.persistence, roomId)).aggregateVersion).toBe(resumed.room.version);
      } finally {
        released.resolve();
        if (delayed) await delayed;
      }
    });
  });

  it('publishes repeated offline/online transitions and duplicates in emit order at one aggregate version', async () => {
    await usingServer(async subject => {
      const host = await joined(subject, 'Host', 'PRESENCE-SAME');
      const guest = await joined(subject, 'Guest', 'PRESENCE-SAME');
      const roomId = host.room.roomId;
      const before = await stored(subject.runtime.persistence, roomId);
      const baseline = projectPublicRoomState(before, subject.runtime.connections);
      const transport = subject.io.sockets.sockets.get(guest.socket.id!)!;
      await packetFence(host.socket, 'PRESENCE-SAME');
      const packets: PublicRoomState[] = [];
      const receive = (room: PublicRoomState) => { if (room.roomId === roomId) packets.push(room); };
      host.socket.on('update', receive);
      try {
        // Drive the process-local boundary directly: active resume normally revises the room.
        // Delivery still uses the real public room, projector and Socket.IO connection.
        let owner = subject.runtime.connections.get(guest.playerId)!;
        for (const connected of [false, true, false, true, true]) {
          if (connected && !subject.runtime.connections.isConnected(guest.playerId)) {
            owner = subject.runtime.connections.activate(guest.playerId, transport.id);
            transport.data.connectionGeneration = owner.generation;
          } else if (!connected) {
            expect(subject.runtime.connections.deactivate(guest.playerId, owner.socketId, owner.generation)).toBe(true);
          }
          await broadcastRoomById(subject.io, subject.runtime, roomId);
        }
        await packetFence(host.socket, 'PRESENCE-SAME');
        expect(packets.map(room => isConnected(room, guest.playerId))).toEqual([false, true, false, true, true]);
        for (const packet of packets) {
          expect(packet.version).toBe(before.aggregateVersion);
          expect(packet.gameState).toEqual(baseline.gameState);
          expect(packet.players.map(player => ({ ...player, connected: undefined })))
            .toEqual(baseline.players.map(player => ({ ...player, connected: undefined })));
        }
        const after = await stored(subject.runtime.persistence, roomId);
        expect(after.aggregateVersion).toBe(before.aggregateVersion);
        expect(after.gameSnapshot).toEqual(before.gameSnapshot);
      } finally {
        host.socket.off('update', receive);
      }
    });
  });

  it('keeps bots present without a connection and sends a spectator only public non-current-player presence', async () => {
    await usingServer(async subject => {
      const { host, guest, botId, roomId } = await playingPair(subject, 'PRESENCE-BOT', true);
      expect(botId).toBeDefined();
      expect(subject.runtime.connections.get(botId!)).toBeUndefined();
      const spectator = await connect(subject.url);
      const privatePackets: PrivatePlayerState[] = [];
      const onPrivate = (state: PrivatePlayerState) => privatePackets.push(state);
      spectator.on('private player state', onPrivate);
      try {
        const admission = dataOf(await ack<JoinRoomResult>(callback => spectator.emit('join room', {
          name: 'Watcher', roomCode: 'PRESENCE-BOT',
        }, callback)));
        expect(admission.kind).toBe('SPECTATOR');
        const watcher = subject.io.sockets.sockets.get(spectator.id!)!;
        expect(watcher.rooms.has(publicRoomName(roomId))).toBe(true);
        for (const player of [host, guest]) expect(watcher.rooms.has(privatePlayerRoomName(player.playerId))).toBe(false);
        const before = await stored(subject.runtime.persistence, roomId);
        const packet = await updateAfter(spectator, room => room.roomId === roomId && isConnected(room, guest.playerId) === false,
          () => { guest.socket.disconnect(); });
        expect(packet.version).toBe(before.aggregateVersion);
        expect(packet.players.find(player => player.playerId === botId)).toMatchObject({ kind: 'BOT', ready: true, connected: true });
        expect(packet.gameState.boardState.currentPlayer.id).toBe(host.playerId);
        expect(packet.gameState.boardState.turnRecovery).toBeNull();
        expect(packet.gameState).toEqual(projectPublicRoomState(before, subject.runtime.connections).gameState);
        await packetFence(spectator, 'PRESENCE-BOT');
        expect(privatePackets).toEqual([]);
        const serialized = JSON.stringify(packet);
        for (const player of [host, guest]) {
          expect(serialized).not.toContain(player.token);
          expect(serialized).not.toContain(createHash('sha256').update(player.token).digest('hex'));
        }
        for (const hidden of ['tokenHash', 'heldJailFreeCardIds', 'semanticLanes', 'privateState', 'drawPile']) {
          expect(serialized).not.toContain(hidden);
        }
        expect((await stored(subject.runtime.persistence, roomId)).gameSnapshot).toEqual(before.gameSnapshot);
      } finally {
        spectator.off('private player state', onPrivate);
      }
    });
  });

  it('revises current-player recovery on disconnect and reconnect while preserving the exact turn and gameplay', async () => {
    await usingServer(async subject => {
      const { host, guest, roomId } = await playingPair(subject, 'PRESENCE-RECOVERY');
      const before = await stored(subject.runtime.persistence, roomId);
      const offline = await updateAfter(guest.socket, room => room.roomId === roomId
        && room.version > before.aggregateVersion && isConnected(room, host.playerId) === false,
      () => { host.socket.disconnect(); });
      expect(offline.gameState.boardState.turnRecovery).toMatchObject({ playerId: host.playerId });
      expect(offline.gameState.boardState.turnNumber).toBe(before.gameSnapshot.gameState.boardState.turnNumber);
      const armed = await stored(subject.runtime.persistence, roomId);
      expect(armed.gameSnapshot.gameState.boardState.turnRecovery).toMatchObject({
        playerId: host.playerId, turnNumber: before.gameSnapshot.gameState.boardState.turnNumber,
      });
      expect(armed.aggregateVersion).toBe(before.aggregateVersion + 1);
      const onlyRecovery = structuredClone(armed.gameSnapshot);
      onlyRecovery.gameState.boardState.turnRecovery = null;
      expect(onlyRecovery).toEqual(before.gameSnapshot);
      const returning = await connect(subject.url);
      const online = await updateAfter(guest.socket, room => room.roomId === roomId
        && room.version > armed.aggregateVersion && isConnected(room, host.playerId) === true
        && room.gameState.boardState.turnRecovery === null,
      async () => { expect((await completedResume(subject, returning, host.token)).playerId).toBe(host.playerId); });
      expect(online.gameState).toEqual(projectPublicRoomState(before, subject.runtime.connections).gameState);
      expect((await stored(subject.runtime.persistence, roomId)).gameSnapshot).toEqual(before.gameSnapshot);
    });
  });
});
