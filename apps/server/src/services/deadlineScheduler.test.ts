import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createServer } from '../createServer.js';
import { InMemoryPersistenceStore } from '../persistence/inMemory.js';
import {
  ROOM_SNAPSHOT_SCHEMA_VERSION,
  createRoomSnapshot,
  type RoomSnapshot,
} from '../rooms.js';
import type { AppServer } from '../socket/types.js';
import { DeadlineScheduler, recoverRoomIfDue } from './deadlineScheduler.js';
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
    cardAwaitingDrawTimeoutMs: 20_000,
    cardRevealedTimeoutMs: 30_000,
    emergencyRescueTimeoutMs: 30_000,
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
      characterId: 'dog',
      teamId: 'TEAM_1',
      teamSlot: 0,
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    },
    [PLAYER_B]: {
      name: 'Grace',
      currentTile: 0,
      color: 'blue',
      characterId: 'panda',
      teamId: 'TEAM_2',
      teamSlot: 0,
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
    rescue: null,
  };
}

describe('durable deadline recovery', () => {
  it('cancels offers invalidated by deadline bankruptcy once, privately, after commit and before the public update', async () => {
    const { persistence, runtime, io } = createRuntime();
    const now = new Date(Date.now() + 1_000);
    const roomId = randomUUID();
    const snapshot = activeSnapshot();
    addDueBankDebt(snapshot, now);
    await persistence.rooms.create({
      id: roomId,
      code: 'DEADLINE-OFFER-CANCEL',
      status: 'IN_PROGRESS',
      hostPlayerId: PLAYER_B,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: snapshot,
      nextActionAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    const offerIds = [randomUUID(), randomUUID()];
    for (const [index, id] of offerIds.entries()) {
      await persistence.tradeOffers.create({
        id,
        roomId,
        proposerPlayerId: index === 0 ? PLAYER_B : PLAYER_A,
        recipientPlayerId: index === 0 ? PLAYER_A : PLAYER_B,
        offered: { cash: 800 + index, propertyIds: [], jailFreeCardIds: [] },
        requested: { cash: 0, propertyIds: [index + 1], jailFreeCardIds: [] },
        expiresAt: new Date(now.getTime() + 60_000),
      });
    }
    const pendingBefore = await persistence.tradeOffers.listPendingForPlayer(roomId, PLAYER_A);
    const emissions: Array<{ roomName: string; event: string; payload: unknown }> = [];
    const toSpy = vi.spyOn(io, 'to').mockImplementation((roomName: string | string[]) => ({
      emit(event: string, payload: unknown) {
        emissions.push({ roomName: Array.isArray(roomName) ? roomName.join(',') : roomName, event, payload });
        return true;
      },
    }) as never);

    try {
      await recoverRoomIfDue(io, runtime, roomId, now);
      const cancellationEmissions = emissions.filter((entry) => entry.event === 'offer cancelled');
      expect(cancellationEmissions).toHaveLength(offerIds.length * 2);
      expect(cancellationEmissions.map((entry) => entry.roomName)).toEqual(pendingBefore.flatMap((offer) => [
        `player:${offer.proposerPlayerId}`,
        `player:${offer.recipientPlayerId}`,
      ]));
      expect(cancellationEmissions.map((entry) => (entry.payload as { offerId: string }).offerId)).toEqual(
        pendingBefore.flatMap((offer) => [offer.id, offer.id]),
      );
      expect(cancellationEmissions.every((entry) => entry.roomName !== `room:${roomId}`)).toBe(true);
      expect(emissions.findIndex((entry) => entry.event === 'offer cancelled'))
        .toBeLessThan(emissions.findIndex((entry) => entry.event === 'update'));

      const stored = await Promise.all(offerIds.map((id) => persistence.tradeOffers.findById(id)));
      const expected = pendingBefore.map((offer) => {
        const resolved = stored.find((candidate) => candidate?.id === offer.id);
        if (!resolved?.resolvedAt) throw new Error('Deadline cancellation did not persist resolvedAt');
        return {
          offerId: resolved.id,
          status: 'CANCELLED',
          proposerPlayerId: resolved.proposerPlayerId,
          recipientPlayerId: resolved.recipientPlayerId,
          proposerName: resolved.proposerPlayerId === PLAYER_A ? 'Ada' : 'Grace',
          recipientName: resolved.recipientPlayerId === PLAYER_A ? 'Ada' : 'Grace',
          offered: resolved.offered,
          requested: resolved.requested,
          resolvedAt: resolved.resolvedAt.toISOString(),
        };
      });
      const actualByOffer = new Map<string, unknown>();
      for (const entry of cancellationEmissions) {
        const payload = entry.payload as { offerId: string };
        actualByOffer.set(payload.offerId, payload);
      }
      expect([...actualByOffer.values()]).toEqual(expected);
      expect(JSON.stringify([...actualByOffer.values()])).toBe(JSON.stringify(expected));
      const publicUpdate = emissions.find((entry) => entry.event === 'update')?.payload;
      const publicJson = JSON.stringify(publicUpdate);
      for (const id of offerIds) expect(publicJson).not.toContain(id);
      expect(publicJson).not.toContain('offered');
      expect(publicJson).not.toContain('requested');

      const eventCountAfterCommit = emissions.length;
      await recoverRoomIfDue(io, runtime, roomId, now);
      expect(emissions).toHaveLength(eventCountAfterCommit);
      for (const id of offerIds) expect((await persistence.tradeOffers.findById(id))?.status).toBe('CANCELLED');
    } finally {
      toSpy.mockRestore();
    }
  });

  it('keeps offer deadline expiry on its distinct private expired event', async () => {
    const { persistence, runtime, io } = createRuntime();
    const expiresAt = new Date(Date.now() + 10_000);
    const now = new Date(expiresAt.getTime() + 1);
    const roomId = randomUUID();
    await persistence.rooms.create({
      id: roomId,
      code: 'DEADLINE-OFFER-EXPIRE',
      status: 'IN_PROGRESS',
      hostPlayerId: PLAYER_A,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: activeSnapshot(),
      nextActionAt: new Date(now.getTime() + 86_400_000),
      expiresAt: new Date(now.getTime() + 172_800_000),
    });
    const offerId = randomUUID();
    await persistence.tradeOffers.create({
      id: offerId,
      roomId,
      proposerPlayerId: PLAYER_A,
      recipientPlayerId: PLAYER_B,
      offered: { cash: 12, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
      expiresAt,
    });
    const emissions: Array<{ roomName: string; event: string; payload: unknown }> = [];
    const toSpy = vi.spyOn(io, 'to').mockImplementation((roomName: string | string[]) => ({
      emit(event: string, payload: unknown) {
        emissions.push({ roomName: Array.isArray(roomName) ? roomName.join(',') : roomName, event, payload });
        return true;
      },
    }) as never);

    try {
      const scheduler = new DeadlineScheduler(io, runtime);
      await scheduler.runOnce(now);
      expect(emissions).toEqual([
        {
          roomName: `player:${PLAYER_A}`,
          event: 'offer expired',
          payload: {
            offerId,
            status: 'EXPIRED',
            proposerPlayerId: PLAYER_A,
            recipientPlayerId: PLAYER_B,
            proposerName: 'Ada',
            recipientName: 'Grace',
            offered: { cash: 12, propertyIds: [], jailFreeCardIds: [] },
            requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
            resolvedAt: now.toISOString(),
          },
        },
        {
          roomName: `player:${PLAYER_B}`,
          event: 'offer expired',
          payload: {
            offerId,
            status: 'EXPIRED',
            proposerPlayerId: PLAYER_A,
            recipientPlayerId: PLAYER_B,
            proposerName: 'Ada',
            recipientName: 'Grace',
            offered: { cash: 12, propertyIds: [], jailFreeCardIds: [] },
            requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
            resolvedAt: now.toISOString(),
          },
        },
      ]);
      expect(emissions.some((entry) => entry.event === 'offer cancelled')).toBe(false);
      expect((await persistence.tradeOffers.findById(offerId))?.status).toBe('EXPIRED');
      const eventCountAfterExpiry = emissions.length;
      await scheduler.runOnce(now);
      expect(emissions).toHaveLength(eventCountAfterExpiry);
    } finally {
      toSpy.mockRestore();
    }
  });

  it('publishes no cancellation if the room deadline transaction fails before commit', async () => {
    const { persistence, runtime, io } = createRuntime();
    const now = new Date(Date.now() + 1_000);
    const roomId = randomUUID();
    const snapshot = activeSnapshot();
    addDueBankDebt(snapshot, now);
    await persistence.rooms.create({
      id: roomId,
      code: 'DEADLINE-ROLLBACK',
      status: 'IN_PROGRESS',
      hostPlayerId: PLAYER_B,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: snapshot,
      nextActionAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    const offerId = randomUUID();
    await persistence.tradeOffers.create({
      id: offerId,
      roomId,
      proposerPlayerId: PLAYER_B,
      recipientPlayerId: PLAYER_A,
      offered: { cash: 800, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
      expiresAt: new Date(now.getTime() + 60_000),
    });
    const before = await persistence.rooms.findById(roomId);
    const emissions: Array<{ roomName: string; event: string; payload: unknown }> = [];
    const toSpy = vi.spyOn(io, 'to').mockImplementation((roomName: string | string[]) => ({
      emit(event: string, payload: unknown) {
        emissions.push({ roomName: Array.isArray(roomName) ? roomName.join(',') : roomName, event, payload });
        return true;
      },
    }) as never);
    const transactionSpy = vi.spyOn(persistence, 'transaction').mockRejectedValue(new Error('controlled transaction failure'));

    try {
      await expect(recoverRoomIfDue(io, runtime, roomId, now)).rejects.toThrow('controlled transaction failure');
      expect(emissions).toEqual([]);
      expect(await persistence.rooms.findById(roomId)).toEqual(before);
      expect((await persistence.tradeOffers.findById(offerId))?.status).toBe('PENDING');
    } finally {
      transactionSpy.mockRestore();
      toSpy.mockRestore();
    }
  });

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

  it('recovers a legacy awaiting card as revealed and leaves it durable', async () => {
    const { persistence, runtime, io } = createRuntime();
    const now = new Date('2026-08-12T12:10:00.000Z');
    const roomId = randomUUID();
    const snapshot = activeSnapshot();
    snapshot.gameState.players[PLAYER_A].currentTile = 7;
    snapshot.gameState.players[PLAYER_A].accountBalance = 100;
    const chancePile = snapshot.gameState.privateState.decks.chance.drawPile;
    snapshot.gameState.privateState.decks.chance.drawPile = [
      'chance-dividend',
      ...chancePile.filter(cardId => cardId !== 'chance-dividend'),
    ];
    const operationId = randomUUID();
    snapshot.gameState.turnInfo.pendingCardInteraction = {
      operationId,
      playerId: PLAYER_A,
      turnNumber: 4,
      deck: 'chance',
      sourceTile: 7,
      stage: 'AWAITING_DRAW',
      continuation: { playerId: PLAYER_A, turnNumber: 4 },
      deadlineAt: now.toISOString(),
    };
    await persistence.rooms.create({
      id: roomId,
      code: 'CARD-RECOVERY',
      status: 'IN_PROGRESS',
      hostPlayerId: PLAYER_A,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: snapshot,
      nextActionAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });

    await Promise.all([
      recoverRoomIfDue(io, runtime, roomId, now),
      recoverRoomIfDue(io, runtime, roomId, now),
    ]);
    const revealed = await persistence.rooms.findById(roomId);
    expect(revealed?.gameSnapshot.gameState.turnInfo.pendingCardInteraction).toMatchObject({
      operationId,
      stage: 'REVEALED',
      revealedCardId: 'chance-dividend',
    });
    expect(revealed?.gameSnapshot.gameState.players[PLAYER_A].accountBalance).toBe(100);
    const revealDeadline = new Date(
      revealed?.gameSnapshot.gameState.turnInfo.pendingCardInteraction?.deadlineAt ?? '',
    );
    expect(Number.isFinite(revealDeadline.getTime())).toBe(true);
    expect(revealed?.gameSnapshot.gameState.privateState.decks.chance.drawPile)
      .not.toContain('chance-dividend');

    const restarted = createRuntime(persistence);
    await Promise.all([
      recoverRoomIfDue(restarted.io, restarted.runtime, roomId, revealDeadline),
      recoverRoomIfDue(restarted.io, restarted.runtime, roomId, revealDeadline),
    ]);
    const resolved = await persistence.rooms.findById(roomId);
    expect(resolved?.gameSnapshot.gameState.turnInfo.pendingCardInteraction).toMatchObject({
      operationId,
      stage: 'REVEALED',
      revealedCardId: 'chance-dividend',
    });
    expect(resolved?.gameSnapshot.gameState.players[PLAYER_A].accountBalance).toBe(100);
    expect(resolved?.gameSnapshot.gameState.privateState.decks.chance.drawPile)
      .not.toContain('chance-dividend');
    expect(resolved?.gameSnapshot.gameState.boardState.gameplayEvents.events.filter(
      event => event.type === 'MONEY_TRANSFER' && event.reason === 'CARD',
    )).toHaveLength(0);
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
