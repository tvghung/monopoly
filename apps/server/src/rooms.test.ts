import { describe, expect, it } from 'vitest';

import {
  ROOM_SNAPSHOT_SCHEMA_VERSION,
  UnsupportedRoomSnapshotVersionError,
  assertSupportedRoomSnapshot,
  createRoomSnapshot,
  hydrateGameState,
  storeGameState,
} from './rooms.js';
import type { RoomRecord } from './persistence/types.js';
import { ConnectionRegistry } from './services/connectionRegistry.js';
import { projectPublicRoomState } from './services/publicState.js';

const PLAYER_ONE = '00000000-0000-4000-8000-000000000001';
const PLAYER_TWO = '00000000-0000-4000-8000-000000000002';

const createActiveSnapshot = (): ReturnType<typeof createRoomSnapshot> => {
  const gameSnapshot = createRoomSnapshot();
  gameSnapshot.members[PLAYER_ONE] = {
    joinOrder: 1,
    ready: true,
    membershipStatus: 'ACTIVE',
  };
  gameSnapshot.members[PLAYER_TWO] = {
    joinOrder: 2,
    ready: true,
    membershipStatus: 'ACTIVE',
  };
  gameSnapshot.nextJoinOrder = 3;
  gameSnapshot.gameState.players[PLAYER_ONE] = {
    name: 'Player One',
    currentTile: 0,
    color: 'red',
    accountBalance: 1500,
    isJail: false,
    jailOpponentRoundsElapsed: 0,
    heldJailFreeCardIds: [],
  };
  gameSnapshot.gameState.players[PLAYER_TWO] = {
    name: 'Player Two',
    currentTile: 0,
    color: 'blue',
    accountBalance: 1500,
    isJail: false,
    jailOpponentRoundsElapsed: 0,
    heldJailFreeCardIds: [],
  };
  gameSnapshot.gameState.boardState.gameStarted = true;
  gameSnapshot.gameState.boardState.players = [PLAYER_ONE, PLAYER_TWO];
  gameSnapshot.gameState.boardState.currentPlayer = {
    id: PLAYER_ONE,
    hasMoved: true,
  };
  gameSnapshot.gameState.boardState.turnNumber = 7;
  return gameSnapshot;
};

describe('durable room snapshot compatibility', () => {
  it('accepts the current schema version and rejects unknown versions', () => {
    const gameSnapshot = createRoomSnapshot();

    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot,
    })).not.toThrow();

    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION + 1,
      gameSnapshot,
    })).toThrow(UnsupportedRoomSnapshotVersionError);
  });

  it('rejects non-UUID domain player identities in a persisted snapshot', () => {
    const gameSnapshot = createRoomSnapshot();
    gameSnapshot.members['legacy-socket-id'] = {
      joinOrder: 1,
      ready: false,
      membershipStatus: 'ACTIVE',
    };
    gameSnapshot.nextJoinOrder = 2;
    gameSnapshot.gameState.players['legacy-socket-id'] = {
      name: 'Legacy',
      currentTile: 0,
      color: 'red',
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    };
    gameSnapshot.gameState.boardState.players = ['legacy-socket-id'];

    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot,
    })).toThrow(/Invalid room snapshot/);
  });

  it('rejects an active member without a live player display identity', () => {
    const playerId = '00000000-0000-4000-8000-000000000001';
    const gameSnapshot = createRoomSnapshot();
    gameSnapshot.members[playerId] = {
      joinOrder: 1,
      ready: false,
      membershipStatus: 'ACTIVE',
    };
    gameSnapshot.nextJoinOrder = 2;
    gameSnapshot.gameState.boardState.players = [playerId];

    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot,
    })).toThrow(/inconsistent game state/);
  });

  it('preserves the active multi-debtor claim when game state is stored and hydrated', () => {
    const debtorId = '00000000-0000-4000-8000-000000000001';
    const creditorId = '00000000-0000-4000-8000-000000000002';
    const gameSnapshot = createRoomSnapshot();
    gameSnapshot.members[debtorId] = {
      joinOrder: 1,
      ready: true,
      membershipStatus: 'ACTIVE',
    };
    gameSnapshot.members[creditorId] = {
      joinOrder: 2,
      ready: true,
      membershipStatus: 'ACTIVE',
    };
    gameSnapshot.nextJoinOrder = 3;

    const state = hydrateGameState(gameSnapshot, 'IN_PROGRESS');
    state.players[debtorId] = {
      name: 'Debtor',
      currentTile: 0,
      color: 'red',
      accountBalance: 5,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    };
    state.players[creditorId] = {
      name: 'Creditor',
      currentTile: 0,
      color: 'blue',
      accountBalance: 100,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    };
    state.boardState.players = [debtorId, creditorId];
    state.boardState.currentPlayer = { id: debtorId, hasMoved: true };
    state.boardState.turnNumber = 4;
    state.boardState.paymentQueue = {
      operationId: '00000000-0000-4000-8000-000000000010',
      orderedClaims: [
        {
          claimId: '00000000-0000-4000-8000-000000000011',
          debtorPlayerId: creditorId,
          creditor: 'PLAYER',
          creditorPlayerId: debtorId,
          amount: 10,
          remainingAmount: 0,
          source: { kind: 'CARD', cardId: 'chest-birthday' },
          status: 'SETTLED',
        },
        {
          claimId: '00000000-0000-4000-8000-000000000012',
          debtorPlayerId: debtorId,
          creditor: 'PLAYER',
          creditorPlayerId: creditorId,
          amount: 20,
          remainingAmount: 20,
          source: { kind: 'OTHER', description: 'restart regression' },
          status: 'PENDING',
        },
      ],
      activeClaimIndex: 1,
      continuation: {
        playerId: debtorId,
        turnNumber: 4,

      },
      actionDeadlineAt: '2030-01-01T00:02:00.000Z',
    };

    storeGameState(gameSnapshot, state, 'IN_PROGRESS');
    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot,
      hostPlayerId: debtorId,
      status: 'IN_PROGRESS',
    })).not.toThrow();

    const restarted = hydrateGameState(gameSnapshot, 'IN_PROGRESS');
    expect(restarted.boardState.paymentQueue).toMatchObject({
      activeClaimIndex: 1,
      orderedClaims: [
        { status: 'SETTLED', remainingAmount: 0 },
        { status: 'PENDING', remainingAmount: 20 },
      ],
    });
  });



});

describe('public room projection', () => {
  const roomFromSnapshot = (
    gameSnapshot: ReturnType<typeof createRoomSnapshot>,
  ): RoomRecord<ReturnType<typeof createRoomSnapshot>> => ({
    id: '00000000-0000-4000-8000-000000000100',
    code: 'public-state',
    status: 'IN_PROGRESS',
    hostPlayerId: PLAYER_ONE,
    aggregateVersion: 5,
    snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
    gameSnapshot,
    nextActionAt: null,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    lastActivityAt: new Date('2030-01-01T00:00:00.000Z'),
    expiresAt: null,
  });

  it('hides private deck order and payment continuations', () => {
    const gameSnapshot = createActiveSnapshot();
    gameSnapshot.gameState.boardState.paymentQueue = {
      operationId: '00000000-0000-4000-8000-000000000101',
      orderedClaims: [{
        claimId: '00000000-0000-4000-8000-000000000102',
        debtorPlayerId: PLAYER_ONE,
        creditor: 'BANK',
        amount: 100,
        remainingAmount: 40,
        source: { kind: 'OTHER', description: 'income tax' },
        status: 'PENDING',
      }],
      activeClaimIndex: 0,
      continuation: {
        playerId: PLAYER_ONE,
        turnNumber: 7,

      },
      actionDeadlineAt: '2030-01-01T00:02:00.000Z',
    };
    const projected = projectPublicRoomState(
      roomFromSnapshot(gameSnapshot),
      new ConnectionRegistry(),
      new Date('2030-01-01T00:01:00.000Z'),
    );

    expect(projected.gameState).not.toHaveProperty('privateState');
    expect(projected.gameState.boardState.paymentShortfall).toEqual({
      debtorPlayerId: PLAYER_ONE,
      creditor: 'BANK',
      creditorPlayerId: undefined,
      amount: 100,
      remainingAmount: 40,
      source: { kind: 'OTHER', description: 'income tax' },
      actionDeadlineAt: '2030-01-01T00:02:00.000Z',
      remainingClaimCount: 1,
      paymentOperationId: '00000000-0000-4000-8000-000000000101',
      claimId: '00000000-0000-4000-8000-000000000102',
      sellableProperties: [],
    });
  });

});
