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

function createRuntime(): {
  persistence: InMemoryPersistenceStore<RoomSnapshot>;
  runtime: AppRuntime;
  io: AppServer;
} {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const runtime = createAppRuntime(persistence, {
    reconnectGraceMs: 60_000,
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
      jailRounds: 0,
      getOutOfJailCards: 0,
    },
    [PLAYER_B]: {
      name: 'Grace',
      currentTile: 0,
      color: 'blue',
      accountBalance: 1500,
      isJail: false,
      jailRounds: 0,
      getOutOfJailCards: 0,
    },
  };
  snapshot.gameState.boardState.gameStarted = true;
  snapshot.gameState.boardState.players = [PLAYER_A, PLAYER_B];
  snapshot.gameState.boardState.currentPlayer = { id: PLAYER_A, hasMoved: true };
  snapshot.gameState.boardState.turnNumber = 4;
  return snapshot;
}

describe('durable deadline recovery', () => {
  it('finalizes an expired persisted auction once and advances the turn', async () => {
    const { persistence, runtime, io } = createRuntime();
    const now = new Date('2026-08-09T12:00:00.000Z');
    const roomId = randomUUID();
    const snapshot = activeSnapshot();
    const auctionId = randomUUID();
    snapshot.gameState.boardState.auction = {
      auctionId,
      tileID: 1,
      tileName: 'Mediterranean Avenue',
      price: 60,
      highestBid: 100,
      highestBidder: PLAYER_B,
      highestBidderName: 'Grace',
      active: [PLAYER_A, PLAYER_B],
      passed: [PLAYER_A],
      endsAt: new Date(now.getTime() - 1).toISOString(),
    };
    await persistence.rooms.create({
      id: roomId,
      code: 'AUCTION-RECOVERY',
      status: 'IN_PROGRESS',
      hostPlayerId: PLAYER_A,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: snapshot,
      nextActionAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });

    const beforeRecovery = await persistence.rooms.findById(roomId);
    await Promise.all([
      recoverRoomIfDue(io, runtime, roomId, now),
      recoverRoomIfDue(io, runtime, roomId, now),
    ]);

    const restored = await persistence.rooms.findById(roomId);
    expect(restored?.aggregateVersion).toBe(
      (beforeRecovery?.aggregateVersion ?? 0) + 1,
    );
    expect(restored?.gameSnapshot.gameState.boardState).toMatchObject({
      auction: null,
      currentPlayer: { id: PLAYER_B, hasMoved: false },
      turnNumber: 5,
    });
    expect(restored?.gameSnapshot.gameState.boardState.ownedProps[1]?.id).toBe(PLAYER_B);
    expect(restored?.gameSnapshot.gameState.players[PLAYER_B]?.accountBalance).toBe(1400);
  });

  it('turns a due buy decision into an auction and deletes an expired empty room', async () => {
    const { persistence, runtime, io } = createRuntime();
    const now = new Date('2026-08-09T12:00:00.000Z');
    const roomId = randomUUID();
    const snapshot = activeSnapshot();
    snapshot.gameState.turnInfo.canBuyProp = true;
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
    expect(recovered?.gameSnapshot.gameState.boardState.turnRecovery).toBeNull();
    expect(recovered?.gameSnapshot.gameState.boardState.auction).toMatchObject({
      tileID: 1,
    });

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
