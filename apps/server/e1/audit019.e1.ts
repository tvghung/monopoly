import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import {
  SOCKET_PROTOCOL_VERSION,
  type Ack,
  type AckCallback,
  type ClientToServerEvents,
  type ResumeSessionResult,
  type ServerToClientEvents,
} from '@monopoly/shared';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it, vi } from 'vitest';

import { isCorrectnessRegression } from './phaseE1Mode.js';
import { BotDriver } from '../src/bots/driver.js';
import { findBotTask } from '../src/bots/policy.js';
import { buildBotViews } from '../src/bots/view.js';
import { createServer } from '../src/createServer.js';
import { InMemoryPersistenceStore } from '../src/persistence/inMemory.js';
import { hydrateGameState, storeGameState, type RoomSnapshot } from '../src/rooms.js';
import { hasConnectedHuman } from '../src/services/presence.js';
import { projectPublicRoomState } from '../src/services/publicState.js';
import { createAppRuntime } from '../src/services/runtime.js';
import { registerSocketHandlers } from '../src/socket/index.js';
import type { AppSocket } from '../src/socket/types.js';
import {
  TIMING, addBot, appearance, dataOf, join, mutateRoom, okOf, ready, resume, start, stored,
} from '../src/testing/teamHarness.js';

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
const correctness = isCorrectnessRegression();
const category = correctness ? 'correctness regression' : 'fixed-behavior characterization';
// Old ghost/takeover assertions are historical evidence in audit reports 03/11/12.
// Both modes now enforce the same fixed behavior; correctness remains the release gate.

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

/** Timeouts bound failed event barriers; elapsed time never establishes success. */
async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Barrier timed out: ' + label)), 2_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function withServer(run: (subject: Awaited<ReturnType<typeof makeServer>>) => Promise<void>) {
  const subject = await makeServer();
  try {
    await run(subject);
  } finally {
    // Release every artificial pause even when a setup or correctness assertion fails.
    subject.runtime.flags.shuttingDown = true;
    for (const release of subject.releases) release();
    for (const socket of subject.sockets) socket.disconnect();
    try {
      await bounded(Promise.all(subject.handlers), 'in-flight resume cleanup');
    } finally {
      await new Promise<void>((resolve) => subject.io.close(() => resolve()));
      await subject.persistence.close();
      vi.restoreAllMocks();
    }
  }
}

async function makeServer() {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const runtime = createAppRuntime(persistence, TIMING);
  const { server, io } = createServer(runtime, { environment: { SERVER_RUNTIME_PROFILE: 'development' } });
  registerSocketHandlers(io, runtime, 'development');
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const url = 'http://127.0.0.1:' + String((server.address() as AddressInfo).port);
  const sockets: TestSocket[] = [];
  const releases: Array<() => void> = [];
  const handlers: Promise<void>[] = [];
  return {
    persistence, runtime, io, sockets, releases, handlers,
    async connect() {
      const socket: TestSocket = createClient(url, {
        auth: { protocolVersion: SOCKET_PROTOCOL_VERSION },
        autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'],
      });
      sockets.push(socket);
      const connected = deferred();
      const failed = deferred<never>();
      const onConnect = () => connected.resolve();
      const onError = (error: Error) => failed.resolve(Promise.reject(error));
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
      try {
        socket.connect();
        await bounded(Promise.race([connected.promise, failed.promise]), 'loopback connect');
      } finally {
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
      }
      return socket;
    },
    serverSocket(socket: TestSocket): AppSocket {
      const result = socket.id ? io.sockets.sockets.get(socket.id) : undefined;
      if (!result) throw new Error('The connected transport is missing from Socket.IO');
      return result;
    },
    async disconnect(socket: TestSocket) {
      const transport = this.serverSocket(socket);
      const disconnected = deferred();
      const onDisconnect = () => disconnected.resolve();
      transport.once('disconnect', onDisconnect);
      try {
        socket.disconnect();
        await bounded(disconnected.promise, 'server observes disconnect');
      } finally {
        transport.off('disconnect', onDisconnect);
      }
      expect(transport.connected).toBe(false);
      expect(io.sockets.sockets.has(transport.id)).toBe(false);
      return transport;
    },
    /** Observe the real async event handler's completion, including a rejected resume with no deliverable ACK. */
    observeResume(socket: TestSocket) {
      const transport = this.serverSocket(socket);
      const listeners = transport.listeners('resume session');
      expect(listeners).toHaveLength(1);
      const handler = listeners[0]!;
      const completed = deferred();
      handlers.push(completed.promise);
      transport.off('resume session', handler);
      transport.on('resume session', async (...args) => {
        try { await handler(...args); } finally { completed.resolve(); }
      });
      return completed.promise;
    },
    pauseNextResume() {
      const reached = deferred();
      const release = deferred();
      releases.push(() => release.resolve());
      const original = runtime.sessions.resume.bind(runtime.sessions);
      vi.spyOn(runtime.sessions, 'resume').mockImplementationOnce(async (...args) => {
        const result = await original(...args);
        reached.resolve();
        await release.promise;
        return result;
      });
      return { reached: reached.promise, release: () => release.resolve() };
    },
  };
}

type Subject = Awaited<ReturnType<typeof makeServer>>;

async function offlinePlayer(subject: Subject) {
  const socket = await subject.connect();
  const player = await join(socket, 'Ada', 'E1-019');
  const transport = subject.serverSocket(socket);
  const sessionId = transport.data.sessionId!;
  const first = subject.runtime.connections.get(player.playerId)!;
  expect(first).toEqual({ socketId: socket.id, generation: 1 });
  expect(player.room.players).toHaveLength(1);
  expect(player.room.players[0]).toMatchObject({ playerId: player.playerId, connected: true });
  // The disconnect broadcast is an explicit completion barrier for its asynchronous recovery path.
  const published = deferred();
  subject.runtime.bots = { notify: () => published.resolve() };
  await subject.disconnect(socket);
  await bounded(published.promise, 'initial disconnect published');
  delete subject.runtime.bots;
  expect(subject.runtime.connections.get(player.playerId)).toBeUndefined();
  expect((await subject.persistence.playerSessions.findById(sessionId))?.status).toBe('ACTIVE');
  return { ...player, sessionId, first };
}

async function suspendedDeadResume(subject: Subject, token: string) {
  const gate = subject.pauseNextResume();
  const socket = await subject.connect();
  const id = socket.id!;
  const completed = subject.observeResume(socket);
  socket.emit('resume session', { token }, () => {});
  await bounded(gate.reached, 'resume service completed before connection binding');
  const transport = await subject.disconnect(socket);
  expect(transport.data.playerId).toBeUndefined();
  return { id, socket, transport, completed, release: gate.release };
}

async function acknowledge<T>(emit: (callback: AckCallback<T>) => void): Promise<Ack<T>> {
  const result = deferred<Ack<T>>();
  emit(result.resolve);
  return bounded(result.promise, 'command acknowledgement');
}

describe('AUDIT-019 ' + category + ' over real loopback Socket.IO', () => {
  it('019-A: disconnect before binding ' + 'must never register a dead transport', async () => {
    await withServer(async (subject) => {
      const player = await offlinePlayer(subject);
      const dead = await suspendedDeadResume(subject, player.token);
      expect(subject.runtime.connections.get(player.playerId)).toBeUndefined();
      dead.release();
      await bounded(dead.completed, 'late disconnected resume completed');
      const room = await stored(subject.persistence, player.room.roomId);
      const projected = projectPublicRoomState(room, subject.runtime.connections);
      expect.soft(subject.runtime.connections.get(player.playerId)).toBeUndefined();
      expect.soft(projected.players[0]?.connected).toBe(false);
      expect(dead.transport.connected).toBe(false);
      expect(subject.io.sockets.sockets.has(dead.id)).toBe(false);
    });
  });

  it('019-B: older disconnected A ' + 'cannot replace or disconnect newer live B or advance its generation', async () => {
    await withServer(async (subject) => {
      const player = await offlinePlayer(subject);
      const dead = await suspendedDeadResume(subject, player.token);
      const live = await subject.connect();
      const liveTransport = subject.serverSocket(live);
      const resumed = await resume(live, player.token);
      const liveId = live.id!;
      const activeB = subject.runtime.connections.get(player.playerId)!;
      expect(resumed.playerId).toBe(player.playerId);
      expect(activeB).toEqual({ socketId: liveId, generation: 2 });
      expect(live.connected).toBe(true);
      const replaced: unknown[] = [];
      const onReplaced = (value: unknown) => replaced.push(value);
      live.on('session replaced', onReplaced);
      const disconnected = deferred();
      const onDisconnect = () => disconnected.resolve();
      live.once('disconnect', onDisconnect);
      try {
        dead.release();
        await bounded(dead.completed, 'older dead resume completed after B');
        expect.soft(liveTransport.connected).toBe(true);
        expect.soft(live.connected).toBe(true);
        expect.soft(subject.io.sockets.sockets.has(liveId)).toBe(true);
        expect.soft(subject.runtime.connections.get(player.playerId)).toEqual(activeB);
        expect.soft(subject.runtime.connections.isCurrent(player.playerId, liveId, activeB.generation)).toBe(true);
        expect.soft(replaced).toEqual([]);
        expect(subject.runtime.connections.deactivate(player.playerId, dead.id, player.first.generation)).toBe(false);
      } finally {
        live.off('session replaced', onReplaced);
        live.off('disconnect', onDisconnect);
      }
    });
  });

  it('019-C: disconnected resume preserves the legitimate seat/token and a subsequent live reconnect owns a fresh generation', async () => {
    await withServer(async (subject) => {
      const player = await offlinePlayer(subject);
      const before = await stored(subject.persistence, player.room.roomId);
      const sessionBefore = await subject.persistence.playerSessions.findById(player.sessionId);
      const dead = await suspendedDeadResume(subject, player.token);
      dead.release();
      await bounded(dead.completed, 'disconnected resume preserves session');
      const after = await stored(subject.persistence, player.room.roomId);
      const sessionAfter = await subject.persistence.playerSessions.findById(player.sessionId);
      expect(sessionAfter).toMatchObject({ id: player.sessionId, status: 'ACTIVE', playerId: player.playerId, roomId: before.id });
      expect(sessionAfter?.id).toBe(sessionBefore?.id);
      expect((await subject.persistence.playerSessions.findByTokenHash(createHash('sha256').update(player.token).digest()))?.id).toBe(player.sessionId);
      expect(after.hostPlayerId).toBe(before.hostPlayerId);
      expect(after.gameSnapshot).toEqual(before.gameSnapshot);
      const priorGeneration = subject.runtime.connections.get(player.playerId)?.generation ?? player.first.generation;
      const live = await subject.connect();
      const recovered = await resume(live, player.token);
      const active = subject.runtime.connections.get(player.playerId)!;
      expect(recovered.playerId).toBe(player.playerId);
      expect(recovered.room.players).toHaveLength(1);
      expect(recovered.room.players[0]).toMatchObject({ playerId: player.playerId, connected: true });
      expect(active).toEqual({ socketId: live.id, generation: priorGeneration + 1 });
      expect(subject.runtime.connections.deactivate(player.playerId, dead.id, priorGeneration)).toBe(false);
      expect(subject.runtime.connections.isCurrent(player.playerId, live.id!, active.generation)).toBe(true);
      expect(JSON.stringify(recovered.room)).not.toContain(player.token);
      expect(JSON.stringify(subject.serverSocket(live).data)).not.toContain(player.token);
    });
  });

  it('019-C: a rejected invalid-token resume leaves the legitimate active session recoverable', async () => {
    await withServer(async (subject) => {
      const player = await offlinePlayer(subject);
      const before = await stored(subject.persistence, player.room.roomId);
      const stranger = await subject.connect();
      const rejected = await acknowledge<ResumeSessionResult>((callback) => stranger.emit('resume session', { token: 'A'.repeat(43) }, callback));
      expect(rejected).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } });
      expect(subject.serverSocket(stranger).data.playerId).toBeUndefined();
      expect(subject.runtime.connections.get(player.playerId)).toBeUndefined();
      expect(await stored(subject.persistence, before.id)).toEqual(before);
      const session = await subject.persistence.playerSessions.findById(player.sessionId);
      expect(session?.status).toBe('ACTIVE');
      expect(await subject.persistence.playerSessions.findByTokenHash(createHash('sha256').update(player.token).digest())).toEqual(session);
      const recovered = await resume(await subject.connect(), player.token);
      expect(recovered.playerId).toBe(player.playerId);
      expect(recovered.room.players).toHaveLength(1);
    });
  });

  it('019-D: ghost presence ' + 'cannot satisfy human presence or arm bot work', async () => {
    await withServer(async (subject) => {
      const host = await join(await subject.connect(), 'Host', 'E1-019-BOT');
      const botId = dataOf(await addBot(host.socket)).playerId;
      okOf(await appearance(host.socket, { characterId: 'dog' }));
      okOf(await ready(host.socket));
      okOf(await start(host.socket));
      const roomId = host.room.roomId;
      await mutateRoom(subject.persistence, roomId, (room) => {
        const state = hydrateGameState(room.gameSnapshot, room.status);
        state.boardState.currentPlayer = { id: botId, hasMoved: false };
        state.boardState.turnRecovery = null;
        state.turnInfo = {};
        storeGameState(room.gameSnapshot, state, room.status);
      });
      const disconnected = deferred();
      subject.runtime.bots = { notify: () => disconnected.resolve() };
      await subject.disconnect(host.socket);
      await bounded(disconnected.promise, 'last human disconnect published');
      delete subject.runtime.bots;
      const before = await stored(subject.persistence, roomId);
      const task = findBotTask(buildBotViews(before, subject.runtime.connections, [], new Date()));
      expect(task).toMatchObject({ botId, kind: 'TURN' });
      expect(hasConnectedHuman(subject.runtime.connections, before.gameSnapshot)).toBe(false);
      const dead = await suspendedDeadResume(subject, host.token);
      dead.release();
      await bounded(dead.completed, 'ghost resume before bot evaluation');
      const after = await stored(subject.persistence, roomId);
      // Fake only the bot driver's timer surface after all network barriers have settled.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      const bots = new BotDriver(subject.io, subject.runtime);
      try {
        bots.start();
        bots.notify(roomId);
        await bots.idle();
        expect.soft(hasConnectedHuman(subject.runtime.connections, after.gameSnapshot)).toBe(false);
        expect.soft(bots.armedKey(roomId)).toBeUndefined();
        expect(after.gameSnapshot.gameState).toEqual(before.gameSnapshot.gameState);
        expect(dead.transport.connected).toBe(false);
        expect(subject.io.sockets.sockets.has(dead.id)).toBe(false);
      } finally {
        try {
          bots.stop();
          await bots.idle();
          expect(vi.getTimerCount()).toBe(0);
        } finally {
          vi.clearAllTimers();
          vi.useRealTimers();
        }
      }
    });
  });
});
