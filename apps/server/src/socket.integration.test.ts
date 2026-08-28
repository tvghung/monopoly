import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import {
  createCanonicalDecks,
  SOCKET_PROTOCOL_VERSION,
  tileState,
  type Ack,
  type AckCallback,
  type ClientToServerEvents,
  type JoinRoomResult,
  type LeaveRoomResult,
  type PrivateOffer,
  type PublicRoomState,
  type ResumeSessionResult,
  type ServerToClientEvents,
  type SessionReplacedInfo,
  type SetAppearanceRequest,
  type TradeOfferRequest,
} from '@monopoly/shared';
import { Pool } from 'pg';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PersistenceTimingConfig } from './config.js';
import { createServer } from './createServer.js';
import { forcedSaleGrossPrice } from './game';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import { migrateDatabase } from './persistence/migrate.js';
import { PostgresPersistenceStore } from './persistence/postgres.js';
import type {
  PersistenceStore,
  PersistenceUnitOfWork,
  RoomRecord,
} from './persistence/types.js';
import { assertSupportedRoomSnapshot, type RoomSnapshot } from './rooms.js';
import { createAppRuntime, type AppRuntime } from './services/runtime.js';
import { registerSocketHandlers } from './socket/index.js';

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

interface RunningServer {
  runtime: AppRuntime;
  url: string;
  close: () => Promise<void>;
}

interface PlayerConnection {
  socket: TestSocket;
  token: string;
  playerId: string;
  room: PublicRoomState;
}

class FailAfterCommandPersistenceStore extends InMemoryPersistenceStore<RoomSnapshot> {
  failNextTransactionAfterOperation = false;

  override transaction<TResult>(
    operation: (transaction: PersistenceUnitOfWork<RoomSnapshot>) => Promise<TResult>,
  ): Promise<TResult> {
    if (!this.failNextTransactionAfterOperation) return super.transaction(operation);
    this.failNextTransactionAfterOperation = false;
    return super.transaction<TResult>(async (transaction) => {
      await operation(transaction);
      throw Object.assign(new Error('Simulated database outage'), { code: 'ECONNRESET' });
    });
  }
}

const TEST_TIMING: PersistenceTimingConfig = {
  reconnectGraceMs: 60_000,
  paymentShortfallActionTimeoutMs: 120_000,
  cardAwaitingDrawTimeoutMs: 20_000,
  cardRevealedTimeoutMs: 30_000,
  pendingSessionTtlMs: 5 * 60_000,
  terminalSessionRetentionMs: 7 * 24 * 60 * 60_000,
  lobbyRetentionMs: 24 * 60 * 60_000,
  inProgressRetentionMs: 30 * 24 * 60 * 60_000,
  finishedRetentionMs: 7 * 24 * 60 * 60_000,
};

const runningServers: RunningServer[] = [];
const openSockets: TestSocket[] = [];

afterEach(async () => {
  for (const socket of openSockets.splice(0)) socket.disconnect();
  await Promise.all(runningServers.splice(0).map((subject) => subject.close()));
});

async function startServer(
  persistence: PersistenceStore<RoomSnapshot> =
    new InMemoryPersistenceStore<RoomSnapshot>(),
): Promise<RunningServer> {
  const runtime = createAppRuntime(persistence, TEST_TIMING);
  const { server, io } = createServer(runtime);
  registerSocketHandlers(io, runtime);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  let closed = false;
  const subject: RunningServer = {
    runtime,
    url: `http://127.0.0.1:${String(address.port)}`,
    close: async () => {
      if (closed) return;
      closed = true;
      runtime.flags.shuttingDown = true;
      await io.close();
    },
  };
  runningServers.push(subject);
  return subject;
}

async function connect(url: string): Promise<TestSocket> {
  const socket: TestSocket = createClient(url, {
    auth: { protocolVersion: SOCKET_PROTOCOL_VERSION },
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  openSockets.push(socket);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Socket connection timed out')),
      2_000,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return socket;
}

function waitForAck<TResult>(
  emit: (acknowledge: AckCallback<TResult>) => void,
): Promise<Ack<TResult>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Socket acknowledgement timed out')),
      2_000,
    );
    emit((acknowledgement) => {
      clearTimeout(timer);
      resolve(acknowledgement);
    });
  });
}

function successData<TResult>(acknowledgement: Ack<TResult>): TResult {
  if (!acknowledgement.ok) {
    throw new Error(
      `Expected successful acknowledgement, received ${acknowledgement.error.code}: ${acknowledgement.error.message}`,
    );
  }
  if (acknowledgement.data === undefined) {
    throw new Error('Expected acknowledgement data');
  }
  return acknowledgement.data;
}

async function joinPlayer(
  socket: TestSocket,
  name: string,
  roomCode: string,
): Promise<PlayerConnection> {
  const admission = successData(
    await waitForAck<JoinRoomResult>((acknowledge) => {
      socket.emit('join room', { name, roomCode }, acknowledge);
    }),
  );
  if (admission.kind !== 'PENDING') {
    throw new Error('Expected a pending player admission');
  }

  const resumed = await resumePlayer(socket, admission.token);
  return {
    socket,
    token: admission.token,
    playerId: resumed.playerId,
    room: resumed.room,
  };
}

async function resumePlayer(
  socket: TestSocket,
  token: string,
): Promise<ResumeSessionResult> {
  return successData(
    await waitForAck<ResumeSessionResult>((acknowledge) => {
      socket.emit('resume session', { token }, acknowledge);
    }),
  );
}

async function setReady(socket: TestSocket, ready = true): Promise<Ack> {
  if (ready) {
    await waitForAck((acknowledge) => {
      socket.emit('set appearance', { characterId: 'dog' }, acknowledge);
    });
  }
  return waitForAck((acknowledge) => {
    socket.emit('set ready', { ready }, acknowledge);
  });
}

async function setReadyOnly(socket: TestSocket, ready = true): Promise<Ack> {
  return waitForAck((acknowledge) => {
    socket.emit('set ready', { ready }, acknowledge);
  });
}

async function setAppearance(socket: TestSocket, request: SetAppearanceRequest): Promise<Ack> {
  return waitForAck((acknowledge) => {
    socket.emit('set appearance', request, acknowledge);
  });
}

async function startGame(socket: TestSocket): Promise<Ack> {
  return waitForAck((acknowledge) => {
    socket.emit('start game', acknowledge);
  });
}

async function playAgain(socket: TestSocket): Promise<Ack> {
  return waitForAck((acknowledge) => {
    socket.emit('play again', acknowledge);
  });
}

async function rollDice(socket: TestSocket): Promise<Ack> {
  return waitForAck((acknowledge) => {
    socket.emit('roll dice', acknowledge);
  });
}

async function buyProperty(socket: TestSocket, operationId: string): Promise<Ack> {
  return waitForAck((acknowledge) => {
    socket.emit('buy property', { operationId }, acknowledge);
  });
}

async function drawCard(socket: TestSocket, operationId: string): Promise<Ack> {
  return waitForAck((acknowledge) => {
    socket.emit('draw card', { operationId }, acknowledge);
  });
}

async function dismissCard(socket: TestSocket, operationId: string): Promise<Ack> {
  return waitForAck((acknowledge) => {
    socket.emit('dismiss card', { operationId }, acknowledge);
  });
}

async function leaveRoom(socket: TestSocket): Promise<Ack<LeaveRoomResult>> {
  return waitForAck((acknowledge) => {
    socket.emit('leave room', acknowledge);
  });
}

async function waitUntil(
  predicate: () => boolean,
  message: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function mutateRoom(
  persistence: PersistenceStore<RoomSnapshot>,
  roomId: string,
  mutate: (room: RoomRecord<RoomSnapshot>) => void,
): Promise<RoomRecord<RoomSnapshot>> {
  const room = await persistence.rooms.findById(roomId);
  if (!room) throw new Error(`Room ${roomId} was not found`);
  mutate(room);
  return persistence.rooms.save({
    id: room.id,
    expectedVersion: room.aggregateVersion,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    snapshotSchemaVersion: room.snapshotSchemaVersion,
    gameSnapshot: room.gameSnapshot,
    nextActionAt: room.nextActionAt,
    lastActivityAt: room.lastActivityAt,
    expiresAt: room.expiresAt,
  });
}

describe('Socket.IO durable player lifecycle', () => {
  it.each([SOCKET_PROTOCOL_VERSION - 1, SOCKET_PROTOCOL_VERSION + 1])(
    'rejects incompatible protocol v%i before registering application handlers',
    async (incompatibleVersion) => {
      const subject = await startServer();
      const socket: TestSocket = createClient(subject.url, {
        auth: { protocolVersion: incompatibleVersion },
        forceNew: true,
        reconnection: false,
        transports: ['websocket'],
      });
      openSockets.push(socket);

      const error = await new Promise<Error>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Protocol rejection timed out')),
          2_000,
        );
        socket.once('connect', () => {
          clearTimeout(timer);
          reject(new Error('An incompatible protocol connected successfully'));
        });
        socket.once('connect_error', (connectError) => {
          clearTimeout(timer);
          resolve(connectError);
        });
      });

      expect(error).toMatchObject({
        message: 'Client protocol version is no longer supported.',
        data: {
          code: 'UPGRADE_REQUIRED',
          message: 'Client protocol version is no longer supported.',
          retryable: false,
        },
      });
      expect(socket.connected).toBe(false);
    },
  );

  it('uses two-step admission and assigns a stable player ID distinct from socket.id', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const socket = await connect(subject.url);

    const join = successData(
      await waitForAck<JoinRoomResult>((acknowledge) => {
        socket.emit(
          'join room',
          { name: 'Ada', roomCode: 'stable-id' },
          acknowledge,
        );
      }),
    );

    expect(join.kind).toBe('PENDING');
    expect(await persistence.rooms.findByCode('STABLE-ID')).toBeNull();
    if (join.kind !== 'PENDING') throw new Error('Expected pending admission');

    const resumed = await resumePlayer(socket, join.token);

    expect(resumed.playerId).not.toBe(socket.id);
    expect(resumed.room).toMatchObject({
      status: 'LOBBY',
      hostPlayerId: resumed.playerId,
      players: [
        {
          playerId: resumed.playerId,
          name: 'Ada',
          ready: false,
          connected: true,
        },
      ],
    });
    expect(JSON.stringify(resumed.room)).not.toContain(join.token);
  });

  it('rejects an unknown reconnect credential without creating or binding a seat', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const socket = await connect(subject.url);

    const rejected = await waitForAck<ResumeSessionResult>((acknowledge) => {
      socket.emit('resume session', { token: 'A'.repeat(43) }, acknowledge);
    });

    expect(rejected).toMatchObject({
      ok: false,
      error: {
        code: 'SESSION_INVALID',
        retryable: false,
      },
    });

    const joined = await joinPlayer(socket, 'Ada', 'after-invalid-token');
    expect(joined.room.players).toHaveLength(1);
    expect(joined.room.players[0]?.playerId).toBe(joined.playerId);
  });

  it('reclaims the same seat and persisted lobby state on a new socket', async () => {
    const subject = await startServer();
    const firstSocket = await connect(subject.url);
    const player = await joinPlayer(firstSocket, 'Ada', 'refresh-room');
    expect((await setAppearance(firstSocket, { characterId: 'elephant', color: 'pink' })).ok).toBe(true);
    expect((await setReadyOnly(firstSocket)).ok).toBe(true);

    firstSocket.disconnect();
    await waitUntil(
      () => !subject.runtime.connections.isConnected(player.playerId),
      'The disconnected transport remained active',
    );

    const refreshedSocket = await connect(subject.url);
    const resumed = await resumePlayer(refreshedSocket, player.token);

    expect(resumed.playerId).toBe(player.playerId);
    expect(resumed.room.players).toHaveLength(1);
    expect(resumed.room.players[0]).toMatchObject({
      playerId: player.playerId,
      color: 'pink',
      characterId: 'elephant',
      ready: true,
      connected: true,
    });
    expect(resumed.room.gameState.players[player.playerId]?.accountBalance).toBe(1500);
  });

  it('does not revise or broadcast a draft when durable commit fails', async () => {
    const persistence = new FailAfterCommandPersistenceStore();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'failed-commit');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'failed-commit');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);
    const before = await persistence.rooms.findById(host.room.roomId);
    if (!before) throw new Error('Expected a persisted room before the failure');

    await new Promise((resolve) => setTimeout(resolve, 20));
    const updates: PublicRoomState[] = [];
    host.socket.on('update', (room) => updates.push(room));
    persistence.failNextTransactionAfterOperation = true;

    const acknowledgement = await waitForAck((acknowledge) => {
      host.socket.emit('send chat', 'This message must roll back', acknowledge);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(acknowledgement).toMatchObject({
      ok: false,
      error: { code: 'DATABASE_UNAVAILABLE', retryable: true },
    });
    expect(updates).toHaveLength(0);
    expect(await persistence.rooms.findById(host.room.roomId)).toEqual(before);
  });

  it('lets the newest connection win without a stale disconnect deactivating it', async () => {
    const subject = await startServer();
    const oldSocket = await connect(subject.url);
    const player = await joinPlayer(oldSocket, 'Ada', 'duplicate-room');
    const replacementSocket = await connect(subject.url);
    const replaced = new Promise<SessionReplacedInfo>((resolve) => {
      oldSocket.once('session replaced', resolve);
    });

    const resumed = await resumePlayer(replacementSocket, player.token);

    await expect(replaced).resolves.toMatchObject({ code: 'SESSION_REPLACED' });
    await waitUntil(
      () => !oldSocket.connected,
      'The replaced socket was not disconnected',
    );
    expect(subject.runtime.connections.get(player.playerId)?.socketId).toBe(
      replacementSocket.id,
    );
    expect(resumed.playerId).toBe(player.playerId);
    expect((await setReady(replacementSocket)).ok).toBe(true);
    expect(subject.runtime.connections.isConnected(player.playerId)).toBe(true);
  });

  it('enforces host and ready authority before starting the game', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'lobby-rules');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'lobby-rules');

    expect((await setReady(host.socket)).ok).toBe(true);
    const notReadyStart = await startGame(host.socket);
    expect(notReadyStart).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect((await setReady(guest.socket)).ok).toBe(true);

    const guestStart = await startGame(guest.socket);
    expect(guestStart).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    const hostStart = await startGame(host.socket);
    expect(hostStart.ok).toBe(true);
    const stored = await persistence.rooms.findById(host.room.roomId);
    expect(stored).toMatchObject({
      status: 'IN_PROGRESS',
      hostPlayerId: host.playerId,
      gameSnapshot: {
        gameState: {
          boardState: {
            gameStarted: true,
            rollSequence: 0,
            currentPlayer: { hasMoved: false },
          },
        },
      },
    });
    const startedAt = stored?.gameSnapshot.gameState.boardState.gameStartedAt;
    expect(startedAt).toEqual(expect.any(String));
    expect(Number.isFinite(Date.parse(startedAt ?? ''))).toBe(true);
    const startingPlayerId = stored?.gameSnapshot.gameState.boardState.currentPlayer.id;
    expect([host.playerId, guest.playerId]).toContain(startingPlayerId);
    expect(stored?.gameSnapshot.gameState.boardState.players[0]).toBe(startingPlayerId);
  });

  it('lets only the finished host reset the same room for eligible players', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'play-again');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'play-again');
    const left = await joinPlayer(await connect(subject.url), 'Left', 'play-again');
    await setReady(host.socket);
    await setReady(guest.socket);
    await setReady(left.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    await mutateRoom(persistence, host.room.roomId, room => {
      const state = room.gameSnapshot.gameState;
      const hostPlayer = state.players[host.playerId];
      if (!hostPlayer) throw new Error('Expected the host player');
      state.boardState.gameStarted = true;
      state.boardState.winner = {
        playerId: host.playerId,
        name: hostPlayer.name,
        color: hostPlayer.color,
        characterId: hostPlayer.characterId,
      };
      state.boardState.players = [host.playerId];
      state.boardState.currentPlayer = { id: host.playerId, hasMoved: false };
      state.boardState.finishedPlayers[guest.playerId] = {
        name: 'Guest',
        color: 'blue',
        characterId: 'dog',
        reason: 'BANKRUPT',
        accountBalance: 0,
      };
      state.boardState.finishedPlayers[left.playerId] = {
        name: 'Left',
        color: 'green',
        characterId: 'dog',
        reason: 'LEFT',
        accountBalance: 0,
      };
      delete state.players[guest.playerId];
      delete state.players[left.playerId];
      room.gameSnapshot.members[guest.playerId].membershipStatus = 'FINISHED';
      room.gameSnapshot.members[guest.playerId].ready = false;
      room.gameSnapshot.members[left.playerId].membershipStatus = 'LEFT';
      room.gameSnapshot.members[left.playerId].ready = false;
      state.boardState.logs = ['old match log'];
      state.boardState.ownedProps[1] = { id: host.playerId, color: hostPlayer.color, houses: 3 };
    });

    const before = await persistence.rooms.findById(host.room.roomId);
    if (!before) throw new Error('Expected the finished room');
    await mutateRoom(persistence, host.room.roomId, room => {
      room.status = 'FINISHED';
    });
    const guestAttempt = await playAgain(guest.socket);
    expect(guestAttempt).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect((await playAgain(host.socket)).ok).toBe(true);

    const replayed = await persistence.rooms.findById(host.room.roomId);
    expect(replayed).toMatchObject({
      id: host.room.roomId,
      status: 'LOBBY',
      hostPlayerId: host.playerId,
      gameSnapshot: {
        members: {
          [host.playerId]: { membershipStatus: 'ACTIVE', ready: false },
          [guest.playerId]: { membershipStatus: 'ACTIVE', ready: false },
        },
        gameState: {
          boardState: {
            gameStarted: false,
            players: [host.playerId, guest.playerId],
            finishedPlayers: {},
            currentPlayer: { id: '', hasMoved: false },
            turnNumber: 0,
            logs: [],
            diceValue: { dice1: 0, dice2: 0 },
            rollSequence: 0,
            ownedProps: {},
            winner: null,
            paymentQueue: null,
            gameplayEvents: { sequence: 0, events: [] },
            activityFeed: { sequence: 0, events: [] },
          },
          players: {
            [host.playerId]: {
              name: 'Host',
              color: 'red',
              characterId: 'dog',
              currentTile: 0,
              accountBalance: 1500,
              heldJailFreeCardIds: [],
            },
            [guest.playerId]: {
              name: 'Guest',
              color: 'blue',
              characterId: 'dog',
              currentTile: 0,
              accountBalance: 1500,
              heldJailFreeCardIds: [],
            },
          },
          turnInfo: {},
          privateState: {
            decks: createCanonicalDecks(),
            forcedSaleProposal: null,
            privateGameplayEventsByPlayer: {},
            completedCardOperations: [],
          },
        },
      },
    });
    expect(replayed?.gameSnapshot.members[left.playerId]).toBeUndefined();
    expect((await playAgain(host.socket)).ok).toBe(false);
  });

  it('allows a one-player host replay after a leave and admits a new player into match two', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'one-player-replay');
    const leavingPlayer = await joinPlayer(await connect(subject.url), 'Leaving', 'one-player-replay');
    await setReady(host.socket);
    await setReady(leavingPlayer.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    const spectatorSocket = await connect(subject.url);
    const spectatorAdmission = successData(
      await waitForAck<JoinRoomResult>((acknowledge) => {
        spectatorSocket.emit('join room', { name: 'Viewer', roomCode: 'one-player-replay' }, acknowledge);
      }),
    );
    expect(spectatorAdmission).toMatchObject({ kind: 'SPECTATOR', role: 'SPECTATOR', playerId: null });
    const spectatorUpdates: PublicRoomState[] = [];
    spectatorSocket.on('update', room => spectatorUpdates.push(room));

    expect(successData(await leaveRoom(leavingPlayer.socket))).toEqual({ roomDeleted: false });
    const finished = await persistence.rooms.findById(host.room.roomId);
    expect(finished).toMatchObject({
      status: 'FINISHED',
      hostPlayerId: host.playerId,
      gameSnapshot: {
        members: {
          [host.playerId]: { membershipStatus: 'ACTIVE' },
          [leavingPlayer.playerId]: { membershipStatus: 'LEFT' },
        },
        gameState: {
          boardState: {
            winner: { playerId: host.playerId },
            players: [host.playerId],
          },
        },
      },
    });

    expect((await playAgain(host.socket)).ok).toBe(true);
    await waitUntil(
      () => spectatorUpdates.some(room => room.status === 'LOBBY'),
      'The spectator did not receive the replay lobby snapshot',
    );
    const replayed = await persistence.rooms.findById(host.room.roomId);
    expect(replayed).toMatchObject({
      id: host.room.roomId,
      code: 'ONE-PLAYER-REPLAY',
      status: 'LOBBY',
      hostPlayerId: host.playerId,
      gameSnapshot: {
        members: {
          [host.playerId]: { membershipStatus: 'ACTIVE', ready: false, joinOrder: 1 },
        },
        gameState: {
          boardState: {
            gameStarted: false,
            players: [host.playerId],
            currentPlayer: { id: '', hasMoved: false },
            turnNumber: 0,
            diceValue: { dice1: 0, dice2: 0 },
            rollSequence: 0,
            ownedProps: {},
            winner: null,
          },
          players: {
            [host.playerId]: { currentTile: 0, accountBalance: 1500, heldJailFreeCardIds: [] },
          },
          turnInfo: {},
        },
      },
    });
    expect(replayed?.gameSnapshot.members[leavingPlayer.playerId]).toBeUndefined();
    expect((await startGame(host.socket)).ok).toBe(false);

    const resumedHostSocket = await connect(subject.url);
    const resumedHost = await resumePlayer(resumedHostSocket, host.token);
    expect(resumedHost).toMatchObject({
      playerId: host.playerId,
      room: { roomId: host.room.roomId, roomCode: 'ONE-PLAYER-REPLAY', status: 'LOBBY' },
    });

    const newcomer = await joinPlayer(await connect(subject.url), 'New player', 'one-player-replay');
    expect(newcomer.playerId).not.toBe(host.playerId);
    expect((await setReady(resumedHostSocket)).ok).toBe(true);
    expect((await setReady(newcomer.socket)).ok).toBe(true);
    expect((await startGame(resumedHostSocket)).ok).toBe(true);
    const secondMatch = await persistence.rooms.findById(host.room.roomId);
    expect(secondMatch).toMatchObject({
      status: 'IN_PROGRESS',
      hostPlayerId: host.playerId,
      gameSnapshot: {
        gameState: {
          boardState: {
            gameStarted: true,
            rollSequence: 0,
            ownedProps: {},
          },
          turnInfo: {},
        },
      },
    });
    expect(secondMatch?.gameSnapshot.gameState.boardState.players).toEqual(
      expect.arrayContaining([host.playerId, newcomer.playerId]),
    );

    const revokedLeaveAttempt = await waitForAck((acknowledge) => {
      leavingPlayer.socket.emit('play again', acknowledge);
    });
    expect(revokedLeaveAttempt).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    expect(successData(await leaveRoom(spectatorSocket))).toEqual({ roomDeleted: false });
  });

  it('increments the durable gameplay roll sequence once for consecutive identical rolls', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'roll-sequence');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'roll-sequence');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2);
    try {
      const firstTurn = await persistence.rooms.findById(host.room.roomId);
      if (!firstTurn) throw new Error('Expected the started room');
      const firstActor = firstTurn.gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId
        ? host
        : guest;
      const firstRoll = await rollDice(firstActor.socket);
      expect(firstRoll.ok).toBe(true);
      const afterFirst = await persistence.rooms.findById(host.room.roomId);
      expect(afterFirst?.gameSnapshot.gameState.boardState).toMatchObject({
        rollSequence: 1,
        diceValue: { dice1: 2, dice2: 2 },
      });

      const secondTurn = afterFirst?.gameSnapshot.gameState.boardState.currentPlayer.id;
      const secondActor = secondTurn === host.playerId ? host : guest;
      const secondRoll = await rollDice(secondActor.socket);
      expect(secondRoll.ok).toBe(true);
      const afterSecond = await persistence.rooms.findById(host.room.roomId);
      expect(afterSecond?.gameSnapshot.gameState.boardState).toMatchObject({
        rollSequence: 2,
        diceValue: { dice1: 2, dice2: 2 },
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('authorizes and idempotently commits the two-stage card interaction', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'card-authority');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'card-authority');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);
    const started = await persistence.rooms.findById(host.room.roomId);
    if (!started) throw new Error('Expected the started room');
    const actor = started.gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId
      ? host
      : guest;
    const other = actor.playerId === host.playerId ? guest : host;
    const operationId = randomUUID();
    const originalBalance = started.gameSnapshot.gameState.players[actor.playerId].accountBalance;
    const originalDeckLength = started.gameSnapshot.gameState.privateState.decks.chance.drawPile.length;
    await mutateRoom(persistence, host.room.roomId, room => {
      const state = room.gameSnapshot.gameState;
      state.players[actor.playerId].currentTile = 7;
      state.boardState.currentPlayer = { id: actor.playerId, hasMoved: true };
      const chancePile = state.privateState.decks.chance.drawPile;
      state.privateState.decks.chance.drawPile = [
        'chance-dividend',
        ...chancePile.filter(cardId => cardId !== 'chance-dividend'),
      ];
      state.turnInfo = {
        pendingCardInteraction: {
          operationId,
          playerId: actor.playerId,
          turnNumber: state.boardState.turnNumber,
          deck: 'chance',
          sourceTile: 7,
          stage: 'AWAITING_DRAW',
          continuation: {
            playerId: actor.playerId,
            turnNumber: state.boardState.turnNumber,
          },
          deadlineAt: new Date(Date.now() + 20_000).toISOString(),
        },
      };
      state.boardState.turnRecovery = null;
    });

    expect(await drawCard(actor.socket, 'not-an-operation-id')).toMatchObject({
      ok: false, error: { code: 'INVALID_REQUEST' },
    });
    expect(await drawCard(other.socket, operationId)).toMatchObject({
      ok: false, error: { code: 'CONFLICT' },
    });
    expect(await dismissCard(actor.socket, operationId)).toMatchObject({
      ok: false, error: { code: 'CONFLICT' },
    });
    expect((await drawCard(actor.socket, operationId)).ok).toBe(true);
    expect((await drawCard(actor.socket, operationId)).ok).toBe(true);
    const revealed = await persistence.rooms.findById(host.room.roomId);
    expect(revealed?.gameSnapshot.gameState.turnInfo.pendingCardInteraction).toMatchObject({
      operationId,
      stage: 'REVEALED',
      revealedCardId: 'chance-dividend',
    });
    expect(revealed?.gameSnapshot.gameState.privateState.decks.chance.drawPile)
      .toHaveLength(originalDeckLength - 1);
    expect(revealed?.gameSnapshot.gameState.players[actor.playerId].accountBalance)
      .toBe(originalBalance);
    expect(await dismissCard(other.socket, operationId)).toMatchObject({
      ok: false, error: { code: 'CONFLICT' },
    });

    expect((await dismissCard(actor.socket, operationId)).ok).toBe(true);
    expect((await dismissCard(actor.socket, operationId)).ok).toBe(true);
    const resolved = await persistence.rooms.findById(host.room.roomId);
    expect(resolved?.gameSnapshot.gameState.turnInfo.pendingCardInteraction).toBeUndefined();
    expect(resolved?.gameSnapshot.gameState.players[actor.playerId].accountBalance)
      .toBe(originalBalance + 50);
    expect(resolved?.gameSnapshot.gameState.boardState.gameplayEvents.events.filter(
      event => event.type === 'MONEY_TRANSFER' && event.reason === 'CARD',
    )).toHaveLength(1);
  });

  it('does not persist a roll sequence when the durable roll transaction fails', async () => {
    const persistence = new FailAfterCommandPersistenceStore();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'roll-rollback');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'roll-rollback');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    const before = await persistence.rooms.findById(host.room.roomId);
    if (!before) throw new Error('Expected the started room');
    const actor = before.gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId
      ? host
      : guest;
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2);
    persistence.failNextTransactionAfterOperation = true;
    try {
      await expect(rollDice(actor.socket)).resolves.toMatchObject({
        ok: false,
        error: { code: 'DATABASE_UNAVAILABLE', retryable: true },
      });
      expect(await persistence.rooms.findById(host.room.roomId)).toEqual(before);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('increments a failed jail roll once through the same roll command boundary', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'jail-roll-sequence');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'jail-roll-sequence');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    const started = await persistence.rooms.findById(host.room.roomId);
    if (!started) throw new Error('Expected the started room');
    const actor = started.gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId
      ? host
      : guest;
    await mutateRoom(persistence, host.room.roomId, room => {
      const state = room.gameSnapshot.gameState;
      state.boardState.currentPlayer = { id: actor.playerId, hasMoved: false };
      state.players[actor.playerId].currentTile = 10;
      state.players[actor.playerId].isJail = true;
      state.players[actor.playerId].jailOpponentRoundsElapsed = 0;
    });

    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.5);
    try {
      expect((await rollDice(actor.socket)).ok).toBe(true);
      const stored = await persistence.rooms.findById(host.room.roomId);
      expect(stored?.gameSnapshot.gameState.boardState).toMatchObject({
        rollSequence: 1,
        diceValue: { dice1: 2, dice2: 4 },
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('does not advance roll sequence for a rejected roll command', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'reject-roll');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'reject-roll');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    const started = await persistence.rooms.findById(host.room.roomId);
    if (!started) throw new Error('Expected the started room');
    const actor = started.gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId
      ? host
      : guest;
    await mutateRoom(persistence, host.room.roomId, room => {
      room.gameSnapshot.gameState.boardState.currentPlayer.hasMoved = true;
    });
    expect((await rollDice(actor.socket)).ok).toBe(false);
    const stored = await persistence.rooms.findById(host.room.roomId);
    expect(stored?.gameSnapshot.gameState.boardState.rollSequence).toBe(0);
  });

  it('assigns a default color and enforces exact appearance combinations', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'appearance-rules');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'appearance-rules');

    expect(host.room.players.map(player => player.color)).toEqual(['red']);
    expect(guest.room.players.map(player => player.color)).toEqual(['red', 'blue']);
    expect(host.room.players.every(player => player.characterId === null)).toBe(true);

    const readyWithoutCharacter = await waitForAck((acknowledge) => {
      host.socket.emit('set ready', { ready: true }, acknowledge);
    });
    expect(readyWithoutCharacter).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect((await setAppearance(host.socket, { characterId: 'dog', color: 'red' })).ok).toBe(true);
    expect((await setReadyOnly(host.socket)).ok).toBe(true);

    const changedColor = await setAppearance(host.socket, { color: 'orange' });
    expect(changedColor).toMatchObject({ ok: true });
    const storedAfterChange = await persistence.rooms.findById(host.room.roomId);
    expect(storedAfterChange?.gameSnapshot.gameState.players[host.playerId]).toMatchObject({
      color: 'orange',
      characterId: 'dog',
    });
    expect(storedAfterChange?.gameSnapshot.members[host.playerId]?.ready).toBe(false);
    expect((await setAppearance(host.socket, { color: 'red' })).ok).toBe(true);

    const sameColorDifferentMascot = await setAppearance(guest.socket, {
      characterId: 'panda',
      color: 'red',
    });
    expect(sameColorDifferentMascot.ok).toBe(true);

    const characterOnlyCollision = await setAppearance(guest.socket, { characterId: 'dog' });
    expect(characterOnlyCollision).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Tổ hợp mascot và màu này đã được người chơi khác chọn.' },
    });

    const guestAfterCharacterCollision = await persistence.rooms.findById(host.room.roomId);
    expect(guestAfterCharacterCollision?.gameSnapshot.gameState.players[guest.playerId]).toMatchObject({
      color: 'red',
      characterId: 'panda',
    });

    expect((await setAppearance(guest.socket, { characterId: 'dog', color: 'blue' })).ok).toBe(true);
    const colorOnlyCollision = await setAppearance(guest.socket, { color: 'red' });
    expect(colorOnlyCollision).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Tổ hợp mascot và màu này đã được người chơi khác chọn.' },
    });
    const combinedCollision = await setAppearance(guest.socket, {
      characterId: 'dog',
      color: 'red',
    });
    expect(combinedCollision).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Tổ hợp mascot và màu này đã được người chơi khác chọn.' },
    });

    expect((await setAppearance(host.socket, {}))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect((await setAppearance(host.socket, { characterId: 'dog', extra: true } as unknown as SetAppearanceRequest))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect((await setAppearance(host.socket, { characterId: 'shiba' } as unknown as SetAppearanceRequest))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect((await setAppearance(host.socket, { characterId: 'hamster' } as unknown as SetAppearanceRequest))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect((await setAppearance(host.socket, { color: 'white' } as unknown as SetAppearanceRequest))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });

    expect((await setAppearance(guest.socket, { characterId: 'panda', color: 'red' })).ok).toBe(true);
    expect((await setReadyOnly(host.socket)).ok).toBe(true);
    expect((await setReadyOnly(guest.socket)).ok).toBe(true);
    expect((await startGame(host.socket)).ok).toBe(true);
    expect((await setAppearance(host.socket, { color: 'pink' }))).toMatchObject({
      ok: false,
      error: { code: 'GAME_ALREADY_STARTED' },
    });
  });

  it('releases a lobby color when its active player leaves', async () => {
    const subject = await startServer();
    const host = await joinPlayer(await connect(subject.url), 'Host', 'appearance-release');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'appearance-release');

    expect(guest.room.players.find(player => player.playerId === guest.playerId)?.color).toBe('blue');
    expect((await leaveRoom(guest.socket)).ok).toBe(true);

    const replacement = await joinPlayer(await connect(subject.url), 'Replacement', 'appearance-release');
    expect(replacement.room.players.find(player => player.playerId === replacement.playerId)?.color)
      .toBe('blue');
    expect(host.playerId).not.toBe(replacement.playerId);
  });

  it('allows the same mascot with different colors at start', async () => {
    const subject = await startServer();
    const host = await joinPlayer(await connect(subject.url), 'Host', 'same-mascot');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'same-mascot');

    expect((await setReady(host.socket)).ok).toBe(true);
    expect((await setReady(guest.socket)).ok).toBe(true);
    expect((await startGame(host.socket)).ok).toBe(true);
  });

  it('rejects duplicate authoritative appearance combinations at ready and start', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'appearance-duplicate');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'appearance-duplicate');
    await setReady(host.socket);
    await setReady(guest.socket);

    await mutateRoom(persistence, host.room.roomId, room => {
      room.gameSnapshot.gameState.players[host.playerId].characterId = 'dog';
      room.gameSnapshot.gameState.players[host.playerId].color = 'red';
      room.gameSnapshot.gameState.players[guest.playerId].characterId = 'dog';
      room.gameSnapshot.gameState.players[guest.playerId].color = 'red';
    });

    expect(await setReadyOnly(guest.socket)).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Tổ hợp mascot và màu này đã được người chơi khác chọn.',
      },
    });
    expect(await startGame(host.socket)).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Mỗi người chơi phải có một tổ hợp mascot và màu riêng trước khi bắt đầu.',
      },
    });
  });

  it.each([2, 3, 4])('starts a %i-player lobby when every player is ready', async (playerCount) => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const players: PlayerConnection[] = [];

    for (let index = 0; index < playerCount; index += 1) {
      players.push(await joinPlayer(
        await connect(subject.url),
        `Player ${index + 1}`,
        `start-${playerCount}`,
      ));
    }
    for (const player of players) {
      expect((await setReady(player.socket)).ok).toBe(true);
    }

    expect((await startGame(players[0].socket)).ok).toBe(true);
    const stored = await persistence.rooms.findById(players[0].room.roomId);
    expect(stored?.status).toBe('IN_PROGRESS');
    expect(stored?.gameSnapshot.gameState.boardState.players).toHaveLength(playerCount);
  });

  it('rejects a fifth player before creating a pending admission', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const players: PlayerConnection[] = [];

    for (let index = 0; index < 4; index += 1) {
      players.push(await joinPlayer(
        await connect(subject.url),
        `Player ${index + 1}`,
        'capacity-boundary',
      ));
    }

    const fifthSocket = await connect(subject.url);
    const rejected = await waitForAck<JoinRoomResult>((acknowledge) => {
      fifthSocket.emit('join room', {
        name: 'Player 5',
        roomCode: 'capacity-boundary',
      }, acknowledge);
    });
    expect(rejected).toMatchObject({
      ok: false,
      error: {
        code: 'ROOM_FULL',
        message: 'The lobby already has 4 active players.',
      },
    });

    const stored = await persistence.rooms.findById(players[0].room.roomId);
    expect(Object.values(stored?.gameSnapshot.members ?? {})
      .filter(member => member.membershipStatus === 'ACTIVE')).toHaveLength(4);
    expect(Object.keys(stored?.gameSnapshot.gameState.players ?? {})).toHaveLength(4);
  });

  it('keeps the activation-time capacity guard for concurrent pending admissions', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const players: PlayerConnection[] = [];

    for (let index = 0; index < 3; index += 1) {
      players.push(await joinPlayer(
        await connect(subject.url),
        `Player ${index + 1}`,
        'activation-capacity',
      ));
    }

    const pendingSockets = await Promise.all([
      connect(subject.url),
      connect(subject.url),
    ]);
    const pendingAdmissions = await Promise.all(pendingSockets.map((socket, index) => (
      waitForAck<JoinRoomResult>((acknowledge) => {
        socket.emit('join room', {
          name: `Pending ${index + 1}`,
          roomCode: 'activation-capacity',
        }, acknowledge);
      })
    )));
    const pendingTokens = pendingAdmissions.map(admission => {
      const result = successData(admission);
      if (result.kind !== 'PENDING') throw new Error('Expected a pending admission');
      return result.token;
    });

    const activations = await Promise.all(pendingTokens.map((token, index) => (
      waitForAck<ResumeSessionResult>((acknowledge) => {
        pendingSockets[index].emit('resume session', { token }, acknowledge);
      })
    )));
    expect(activations.filter(acknowledgement => acknowledgement.ok)).toHaveLength(1);
    const rejected = activations.find(acknowledgement => !acknowledgement.ok);
    expect(rejected).toMatchObject({
      ok: false,
      error: {
        code: 'ROOM_FULL',
        message: 'The lobby already has 4 active players.',
      },
    });

    const stored = await persistence.rooms.findById(players[0].room.roomId);
    expect(Object.values(stored?.gameSnapshot.members ?? {})
      .filter(member => member.membershipStatus === 'ACTIVE')).toHaveLength(4);
    expect(Object.keys(stored?.gameSnapshot.gameState.players ?? {})).toHaveLength(4);
  });

  it('rejects a structurally loadable legacy five-player lobby at start', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const players: PlayerConnection[] = [];

    for (let index = 0; index < 4; index += 1) {
      players.push(await joinPlayer(
        await connect(subject.url),
        `Player ${index + 1}`,
        'legacy-capacity',
      ));
    }

    const legacyPlayerId = randomUUID();
    await mutateRoom(persistence, players[0].room.roomId, (room) => {
      room.gameSnapshot.members[legacyPlayerId] = {
        joinOrder: 5,
        ready: true,
        membershipStatus: 'ACTIVE',
      };
      room.gameSnapshot.nextJoinOrder = 6;
      room.gameSnapshot.gameState.players[legacyPlayerId] = {
        name: 'Legacy Player',
        currentTile: 0,
        color: 'orange',
        characterId: null,
        accountBalance: 1500,
        isJail: false,
        jailOpponentRoundsElapsed: 0,
        heldJailFreeCardIds: [],
      };
      room.gameSnapshot.gameState.boardState.players = [
        ...room.gameSnapshot.gameState.boardState.players,
        legacyPlayerId,
      ];
    });

    const rejected = await startGame(players[0].socket);
    expect(rejected).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'A game requires between 2 and 4 players.',
      },
    });
    const stored = await persistence.rooms.findById(players[0].room.roomId);
    expect(stored?.status).toBe('LOBBY');
  });

  it('preserves an in-progress player and their property across transient disconnect', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'disconnect-game');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'disconnect-game');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    await mutateRoom(persistence, host.room.roomId, (room) => {
      room.gameSnapshot.gameState.players[guest.playerId].accountBalance = 1234;
      room.gameSnapshot.gameState.boardState.ownedProps[1] = {
        id: guest.playerId,
        color: room.gameSnapshot.gameState.players[guest.playerId].color,
        houses: 0,
      };
    });

    guest.socket.disconnect();
    await waitUntil(
      () => !subject.runtime.connections.isConnected(guest.playerId),
      'The disconnected player still appeared connected',
    );

    const stored = await persistence.rooms.findById(host.room.roomId);
    expect(stored?.gameSnapshot.members[guest.playerId]).toMatchObject({
      membershipStatus: 'ACTIVE',
    });
    expect(stored?.gameSnapshot.gameState.players[guest.playerId]?.accountBalance).toBe(1234);
    expect(stored?.gameSnapshot.gameState.boardState.ownedProps[1]?.id).toBe(
      guest.playerId,
    );

    const resumed = await resumePlayer(await connect(subject.url), guest.token);
    expect(resumed.playerId).toBe(guest.playerId);
    expect(resumed.room.gameState.players[guest.playerId]?.accountBalance).toBe(1234);
    expect(resumed.room.gameState.boardState.ownedProps[1]?.id).toBe(guest.playerId);
  });

  it('arms recovery when a disconnected non-current player receives the turn and clears it on reconnect', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'handoff-recovery');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'handoff-recovery');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    await mutateRoom(persistence, host.room.roomId, (room) => {
      const board = room.gameSnapshot.gameState.boardState;
      board.players = [host.playerId, guest.playerId];
      board.currentPlayer = { id: host.playerId, hasMoved: true };
      room.gameSnapshot.gameState.players[host.playerId].currentTile = 1;
      room.gameSnapshot.gameState.turnInfo.pendingPropertyDecision = {
        operationId: randomUUID(),
        playerId: host.playerId,
        tileID: 1,
        continuation: {
          playerId: host.playerId,
          turnNumber: board.turnNumber,

        },
      };
    });
    guest.socket.disconnect();
    await waitUntil(
      () => !subject.runtime.connections.isConnected(guest.playerId),
      'The non-current player disconnect was not observed',
    );

    const beforeHandoff = await persistence.rooms.findById(host.room.roomId);
    expect(beforeHandoff?.gameSnapshot.gameState.boardState.currentPlayer.id).toBe(
      host.playerId,
    );
    const pendingOperationId = beforeHandoff?.gameSnapshot.gameState.turnInfo
      .pendingPropertyDecision?.operationId;
    if (!pendingOperationId) throw new Error('Missing purchase operation id');
    expect((await buyProperty(host.socket, pendingOperationId)).ok).toBe(true);

    const handedOff = await persistence.rooms.findById(host.room.roomId);
    expect(handedOff?.gameSnapshot.gameState.boardState).toMatchObject({
      currentPlayer: { id: guest.playerId, hasMoved: false },
      turnNumber:
        (beforeHandoff?.gameSnapshot.gameState.boardState.turnNumber ?? 0) + 1,
      turnRecovery: {
        playerId: guest.playerId,
        turnNumber:
          (beforeHandoff?.gameSnapshot.gameState.boardState.turnNumber ?? 0) + 1,
      },
    });
    expect(handedOff?.gameSnapshot.gameState.boardState.gameplayEvents.events.slice(-2))
      .toMatchObject([{
        type: 'MONEY_TRANSFER',
        operationId: pendingOperationId,
        source: { kind: 'PLAYER', playerId: host.playerId },
        destination: { kind: 'BANK' },
        amount: tileState[1].price,
        reason: 'PROPERTY_PURCHASE',
      }, {
        type: 'PROPERTY_TRANSFER',
        operationId: pendingOperationId,
        tileID: 1,
        from: { kind: 'BANK' },
        to: { kind: 'PLAYER', playerId: host.playerId },
        cause: 'BANK_PURCHASE',
      }]);

    const resumed = await resumePlayer(await connect(subject.url), guest.token);
    expect(resumed.room.gameState.boardState).toMatchObject({
      currentPlayer: { id: guest.playerId, hasMoved: false },
      turnNumber: handedOff?.gameSnapshot.gameState.boardState.turnNumber,
      turnRecovery: null,
    });
  });

  it('rejects spoofed actor fields and routes private offers only to the owner', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const owner = await joinPlayer(await connect(subject.url), 'Owner', 'private-room');
    const buyer = await joinPlayer(await connect(subject.url), 'Buyer', 'private-room');
    const observer = await joinPlayer(await connect(subject.url), 'Observer', 'private-room');
    await setReady(owner.socket);
    await setReady(buyer.socket);
    await setReady(observer.socket);
    expect((await startGame(owner.socket)).ok).toBe(true);

    await mutateRoom(persistence, owner.room.roomId, (room) => {
      room.gameSnapshot.gameState.boardState.ownedProps[1] = {
        id: owner.playerId,
        color: room.gameSnapshot.gameState.players[owner.playerId].color,
        houses: 0,
      };
    });

    const spoofedOffer = {
      tileID: 1,
      price: 100,
      playerId: owner.playerId,
    } as unknown as TradeOfferRequest;
    const spoofed = await waitForAck((acknowledge) => {
      buyer.socket.emit(
        'make offer',
        spoofedOffer,
        acknowledge,
      );
    });
    expect(spoofed).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });

    let observerReceivedOffer = false;
    observer.socket.once('offer on prop', () => {
      observerReceivedOffer = true;
    });
    const ownerOffer = new Promise<PrivateOffer>((resolve) => {
      owner.socket.once('offer on prop', resolve);
    });
    const offered = await waitForAck((acknowledge) => {
      buyer.socket.emit('make offer', {
        recipientPlayerId: owner.playerId,
        offered: { cash: 100, propertyIds: [], jailFreeCardIds: [] },
        requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
      }, acknowledge);
    });

    expect(offered.ok).toBe(true);
    await expect(ownerOffer).resolves.toMatchObject({
      proposerPlayerId: buyer.playerId,
      recipientPlayerId: owner.playerId,
      offered: { cash: 100, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(observerReceivedOffer).toBe(false);
  });

  it('rejects accept and decline actions after the authoritative offer expiry', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const owner = await joinPlayer(await connect(subject.url), 'Owner', 'expired-offers');
    const buyer = await joinPlayer(await connect(subject.url), 'Buyer', 'expired-offers');
    await setReady(owner.socket);
    await setReady(buyer.socket);
    expect((await startGame(owner.socket)).ok).toBe(true);

    await mutateRoom(persistence, owner.room.roomId, (room) => {
      room.gameSnapshot.gameState.boardState.ownedProps[1] = {
        id: owner.playerId,
        color: room.gameSnapshot.gameState.players[owner.playerId].color,
        houses: 0,
      };
    });
    const expiresAt = new Date(Date.now() + 50);
    const acceptOfferId = randomUUID();
    const declineOfferId = randomUUID();
    await persistence.tradeOffers.create({
      id: acceptOfferId,
      roomId: owner.room.roomId,
      proposerPlayerId: buyer.playerId,
      recipientPlayerId: owner.playerId,
      offered: { cash: 100, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
      expiresAt,
    });
    await persistence.tradeOffers.create({
      id: declineOfferId,
      roomId: owner.room.roomId,
      proposerPlayerId: buyer.playerId,
      recipientPlayerId: owner.playerId,
      offered: { cash: 120, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
      expiresAt,
    });
    await new Promise((resolve) => setTimeout(resolve, 60));

    const accept = await waitForAck((acknowledge) => {
      owner.socket.emit('accept offer', { offerId: acceptOfferId }, acknowledge);
    });
    const decline = await waitForAck((acknowledge) => {
      owner.socket.emit('decline offer', { offerId: declineOfferId }, acknowledge);
    });

    expect(accept).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Đề nghị đã hết hạn.' },
    });
    expect(decline).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Đề nghị đã hết hạn.' },
    });
    const stored = await persistence.rooms.findById(owner.room.roomId);
    expect(stored?.gameSnapshot.gameState.boardState.ownedProps[1]?.id).toBe(
      owner.playerId,
    );
    expect(stored?.gameSnapshot.gameState.players[owner.playerId]?.accountBalance).toBe(1500);
    expect(stored?.gameSnapshot.gameState.players[buyer.playerId]?.accountBalance).toBe(1500);
  });

  it('rejects an unaffordable property purchase without committing room state', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'poor-purchase');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'poor-purchase');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);
    await mutateRoom(persistence, host.room.roomId, (room) => {
      const board = room.gameSnapshot.gameState.boardState;
      board.currentPlayer = { id: host.playerId, hasMoved: true };
      const player = room.gameSnapshot.gameState.players[host.playerId];
      player.currentTile = 1;
      player.accountBalance = 59;
      room.gameSnapshot.gameState.turnInfo.pendingPropertyDecision = {
        operationId: randomUUID(),
        playerId: host.playerId,
        tileID: 1,
        continuation: {
          playerId: host.playerId,
          turnNumber: board.turnNumber,

        },
      };
    });
    const before = await persistence.rooms.findById(host.room.roomId);

    const operationId = before?.gameSnapshot.gameState.turnInfo.pendingPropertyDecision?.operationId;
    if (!operationId) throw new Error('Missing purchase operation id');
    const acknowledgement = await buyProperty(host.socket, operationId);

    expect(acknowledgement).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
      },
    });
    expect(await persistence.rooms.findById(host.room.roomId)).toEqual(before);
  });

  it('rejects unaffordable bail without mutating jail or payment state', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'poor-bail');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'poor-bail');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);
    await mutateRoom(persistence, host.room.roomId, (room) => {
      room.gameSnapshot.gameState.boardState.currentPlayer = {
        id: host.playerId,
        hasMoved: false,

      };
      const player = room.gameSnapshot.gameState.players[host.playerId];
      player.accountBalance = 49;
      player.isJail = true;
      player.jailOpponentRoundsElapsed = 2;
      room.gameSnapshot.gameState.boardState.currentPlayer.hasMoved = false;
    });
    const acknowledgement = await waitForAck((acknowledge) => {
      host.socket.emit('pay bail', acknowledge);
    });

    expect(acknowledgement).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    const after = await persistence.rooms.findById(host.room.roomId);
    expect(after?.gameSnapshot.gameState.players[host.playerId]).toMatchObject({
      accountBalance: 49,
      isJail: true,
    });
    expect(after?.gameSnapshot.gameState.boardState.paymentQueue).toBeNull();
  });

  it('rejects a payload inserted into a no-payload command without committing', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'no-payload');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'no-payload');
    await setReady(host.socket);
    await setReady(guest.socket);
    const before = await persistence.rooms.findById(host.room.roomId);
    const rawStart = host.socket.emit.bind(host.socket) as unknown as (
      eventName: 'start game',
      payload: unknown,
      acknowledge: AckCallback,
    ) => TestSocket;

    const malformed = await waitForAck((acknowledge) => {
      rawStart('start game', { playerId: guest.playerId }, acknowledge);
    });

    expect(malformed).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(await persistence.rooms.findById(host.room.roomId)).toMatchObject({
      aggregateVersion: before?.aggregateVersion,
      status: 'LOBBY',
    });
    expect((await startGame(host.socket)).ok).toBe(true);
  });

  it('rejects a queued command after its socket generation becomes stale', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const player = await joinPlayer(await connect(subject.url), 'Ada', 'stale-queue');
    await setAppearance(player.socket, { characterId: 'dog' });
    const before = await persistence.rooms.findById(player.room.roomId);
    const executeSpy = vi.spyOn(subject.runtime.commands, 'execute');
    let releaseBlocker!: () => void;
    let markEntered!: () => void;
    const blockerGate = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const blockerEntered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const blocker = subject.runtime.commands.execute(
      player.room.roomId,
      async () => {
        markEntered();
        await blockerGate;
      },
    );
    await blockerEntered;

    const staleAck = waitForAck((acknowledge) => {
      player.socket.emit('set ready', { ready: true }, acknowledge);
    });
    await waitUntil(
      () => executeSpy.mock.calls.length >= 2,
      'The player command was not queued behind the blocker',
    );
    subject.runtime.connections.activate(player.playerId, 'replacement-socket');
    releaseBlocker();
    await blocker;

    await expect(staleAck).resolves.toMatchObject({
      ok: false,
      error: { code: 'SESSION_REPLACED' },
    });
    expect(await persistence.rooms.findById(player.room.roomId)).toMatchObject({
      aggregateVersion: (before?.aggregateVersion ?? 0) + 1,
      gameSnapshot: {
        members: {
          [player.playerId]: { ready: false },
        },
      },
    });
    executeSpy.mockRestore();
  });

  it('transfers lobby host authority after an explicit host leave', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await joinPlayer(await connect(subject.url), 'Host', 'host-transfer');
    const firstGuest = await joinPlayer(
      await connect(subject.url),
      'First guest',
      'host-transfer',
    );
    const secondGuest = await joinPlayer(
      await connect(subject.url),
      'Second guest',
      'host-transfer',
    );

    expect(successData(await leaveRoom(host.socket))).toEqual({ roomDeleted: false });
    const stored = await persistence.rooms.findById(host.room.roomId);
    expect(stored).toMatchObject({
      status: 'LOBBY',
      hostPlayerId: firstGuest.playerId,
      gameSnapshot: {
        gameState: {
          boardState: {
            players: [firstGuest.playerId, secondGuest.playerId],
          },
        },
      },
    });
    expect(stored?.gameSnapshot.members[host.playerId]).toBeUndefined();
  });

  it('allows a player to leave and join a different room on the same socket', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const socket = await connect(subject.url);
    const first = await joinPlayer(socket, 'First identity', 'first-room');

    expect(successData(await leaveRoom(socket))).toEqual({ roomDeleted: true });
    expect(await persistence.rooms.findById(first.room.roomId)).toBeNull();

    const second = await joinPlayer(socket, 'Second identity', 'second-room');
    expect(second.socket).toBe(socket);
    expect(second.room).toMatchObject({
      roomCode: 'SECOND-ROOM',
      status: 'LOBBY',
      hostPlayerId: second.playerId,
    });
    expect(second.playerId).not.toBe(first.playerId);
    expect(second.room.roomId).not.toBe(first.room.roomId);
    expect(await persistence.rooms.findById(second.room.roomId)).not.toBeNull();
  });



  it('admits a new post-start socket as spectator while a valid token reclaims its seat', async () => {
    const subject = await startServer();
    const host = await joinPlayer(await connect(subject.url), 'Host', 'spectator-room');
    const guest = await joinPlayer(await connect(subject.url), 'Guest', 'spectator-room');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    const spectatorSocket = await connect(subject.url);
    const spectator = successData(
      await waitForAck<JoinRoomResult>((acknowledge) => {
        spectatorSocket.emit(
          'join room',
          { name: 'Viewer', roomCode: 'spectator-room' },
          acknowledge,
        );
      }),
    );
    expect(spectator).toMatchObject({
      kind: 'SPECTATOR',
      role: 'SPECTATOR',
      playerId: null,
    });

    expect(successData(await leaveRoom(spectatorSocket))).toEqual({
      roomDeleted: false,
    });
    const spectatorReady = await setReady(spectatorSocket);
    expect(spectatorReady).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    const formerSpectator = await joinPlayer(
      spectatorSocket,
      'Former viewer',
      'viewer-new-room',
    );
    expect(formerSpectator.room).toMatchObject({
      roomCode: 'VIEWER-NEW-ROOM',
      status: 'LOBBY',
      hostPlayerId: formerSpectator.playerId,
    });

    guest.socket.disconnect();
    await waitUntil(
      () => !subject.runtime.connections.isConnected(guest.playerId),
      'The guest disconnect was not observed',
    );
    const resumed = await resumePlayer(await connect(subject.url), guest.token);
    expect(resumed).toMatchObject({
      role: 'PLAYER',
      playerId: guest.playerId,
      room: { status: 'IN_PROGRESS' },
    });
    expect(resumed.room.players).toHaveLength(2);
  });

  it('restores the same identity and game state after recreating the server', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const firstServer = await startServer(persistence);
    const host = await joinPlayer(await connect(firstServer.url), 'Host', 'restart-room');
    const guest = await joinPlayer(await connect(firstServer.url), 'Guest', 'restart-room');
    await setReady(host.socket);
    await setReady(guest.socket);
    expect((await startGame(host.socket)).ok).toBe(true);

    const beforeRestart = await persistence.rooms.findById(host.room.roomId);
    expect(beforeRestart?.status).toBe('IN_PROGRESS');
    await firstServer.close();

    const restartedServer = await startServer(persistence);
    const resumedHost = await resumePlayer(
      await connect(restartedServer.url),
      host.token,
    );
    const resumedGuest = await resumePlayer(
      await connect(restartedServer.url),
      guest.token,
    );

    expect(resumedHost.playerId).toBe(host.playerId);
    expect(resumedGuest.playerId).toBe(guest.playerId);
    expect(resumedGuest.room).toMatchObject({
      roomId: host.room.roomId,
      status: 'IN_PROGRESS',
      hostPlayerId: host.playerId,
      gameState: {
        boardState: {
          currentPlayer: beforeRestart?.gameSnapshot.gameState.boardState.currentPlayer,
          turnNumber: beforeRestart?.gameSnapshot.gameState.boardState.turnNumber,
        },
      },
    });
    expect(resumedGuest.room.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: host.playerId, ready: true }),
        expect.objectContaining({ playerId: guest.playerId, ready: true }),
      ]),
    );
  });

  it('lets an unrelated current creditor leave without rebasing or clearing another forced sale', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const creditor = await joinPlayer(await connect(subject.url), 'Creditor', 'leave-shortfall');
    const debtor = await joinPlayer(await connect(subject.url), 'Debtor', 'leave-shortfall');
    const buyer = await joinPlayer(await connect(subject.url), 'Buyer', 'leave-shortfall');
    await setReady(creditor.socket);
    await setReady(debtor.socket);
    await setReady(buyer.socket);
    expect((await startGame(creditor.socket)).ok).toBe(true);

    const paymentOperationId = randomUUID();
    const claimId = randomUUID();
    const proposalId = randomUUID();
    const turnNumber = 5;
    const now = Date.now();
    const actionDeadlineAt = new Date(now + 120_000).toISOString();
    const expiresAt = new Date(now + 20_000).toISOString();
    const grossPrice = forcedSaleGrossPrice(1, 0);

    await mutateRoom(persistence, creditor.room.roomId, (room) => {
      const gameState = room.gameSnapshot.gameState;
      gameState.boardState.players = [creditor.playerId, debtor.playerId, buyer.playerId];
      gameState.boardState.currentPlayer = { id: creditor.playerId, hasMoved: true };
      gameState.boardState.turnNumber = turnNumber;
      gameState.boardState.finishedPlayers = {};
      gameState.boardState.winner = null;
      gameState.boardState.ownedProps = {
        1: {
          id: debtor.playerId,
          color: gameState.players[debtor.playerId].color,
          houses: 0,
        },
      };
      gameState.players[creditor.playerId].accountBalance = 1500;
      gameState.players[debtor.playerId].accountBalance = 0;
      gameState.players[buyer.playerId].accountBalance = 1500;
      gameState.turnInfo = {};
      gameState.boardState.paymentQueue = {
        operationId: paymentOperationId,
        orderedClaims: [{
          claimId,
          debtorPlayerId: debtor.playerId,
          creditor: 'PLAYER',
          creditorPlayerId: creditor.playerId,
          amount: 500,
          remainingAmount: 500,
          source: { kind: 'OTHER', description: 'leave continuation regression' },
          status: 'PENDING',
        }],
        activeClaimIndex: 0,
        continuation: { playerId: creditor.playerId, turnNumber },
        actionDeadlineAt,
      };
      gameState.privateState.forcedSaleProposal = {
        proposalId,
        paymentOperationId,
        claimId,
        sellerPlayerId: debtor.playerId,
        buyerPlayerId: buyer.playerId,
        tileID: 1,
        grossPrice,
        expectedHouses: 0,
        expiresAt,
      };
      room.nextActionAt = new Date(expiresAt);
    });

    const before = await persistence.rooms.findById(creditor.room.roomId);
    if (!before) throw new Error('Expected a persisted room before leave');
    assertSupportedRoomSnapshot(before);

    const nullProposalEvents: unknown[] = [];
    debtor.socket.on('forced sale proposal', (proposal) => {
      if (proposal === null) nullProposalEvents.push(proposal);
    });
    buyer.socket.on('forced sale proposal', (proposal) => {
      if (proposal === null) nullProposalEvents.push(proposal);
    });

    expect(successData(await leaveRoom(creditor.socket))).toEqual({ roomDeleted: false });
    expect(nullProposalEvents).toHaveLength(0);

    const after = await persistence.rooms.findById(creditor.room.roomId);
    if (!after) throw new Error('Expected the room to remain after creditor leave');
    assertSupportedRoomSnapshot(after);
    expect(after.gameSnapshot.members[creditor.playerId]).toMatchObject({
      membershipStatus: 'LEFT',
    });
    expect(after.gameSnapshot.gameState.boardState.players).toEqual([
      debtor.playerId,
      buyer.playerId,
    ]);
    expect(after.gameSnapshot.gameState.boardState.currentPlayer).toEqual({
      id: debtor.playerId,
      hasMoved: false,
    });
    expect(after.gameSnapshot.gameState.boardState.turnNumber).toBe(turnNumber + 1);
    expect(after.gameSnapshot.gameState.boardState.paymentQueue).toMatchObject({
      continuation: {
        playerId: debtor.playerId,
        turnNumber: turnNumber + 1,
        resume: { kind: 'NO_TURN_CHANGE' },
      },
      orderedClaims: [{
        debtorPlayerId: debtor.playerId,
        creditor: 'BANK',
        remainingAmount: 500,
      }],
    });
    expect(after.gameSnapshot.gameState.boardState.paymentQueue?.orderedClaims[0]?.creditorPlayerId)
      .toBeUndefined();
    expect(after.gameSnapshot.gameState.boardState.ownedProps[1]).toMatchObject({ id: debtor.playerId });
    expect(after.gameSnapshot.gameState.privateState.forcedSaleProposal).toMatchObject({
      proposalId,
      sellerPlayerId: debtor.playerId,
      buyerPlayerId: buyer.playerId,
      paymentOperationId,
      claimId,
    });
  });
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(testDatabaseUrl))(
  'Socket.IO PostgreSQL restart recovery',
  () => {
    it('cancels a persisted offer before broadcasting a one-player replay reset', async () => {
      if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');

      const schemaName = `monopoly_replay_offer_${randomUUID().replaceAll('-', '')}`;
      const administrativePool = new Pool({ connectionString: testDatabaseUrl });
      let schemaCreated = false;
      let applicationPool: Pool | undefined;
      let persistence: PostgresPersistenceStore<RoomSnapshot> | undefined;

      try {
        await administrativePool.query(`CREATE SCHEMA "${schemaName}"`);
        schemaCreated = true;
        applicationPool = new Pool({
          connectionString: testDatabaseUrl,
          options: `-c search_path=${schemaName}`,
        });
        await migrateDatabase(applicationPool);
        persistence = new PostgresPersistenceStore<RoomSnapshot>(applicationPool);

        const subject = await startServer(persistence);
        const host = await joinPlayer(await connect(subject.url), 'Host', 'replay-offer');
        const left = await joinPlayer(await connect(subject.url), 'Left', 'replay-offer');
        await setReady(host.socket);
        await setReady(left.socket);
        expect((await startGame(host.socket)).ok).toBe(true);

        const offerId = randomUUID();
        await persistence.tradeOffers.create({
          id: offerId,
          roomId: host.room.roomId,
          proposerPlayerId: left.playerId,
          recipientPlayerId: host.playerId,
          offered: { cash: 10, propertyIds: [], jailFreeCardIds: [] },
          requested: { cash: 0, propertyIds: [], jailFreeCardIds: [] },
          expiresAt: new Date(Date.now() + 60_000),
        });

        await mutateRoom(persistence, host.room.roomId, room => {
          const state = room.gameSnapshot.gameState;
          const hostPlayer = state.players[host.playerId];
          const leftPlayer = state.players[left.playerId];
          if (!hostPlayer || !leftPlayer) throw new Error('Expected both persisted players');
          state.boardState.players = [host.playerId];
          state.boardState.currentPlayer = { id: host.playerId, hasMoved: false };
          state.boardState.finishedPlayers[left.playerId] = {
            name: leftPlayer.name,
            color: leftPlayer.color,
            characterId: leftPlayer.characterId,
            reason: 'LEFT',
            accountBalance: 0,
          };
          delete state.players[left.playerId];
          room.gameSnapshot.members[left.playerId].membershipStatus = 'LEFT';
          room.gameSnapshot.members[left.playerId].ready = false;
          state.boardState.winner = {
            playerId: host.playerId,
            name: hostPlayer.name,
            color: hostPlayer.color,
            characterId: hostPlayer.characterId,
            accountBalance: hostPlayer.accountBalance,
          };
          room.status = 'FINISHED';
        });

        const cancelledOffer = new Promise<unknown>(resolve => {
          host.socket.once('offer cancelled', resolve);
        });
        expect((await playAgain(host.socket)).ok).toBe(true);
        await expect(cancelledOffer).resolves.toMatchObject({
          offerId,
          status: 'CANCELLED',
        });

        expect(await persistence.tradeOffers.findById(offerId)).toMatchObject({
          id: offerId,
          status: 'CANCELLED',
        });
        const replayed = await persistence.rooms.findById(host.room.roomId);
        expect(replayed).toMatchObject({
          status: 'LOBBY',
          hostPlayerId: host.playerId,
          gameSnapshot: {
            members: {
              [host.playerId]: { membershipStatus: 'ACTIVE', ready: false },
            },
            gameState: {
              boardState: {
                gameStarted: false,
                players: [host.playerId],
                rollSequence: 0,
                winner: null,
              },
            },
          },
        });
        expect(replayed?.gameSnapshot.members[left.playerId]).toBeUndefined();

        const guestAction = await startGame(left.socket);
        expect(guestAction).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      } finally {
        if (persistence) {
          await persistence.close();
          applicationPool = undefined;
        }
        if (applicationPool) await applicationPool.end();
        if (schemaCreated) {
          await administrativePool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        }
        await administrativePool.end();
      }
    });

    it('resets a v1 in-progress game in place while preserving identity and active sessions', async () => {
      if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');

      const schemaName = `monopoly_v1_reset_${randomUUID().replaceAll('-', '')}`;
      const administrativePool = new Pool({ connectionString: testDatabaseUrl });
      let schemaCreated = false;
      let applicationPool: Pool | undefined;
      let persistence: PostgresPersistenceStore<RoomSnapshot> | undefined;

      try {
        await administrativePool.query(`CREATE SCHEMA "${schemaName}"`);
        schemaCreated = true;
        applicationPool = new Pool({
          connectionString: testDatabaseUrl,
          options: `-c search_path=${schemaName}`,
        });
        await migrateDatabase(applicationPool);
        const migrationRows = await applicationPool.query<{ checksum: string }>(
          `DELETE FROM schema_migrations
           WHERE version IN (
             '003_reset_v1_snapshots.sql',
             '004_simplified_rules_v3.sql',
             '005_remove_mortgage_open_market.sql',
              '006_appearance_system_v5.sql',
              '007_roll_sequence_v6.sql',
              '008_semantic_card_v7.sql',
              '009_activity_feed_v8.sql'
           )
           RETURNING checksum`,
        );
        expect(migrationRows.rows).toHaveLength(7);

        const roomId = randomUUID();
        const hostPlayerId = randomUUID();
        const guestPlayerId = randomUUID();
        const hostSessionId = randomUUID();
        const guestSessionId = randomUUID();
        // Historical v1 fixture: these legacy fields are intentionally present
        // so migrations 003-006 can prove that the row is upgraded in place.
        const legacySnapshot = {
          members: {
            [hostPlayerId]: { joinOrder: 1, ready: true, membershipStatus: 'ACTIVE' },
            [guestPlayerId]: { joinOrder: 2, ready: true, membershipStatus: 'ACTIVE' },
          },
          nextJoinOrder: 3,
          gameState: {
            players: {
              [hostPlayerId]: {
                name: 'Chủ phòng',
                color: 'red',
                currentTile: 39,
                accountBalance: 17,
                isJail: true,
                jailOpponentRoundsElapsed: 2,
              },
              [guestPlayerId]: {
                name: 'Khách',
                color: 'blue',
                currentTile: 20,
                accountBalance: 23,
                isJail: false,
                jailOpponentRoundsElapsed: 0,
              },
            },
            boardState: {
              players: [guestPlayerId, hostPlayerId],
              finishedPlayers: {},
              currentPlayer: { id: guestPlayerId, hasMoved: true },
              ownedProps: { 1: { id: hostPlayerId, houses: 4, mortgaged: false } },
              openMarket: {},
              winner: null,
            },
          },
        };
        await applicationPool.query(
          `INSERT INTO rooms (
             id, code, status, host_player_id, aggregate_version,
             snapshot_schema_version, game_snapshot, next_action_at
           ) VALUES ($1, $2, 'IN_PROGRESS', $3, 7, 1, $4, CURRENT_TIMESTAMP)`,
          [roomId, 'V1-IDENTITY', hostPlayerId, legacySnapshot],
        );
        const hostTokenHash = Buffer.alloc(32, 11);
        const guestTokenHash = Buffer.alloc(32, 22);
        await applicationPool.query(
          `INSERT INTO player_sessions (
             id, status, token_hash, room_id, player_id, last_used_at
           ) VALUES
             ($1, 'ACTIVE', $2, $3, $4, CURRENT_TIMESTAMP),
             ($5, 'ACTIVE', $6, $3, $7, CURRENT_TIMESTAMP)`,
          [
            hostSessionId,
            hostTokenHash,
            roomId,
            hostPlayerId,
            guestSessionId,
            guestTokenHash,
            guestPlayerId,
          ],
        );
        const offerId = randomUUID();
        await applicationPool.query(
          `INSERT INTO trade_offers (
             id, room_id, status, expires_at, proposer_player_id,
             recipient_player_id, offered_bundle, requested_bundle
           ) VALUES ($1, $2, 'PENDING', CURRENT_TIMESTAMP + INTERVAL '1 hour',
             $3, $4, $5, $6)`,
          [
            offerId,
            roomId,
            guestPlayerId,
            hostPlayerId,
            { cash: 25, propertyIds: [], jailFreeCardIds: [] },
            { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
          ],
        );

        await migrateDatabase(applicationPool);
        const migratedPool = applicationPool;
        persistence = new PostgresPersistenceStore<RoomSnapshot>(migratedPool);

        const resetRoom = await persistence.rooms.findById(roomId);
        expect(resetRoom).toMatchObject({
          id: roomId,
          code: 'V1-IDENTITY',
          status: 'IN_PROGRESS',
          hostPlayerId,
          aggregateVersion: 14,
          snapshotSchemaVersion: 8,
          gameSnapshot: {
            members: {
              [hostPlayerId]: { joinOrder: 1, ready: true, membershipStatus: 'ACTIVE' },
              [guestPlayerId]: { joinOrder: 2, ready: true, membershipStatus: 'ACTIVE' },
            },
            nextJoinOrder: 3,
            gameState: {
              boardState: {
                gameStarted: true,
                rollSequence: 0,
                turnNumber: 1,
                ownedProps: {},
                paymentQueue: null,
              },
              players: {
                [hostPlayerId]: {
                  name: 'Chủ phòng',
                  color: 'red',
                  characterId: null,
                  currentTile: 0,
                  accountBalance: 1500,
                },
                [guestPlayerId]: {
                  name: 'Khách',
                  color: 'blue',
                  characterId: null,
                  currentTile: 0,
                  accountBalance: 1500,
                },
              },
            },
          },
        });
        expect(resetRoom?.gameSnapshot.gameState.boardState.players).toHaveLength(2);
        expect(resetRoom?.gameSnapshot.gameState.boardState.players[0]).toBe(
          resetRoom?.gameSnapshot.gameState.boardState.currentPlayer.id,
        );
        expect(await persistence.playerSessions.findByTokenHash(hostTokenHash))
          .toMatchObject({ id: hostSessionId, roomId, playerId: hostPlayerId, status: 'ACTIVE' });
        expect(await persistence.playerSessions.findByTokenHash(guestTokenHash))
          .toMatchObject({ id: guestSessionId, roomId, playerId: guestPlayerId, status: 'ACTIVE' });
        expect(await persistence.tradeOffers.findById(offerId))
          .toMatchObject({ status: 'CANCELLED' });

        const beforeSecondMigration = await persistence.rooms.findById(roomId);
        expect(await migrateDatabase(migratedPool)).toEqual([]);
        expect(await persistence.rooms.findById(roomId)).toEqual(beforeSecondMigration);
      } finally {
        if (persistence) {
          await persistence.close();
          applicationPool = undefined;
        }
        if (applicationPool) await applicationPool.end();
        if (schemaCreated) {
          await administrativePool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        }
        await administrativePool.end();
      }
    });

    it('converts a representative v2 snapshot through the current strict state in place', async () => {
      if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');

      const schemaName = `monopoly_v2_to_v4_${randomUUID().replaceAll('-', '')}`;
      const administrativePool = new Pool({ connectionString: testDatabaseUrl });
      let schemaCreated = false;
      let applicationPool: Pool | undefined;
      let persistence: PostgresPersistenceStore<RoomSnapshot> | undefined;

      try {
        await administrativePool.query(`CREATE SCHEMA "${schemaName}"`);
        schemaCreated = true;
        applicationPool = new Pool({
          connectionString: testDatabaseUrl,
          options: `-c search_path=${schemaName}`,
        });
        await migrateDatabase(applicationPool);
        await applicationPool.query(
          `DELETE FROM schema_migrations
           WHERE version IN (
             '004_simplified_rules_v3.sql',
             '005_remove_mortgage_open_market.sql',
              '006_appearance_system_v5.sql',
              '007_roll_sequence_v6.sql',
              '008_semantic_card_v7.sql',
              '009_activity_feed_v8.sql'
           )`,
        );

        const roomId = randomUUID();
        const hostPlayerId = randomUUID();
        const guestPlayerId = randomUUID();
        const hostSessionId = randomUUID();
        const hostTokenHash = Buffer.alloc(32, 31);
        // Historical v2 fixture: these legacy fields are intentionally present
        // so migrations 004-005 can prove that the row reaches the current shape.
        const v2Snapshot = {
          members: {
            [hostPlayerId]: { joinOrder: 1, ready: true, membershipStatus: 'ACTIVE' },
            [guestPlayerId]: { joinOrder: 2, ready: true, membershipStatus: 'ACTIVE' },
          },
          nextJoinOrder: 3,
          gameState: {
            players: {
              [hostPlayerId]: {
                name: 'Chủ phòng',
                color: 'red',
                currentTile: 7,
                accountBalance: 222,
                isJail: true,
                jailRounds: 2,
                heldJailFreeCardIds: [],
              },
              [guestPlayerId]: {
                name: 'Khách',
                color: 'blue',
                currentTile: 14,
                accountBalance: 333,
                isJail: false,
                jailRounds: 0,
                heldJailFreeCardIds: [],
              },
            },
            boardState: {
              gameStarted: true,
              players: [hostPlayerId, guestPlayerId],
              finishedPlayers: {},
              currentPlayer: { id: hostPlayerId, hasMoved: true, doublesStreak: 2 },
              turnNumber: 8,
              turnRecovery: null,
              logs: [],
              diceValue: { dice1: 3, dice2: 3 },
              ownedProps: {
                1: { id: hostPlayerId, color: 'red', houses: 3, mortgaged: false },
              },
              openMarket: {},
              winner: null,
              auction: null,
              buildingContention: null,
              paymentQueue: {
                operationId: randomUUID(),
                orderedClaims: [],
                activeClaimIndex: 0,
              },
              bankPropertyAuctionQueue: null,
            },
            turnInfo: {
              pendingPropertyDecision: null,
              pendingDevelopmentDecision: null,
            },
            privateState: {
              decks: {
                chance: { drawPile: [] },
                chest: { drawPile: [] },
              },
            },
          },
        };

        await applicationPool.query(
          `INSERT INTO rooms (
             id, code, status, host_player_id, aggregate_version,
             snapshot_schema_version, game_snapshot, next_action_at
           ) VALUES ($1, $2, 'IN_PROGRESS', $3, 12, 2, $4, CURRENT_TIMESTAMP)`,
          [roomId, 'V2-TO-V4', hostPlayerId, v2Snapshot],
        );
        await applicationPool.query(
          `INSERT INTO player_sessions (
             id, status, token_hash, room_id, player_id, last_used_at
           ) VALUES ($1, 'ACTIVE', $2, $3, $4, CURRENT_TIMESTAMP)`,
          [hostSessionId, hostTokenHash, roomId, hostPlayerId],
        );
        const offerId = randomUUID();
        await applicationPool.query(
          `INSERT INTO trade_offers (
             id, room_id, status, expires_at, proposer_player_id,
             recipient_player_id, offered_bundle, requested_bundle
           ) VALUES ($1, $2, 'PENDING', CURRENT_TIMESTAMP + INTERVAL '1 hour',
             $3, $4, $5, $6)`,
          [
            offerId,
            roomId,
            hostPlayerId,
            guestPlayerId,
            { cash: 10, propertyIds: [], jailFreeCardIds: [] },
            { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
          ],
        );

        await migrateDatabase(applicationPool);
        persistence = new PostgresPersistenceStore<RoomSnapshot>(applicationPool);
        const migrated = await persistence.rooms.findById(roomId);
        if (!migrated) throw new Error('Migrated v2 room was not persisted');

        expect(migrated).toMatchObject({
          id: roomId,
          code: 'V2-TO-V4',
          status: 'IN_PROGRESS',
          hostPlayerId,
          aggregateVersion: 18,
          snapshotSchemaVersion: 8,
          gameSnapshot: {
            gameState: {
              boardState: {
                gameStarted: true,
                rollSequence: 0,
                turnNumber: 1,
                ownedProps: {},
                paymentQueue: null,
              },
              players: {
                [hostPlayerId]: {
                  currentTile: 0,
                  accountBalance: 1500,
                  jailOpponentRoundsElapsed: 0,
                  characterId: null,
                },
                [guestPlayerId]: {
                  currentTile: 0,
                  accountBalance: 1500,
                  jailOpponentRoundsElapsed: 0,
                  characterId: null,
                },
              },
              turnInfo: {},
              privateState: { forcedSaleProposal: null },
            },
          },
        });
        expect(migrated.gameSnapshot.gameState.boardState.players).toHaveLength(2);
        expect(migrated.gameSnapshot.gameState.boardState).not.toHaveProperty('auction');
        expect(migrated.gameSnapshot.gameState.boardState).not.toHaveProperty('buildingContention');
        expect(migrated.gameSnapshot.gameState.boardState).not.toHaveProperty('bankPropertyAuctionQueue');
        expect(migrated.gameSnapshot.gameState.boardState.currentPlayer).not.toHaveProperty('doublesStreak');
        expect(migrated.gameSnapshot.gameState.players[hostPlayerId]).not.toHaveProperty('jailRounds');
        expect(await persistence.playerSessions.findByTokenHash(hostTokenHash))
          .toMatchObject({ id: hostSessionId, roomId, playerId: hostPlayerId, status: 'ACTIVE' });
        expect(await persistence.tradeOffers.findById(offerId)).toMatchObject({ status: 'CANCELLED' });
        assertSupportedRoomSnapshot(migrated);
      } finally {
        if (persistence) {
          await persistence.close();
          applicationPool = undefined;
        }
        if (applicationPool) await applicationPool.end();
        if (schemaCreated) {
          await administrativePool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        }
        await administrativePool.end();
      }
    });

    it('removes mortgage and public listing state from a live v3 snapshot', async () => {
      if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');

      const schemaName = `monopoly_v3_cleanup_${randomUUID().replaceAll('-', '')}`;
      const administrativePool = new Pool({ connectionString: testDatabaseUrl });
      let schemaCreated = false;
      let applicationPool: Pool | undefined;
      let persistence: PostgresPersistenceStore<RoomSnapshot> | undefined;

      try {
        await administrativePool.query(`CREATE SCHEMA "${schemaName}"`);
        schemaCreated = true;
        applicationPool = new Pool({
          connectionString: testDatabaseUrl,
          options: `-c search_path=${schemaName}`,
        });
        await migrateDatabase(applicationPool);
        await applicationPool.query(
          `DELETE FROM schema_migrations
           WHERE version IN (
             '005_remove_mortgage_open_market.sql',
              '006_appearance_system_v5.sql',
              '007_roll_sequence_v6.sql',
              '008_semantic_card_v7.sql',
              '009_activity_feed_v8.sql'
           )`,
        );

        const roomId = randomUUID();
        const sellerPlayerId = randomUUID();
        const buyerPlayerId = randomUUID();
        const paymentOperationId = randomUUID();
        const claimId = randomUUID();
        const proposalId = randomUUID();
        const roomExpiresAt = new Date(Date.now() + 300_000);
        const paymentDeadline = new Date(Date.now() + 120_000);
        const proposalExpiresAt = new Date(Date.now() + 60_000);
        const canonicalDecks = createCanonicalDecks();
        const grossPrice = forcedSaleGrossPrice(1, 2);
        // Historical v3 fixture: these legacy fields are intentionally present
        // so migration 005 is tested against the complete obsolete state shape.
        const v3Snapshot = {
          members: {
            [sellerPlayerId]: { joinOrder: 1, ready: true, membershipStatus: 'ACTIVE' },
            [buyerPlayerId]: { joinOrder: 2, ready: true, membershipStatus: 'ACTIVE' },
          },
          nextJoinOrder: 3,
          gameState: {
            boardState: {
              gameStarted: true,
              players: [sellerPlayerId, buyerPlayerId],
              finishedPlayers: {},
              currentPlayer: { id: sellerPlayerId, hasMoved: false },
              turnNumber: 9,
              turnRecovery: null,
              logs: ['v3 migration fixture'],
              diceValue: { dice1: 2, dice2: 4 },
              ownedProps: {
                1: { id: sellerPlayerId, color: 'red', houses: 2, mortgaged: true },
                3: { id: buyerPlayerId, color: 'red', houses: 0, mortgaged: false },
              },
              openMarket: {
                1: {
                  seller: sellerPlayerId,
                  price: 250,
                  sellerName: 'Người bán',
                  tileName: 'Bạc Liêu',
                },
              },
              winner: null,
              paymentQueue: {
                operationId: paymentOperationId,
                orderedClaims: [{
                  claimId,
                  debtorPlayerId: sellerPlayerId,
                  creditor: 'BANK',
                  amount: 600,
                  remainingAmount: 600,
                  source: { kind: 'OTHER', description: 'v3 migration fixture' },
                  status: 'PENDING',
                }],
                activeClaimIndex: 0,
                continuation: { playerId: sellerPlayerId, turnNumber: 9 },
                actionDeadlineAt: paymentDeadline.toISOString(),
              },
            },
            players: {
              [sellerPlayerId]: {
                name: 'Người bán',
                currentTile: 1,
                color: 'red',
                characterId: 'dog',
                accountBalance: 1000,
                isJail: false,
                jailOpponentRoundsElapsed: 0,
                heldJailFreeCardIds: [],
              },
              [buyerPlayerId]: {
                name: 'Người mua',
                currentTile: 3,
                color: 'blue',
                characterId: 'panda',
                accountBalance: 900,
                isJail: false,
                jailOpponentRoundsElapsed: 0,
                heldJailFreeCardIds: [],
              },
            },
            turnInfo: {},
            privateState: {
              decks: canonicalDecks,
              forcedSaleProposal: {
                proposalId,
                paymentOperationId,
                claimId,
                sellerPlayerId,
                buyerPlayerId,
                tileID: 1,
                grossPrice,
                sellerNetProceeds: grossPrice - 100,
                expectedHouses: 2,
                expectedMortgaged: true,
                expiresAt: proposalExpiresAt.toISOString(),
              },
            },
          },
        };

        await applicationPool.query(
          `INSERT INTO rooms (
             id, code, status, host_player_id, aggregate_version,
             snapshot_schema_version, game_snapshot, next_action_at, expires_at
           ) VALUES ($1, $2, 'IN_PROGRESS', $3, 20, 3, $4, CURRENT_TIMESTAMP, $5)`,
          [roomId, 'V3-CLEANUP', sellerPlayerId, v3Snapshot, roomExpiresAt],
        );
        const offerId = randomUUID();
        await applicationPool.query(
          `INSERT INTO trade_offers (
             id, room_id, status, expires_at, proposer_player_id,
             recipient_player_id, offered_bundle, requested_bundle
           ) VALUES ($1, $2, 'PENDING', CURRENT_TIMESTAMP + INTERVAL '1 hour',
             $3, $4, $5, $6)`,
          [
            offerId,
            roomId,
            buyerPlayerId,
            sellerPlayerId,
            { cash: 100, propertyIds: [], jailFreeCardIds: [] },
            { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
          ],
        );

        await migrateDatabase(applicationPool);
        persistence = new PostgresPersistenceStore<RoomSnapshot>(applicationPool);
        const migrated = await persistence.rooms.findById(roomId);
        if (!migrated) throw new Error('Migrated v3 room was not persisted');

        expect(migrated).toMatchObject({
          id: roomId,
          code: 'V3-CLEANUP',
          status: 'IN_PROGRESS',
          hostPlayerId: sellerPlayerId,
          aggregateVersion: 25,
          snapshotSchemaVersion: 8,
        });
        const migratedState = migrated.gameSnapshot.gameState;
        expect(migratedState.boardState.rollSequence).toBe(0);
        expect(migratedState.boardState).not.toHaveProperty('openMarket');
        expect(migratedState.boardState.ownedProps).toEqual({
          1: { id: sellerPlayerId, color: 'red', houses: 2 },
          3: { id: buyerPlayerId, color: 'blue', houses: 0 },
        });
        expect(migratedState.boardState.paymentQueue).toMatchObject({
          operationId: paymentOperationId,
          activeClaimIndex: 0,
          continuation: { playerId: sellerPlayerId, turnNumber: 9 },
          actionDeadlineAt: paymentDeadline.toISOString(),
        });
        expect(migratedState.boardState.turnNumber).toBe(9);
        expect(migratedState.players[sellerPlayerId]).toMatchObject({
          currentTile: 1,
          accountBalance: 1000,
          characterId: null,
        });
        expect(migratedState.players[buyerPlayerId]).toMatchObject({
          currentTile: 3,
          accountBalance: 900,
          characterId: null,
        });
        expect(migratedState.privateState.decks).toEqual(canonicalDecks);
        expect(migratedState.privateState.forcedSaleProposal).toBeNull();
        expect(await persistence.tradeOffers.findById(offerId))
          .toMatchObject({ status: 'CANCELLED' });
        expect(migrated.nextActionAt).not.toBeNull();
        expect(migrated.nextActionAt!.getTime()).toBeLessThanOrEqual(paymentDeadline.getTime());
        assertSupportedRoomSnapshot(migrated);
      } finally {
        if (persistence) {
          await persistence.close();
          applicationPool = undefined;
        }
        if (applicationPool) await applicationPool.end();
        if (schemaCreated) {
          await administrativePool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        }
        await administrativePool.end();
      }
    });

    it('resumes the same players and game aggregate through a fresh pool and server', async () => {
      if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');

      const schemaName = `monopoly_socket_restart_${randomUUID().replaceAll('-', '')}`;
      const administrativePool = new Pool({ connectionString: testDatabaseUrl });
      let schemaCreated = false;
      let firstPool: Pool | undefined;
      let secondPool: Pool | undefined;
      let firstPersistence: PostgresPersistenceStore<RoomSnapshot> | undefined;
      let secondPersistence: PostgresPersistenceStore<RoomSnapshot> | undefined;
      let firstServer: RunningServer | undefined;
      let secondServer: RunningServer | undefined;

      try {
        await administrativePool.query(`CREATE SCHEMA "${schemaName}"`);
        schemaCreated = true;

        firstPool = new Pool({
          connectionString: testDatabaseUrl,
          options: `-c search_path=${schemaName}`,
        });
        await migrateDatabase(firstPool);
        firstPersistence = new PostgresPersistenceStore<RoomSnapshot>(firstPool);
        firstPool = undefined;
        firstServer = await startServer(firstPersistence);

        const host = await joinPlayer(
          await connect(firstServer.url),
          'Host',
          'postgres-restart',
        );
        const guest = await joinPlayer(
          await connect(firstServer.url),
          'Guest',
          'postgres-restart',
        );
        await setReady(host.socket);
        await setReady(guest.socket);
        expect((await startGame(host.socket)).ok).toBe(true);
        await mutateRoom(firstPersistence, host.room.roomId, (room) => {
          room.gameSnapshot.gameState.players[host.playerId].accountBalance = 0;
          room.gameSnapshot.gameState.players[guest.playerId].accountBalance = 1444;
          room.gameSnapshot.gameState.boardState.ownedProps[1] = {
            id: host.playerId,
            color: room.gameSnapshot.gameState.players[host.playerId].color,
            houses: 0,
          };
          room.gameSnapshot.gameState.boardState.paymentQueue = {
            operationId: randomUUID(),
            orderedClaims: [{
              claimId: randomUUID(),
              debtorPlayerId: host.playerId,
              creditor: 'PLAYER',
              creditorPlayerId: guest.playerId,
              amount: 100,
              remainingAmount: 100,
              source: { kind: 'OTHER', description: 'restart payment' },
              status: 'PENDING',
            }],
            activeClaimIndex: 0,
            continuation: {
              playerId: room.gameSnapshot.gameState.boardState.currentPlayer.id,
              turnNumber: room.gameSnapshot.gameState.boardState.turnNumber,
            },
            actionDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
          };
          room.nextActionAt = new Date(room.gameSnapshot.gameState.boardState.paymentQueue.actionDeadlineAt);
        });
        const beforeRestart = await firstPersistence.rooms.findById(host.room.roomId);
        if (!beforeRestart) throw new Error('PostgreSQL room was not persisted');
        assertSupportedRoomSnapshot(beforeRestart);

        await firstServer.close();
        await firstPersistence.close();
        firstPersistence = undefined;

        secondPool = new Pool({
          connectionString: testDatabaseUrl,
          options: `-c search_path=${schemaName}`,
        });
        await migrateDatabase(secondPool);
        secondPersistence = new PostgresPersistenceStore<RoomSnapshot>(secondPool);
        secondPool = undefined;
        secondServer = await startServer(secondPersistence);

        const resumedHost = await resumePlayer(
          await connect(secondServer.url),
          host.token,
        );
        const resumedGuest = await resumePlayer(
          await connect(secondServer.url),
          guest.token,
        );

        expect(resumedHost).toMatchObject({
          playerId: host.playerId,
          room: {
            roomId: host.room.roomId,
            status: 'IN_PROGRESS',
          },
        });
        expect(resumedGuest).toMatchObject({
          playerId: guest.playerId,
          room: {
            roomId: host.room.roomId,
            status: 'IN_PROGRESS',
            gameState: {
              boardState: {
                currentPlayer:
                  beforeRestart.gameSnapshot.gameState.boardState.currentPlayer,
                turnNumber:
                  beforeRestart.gameSnapshot.gameState.boardState.turnNumber,
                ownedProps: { 1: { id: host.playerId } },
                paymentShortfall: { remainingAmount: 100 },
              },
              players: {
                [host.playerId]: { accountBalance: 0 },
                [guest.playerId]: { accountBalance: 1444 },
              },
            },
          },
        });

        const afterRestart = await secondPersistence.rooms.findById(host.room.roomId);
        expect(afterRestart?.gameSnapshot.gameState).toEqual(
          beforeRestart.gameSnapshot.gameState,
        );
      } finally {
        await secondServer?.close();
        await firstServer?.close();
        if (secondPersistence) await secondPersistence.close();
        if (firstPersistence) await firstPersistence.close();
        if (secondPool) await secondPool.end();
        if (firstPool) await firstPool.end();
        if (schemaCreated) {
          await administrativePool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        }
        await administrativePool.end();
      }
    });
  },
);
