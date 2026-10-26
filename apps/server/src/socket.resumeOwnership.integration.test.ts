import { createHash } from 'node:crypto';

import type {
  Ack, AckCallback, JoinRoomResult, PrivatePlayerState, ResumeSessionResult,
} from '@monopoly/shared';
import { describe, expect, it, vi } from 'vitest';

import type { RoomSnapshot } from './rooms.js';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import { privatePlayerRoomName, publicRoomName } from './socket/broadcast.js';
import { CommandError } from './socket/errors.js';
import type { AppSocket } from './socket/types.js';
import {
  ack, dataOf, join, resume, startServer, stored, useHarnessCleanup,
  connect, ready, start, mutateRoom, type Player,
} from './testing/teamHarness.js';

type TestSocket = Player['socket'];
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Ownership barrier timed out: ' + label)), 2_000);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
interface Attempt {
  response: Promise<Ack<ResumeSessionResult>>;
  acknowledgements: Ack<ResumeSessionResult>[];
  completed: Promise<void>;
}
useHarnessCleanup();

async function usingFixture(run: (subject: Fixture) => Promise<void>) {
  const subject = await fixture();
  try {
    await run(subject);
  } finally {
    subject.runtime.flags.shuttingDown = true;
    for (const release of subject.releases) release();
    for (const socket of subject.sockets) socket.disconnect();
    try {
      await bounded(Promise.all(subject.inFlight), 'pending handlers cleanup');
      expect(subject.observerErrors).toEqual([]);
    } finally {
      await subject.close();
      await subject.runtime.persistence.close();
      vi.restoreAllMocks();
    }
  }
}

async function fixture() {
  const subject = await startServer(new InMemoryPersistenceStore<RoomSnapshot>());
  const sockets: TestSocket[] = [];
  const releases: Array<() => void> = [];
  const inFlight: Promise<unknown>[] = [];
  const observerErrors: unknown[] = [];
  const watched = new WeakMap<TestSocket, Array<ReturnType<typeof deferred<Attempt>>>>();
  const originalResume = subject.runtime.sessions.resume.bind(subject.runtime.sessions);
  const subjectWithControls = {
    ...subject, sockets, releases, inFlight, observerErrors,
    async connect() {
      const socket = await connect(subject.url);
      sockets.push(socket);
      return socket;
    },
    transport(socket: TestSocket): AppSocket {
      const transport = socket.id ? subject.io.sockets.sockets.get(socket.id) : undefined;
      if (!transport) throw new Error('Expected a live Socket.IO transport');
      return transport;
    },
    async disconnect(socket: TestSocket) {
      const transport = this.transport(socket);
      const observed = deferred();
      const published = deferred();
      const playerBound = transport.data.playerId !== undefined;
      const previousBots = subject.runtime.bots;
      if (playerBound) subject.runtime.bots = { notify: () => published.resolve() };
      const onDisconnect = () => observed.resolve();
      transport.once('disconnect', onDisconnect);
      try {
        socket.disconnect();
        await bounded(observed.promise, 'transport disconnect');
        if (playerBound) await bounded(published.promise, 'disconnect broadcast');
      } finally {
        transport.off('disconnect', onDisconnect);
        subject.runtime.bots = previousBots;
      }
      expect(transport.connected).toBe(false);
      expect(subject.io.sockets.sockets.has(transport.id)).toBe(false);
      return transport;
    },
    gate() {
      const entered = deferred();
      const released = deferred();
      const release = () => released.resolve();
      releases.push(release);
      return { entered, released: released.promise, release };
    },
    pauseResume() {
      const gate = this.gate();
      vi.spyOn(subject.runtime.sessions, 'resume').mockImplementationOnce(async (...args) => {
        const result = await originalResume(...args);
        gate.entered.resolve();
        await gate.released;
        return result;
      });
      return gate;
    },
    async attempt(socket: TestSocket, token: string): Promise<Attempt> {
      let waiting = watched.get(socket);
      if (!waiting) {
        waiting = [];
        watched.set(socket, waiting);
        const queue = waiting;
        const transport = this.transport(socket);
        const handlers = transport.listeners('resume session');
        expect(handlers).toHaveLength(1);
        const original = handlers[0];
        transport.off('resume session', original);
        transport.on('resume session', (request, acknowledge) => {
          const next = queue.shift();
          if (!next) throw new Error('Resume event has no test observer');
          const completed = deferred();
          const acknowledgements: Ack<ResumeSessionResult>[] = [];
          const response = clientResponses.shift();
          if (!response) throw new Error('Resume event has no response observer');
          const attempt = { response: response.promise, acknowledgements, completed: completed.promise };
          inFlight.push(completed.promise);
          next.resolve(attempt);
          const capture: AckCallback<ResumeSessionResult> = value => {
            acknowledgements.push(value);
            acknowledge(value);
          };
          const execution = Promise.resolve().then(() => original(request, capture))
            .catch((error: unknown) => { observerErrors.push(error); })
            .finally(() => completed.resolve());
          inFlight.push(execution);
        });
      }
      const begun = deferred<Attempt>();
      const response = deferred<Ack<ResumeSessionResult>>();
      waiting.push(begun);
      clientResponses.push(response);
      socket.emit('resume session', { token }, response.resolve);
      return bounded(begun.promise, 'resume event arrived');
    },
  };
  // Requests are emitted sequentially up to their arrival barrier, including repeated requests on one socket.
  const clientResponses: Array<ReturnType<typeof deferred<Ack<ResumeSessionResult>>>> = [];
  return subjectWithControls;
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function offline(fixture: Fixture) {
  const player = await join(await fixture.connect(), 'Ada', 'OWNERSHIP');
  const transport = fixture.transport(player.socket);
  const sessionId = transport.data.sessionId!;
  expect(fixture.runtime.connections.get(player.playerId)).toEqual({ socketId: transport.id, generation: 1 });
  await fixture.disconnect(player.socket);
  expect(fixture.runtime.connections.get(player.playerId)).toBeUndefined();
  return { ...player, sessionId };
}
async function finish(attempt: Attempt) {
  await bounded(attempt.completed, 'actual resume handler completed');
}
async function success(attempt: Attempt) {
  const result = dataOf(await bounded(attempt.response, 'successful resume ACK'));
  await finish(attempt);
  expect(attempt.acknowledgements).toHaveLength(1);
  return result;
}
async function assertSeatPreserved(fixture: Fixture, player: Player & { sessionId: string }) {
  const session = await fixture.runtime.persistence.playerSessions.findByTokenHash(createHash('sha256').update(player.token).digest());
  expect(session).toMatchObject({ id: player.sessionId, status: 'ACTIVE', playerId: player.playerId, roomId: player.room.roomId });
  const room = await stored(fixture.runtime.persistence, player.room.roomId);
  expect(room.gameSnapshot.members[player.playerId]?.membershipStatus).toBe('ACTIVE');
  expect(Object.keys(room.gameSnapshot.members)).toEqual([player.playerId]);
  expect(room.hostPlayerId).toBe(player.playerId);
  expect(room.gameSnapshot.gameState.players[player.playerId]?.accountBalance).toBe(1500);
}
function expectUnbound(transport: AppSocket, player: Player) {
  expect(transport.data.playerId).toBeUndefined();
  expect(transport.rooms.has(publicRoomName(player.room.roomId))).toBe(false);
  expect(transport.rooms.has(privatePlayerRoomName(player.playerId))).toBe(false);
}
async function privateFence(socket: TestSocket) {
  // Unbound transports reject this command without mutation; its ACK follows all queued private packets.
  expect(await ack(callback => socket.emit('set ready', { ready: true }, callback))).toMatchObject({
    ok: false, error: { code: 'UNAUTHENTICATED' },
  });
}

describe('resume operation ownership across asynchronous transport boundaries', () => {
  it('rejects a transport disconnected while its binding waits in the room FIFO, then permits a valid retry', async () => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const fifo = fixture.gate();
      const blocking = fixture.runtime.commands.execute(player.room.roomId, () => undefined, {
        persistRoom: false,
        afterCommit: async () => { fifo.entered.resolve(); await fifo.released; },
      });
      fixture.inFlight.push(blocking);
      await bounded(fifo.entered.promise, 'room FIFO occupied after commit');
      const queued = deferred();
      const execute = fixture.runtime.commands.execute.bind(fixture.runtime.commands);
      const observeExecute: typeof fixture.runtime.commands.execute = (...args) => {
        const result = execute(...args);
        queued.resolve();
        return result;
      };
      vi.spyOn(fixture.runtime.commands, 'execute').mockImplementation(observeExecute);
      const socket = await fixture.connect();
      const attempt = await fixture.attempt(socket, player.token);
      await bounded(queued.promise, 'resume binding joined FIFO');
      await fixture.disconnect(socket);
      fifo.release();
      await finish(attempt);
      expect(fixture.runtime.connections.get(player.playerId)).toBeUndefined();
      expect(attempt.acknowledgements.filter(value => value.ok)).toHaveLength(0);
      await assertSeatPreserved(fixture, player);
      const returning = await fixture.connect();
      expect((await resume(returning, player.token)).playerId).toBe(player.playerId);
      expect(fixture.runtime.connections.get(player.playerId)).toEqual({ socketId: returning.id, generation: 2 });
    });
  });

  it('keeps newer live B authoritative when older still-live A finishes session processing later', async () => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const gate = fixture.pauseResume();
      const older = await fixture.connect();
      const olderTransport = fixture.transport(older);
      const privatePackets: PrivatePlayerState[] = [];
      const onPrivate = (state: PrivatePlayerState) => privatePackets.push(state);
      older.on('private player state', onPrivate);
      try {
        const a = await fixture.attempt(older, player.token);
        await bounded(gate.entered.promise, 'older live A paused');
        const newer = await fixture.connect();
        const b = await fixture.attempt(newer, player.token);
        expect((await success(b)).playerId).toBe(player.playerId);
        const owner = fixture.runtime.connections.get(player.playerId)!;
        expect(owner).toEqual({ socketId: newer.id, generation: 2 });
        gate.release();
        expect(await bounded(a.response, 'stale A rejection')).toMatchObject({ ok: false, error: { code: 'SESSION_REPLACED' } });
        await finish(a);
        await privateFence(older);
        expect(older.connected).toBe(true);
        expect(newer.connected).toBe(true);
        expect(fixture.runtime.connections.get(player.playerId)).toEqual(owner);
        expectUnbound(olderTransport, player);
        expect(privatePackets).toEqual([]);
        expect(a.acknowledgements).toHaveLength(1);
        await assertSeatPreserved(fixture, player);
      } finally { older.off('private player state', onPrivate); }
    });
  });

  it('coalesces authority for three overlapping resumes on the same live socket without stale generations or duplicate success ACKs', async () => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const gateA = fixture.pauseResume();
      const gateB = fixture.pauseResume();
      const socket = await fixture.connect();
      const a = await fixture.attempt(socket, player.token);
      await bounded(gateA.entered.promise, 'first same-socket resume paused');
      const b = await fixture.attempt(socket, player.token);
      await bounded(gateB.entered.promise, 'second same-socket resume paused');
      const c = await fixture.attempt(socket, player.token);
      expect((await success(c)).playerId).toBe(player.playerId);
      const owner = fixture.runtime.connections.get(player.playerId)!;
      gateB.release();
      gateA.release();
      for (const stale of [a, b]) {
        expect(await bounded(stale.response, 'same-socket stale ACK')).toMatchObject({ ok: false, error: { code: 'SESSION_REPLACED' } });
        await finish(stale);
        expect(stale.acknowledgements).toHaveLength(1);
      }
      expect(owner).toEqual({ socketId: socket.id, generation: 2 });
      expect(fixture.runtime.connections.get(player.playerId)).toEqual(owner);
      expect(fixture.transport(socket).data.connectionGeneration).toBe(owner.generation);
      expect(fixture.transport(socket).rooms.has(privatePlayerRoomName(player.playerId))).toBe(true);
      expect((await ack(callback => socket.emit('set ready', { ready: true }, callback))).ok).toBe(true);
      await assertSeatPreserved(fixture, player);
    });
  });

  it('keeps live B and its private rooms when already-bound A finishes an old room join after replacement', async () => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const older = await fixture.connect();
      const olderTransport = fixture.transport(older);
      const gate = fixture.gate();
      const joinRoom = olderTransport.join.bind(olderTransport);
      vi.spyOn(olderTransport, 'join').mockImplementationOnce(async rooms => {
        gate.entered.resolve();
        await gate.released;
        await joinRoom(rooms);
      });
      const privatePackets: PrivatePlayerState[] = [];
      const onPrivate = (state: PrivatePlayerState) => privatePackets.push(state);
      const disconnected = deferred();
      const onDisconnect = () => disconnected.resolve();
      older.on('private player state', onPrivate);
      older.once('disconnect', onDisconnect);
      try {
        const a = await fixture.attempt(older, player.token);
        await bounded(gate.entered.promise, 'A bound but join completion pending');
        expect(fixture.runtime.connections.get(player.playerId)).toEqual({ socketId: older.id, generation: 2 });
        const newer = await fixture.connect();
        const b = await fixture.attempt(newer, player.token);
        expect((await success(b)).playerId).toBe(player.playerId);
        await bounded(disconnected.promise, 'A receives replacement disconnect after all earlier packets');
        const ownerB = fixture.runtime.connections.get(player.playerId)!;
        expect(ownerB).toEqual({ socketId: newer.id, generation: 3 });
        gate.release();
        await finish(a);
        expect(a.acknowledgements.filter(value => value.ok)).toHaveLength(0);
        expect(fixture.runtime.connections.get(player.playerId)).toEqual(ownerB);
        expect(newer.connected).toBe(true);
        expect(olderTransport.rooms.size).toBe(0);
        expect(privatePackets).toEqual([]);
        const newerTransport = fixture.transport(newer);
        expect(newerTransport.rooms.has(publicRoomName(player.room.roomId))).toBe(true);
        expect(newerTransport.rooms.has(privatePlayerRoomName(player.playerId))).toBe(true);
        expect(fixture.runtime.connections.deactivate(player.playerId, olderTransport.id, 2)).toBe(false);
        await assertSeatPreserved(fixture, player);
      } finally {
        older.off('private player state', onPrivate);
        older.off('disconnect', onDisconnect);
      }
    });
  });

  it('does not let an older same-socket join completion clear the newer generation or its public/private rooms', async () => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const socket = await fixture.connect();
      const transport = fixture.transport(socket);
      const gate = fixture.gate();
      const joinRoom = transport.join.bind(transport);
      vi.spyOn(transport, 'join').mockImplementationOnce(async rooms => {
        gate.entered.resolve();
        await gate.released;
        await joinRoom(rooms);
      });
      const a = await fixture.attempt(socket, player.token);
      await bounded(gate.entered.promise, 'older binding waits for room join');
      const ownerA = fixture.runtime.connections.get(player.playerId)!;
      expect(ownerA.generation).toBe(2);
      const b = await fixture.attempt(socket, player.token);
      expect((await success(b)).playerId).toBe(player.playerId);
      const ownerB = fixture.runtime.connections.get(player.playerId)!;
      expect(ownerB).toEqual({ socketId: socket.id, generation: 3 });
      gate.release();
      expect(await bounded(a.response, 'older join completion rejection')).toMatchObject({ ok: false, error: { code: 'SESSION_REPLACED' } });
      await finish(a);
      expect(fixture.runtime.connections.get(player.playerId)).toEqual(ownerB);
      expect(transport.data.connectionGeneration).toBe(ownerB.generation);
      expect(transport.rooms.has(publicRoomName(player.room.roomId))).toBe(true);
      expect(transport.rooms.has(privatePlayerRoomName(player.playerId))).toBe(true);
      expect(fixture.runtime.connections.deactivate(player.playerId, transport.id, ownerA.generation)).toBe(false);
      expect((await ack(callback => socket.emit('set ready', { ready: true }, callback))).ok).toBe(true);
    });
  });

  it.each(['room join', 'deadline lookup'] as const)('cleans an owner disconnected during %s and preserves a valid retry', async boundary => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const socket = await fixture.connect();
      const transport = fixture.transport(socket);
      const gate = fixture.gate();
      if (boundary === 'room join') {
        const joinRoom = transport.join.bind(transport);
        vi.spyOn(transport, 'join').mockImplementationOnce(async rooms => {
          gate.entered.resolve();
          await gate.released;
          await joinRoom(rooms);
        });
      } else {
        const find = fixture.runtime.persistence.rooms.findById.bind(fixture.runtime.persistence.rooms);
        let pending = true;
        vi.spyOn(fixture.runtime.persistence.rooms, 'findById').mockImplementation(async (...args) => {
          const room = await find(...args);
          if (pending && transport.data.playerId === player.playerId && transport.rooms.has(privatePlayerRoomName(player.playerId))) {
            pending = false;
            gate.entered.resolve();
            await gate.released;
          }
          return room;
        });
      }
      const attempt = await fixture.attempt(socket, player.token);
      await bounded(gate.entered.promise, 'resume waits after binding');
      const owner = fixture.runtime.connections.get(player.playerId)!;
      expect(owner).toEqual({ socketId: transport.id, generation: 2 });
      await fixture.disconnect(socket);
      expect(fixture.runtime.connections.get(player.playerId)).toBeUndefined();
      gate.release();
      await finish(attempt);
      expect(attempt.acknowledgements.filter(value => value.ok)).toHaveLength(0);
      expect(fixture.runtime.connections.get(player.playerId)).toBeUndefined();
      expect(transport.rooms.size).toBe(0);
      await assertSeatPreserved(fixture, player);
      const returning = await fixture.connect();
      expect((await resume(returning, player.token)).playerId).toBe(player.playerId);
      expect(fixture.runtime.connections.get(player.playerId)).toEqual({ socketId: returning.id, generation: 3 });
    });
  });

  it('removes exactly the acknowledged generation on immediate disconnect and preserves the same token and seat', async () => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const socket = await fixture.connect();
      const attempt = await fixture.attempt(socket, player.token);
      expect((await success(attempt)).playerId).toBe(player.playerId);
      const active = fixture.runtime.connections.get(player.playerId)!;
      expect(active).toEqual({ socketId: socket.id, generation: 2 });
      const transport = await fixture.disconnect(socket);
      expect(fixture.runtime.connections.get(player.playerId)).toBeUndefined();
      expect(transport.rooms.size).toBe(0);
      expect(attempt.acknowledgements.filter(value => value.ok)).toHaveLength(1);
      await assertSeatPreserved(fixture, player);
      const returning = await fixture.connect();
      await resume(returning, player.token);
      expect(fixture.runtime.connections.deactivate(player.playerId, transport.id, active.generation)).toBe(false);
      expect(fixture.runtime.connections.get(player.playerId)).toEqual({ socketId: returning.id, generation: 3 });
    });
  });

  it.each(['deadline room lookup', 'reconciliation FIFO'] as const)('preserves current-player recovery after the bound resume loses ownership during %s', async boundary => {
    await usingFixture(async fixture => {
      const host = await join(await fixture.connect(), 'Host', 'OWNER-RECOVERY');
      const guest = await join(await fixture.connect(), 'Guest', 'OWNER-RECOVERY');
      await ack(callback => host.socket.emit('set appearance', { characterId: 'dog' }, callback));
      await ack(callback => guest.socket.emit('set appearance', { characterId: 'cat' }, callback));
      expect((await ready(host.socket)).ok).toBe(true);
      expect((await ready(guest.socket)).ok).toBe(true);
      expect((await start(host.socket)).ok).toBe(true);
      await mutateRoom(fixture.runtime.persistence, host.room.roomId, room => {
        room.gameSnapshot.gameState.boardState.currentPlayer = { id: host.playerId, hasMoved: false };
        room.gameSnapshot.gameState.boardState.turnRecovery = null;
      });
      if (boundary === 'reconciliation FIFO') await fixture.disconnect(host.socket);
      const socket = await fixture.connect();
      const transport = fixture.transport(socket);
      const gate = fixture.gate();
      let pending = true;
      if (boundary === 'deadline room lookup') {
        const find = fixture.runtime.persistence.rooms.findById.bind(fixture.runtime.persistence.rooms);
        vi.spyOn(fixture.runtime.persistence.rooms, 'findById').mockImplementation(async (...args) => {
          const room = await find(...args);
          if (pending && transport.data.playerId === host.playerId && transport.rooms.has(privatePlayerRoomName(host.playerId))) {
            pending = false;
            gate.entered.resolve();
            await gate.released;
          }
          return room;
        });
      } else {
        const execute = fixture.runtime.commands.execute.bind(fixture.runtime.commands);
        const paused: typeof fixture.runtime.commands.execute = async (...args) => {
          if (pending && transport.data.playerId === host.playerId && args[2]?.persistRoom !== false) {
            pending = false;
            gate.entered.resolve();
            await gate.released;
          }
          return execute(...args);
        };
        vi.spyOn(fixture.runtime.commands, 'execute').mockImplementation(paused);
      }
      const attempt = await fixture.attempt(socket, host.token);
      await bounded(gate.entered.promise, 'reconciliation after binding');
      expect(fixture.runtime.connections.get(host.playerId)).toEqual({ socketId: transport.id, generation: 2 });
      await fixture.disconnect(socket);
      const armed = (await stored(fixture.runtime.persistence, host.room.roomId)).gameSnapshot.gameState.boardState.turnRecovery;
      expect(armed).toMatchObject({ playerId: host.playerId });
      gate.release();
      await finish(attempt);
      const room = await stored(fixture.runtime.persistence, host.room.roomId);
      expect(room.gameSnapshot.gameState.boardState.turnRecovery).toEqual(armed);
      expect(fixture.runtime.connections.get(host.playerId)).toBeUndefined();
      expect(attempt.acknowledgements.filter(value => value.ok)).toHaveLength(0);
      expect(fixture.runtime.connections.get(guest.playerId)?.socketId).toBe(guest.socket.id);
      expect(transport.rooms.size).toBe(0);
    });
  });

  it('restores current-player recovery if disconnect occurs after its clear was saved to a draft but before transaction publication', async () => {
    await usingFixture(async fixture => {
      const host = await join(await fixture.connect(), 'Host', 'OWNER-COMMIT');
      const guest = await join(await fixture.connect(), 'Guest', 'OWNER-COMMIT');
      expect((await ready(host.socket)).ok).toBe(true);
      expect((await ready(guest.socket)).ok).toBe(true);
      expect((await start(host.socket)).ok).toBe(true);
      await mutateRoom(fixture.runtime.persistence, host.room.roomId, room => {
        room.gameSnapshot.gameState.boardState.currentPlayer = { id: host.playerId, hasMoved: false };
        room.gameSnapshot.gameState.boardState.turnRecovery = null;
      });
      await fixture.disconnect(host.socket);
      const before = await stored(fixture.runtime.persistence, host.room.roomId);
      expect(before.gameSnapshot.gameState.boardState.turnRecovery).toMatchObject({ playerId: host.playerId });
      const socket = await fixture.connect();
      const transport = fixture.transport(socket);
      const gate = fixture.gate();
      let pending = true;
      const transact = fixture.runtime.persistence.transaction.bind(fixture.runtime.persistence);
      const observed: typeof fixture.runtime.persistence.transaction = operation => transact(async transaction => {
        const save = transaction.rooms.save.bind(transaction.rooms);
        transaction.rooms.save = async input => {
          const result = await save(input);
          if (pending && input.id === host.room.roomId && transport.data.playerId === host.playerId
            && input.gameSnapshot.gameState.boardState.turnRecovery === null) {
            pending = false;
            gate.entered.resolve();
            await gate.released;
          }
          return result;
        };
        return operation(transaction);
      });
      vi.spyOn(fixture.runtime.persistence, 'transaction').mockImplementation(observed);
      const attempt = await fixture.attempt(socket, host.token);
      await bounded(gate.entered.promise, 'recovery clear saved only in transaction draft');
      expect(fixture.runtime.connections.get(host.playerId)).toEqual({ socketId: transport.id, generation: 2 });
      await fixture.disconnect(socket);
      expect((await stored(fixture.runtime.persistence, host.room.roomId)).gameSnapshot.gameState.boardState.turnRecovery)
        .toEqual(before.gameSnapshot.gameState.boardState.turnRecovery);
      gate.release();
      await finish(attempt);
      const after = await stored(fixture.runtime.persistence, host.room.roomId);
      expect(after.gameSnapshot.gameState.boardState.turnRecovery).toMatchObject({
        playerId: host.playerId, turnNumber: before.gameSnapshot.gameState.boardState.turnNumber,
      });
      expect(after.gameSnapshot.gameState.players).toEqual(before.gameSnapshot.gameState.players);
      expect(after.gameSnapshot.gameState.turnInfo).toEqual(before.gameSnapshot.gameState.turnInfo);
      expect(fixture.runtime.connections.get(host.playerId)).toBeUndefined();
      expect(attempt.acknowledgements.filter(value => value.ok)).toHaveLength(0);
      expect(transport.rooms.size).toBe(0);
    });
  });

  it('atomically rejects an older queued resume for another player after the same socket binds a different room', async () => {
    await usingFixture(async fixture => {
      const first = await offline(fixture);
      const second = await join(await fixture.connect(), 'Grace', 'OTHER-OWNER');
      await fixture.disconnect(second.socket);
      const fifo = fixture.gate();
      const blocking = fixture.runtime.commands.execute(first.room.roomId, () => undefined, {
        persistRoom: false, afterCommit: async () => { fifo.entered.resolve(); await fifo.released; },
      });
      fixture.inFlight.push(blocking);
      await bounded(fifo.entered.promise, 'first player room FIFO blocked');
      const queued = deferred();
      const execute = fixture.runtime.commands.execute.bind(fixture.runtime.commands);
      const observe: typeof fixture.runtime.commands.execute = (...args) => {
        const result = execute(...args);
        if (args[0] === first.room.roomId) queued.resolve();
        return result;
      };
      vi.spyOn(fixture.runtime.commands, 'execute').mockImplementation(observe);
      const socket = await fixture.connect();
      const older = await fixture.attempt(socket, first.token);
      await bounded(queued.promise, 'older first-player attempt passed initial socket identity check');
      const newer = await fixture.attempt(socket, second.token);
      expect((await success(newer)).playerId).toBe(second.playerId);
      const transport = fixture.transport(socket);
      const owner = fixture.runtime.connections.get(second.playerId)!;
      expect(owner).toEqual({ socketId: socket.id, generation: 2 });
      fifo.release();
      expect(await bounded(older.response, 'cross-player conflict after FIFO')).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
      await finish(older);
      expect(fixture.runtime.connections.get(first.playerId)).toBeUndefined();
      expect(fixture.runtime.connections.get(second.playerId)).toEqual(owner);
      expect(transport.data.playerId).toBe(second.playerId);
      expect(transport.data.connectionGeneration).toBe(owner.generation);
      expect(transport.rooms.has(publicRoomName(first.room.roomId))).toBe(false);
      expect(transport.rooms.has(privatePlayerRoomName(first.playerId))).toBe(false);
      expect(transport.rooms.has(publicRoomName(second.room.roomId))).toBe(true);
      expect(transport.rooms.has(privatePlayerRoomName(second.playerId))).toBe(true);
      expect(older.acknowledgements).toHaveLength(1);
      await assertSeatPreserved(fixture, first);
      expect((await stored(fixture.runtime.persistence, second.room.roomId)).gameSnapshot.members[second.playerId]?.membershipStatus).toBe('ACTIVE');
    });
  });

  it.each(['session revoked', 'room deleted'] as const)('rejects binding after %s while session resume was paused', async invalidation => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const gate = fixture.pauseResume();
      const socket = await fixture.connect();
      const transport = fixture.transport(socket);
      const privatePackets: PrivatePlayerState[] = [];
      const onPrivate = (state: PrivatePlayerState) => privatePackets.push(state);
      socket.on('private player state', onPrivate);
      try {
        const attempt = await fixture.attempt(socket, player.token);
        await bounded(gate.entered.promise, 'session completed before invalidation');
        if (invalidation === 'session revoked') {
          expect(await fixture.runtime.persistence.playerSessions.revoke(player.sessionId, new Date())).toBe(true);
        } else {
          expect(await fixture.runtime.persistence.rooms.delete(player.room.roomId)).toBe(true);
        }
        gate.release();
        expect(await bounded(attempt.response, 'invalidation failure ACK')).toMatchObject({
          ok: false, error: { code: invalidation === 'session revoked' ? 'SESSION_REVOKED' : 'ROOM_GONE' },
        });
        await finish(attempt);
        await privateFence(socket);
        expect(attempt.acknowledgements).toHaveLength(1);
        expect(fixture.runtime.connections.get(player.playerId)).toBeUndefined();
        expectUnbound(transport, player);
        expect(privatePackets).toEqual([]);
      } finally { socket.off('private player state', onPrivate); }
    });
  });
  it('keeps successor subscriptions when an older same-socket cleanup leave completes late', async () => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const socket = await fixture.connect();
      const transport = fixture.transport(socket);
      const leaveGate = fixture.gate();
      const newestBound = deferred();
      const leave = transport.leave.bind(transport);
      let pauseLeave = true;
      vi.spyOn(transport, 'leave').mockImplementation(room => {
        if (pauseLeave && room === publicRoomName(player.room.roomId)) {
          pauseLeave = false;
          leaveGate.entered.resolve();
          return leaveGate.released.then(() => leave(room));
        }
        return leave(room);
      });
      const find = fixture.runtime.persistence.rooms.findById.bind(fixture.runtime.persistence.rooms);
      let fail = true;
      vi.spyOn(fixture.runtime.persistence.rooms, 'findById').mockImplementation(async (...args) => {
        if (fail && transport.rooms.has(privatePlayerRoomName(player.playerId))) {
          fail = false;
          throw new CommandError('CONFLICT', 'Snapshot temporarily unavailable.', true);
        }
        return find(...args);
      });
      const activate = fixture.runtime.connections.activateResume.bind(fixture.runtime.connections);
      vi.spyOn(fixture.runtime.connections, 'activateResume').mockImplementation((...args) => {
        const result = activate(...args);
        if (result?.generation === 3) newestBound.resolve();
        return result;
      });
      const older = await fixture.attempt(socket, player.token);
      await bounded(leaveGate.entered.promise, 'old generation cleanup leave is pending');
      const newer = await fixture.attempt(socket, player.token);
      await bounded(newestBound.promise, 'successor owns the same live socket');
      // The no-op ACK is an event-loop/packet barrier, not an elapsed-time sleep.
      expect(await ack<JoinRoomResult>(callback => socket.emit('join room', { name: 'Fence', roomCode: player.room.roomCode }, callback)))
        .toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
      leaveGate.release();
      expect((await success(newer)).playerId).toBe(player.playerId);
      await finish(older);
      expect(await bounded(older.response, 'older failure ACK')).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
      expect(transport.data.connectionGeneration).toBe(3);
      expect(transport.rooms.has(publicRoomName(player.room.roomId))).toBe(true);
      expect(transport.rooms.has(privatePlayerRoomName(player.playerId))).toBe(true);
      expect(fixture.runtime.connections.get(player.playerId)).toEqual({ socketId: socket.id, generation: 3 });
      await assertSeatPreserved(fixture, player);
    });
  });

  it.each(['session revoked', 'room deleted'] as const)('revalidates final private publication after %s while waiting for the final room FIFO', async invalidation => {
    await usingFixture(async fixture => {
      const player = await offline(fixture);
      const socket = await fixture.connect();
      const transport = fixture.transport(socket);
      const gate = fixture.gate();
      const packets: PrivatePlayerState[] = [];
      const onPrivate = (state: PrivatePlayerState) => packets.push(state);
      socket.on('private player state', onPrivate);
      let pending = true;
      const execute = fixture.runtime.commands.execute.bind(fixture.runtime.commands);
      const pauseFinal: typeof fixture.runtime.commands.execute = async (...args) => {
        if (pending && args[2]?.persistRoom === false && transport.rooms.has(privatePlayerRoomName(player.playerId))) {
          pending = false;
          gate.entered.resolve();
          await gate.released;
        }
        return execute(...args);
      };
      vi.spyOn(fixture.runtime.commands, 'execute').mockImplementation(pauseFinal);
      try {
        const attempt = await fixture.attempt(socket, player.token);
        await bounded(gate.entered.promise, 'joined resume waits for final validation');
        if (invalidation === 'session revoked') await fixture.runtime.persistence.playerSessions.revoke(player.sessionId, new Date());
        else await fixture.runtime.persistence.rooms.delete(player.room.roomId);
        gate.release();
        expect(await bounded(attempt.response, 'final invalidation ACK')).toMatchObject({
          ok: false, error: { code: invalidation === 'session revoked' ? 'SESSION_REVOKED' : 'ROOM_GONE' },
        });
        await finish(attempt);
        await privateFence(socket);
        expect(attempt.acknowledgements).toHaveLength(1);
        expect(packets).toEqual([]);
        expect(fixture.runtime.connections.get(player.playerId)).toBeUndefined();
        expectUnbound(transport, player);
      } finally { socket.off('private player state', onPrivate); }
    });
  });

});
