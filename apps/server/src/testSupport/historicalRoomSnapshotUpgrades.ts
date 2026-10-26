import type { PlayerColorId, PlayerId, RoomStatus, TeamId } from '@monopoly/shared';
import { TEAM_IDS } from '@monopoly/shared';
import { createEmptyActivityFeed } from '../game/activity.js';
import { createEmptyGameplayEventStream } from '../game/semanticEvents.js';
import { createDefaultTeamSettings, createEmptyTeamPlayState } from '../game/teamState.js';
import { ROOM_SNAPSHOT_SCHEMA_VERSION } from '../rooms.js';
import type { PersistedRoomSnapshotEnvelope, RoomSnapshot } from '../rooms.js';

export const LEGACY_PLAYER_COLOR_MAP: Record<string, PlayerColorId> = {
  yellow: 'yellow',
  green: 'green',
  blue: 'blue',
  red: 'red',
  orange: 'orange',
  white: 'cyan',
  black: 'charcoal',
  purple: 'purple',
  pink: 'pink',
  cyan: 'cyan',
  lime: 'lime',
  charcoal: 'charcoal',
};

export const mapLegacyPlayerColor = (rawColor: unknown): PlayerColorId => {
  const normalized = typeof rawColor === 'string' ? rawColor.trim().toLowerCase() : '';
  return LEGACY_PLAYER_COLOR_MAP[normalized] ?? 'charcoal';
};

interface LegacyPlayerRecord {
  id?: unknown;
  color?: unknown;
  characterId?: unknown;
  [key: string]: unknown;
}

interface LegacyRoomSnapshotShape {
  members: RoomSnapshot['members'];
  nextJoinOrder: number;
  gameState: {
    players: Record<PlayerId, LegacyPlayerRecord>;
    boardState: {
      finishedPlayers: Record<PlayerId, LegacyPlayerRecord>;
      winner: LegacyPlayerRecord | null;
      ownedProps: Record<string, LegacyPlayerRecord>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Historical fixture transform; keep the V4 -> V5 behavior without inventing an appearance. */
export const upgradeRoomSnapshotV4ToV5 = (
  input: unknown,
): PersistedRoomSnapshotEnvelope => {
  const envelope = structuredClone(input) as {
    snapshotSchemaVersion: number;
    gameSnapshot: LegacyRoomSnapshotShape;
    hostPlayerId?: PlayerId | null;
    status?: RoomStatus;
  };
  if (envelope.snapshotSchemaVersion !== 4) {
    throw new Error('Only V4 room snapshots can be upgraded to V5');
  }

  const { gameState } = envelope.gameSnapshot;
  Object.values(gameState.players).forEach(player => {
    player.color = mapLegacyPlayerColor(player.color);
    player.characterId = null;
  });
  Object.values(gameState.boardState.finishedPlayers).forEach(player => {
    player.color = mapLegacyPlayerColor(player.color);
    player.characterId = null;
  });
  if (gameState.boardState.winner) {
    gameState.boardState.winner.color = mapLegacyPlayerColor(gameState.boardState.winner.color);
    gameState.boardState.winner.characterId = null;
  }
  Object.values(gameState.boardState.ownedProps).forEach(property => {
    const owner = gameState.players[property.id as PlayerId];
    property.color = mapLegacyPlayerColor(owner?.color ?? property.color);
  });

  return {
    ...envelope,
    snapshotSchemaVersion: 5,
    gameSnapshot: envelope.gameSnapshot as unknown as RoomSnapshot,
  };
};

/** Historical fixture transform; keep the V5 -> V6 baseline without inventing a historical roll count. */
export const upgradeRoomSnapshotV5ToV6 = (
  input: unknown,
): PersistedRoomSnapshotEnvelope => {
  const envelope = structuredClone(input) as {
    snapshotSchemaVersion: number;
    gameSnapshot: {
      gameState: {
        boardState: { rollSequence?: number; [key: string]: unknown };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    hostPlayerId?: PlayerId | null;
    status?: RoomStatus;
  };
  if (envelope.snapshotSchemaVersion !== 5) {
    throw new Error('Only V5 room snapshots can be upgraded to V6');
  }

  envelope.gameSnapshot.gameState.boardState.rollSequence = 0;
  return {
    ...envelope,
    snapshotSchemaVersion: 6,
    gameSnapshot: envelope.gameSnapshot as unknown as RoomSnapshot,
  };
};

/**
 * V7 starts both semantic lanes at an empty reconnect baseline. Historical
 * balance/log diffs are deliberately not reinterpreted as gameplay facts.
 */
export const upgradeRoomSnapshotV6ToV7 = (
  input: unknown,
): PersistedRoomSnapshotEnvelope => {
  const envelope = structuredClone(input) as {
    snapshotSchemaVersion: number;
    gameSnapshot: {
      gameState: {
        boardState: { gameplayEvents?: unknown; [key: string]: unknown };
        privateState: {
          privateGameplayEventsByPlayer?: unknown;
          completedCardOperations?: unknown;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    hostPlayerId?: PlayerId | null;
    status?: RoomStatus;
  };
  if (envelope.snapshotSchemaVersion !== 6) {
    throw new Error('Only V6 room snapshots can be upgraded to V7');
  }

  envelope.gameSnapshot.gameState.boardState.gameplayEvents = createEmptyGameplayEventStream();
  envelope.gameSnapshot.gameState.privateState.privateGameplayEventsByPlayer = {};
  envelope.gameSnapshot.gameState.privateState.completedCardOperations = [];
  return {
    ...envelope,
    snapshotSchemaVersion: 7,
    gameSnapshot: envelope.gameSnapshot as unknown as RoomSnapshot,
  };
};

/** V8 adds the typed public activity tail without reconstructing old logs. */
export const upgradeRoomSnapshotV7ToV8 = (
  input: unknown,
): PersistedRoomSnapshotEnvelope => {
  const envelope = structuredClone(input) as {
    snapshotSchemaVersion: number;
    gameSnapshot: {
      gameState: {
        boardState: { activityFeed?: unknown; [key: string]: unknown };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    hostPlayerId?: PlayerId | null;
    status?: RoomStatus;
  };
  if (envelope.snapshotSchemaVersion !== 7) {
    throw new Error('Only V7 room snapshots can be upgraded to V8');
  }

  envelope.gameSnapshot.gameState.boardState.activityFeed = createEmptyActivityFeed();
  return {
    ...envelope,
    snapshotSchemaVersion: 8,
    gameSnapshot: envelope.gameSnapshot as unknown as RoomSnapshot,
  };
};

/**
 * V9 adds the 2v2 team state. Every existing room becomes a Solo game with default team settings: players and finished players
 * receive a team by alternating through the room's members in join order (so a lobby that is upgraded is balanced and a
 * later switch to 2v2 starts from a sensible split), no match-level team state, and payment queues gain their (empty) rescue
 * slot. Nothing about an existing Solo game changes.
 */
export const upgradeRoomSnapshotV8ToV9 = (
  input: unknown,
): PersistedRoomSnapshotEnvelope => {
  const envelope = structuredClone(input) as {
    snapshotSchemaVersion: number;
    gameSnapshot: {
      members: Record<PlayerId, { joinOrder: number }>;
      gameState: {
        players: Record<PlayerId, Record<string, unknown>>;
        boardState: {
          finishedPlayers: Record<PlayerId, Record<string, unknown>>;
          winner: Record<string, unknown> | null;
          paymentQueue: Record<string, unknown> | null;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    hostPlayerId?: PlayerId | null;
    status?: RoomStatus;
  };
  if (envelope.snapshotSchemaVersion !== 8) {
    throw new Error('Only V8 room snapshots can be upgraded to V9');
  }

  const { members, gameState } = envelope.gameSnapshot;
  const teamByPlayer = new Map<PlayerId, TeamId>();
  Object.entries(members)
    .sort(([leftId, left], [rightId, right]) => left.joinOrder - right.joinOrder || leftId.localeCompare(rightId))
    .forEach(([playerId], index) => teamByPlayer.set(playerId, TEAM_IDS[index % TEAM_IDS.length]));
  const teamOf = (playerId: PlayerId): TeamId => teamByPlayer.get(playerId) ?? TEAM_IDS[0];

  Object.entries(gameState.players).forEach(([playerId, player]) => {
    player.teamId = teamOf(playerId);
  });
  Object.entries(gameState.boardState.finishedPlayers).forEach(([playerId, player]) => {
    player.teamId = teamOf(playerId);
  });
  if (gameState.boardState.winner) {
    gameState.boardState.winner.teamId = teamOf(String(gameState.boardState.winner.playerId));
  }
  if (gameState.boardState.paymentQueue) {
    gameState.boardState.paymentQueue.rescue = null;
  }
  Object.assign(gameState.boardState, {
    gameMode: 'SOLO',
    teams: createDefaultTeamSettings(),
    teamPlay: createEmptyTeamPlayState(),
    winningTeamId: null,
  });

  return {
    ...envelope,
    snapshotSchemaVersion: 9,
    gameSnapshot: envelope.gameSnapshot as unknown as RoomSnapshot,
  };
};

/**
 * V10 adds the lobby seats: every live player gets a seat inside their team (the next free one, in join order) and the
 * room starts with no open seat-swap request. Nothing about a game that is already running changes.
 */
export const upgradeRoomSnapshotV9ToV10 = (
  input: unknown,
): PersistedRoomSnapshotEnvelope => {
  const envelope = structuredClone(input) as {
    snapshotSchemaVersion: number;
    gameSnapshot: {
      members: Record<PlayerId, { joinOrder: number }>;
      gameState: {
        players: Record<PlayerId, Record<string, unknown>>;
        boardState: Record<string, unknown>;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    hostPlayerId?: PlayerId | null;
    status?: RoomStatus;
  };
  if (envelope.snapshotSchemaVersion !== 9) {
    throw new Error('Only V9 room snapshots can be upgraded to V10');
  }

  const { members, gameState } = envelope.gameSnapshot;
  const nextSlotByTeam = new Map<string, number>();
  Object.entries(gameState.players)
    .sort(([leftId], [rightId]) => (
      (members[leftId]?.joinOrder ?? 0) - (members[rightId]?.joinOrder ?? 0) || leftId.localeCompare(rightId)
    ))
    .forEach(([, player]) => {
      const teamId = String(player.teamId);
      const slot = nextSlotByTeam.get(teamId) ?? 0;
      nextSlotByTeam.set(teamId, slot + 1);
      player.teamSlot = Math.min(slot, 1);
    });
  gameState.boardState.seatSwapRequests = [];

  return {
    ...envelope,
    snapshotSchemaVersion: 10,
    gameSnapshot: envelope.gameSnapshot as unknown as RoomSnapshot,
  };
};

/**
 * V11 adds bot seats (`RoomMember.kind`, absent = HUMAN) and the per-match `boardState.matchId`. A V10 room has only human
 * members and no match id, which is exactly what an absent field means, so the upgrade only stamps the version.
 */
export const upgradeRoomSnapshotV10ToV11 = (
  input: unknown,
): PersistedRoomSnapshotEnvelope => {
  const envelope = structuredClone(input) as PersistedRoomSnapshotEnvelope;
  if (envelope.snapshotSchemaVersion !== 10) {
    throw new Error('Only V10 room snapshots can be upgraded to V11');
  }
  return { ...envelope, snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION };
};
