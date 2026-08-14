import { describe, expect, it } from 'vitest';
import { tileState } from '@monopoly/shared';

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
    jailRounds: 0,
    heldJailFreeCardIds: [],
  };
  gameSnapshot.gameState.players[PLAYER_TWO] = {
    name: 'Player Two',
    currentTile: 0,
    color: 'blue',
    accountBalance: 1500,
    isJail: false,
    jailRounds: 0,
    heldJailFreeCardIds: [],
  };
  gameSnapshot.gameState.boardState.gameStarted = true;
  gameSnapshot.gameState.boardState.players = [PLAYER_ONE, PLAYER_TWO];
  gameSnapshot.gameState.boardState.currentPlayer = {
    id: PLAYER_ONE,
    hasMoved: true,
    doublesStreak: 0,
  };
  gameSnapshot.gameState.boardState.turnNumber = 7;
  return gameSnapshot;
};

const expectInvalidActiveSnapshot = (
  gameSnapshot: ReturnType<typeof createRoomSnapshot>,
): void => {
  expect(() => assertSupportedRoomSnapshot({
    snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
    gameSnapshot,
    hostPlayerId: PLAYER_ONE,
    status: 'IN_PROGRESS',
  })).toThrow();
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
      jailRounds: 0,
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
      jailRounds: 0,
      heldJailFreeCardIds: [],
    };
    state.players[creditorId] = {
      name: 'Creditor',
      currentTile: 0,
      color: 'blue',
      accountBalance: 100,
      isJail: false,
      jailRounds: 0,
      heldJailFreeCardIds: [],
    };
    state.boardState.players = [debtorId, creditorId];
    state.boardState.currentPlayer = { id: debtorId, hasMoved: true, doublesStreak: 0 };
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
        rolledDoubles: false,
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

  it('rejects stale continuations for payment, property auction, and Bank auction queue', () => {
    const validSnapshot = createActiveSnapshot();
    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: validSnapshot,
      hostPlayerId: PLAYER_ONE,
      status: 'IN_PROGRESS',
    })).not.toThrow();

    const staleContinuation = {
      playerId: PLAYER_TWO,
      turnNumber: 6,
      rolledDoubles: false,
    };

    const paymentSnapshot = createActiveSnapshot();
    paymentSnapshot.gameState.boardState.paymentQueue = {
      operationId: '00000000-0000-4000-8000-000000000010',
      orderedClaims: [{
        claimId: '00000000-0000-4000-8000-000000000011',
        debtorPlayerId: PLAYER_ONE,
        creditor: 'BANK',
        amount: 10,
        remainingAmount: 10,
        source: { kind: 'OTHER', description: 'stale payment continuation' },
        status: 'PENDING',
      }],
      activeClaimIndex: 0,
      continuation: staleContinuation,
      actionDeadlineAt: '2030-01-01T00:02:00.000Z',
    };
    expectInvalidActiveSnapshot(paymentSnapshot);

    const auctionSnapshot = createActiveSnapshot();
    auctionSnapshot.gameState.boardState.auction = {
      kind: 'PROPERTY',
      auctionId: '00000000-0000-4000-8000-000000000020',
      tileID: 1,
      tileName: 'Cà Mau',
      price: 60,
      source: 'DECLINED_PURCHASE',
      highestBid: 0,
      highestBidder: null,
      highestBidderName: null,
      active: [PLAYER_ONE, PLAYER_TWO],
      passed: [],
      endsAt: '2030-01-01T00:00:30.000Z',
      continuation: staleContinuation,
    };
    expectInvalidActiveSnapshot(auctionSnapshot);

    const bankSnapshot = createActiveSnapshot();
    const bankAuctionId = '00000000-0000-4000-8000-000000000030';
    bankSnapshot.gameState.boardState.auction = {
      kind: 'PROPERTY',
      auctionId: bankAuctionId,
      tileID: 3,
      tileName: 'Bạc Liêu',
      price: 60,
      source: 'BANKRUPTCY',
      highestBid: 0,
      highestBidder: null,
      highestBidderName: null,
      active: [PLAYER_ONE, PLAYER_TWO],
      passed: [],
      endsAt: '2030-01-01T00:00:30.000Z',
      continuation: null,
    };
    bankSnapshot.gameState.boardState.bankPropertyAuctionQueue = {
      operationId: '00000000-0000-4000-8000-000000000031',
      orderedRemainingTileIds: [],
      currentTileId: 3,
      currentAuctionId: bankAuctionId,
      continuation: staleContinuation,
    };
    expectInvalidActiveSnapshot(bankSnapshot);
  });

  it('rejects a building auction whose request is not a legal build target', () => {
    const gameSnapshot = createActiveSnapshot();
    gameSnapshot.gameState.boardState.auction = {
      kind: 'BUILDING',
      buildingType: 'HOUSE',
      requests: {
        [PLAYER_ONE]: {
          playerId: PLAYER_ONE,
          tileID: 5,
          buildingType: 'HOUSE',
          requestedAt: '2030-01-01T00:00:00.000Z',
        },
      },
      minimumBid: 1,
      auctionId: '00000000-0000-4000-8000-000000000040',
      highestBid: 0,
      highestBidder: null,
      highestBidderName: null,
      active: [PLAYER_ONE],
      passed: [],
      endsAt: '2030-01-01T00:00:30.000Z',
      continuation: null,
    };

    expectInvalidActiveSnapshot(gameSnapshot);
  });

  it('allows more than the legacy finite Bank inventory', () => {
    const gameSnapshot = createActiveSnapshot();
    tileState.forEach((tile, tileID) => {
      if (tile.tileType !== 'normal') return;
      gameSnapshot.gameState.boardState.ownedProps[tileID] = {
        id: PLAYER_ONE,
        color: tile.color ?? 'red',
        houses: 4,
        mortgaged: false,
      };
    });

    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot,
      hostPlayerId: PLAYER_ONE,
      status: 'IN_PROGRESS',
    })).not.toThrow();
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
        source: { kind: 'TAX', tileID: 4 },
        status: 'PENDING',
      }],
      activeClaimIndex: 0,
      continuation: {
        playerId: PLAYER_ONE,
        turnNumber: 7,
        rolledDoubles: true,
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
      source: { kind: 'TAX', tileID: 4 },
      actionDeadlineAt: '2030-01-01T00:02:00.000Z',
      remainingClaimCount: 1,
      paymentOperationId: '00000000-0000-4000-8000-000000000101',
      claimId: '00000000-0000-4000-8000-000000000102',
      sellableProperties: [],
    });
  });

  it.skip('hides the turn continuation attached to a removed auction', () => {
    const gameSnapshot = createActiveSnapshot();
    gameSnapshot.gameState.boardState.auction = {
      kind: 'PROPERTY',
      auctionId: '00000000-0000-4000-8000-000000000104',
      tileID: 1,
      tileName: 'Cà Mau',
      price: 60,
      source: 'DECLINED_PURCHASE',
      highestBid: 0,
      highestBidder: null,
      highestBidderName: null,
      active: [PLAYER_ONE, PLAYER_TWO],
      passed: [],
      endsAt: '2030-01-01T00:01:30.000Z',
      continuation: {
        playerId: PLAYER_ONE,
        turnNumber: 7,
        rolledDoubles: true,
      },
    };

    const projected = projectPublicRoomState(
      roomFromSnapshot(gameSnapshot),
      new ConnectionRegistry(),
      new Date('2030-01-01T00:01:00.000Z'),
    );

    expect(projected.gameState.boardState.auction).toMatchObject({
      kind: 'PROPERTY',
      timer: 30,
    });
    expect(projected.gameState.boardState.auction).not.toHaveProperty('continuation');
  });
});
