import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { createServer } from '../createServer.js';
import { InMemoryPersistenceStore } from '../persistence/inMemory.js';
import {
  ROOM_SNAPSHOT_SCHEMA_VERSION,
  createRoomSnapshot,
  type RoomSnapshot,
} from '../rooms.js';
import type { AppServer } from '../socket/types.js';
import { recoverRoomIfDue } from './deadlineScheduler.js';
import { createAppRuntime, type AppRuntime } from './runtime.js';

const PLAYER_A = randomUUID();
const PLAYER_B = randomUUID();
const openServers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(({ io }) => new Promise<void>((resolve) => {
    void io.close(() => resolve());
  })));
});

function createRuntime(
  persistence = new InMemoryPersistenceStore<RoomSnapshot>(),
): {
  persistence: InMemoryPersistenceStore<RoomSnapshot>;
  runtime: AppRuntime;
  io: AppServer;
} {
  const runtime = createAppRuntime(persistence, {
    reconnectGraceMs: 60_000,
    paymentShortfallActionTimeoutMs: 120_000,
    pendingSessionTtlMs: 300_000,
    terminalSessionRetentionMs: 604_800_000,
    lobbyRetentionMs: 86_400_000,
    inProgressRetentionMs: 2_592_000_000,
    finishedRetentionMs: 604_800_000,
  });
  const server = createServer(runtime);
  openServers.push(server);
  return { persistence, runtime, io: server.io };
}

function activeSnapshot(): RoomSnapshot {
  const snapshot = createRoomSnapshot();
  snapshot.members = {
    [PLAYER_A]: { joinOrder: 1, ready: true, membershipStatus: 'ACTIVE' },
    [PLAYER_B]: { joinOrder: 2, ready: true, membershipStatus: 'ACTIVE' },
  };
  snapshot.nextJoinOrder = 3;
  snapshot.gameState.players = {
    [PLAYER_A]: {
      name: 'Ada',
      currentTile: 1,
      color: 'red',
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    },
    [PLAYER_B]: {
      name: 'Grace',
      currentTile: 0,
      color: 'blue',
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    },
  };
  snapshot.gameState.boardState.gameStarted = true;
  snapshot.gameState.boardState.players = [PLAYER_A, PLAYER_B];
  snapshot.gameState.boardState.currentPlayer = {
    id: PLAYER_A,
    hasMoved: true,

  };
  snapshot.gameState.boardState.turnNumber = 4;
  return snapshot;
}

function addDueBankDebt(snapshot: RoomSnapshot, now: Date): void {
  snapshot.gameState.players[PLAYER_A].accountBalance = 0;
  snapshot.gameState.boardState.paymentQueue = {
    operationId: randomUUID(),
    orderedClaims: [{
      claimId: randomUUID(),
      debtorPlayerId: PLAYER_A,
      creditor: 'BANK',
      amount: 200,
      remainingAmount: 200,
      source: { kind: 'OTHER', description: 'income tax' },
      status: 'PENDING',
    }],
    activeClaimIndex: 0,
    continuation: {
      playerId: PLAYER_A,
      turnNumber: snapshot.gameState.boardState.turnNumber,

    },
    actionDeadlineAt: new Date(now.getTime() - 1).toISOString(),
  };
}

describe('durable deadline recovery', () => {
  it('bankrupts a connected but idle debtor when the durable debt deadline expires', async () => {
    const { persistence, runtime, io } = createRuntime();
    const now = new Date('2026-08-12T12:00:00.000Z');
    const roomId = randomUUID();
    const snapshot = activeSnapshot();
    addDueBankDebt(snapshot, now);
    await persistence.rooms.create({
      id: roomId,
      code: 'CONNECTED-IDLE-DEBT',
      status: 'IN_PROGRESS',
      hostPlayerId: PLAYER_B,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: snapshot,
      nextActionAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    runtime.connections.activate(PLAYER_A, 'connected-idle-socket');
    const beforeRecovery = await persistence.rooms.findById(roomId);

    await Promise.all([
      recoverRoomIfDue(io, runtime, roomId, now),
      recoverRoomIfDue(io, runtime, roomId, now),
    ]);

    const restored = await persistence.rooms.findById(roomId);
    expect(restored?.aggregateVersion).toBe(
      (beforeRecovery?.aggregateVersion ?? 0) + 1,
    );
    expect(restored?.gameSnapshot.gameState.players[PLAYER_A]).toBeUndefined();
    expect(restored?.gameSnapshot.gameState.boardState).toMatchObject({
      paymentQueue: null,
      finishedPlayers: { [PLAYER_A]: { reason: 'BANKRUPT' } },
      winner: { playerId: PLAYER_B },
    });
  });

  it('recovers a due debt from the persisted snapshot through a fresh runtime', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const first = createRuntime(persistence);
    const now = new Date('2026-08-12T12:05:00.000Z');
    const roomId = randomUUID();
    const snapshot = activeSnapshot();
    addDueBankDebt(snapshot, now);
    await persistence.rooms.create({
      id: roomId,
      code: 'RESTART-DEBT',
      status: 'IN_PROGRESS',
      hostPlayerId: PLAYER_B,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: snapshot,
      nextActionAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    first.runtime.connections.activate(PLAYER_A, 'pre-restart-socket');

    const restarted = createRuntime(persistence);
    expect(restarted.runtime.connections.isConnected(PLAYER_A)).toBe(false);
    await recoverRoomIfDue(restarted.io, restarted.runtime, roomId, now);

    const restored = await persistence.rooms.findById(roomId);
    expect(restored?.gameSnapshot.gameState.players[PLAYER_A]).toBeUndefined();
    expect(restored?.gameSnapshot.gameState.boardState).toMatchObject({
      paymentQueue: null,
      finishedPlayers: { [PLAYER_A]: { reason: 'BANKRUPT' } },
      winner: { playerId: PLAYER_B },
    });
  });



  it('turns a due buy decision into Do Not Buy and deletes an expired empty room', async () => {
    const { persistence, runtime, io } = createRuntime();
    const now = new Date('2026-08-09T12:00:00.000Z');
    const roomId = randomUUID();
    const snapshot = activeSnapshot();
    snapshot.gameState.turnInfo.pendingPropertyDecision = {
      operationId: randomUUID(),
      playerId: PLAYER_A,
      tileID: 1,
      continuation: {
        playerId: PLAYER_A,
        turnNumber: 4,

      },
    };
    snapshot.gameState.boardState.turnRecovery = {
      playerId: PLAYER_A,
      turnNumber: 4,
      deadlineAt: now.toISOString(),
    };
    await persistence.rooms.create({
      id: roomId,
      code: 'TURN-RECOVERY',
      status: 'IN_PROGRESS',
      hostPlayerId: PLAYER_A,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: snapshot,
      nextActionAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });

    await recoverRoomIfDue(io, runtime, roomId, now);
    const recovered = await persistence.rooms.findById(roomId);
    expect(recovered?.gameSnapshot.gameState.boardState.turnRecovery).toMatchObject({
      playerId: PLAYER_B,
      turnNumber: 5,
    });
    expect(recovered?.gameSnapshot.gameState.turnInfo).toEqual({});
    expect(recovered?.gameSnapshot.gameState.boardState.currentPlayer.id).toBe(PLAYER_B);

    const emptyRoomId = randomUUID();
    await persistence.rooms.create({
      id: emptyRoomId,
      code: 'EXPIRED-EMPTY',
      status: 'LOBBY',
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: createRoomSnapshot(),
      nextActionAt: now,
      expiresAt: now,
    });
    await recoverRoomIfDue(io, runtime, emptyRoomId, now);
    expect(await persistence.rooms.findById(emptyRoomId)).toBeNull();
  });
});
