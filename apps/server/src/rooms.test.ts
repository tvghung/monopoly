import { describe, expect, it } from 'vitest';

import { boardStateSchema } from '@monopoly/shared';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_SNAPSHOT_SCHEMA_VERSION,
  UnsupportedRoomSnapshotVersionError,
  assertSupportedRoomSnapshot,
  createRoomSnapshot,
  hydrateGameState,
  nextAvailableColor,
  storeGameState,
  upgradeRoomSnapshotV4ToV5,
  upgradeRoomSnapshotV5ToV6,
} from './rooms.js';
import { freshState } from './rooms.js';
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
    characterId: 'dog',
    accountBalance: 1500,
    isJail: false,
    jailOpponentRoundsElapsed: 0,
    heldJailFreeCardIds: [],
  };
  gameSnapshot.gameState.players[PLAYER_TWO] = {
    name: 'Player Two',
    currentTile: 0,
    color: 'blue',
    characterId: 'panda',
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
  it('starts fresh games with roll sequence zero', () => {
    expect(freshState().boardState.rollSequence).toBe(0);
  });

  it('upgrades V4 appearance state without inventing characters or changing game state', () => {
    const legacy = {
      snapshotSchemaVersion: 4,
      gameSnapshot: {
        ...createRoomSnapshot(),
        gameState: {
          ...createRoomSnapshot().gameState,
          players: {
            [PLAYER_ONE]: {
              name: 'Legacy One',
              currentTile: 11,
              color: 'white',
              accountBalance: 800,
              isJail: false,
              jailOpponentRoundsElapsed: 0,
              heldJailFreeCardIds: [],
            },
          },
          boardState: {
            ...createRoomSnapshot().gameState.boardState,
            finishedPlayers: {
              [PLAYER_TWO]: { name: 'Legacy Two', color: 'black', reason: 'LEFT' },
            },
            ownedProps: {
              1: { id: PLAYER_ONE, color: 'red', houses: 2 },
            },
            winner: { playerId: PLAYER_TWO, name: 'Legacy Two', color: 'black' },
          },
        },
      },
    } as unknown;

    const original = structuredClone(legacy);
    const upgraded = upgradeRoomSnapshotV4ToV5(legacy);
    expect(upgraded.snapshotSchemaVersion).toBe(5);
    expect(upgraded.snapshotSchemaVersion).not.toBe(ROOM_SNAPSHOT_SCHEMA_VERSION);
    expect(upgraded.gameSnapshot.gameState.players[PLAYER_ONE]).toMatchObject({
      color: 'cyan',
      characterId: null,
      currentTile: 11,
      accountBalance: 800,
    });
    expect(upgraded.gameSnapshot.gameState.boardState.finishedPlayers[PLAYER_TWO]).toMatchObject({
      color: 'charcoal',
      characterId: null,
    });
    expect(upgraded.gameSnapshot.gameState.boardState.winner).toMatchObject({
      color: 'charcoal',
      characterId: null,
    });
    expect(upgraded.gameSnapshot.gameState.boardState.ownedProps[1]).toMatchObject({
      id: PLAYER_ONE,
      color: 'cyan',
      houses: 2,
    });
    expect(legacy).toEqual(original);
  });

  it('upgrades V5 state to V6 with a zero roll baseline and preserves other JSON', () => {
    const v5 = {
      snapshotSchemaVersion: 5,
      gameSnapshot: createRoomSnapshot(),
      hostPlayerId: null,
      status: 'LOBBY' as const,
    };
    v5.gameSnapshot.gameState.boardState.diceValue = { dice1: 4, dice2: 2 };
    delete (v5.gameSnapshot.gameState.boardState as unknown as { rollSequence?: number }).rollSequence;
    const expected = structuredClone(v5);
    (expected.gameSnapshot.gameState.boardState as unknown as { rollSequence?: number }).rollSequence = 0;

    const upgraded = upgradeRoomSnapshotV5ToV6(v5);

    expect(upgraded).toEqual({
      ...expected,
      snapshotSchemaVersion: 6,
    });
    expect((v5.gameSnapshot.gameState.boardState as unknown as { rollSequence?: number }).rollSequence)
      .toBeUndefined();
    expect(() => upgradeRoomSnapshotV5ToV6({ ...v5, snapshotSchemaVersion: 6 }))
      .toThrow('Only V5 room snapshots can be upgraded to V6');
  });

  it('requires a non-negative safe roll sequence in the V6 board schema', () => {
    const board = createRoomSnapshot().gameState.boardState;
    expect(boardStateSchema.safeParse(board).success).toBe(true);
    expect(boardStateSchema.safeParse({ ...board, rollSequence: -1 }).success).toBe(false);
    expect(boardStateSchema.safeParse({ ...board, rollSequence: Number.MAX_SAFE_INTEGER }).success).toBe(true);
    expect(boardStateSchema.safeParse({ ...board, rollSequence: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
  });

  it('rejects a current V6 snapshot that omits roll sequence', () => {
    const gameSnapshot = createRoomSnapshot();
    delete (gameSnapshot.gameState.boardState as unknown as { rollSequence?: number }).rollSequence;

    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot,
      status: 'LOBBY',
    })).toThrow(/rollSequence/);
  });

  it('allocates the first unused color from the ten-color palette', () => {
    expect(nextAvailableColor(createActiveSnapshot())).toBe('green');
  });

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

  it('normalizes legacy V5 character ids before validating the snapshot', () => {
    const gameSnapshot = createActiveSnapshot();
    (gameSnapshot.gameState.players[PLAYER_ONE] as unknown as { characterId: unknown }).characterId = 'shiba';
    (gameSnapshot.gameState.players[PLAYER_TWO] as unknown as { characterId: unknown }).characterId = 'fox';

    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot,
      status: 'IN_PROGRESS',
    })).not.toThrow();
    expect(gameSnapshot.gameState.players[PLAYER_ONE]?.characterId).toBe('dog');
    expect(gameSnapshot.gameState.players[PLAYER_TWO]?.characterId).toBe('elephant');
  });

  it('accepts older snapshots without a match-start timestamp', () => {
    const gameSnapshot = createRoomSnapshot();
    delete gameSnapshot.gameState.boardState.gameStartedAt;

    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot,
      status: 'LOBBY',
    })).not.toThrow();
    expect(hydrateGameState(gameSnapshot, 'LOBBY').boardState.gameStartedAt).toBeNull();
  });

  it('preserves an existing match-start timestamp across hydration and storage', () => {
    const gameSnapshot = createRoomSnapshot();
    const startedAt = '2030-01-01T00:00:00.000Z';
    gameSnapshot.gameState.boardState.gameStartedAt = startedAt;

    const state = hydrateGameState(gameSnapshot, 'IN_PROGRESS');
    state.boardState.rollSequence = 17;
    storeGameState(gameSnapshot, state, 'IN_PROGRESS');

    expect(gameSnapshot.gameState.boardState.gameStartedAt).toBe(startedAt);
    expect(hydrateGameState(gameSnapshot, 'IN_PROGRESS').boardState.rollSequence).toBe(17);
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
      characterId: 'dog',
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
      characterId: 'dog',
      accountBalance: 5,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    };
    state.players[creditorId] = {
      name: 'Creditor',
      currentTile: 0,
      color: 'blue',
      characterId: 'panda',
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

  it('projects the supported two-to-four player room limits', () => {
    const projected = projectPublicRoomState(
      roomFromSnapshot(createActiveSnapshot()),
      new ConnectionRegistry(),
    );

    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(4);
    expect(projected).toMatchObject({ minPlayers: 2, maxPlayers: 4 });
  });

  it('projects the durable match-start timestamp to public state', () => {
    const gameSnapshot = createActiveSnapshot();
    gameSnapshot.gameState.boardState.gameStartedAt = '2030-01-01T00:00:00.000Z';
    gameSnapshot.gameState.boardState.rollSequence = 23;

    const projected = projectPublicRoomState(
      roomFromSnapshot(gameSnapshot),
      new ConnectionRegistry(),
      new Date('2030-01-01T00:01:00.000Z'),
    );

    expect(projected.gameState.boardState.gameStartedAt).toBe('2030-01-01T00:00:00.000Z');
    expect(projected.gameState.boardState.rollSequence).toBe(23);
  });

});
