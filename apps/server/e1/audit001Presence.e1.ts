import { createHash } from 'node:crypto';

import type {
  ClientToServerEvents, JoinRoomResult, PrivatePlayerState, PublicRoomState,
} from '@monopoly/shared';
import { describe, expect, it } from 'vitest';

import { isCorrectnessRegression } from './phaseE1Mode.js';
import { InMemoryPersistenceStore } from '../src/persistence/inMemory.js';
import type { RoomSnapshot } from '../src/rooms.js';
import { projectPublicRoomState } from '../src/services/publicState.js';
import { privatePlayerRoomName, publicRoomName } from '../src/socket/broadcast.js';
import {
  ack, appearance, connect, dataOf, join, mutateRoom, okOf, ready, resume, start,
  startServer, stored, useHarnessCleanup, type Player, type RunningServer,
} from '../src/testing/teamHarness.js';

type TestSocket = Player['socket'];
const correctness = isCorrectnessRegression();
const mode = correctness ? 'correctness regression' : 'characterization';
useHarnessCleanup();

async function usingServer(run: (subject: RunningServer) => Promise<void>) {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const subject = await startServer(persistence);
  try {
    await run(subject);
  } finally {
    await subject.close();
    await persistence.close();
  }
}

/** The packet content, not a delay, establishes completion of the disconnect/reconnect broadcast. */
async function publishedUpdate(
  observer: TestSocket,
  predicate: (room: PublicRoomState) => boolean,
  action: () => void | Promise<void>,
): Promise<PublicRoomState> {
  let complete!: (room: PublicRoomState) => void;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const packet = new Promise<PublicRoomState>((resolve) => { complete = resolve; });
  const onUpdate = (room: PublicRoomState) => { if (predicate(room)) complete(room); };
  observer.on('update', onUpdate);
  try {
    await action();
    return await Promise.race([
      packet,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Expected presence packet was not published')), 2_000);
      }),
    ]);
  } finally {
    observer.off('update', onUpdate);
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Await the actual event handler, including its post-ACK public/private broadcast. */
async function resumeThroughCompletedHandler(subject: RunningServer, socket: TestSocket, token: string) {
  const transport = subject.io.sockets.sockets.get(socket.id!)!;
  const listeners = transport.listeners('resume session');
  expect(listeners).toHaveLength(1);
  const original = listeners[0]!;
  let complete!: () => void;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const completed = new Promise<void>((resolve) => { complete = resolve; });
  const observed = async (...args: Parameters<ClientToServerEvents['resume session']>) => {
    try { await original(...args); } finally { complete(); }
  };
  transport.off('resume session', original);
  transport.on('resume session', observed);
  try {
    const result = await resume(socket, token);
    await Promise.race([
      completed,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Resume handler did not complete its broadcast')), 2_000);
      }),
    ]);
    return result;
  } finally {
    transport.off('resume session', observed);
    transport.on('resume session', original);
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function pair(subject: RunningServer, code: string) {
  const host = await join(await connect(subject.url), 'Host', code);
  const guest = await join(await connect(subject.url), 'Guest', code);
  const room = await stored(subject.runtime.persistence, host.room.roomId);
  expect(room.status).toBe('LOBBY');
  expect(projectPublicRoomState(room, subject.runtime.connections).players.map(player => player.connected)).toEqual([true, true]);
  return { host, guest, roomId: room.id };
}

async function playingPair(subject: RunningServer, code: string) {
  const result = await pair(subject, code);
  okOf(await appearance(result.host.socket, { characterId: 'dog' }));
  okOf(await appearance(result.guest.socket, { characterId: 'cat' }));
  okOf(await ready(result.host.socket));
  okOf(await ready(result.guest.socket));
  okOf(await start(result.host.socket));
  // Starting-player dice are deliberately irrelevant to the presence-only non-current-player case.
  await mutateRoom(subject.runtime.persistence, result.roomId, (room) => {
    room.gameSnapshot.gameState.boardState.currentPlayer = { id: result.host.playerId, hasMoved: false };
    room.gameSnapshot.gameState.boardState.turnRecovery = null;
  });
  const room = await stored(subject.runtime.persistence, result.roomId);
  expect(room.status).toBe('IN_PROGRESS');
  expect(room.gameSnapshot.gameState.boardState.currentPlayer.id).toBe(result.host.playerId);
  expect(result.guest.playerId).not.toBe(result.host.playerId);
  return result;
}

function assertPublicOnly(room: PublicRoomState, players: readonly Player[]) {
  const serialized = JSON.stringify(room);
  expect(room).not.toHaveProperty('gameState.privateState');
  expect(room).not.toHaveProperty('gameState.decks');
  expect(serialized).not.toContain('tokenHash');
  expect(serialized).not.toContain('heldJailFreeCardIds');
  expect(serialized).not.toContain('semanticLanes');
  for (const player of players) {
    expect(serialized).not.toContain(player.token);
    expect(serialized).not.toContain(createHash('sha256').update(player.token).digest('hex'));
    expect(serialized).not.toContain(createHash('sha256').update(player.token).digest('base64'));
  }
}

describe('AUDIT-001 real server producer invariants in ' + mode + ' mode', () => {
  it('001-A producer: lobby disconnect publishes accurate presence ' + (correctness ? 'with a monotonic resulting version' : 'at the unchanged aggregate version'), async () => {
    await usingServer(async (subject) => {
      const { host, guest, roomId } = await pair(subject, 'E1-001-LOBBY');
      const before = await stored(subject.runtime.persistence, roomId);
      const guestId = guest.socket.id!;
      const update = await publishedUpdate(host.socket,
        room => room.roomId === roomId && room.players.some(player => player.playerId === guest.playerId && !player.connected),
        () => { guest.socket.disconnect(); });
      const after = await stored(subject.runtime.persistence, roomId);
      expect(subject.io.sockets.sockets.has(guestId)).toBe(false);
      expect(subject.runtime.connections.isConnected(guest.playerId)).toBe(false);
      if (correctness) expect(after.aggregateVersion).toBeGreaterThanOrEqual(before.aggregateVersion);
      else expect(after.aggregateVersion).toBe(before.aggregateVersion);
      expect(after.gameSnapshot).toEqual(before.gameSnapshot);
      expect(update.version).toBe(after.aggregateVersion);
      expect(update.status).toBe('LOBBY');
      expect(update.players).toMatchObject([
        { playerId: host.playerId, connected: true },
        { playerId: guest.playerId, connected: false },
      ]);
      assertPublicOnly(update, [host, guest]);
    });
  });

  it('001-B producer: a non-current player disconnect changes presence without changing gameplay or arming turn recovery', async () => {
    await usingServer(async (subject) => {
      const { host, guest, roomId } = await playingPair(subject, 'E1-001-MATCH');
      const before = await stored(subject.runtime.persistence, roomId);
      const update = await publishedUpdate(host.socket,
        room => room.roomId === roomId && room.players.some(player => player.playerId === guest.playerId && !player.connected),
        () => { guest.socket.disconnect(); });
      const after = await stored(subject.runtime.persistence, roomId);
      if (correctness) expect(after.aggregateVersion).toBeGreaterThanOrEqual(before.aggregateVersion);
      else expect(after.aggregateVersion).toBe(before.aggregateVersion);
      expect(after.gameSnapshot).toEqual(before.gameSnapshot);
      expect(update.version).toBe(after.aggregateVersion);
      expect(update.status).toBe('IN_PROGRESS');
      expect(update.gameState.boardState.currentPlayer.id).toBe(host.playerId);
      expect(update.gameState.boardState.turnRecovery).toBeNull();
      expect(update.gameState).toEqual(projectPublicRoomState(before, subject.runtime.connections).gameState);
      expect(update.players.find(player => player.playerId === guest.playerId)?.connected).toBe(false);
      assertPublicOnly(update, [host, guest]);
    });
  });

  it('001-C/F producer: an ordinary reconnect increases version and the spectator receives only public presence snapshots', async () => {
    await usingServer(async (subject) => {
      const { host, guest, roomId } = await playingPair(subject, 'E1-001-WATCH');
      const spectator = await connect(subject.url);
      const privatePackets: PrivatePlayerState[] = [];
      const onPrivate = (state: PrivatePlayerState) => privatePackets.push(state);
      spectator.on('private player state', onPrivate);
      try {
        const admission = dataOf(await ack<JoinRoomResult>(callback => spectator.emit('join room', { name: 'Watcher', roomCode: 'E1-001-WATCH' }, callback)));
        expect(admission.kind).toBe('SPECTATOR');
        if (admission.kind !== 'SPECTATOR') throw new Error('Expected spectator admission');
        expect(admission.playerId).toBeNull();
        expect(admission.room.players).toHaveLength(2);
        const transport = subject.io.sockets.sockets.get(spectator.id!)!;
        expect(transport.data.role).toBe('SPECTATOR');
        expect(transport.data.playerId).toBeUndefined();
        expect(transport.rooms.has(publicRoomName(roomId))).toBe(true);
        for (const player of [host, guest]) expect(transport.rooms.has(privatePlayerRoomName(player.playerId))).toBe(false);
        assertPublicOnly(admission.room, [host, guest]);
        const before = await stored(subject.runtime.persistence, roomId);
        const offline = await publishedUpdate(spectator,
          room => room.roomId === roomId && room.players.some(player => player.playerId === guest.playerId && !player.connected),
          () => { guest.socket.disconnect(); });
        if (correctness) expect(offline.version).toBeGreaterThanOrEqual(before.aggregateVersion);
        else expect(offline.version).toBe(before.aggregateVersion);
        const returning = await connect(subject.url);
        const online = await publishedUpdate(spectator,
          room => room.roomId === roomId && room.version > offline.version && room.players.some(player => player.playerId === guest.playerId && player.connected),
          async () => {
            const recovered = await resumeThroughCompletedHandler(subject, returning, guest.token);
            expect(recovered.playerId).toBe(guest.playerId);
            expect(recovered.room.version).toBeGreaterThan(offline.version);
          });
        // The completed resume queued all private delivery before this same-transport ACK.
        // A spectator already has a role: a second join is refused before admission/mutation.
        const fence = await ack<JoinRoomResult>(callback => spectator.emit('join room', {
          name: 'Watcher fence', roomCode: 'E1-001-WATCH',
        }, callback));
        expect(fence).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
        const after = await stored(subject.runtime.persistence, roomId);
        expect(online.version).toBe(after.aggregateVersion);
        expect(online.version).toBeGreaterThan(offline.version);
        expect(after.gameSnapshot).toEqual(before.gameSnapshot);
        expect(online.gameState).toEqual(offline.gameState);
        expect(online.players).toHaveLength(2);
        expect(privatePackets).toEqual([]);
        assertPublicOnly(offline, [host, guest]);
        assertPublicOnly(online, [host, guest]);
      } finally {
        spectator.off('private player state', onPrivate);
      }
    });
  });
});
