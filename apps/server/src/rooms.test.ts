import { describe, expect, it } from 'vitest';

import {
  ROOM_SNAPSHOT_SCHEMA_VERSION,
  UnsupportedRoomSnapshotVersionError,
  assertSupportedRoomSnapshot,
  createRoomSnapshot,
} from './rooms.js';

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
      getOutOfJailCards: 0,
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
});
