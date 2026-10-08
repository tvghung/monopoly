import type {
  GameState,
  CharacterId,
  PersistedGameState,
  PlayerColorId,
  PlayerId,
  Player,
  RoomMembershipStatus,
  RoomStatus,
  SeatHolder,
  TeamAwareState,
  TeamId,
  TeamSlot,
} from '@monopoly/shared';
import {
  allGameCards,
  areTeammates,
  createCanonicalDecks,
  firstFreeTeamSlot,
  getOpposingTeamId,
  LEGACY_CHARACTER_ID_MAP,
  persistedGameStateSchema,
  planEmergencyRescue,
  PLAYER_COLOR_IDS,
  teamActivePlayerIds,
  TEAM_2V2_PLAYER_COUNT,
  TEAM_IDS,
  tileState,
} from '@monopoly/shared';
import { z } from 'zod';
import { createEmptyActivityFeed } from './game/activity';
import { createEmptyGameplayEventStream } from './game/semanticEvents';
import { createDefaultTeamSettings, createEmptyTeamPlayState } from './game/teamState';

export const ROOM_SNAPSHOT_SCHEMA_VERSION = 10;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

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

const normalizeLegacyCharacterIds = (snapshot: RoomSnapshot): void => {
  const normalize = (record: LegacyPlayerRecord): void => {
    if (typeof record.characterId !== 'string') return;
    const canonicalId = LEGACY_CHARACTER_ID_MAP[record.characterId];
    if (canonicalId) record.characterId = canonicalId;
  };

  Object.values(snapshot.gameState.players as unknown as Record<PlayerId, LegacyPlayerRecord>)
    .forEach(normalize);
  Object.values(snapshot.gameState.boardState.finishedPlayers as unknown as Record<PlayerId, LegacyPlayerRecord>)
    .forEach(normalize);
  if (snapshot.gameState.boardState.winner) {
    normalize(snapshot.gameState.boardState.winner as unknown as LegacyPlayerRecord);
  }
};

const playerIdValueSchema = z.uuid();
const finiteIntegerSchema = z.number().int().finite().safe();
const roomSnapshotSchema = z.strictObject({
  members: z.record(playerIdValueSchema, z.strictObject({
    joinOrder: finiteIntegerSchema.positive(),
    ready: z.boolean(),
    membershipStatus: z.enum(['ACTIVE', 'FINISHED', 'LEFT']),
  })),
  nextJoinOrder: finiteIntegerSchema.positive(),
  gameState: persistedGameStateSchema,
});

export interface RoomMember {
  joinOrder: number;
  ready: boolean;
  membershipStatus: RoomMembershipStatus;
}

/** Durable JSONB payload. Room lifecycle/version/host stay relational. */
export interface RoomSnapshot {
  members: Record<PlayerId, RoomMember>;
  nextJoinOrder: number;
  gameState: PersistedGameState;
}

export interface PersistedRoomSnapshotEnvelope {
  snapshotSchemaVersion: number;
  gameSnapshot: RoomSnapshot;
  hostPlayerId?: PlayerId | null;
  status?: RoomStatus;
}

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

/**
 * Historical snapshot upgrade helper. Current RAM rooms are created at schema V10;
 * this preserves the exact V4 -> V5 transformation without inventing an appearance.
 */
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

/**
 * Historical snapshot upgrade helper. Current RAM rooms are created at schema V10;
 * this applies the V5 -> V6 baseline without inventing historical roll count.
 */
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

export class UnsupportedRoomSnapshotVersionError extends Error {
  constructor(readonly snapshotSchemaVersion: number) {
    super(
      `Unsupported room snapshot schema version ${snapshotSchemaVersion}; expected ${ROOM_SNAPSHOT_SCHEMA_VERSION}`,
    );
    this.name = 'UnsupportedRoomSnapshotVersionError';
  }
}

export const normalizeRoomId = (raw: unknown): string => {
  const value = (typeof raw === 'string' ? raw : '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .trim()
    .slice(0, 20)
    .toUpperCase();
  return value || 'LOBBY';
};

export const freshState = (): GameState => ({
  boardState: {
    gameStarted: false,
    gameStartedAt: null,
    gameMode: 'SOLO',
    teams: createDefaultTeamSettings(),
    teamPlay: createEmptyTeamPlayState(),
    winningTeamId: null,
    seatSwapRequests: [],
    players: [],
    finishedPlayers: {},
    currentPlayer: { id: '', hasMoved: false },
    turnNumber: 0,
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    rollSequence: 0,
    ownedProps: {},
    winner: null,
    paymentQueue: null,
    gameplayEvents: createEmptyGameplayEventStream(),
    activityFeed: createEmptyActivityFeed(),
  },
  players: {},
  turnInfo: {},
  privateState: {
    decks: createCanonicalDecks(),
    forcedSaleProposal: null,
    privateGameplayEventsByPlayer: {},
    completedCardOperations: [],
  },
  loaded: true,
});

export const createFreshPlayer = (
  name: string,
  color: PlayerColorId,
  characterId: CharacterId | null = null,
  teamId: TeamId = TEAM_IDS[0],
  teamSlot: TeamSlot = 0,
): Player => ({
  name,
  currentTile: 0,
  color,
  characterId,
  teamId,
  teamSlot,
  accountBalance: 1500,
  isJail: false,
  jailOpponentRoundsElapsed: 0,
  heldJailFreeCardIds: [],
});

export const createRoomSnapshot = (): RoomSnapshot => {
  const state = freshState();
  const gameState: PersistedGameState = {
    boardState: state.boardState,
    players: state.players,
    turnInfo: state.turnInfo,
    privateState: state.privateState,
  };
  return { members: {}, nextJoinOrder: 1, gameState };
};

export const hydrateGameState = (
  snapshot: RoomSnapshot,
  status: RoomStatus,
): GameState => ({
  ...structuredClone(snapshot.gameState),
  boardState: {
    ...structuredClone(snapshot.gameState.boardState),
    gameStarted: status !== 'LOBBY',
    gameStartedAt: snapshot.gameState.boardState.gameStartedAt ?? null,
  },
  loaded: true,
});

export const storeGameState = (
  snapshot: RoomSnapshot,
  state: GameState,
  status: RoomStatus,
): void => {
  const durableState = structuredClone(state);
  durableState.boardState.gameStarted = status !== 'LOBBY';
  durableState.boardState.gameStartedAt = durableState.boardState.gameStartedAt ?? null;
  snapshot.gameState = {
    boardState: durableState.boardState,
    players: durableState.players,
    turnInfo: durableState.turnInfo,
    privateState: durableState.privateState,
  };
};

export const activePlayerIds = (snapshot: RoomSnapshot): PlayerId[] => (
  Object.entries(snapshot.members)
    .filter(([, member]) => member.membershipStatus === 'ACTIVE')
    .sort(([, left], [, right]) => left.joinOrder - right.joinOrder)
    .map(([playerId]) => playerId)
);

/**
 * The team a joining player is placed on: the one with fewer active members, Team 1 on a tie. Four joins therefore give
 * Team 1, Team 2, Team 1, Team 2 whatever the game mode, so a later switch to 2v2 needs no re-balancing.
 */
export const chooseJoinTeam = (snapshot: RoomSnapshot): TeamId => {
  const counts: Record<TeamId, number> = { TEAM_1: 0, TEAM_2: 0 };
  for (const playerId of activePlayerIds(snapshot)) {
    const teamId = snapshot.gameState.players[playerId]?.teamId;
    if (teamId) counts[teamId] += 1;
  }
  return counts.TEAM_2 < counts.TEAM_1 ? 'TEAM_2' : 'TEAM_1';
};

/** The active members of a lobby with the seat each one holds (join order). */
export const lobbySeatHolders = (snapshot: RoomSnapshot): SeatHolder[] => (
  activePlayerIds(snapshot).flatMap((playerId) => {
    const player = snapshot.gameState.players[playerId];
    return player ? [{ playerId, teamId: player.teamId, teamSlot: player.teamSlot }] : [];
  })
);

/** Where a joining player sits: the team with fewer members (see `chooseJoinTeam`) and its lowest empty seat. */
export const chooseJoinSeat = (snapshot: RoomSnapshot): { teamId: TeamId; teamSlot: TeamSlot } | null => {
  const teamId = chooseJoinTeam(snapshot);
  const teamSlot = firstFreeTeamSlot(lobbySeatHolders(snapshot), teamId);
  return teamSlot === null ? null : { teamId, teamSlot };
};

export const nextAvailableColor = (snapshot: RoomSnapshot): PlayerColorId | null => {
  const used = new Set(
    activePlayerIds(snapshot)
      .map((playerId) => snapshot.gameState.players[playerId]?.color)
      .filter((color): color is PlayerColorId => typeof color === 'string'),
  );
  return PLAYER_COLOR_IDS.find((color) => !used.has(color)) ?? null;
};

export const syncMembershipWithGameState = (snapshot: RoomSnapshot): void => {
  for (const [playerId, member] of Object.entries(snapshot.members)) {
    if (
      member.membershipStatus === 'ACTIVE'
      && !snapshot.gameState.players[playerId]
      && snapshot.gameState.boardState.finishedPlayers[playerId]
    ) {
      member.membershipStatus = snapshot.gameState.boardState.finishedPlayers[playerId].reason === 'LEFT'
        ? 'LEFT'
        : 'FINISHED';
      member.ready = false;
    } else if (
      // A 2v2 revive puts a bankrupt member back into the game; nothing else returns a finished member.
      member.membershipStatus === 'FINISHED'
      && snapshot.gameState.players[playerId]
      && !snapshot.gameState.boardState.finishedPlayers[playerId]
    ) {
      member.membershipStatus = 'ACTIVE';
    }
  }
};

export const calculateNextActionAt = (snapshot: RoomSnapshot): Date | null => {
  const deadlines = [
    snapshot.gameState.boardState.turnRecovery?.deadlineAt,
    snapshot.gameState.boardState.paymentQueue?.actionDeadlineAt,
    snapshot.gameState.privateState.forcedSaleProposal?.expiresAt,
    snapshot.gameState.turnInfo.pendingCardInteraction?.stage === 'AWAITING_DRAW'
      ? snapshot.gameState.turnInfo.pendingCardInteraction.deadlineAt
      : undefined,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()));

  if (deadlines.length === 0) return null;
  return new Date(Math.min(...deadlines.map((deadline) => deadline.getTime())));
};

/**
 * Lobby seat consistency: no two active lobby members share a seat of a team, and every open seat-swap request is between two
 * different active members of a 2v2 lobby (at most one per requester). A started game and a Solo lobby carry no request.
 */
const assertSeatState = (snapshot: RoomSnapshot): void => {
  const board = snapshot.gameState.boardState;
  const requests = board.seatSwapRequests;
  if (board.gameStarted || board.gameMode !== 'TEAM_2V2') {
    if (requests.length > 0) throw new Error('Room snapshot has seat-swap requests outside a 2v2 lobby');
  }
  if (board.gameStarted) return;

  // A lobby above the player cap (only an old room can be) has more members than seats, so nothing can be said of its seats;
  // it can never start.
  const holders = lobbySeatHolders(snapshot);
  if (
    holders.length <= MAX_PLAYERS
    && new Set(holders.map((holder) => `${holder.teamId}:${holder.teamSlot}`)).size !== holders.length
  ) {
    throw new Error('Room snapshot lobby seats are not unique');
  }
  const requesters = new Set<PlayerId>();
  for (const request of requests) {
    const isLobbyPlayer = (playerId: PlayerId): boolean => (
      snapshot.members[playerId]?.membershipStatus === 'ACTIVE' && Boolean(snapshot.gameState.players[playerId])
    );
    if (
      !isLobbyPlayer(request.requesterPlayerId)
      || !isLobbyPlayer(request.targetPlayerId)
      || requesters.has(request.requesterPlayerId)
    ) {
      throw new Error('Room snapshot seat-swap request is inconsistent');
    }
    requesters.add(request.requesterPlayerId);
  }
};

/**
 * 2v2 consistency of a room snapshot: team colours and membership, the alternating slot order, revive windows, the team winner
 * and an open rescue offer. A Solo snapshot must carry no match-level team state at all.
 */
const assertTeamState = (snapshot: RoomSnapshot): void => {
  const state = snapshot.gameState;
  const board = state.boardState;
  const { teamPlay } = board;
  const view = state as TeamAwareState;

  assertSeatState(snapshot);
  if (board.gameMode === 'SOLO') {
    if (
      teamPlay.slotOrder.length > 0
      || teamPlay.revivedPlayerIds.length > 0
      || teamPlay.reviveWindows.length > 0
      || board.winningTeamId !== null
      || board.paymentQueue?.rescue
    ) {
      throw new Error('Room snapshot contains 2v2 team state in a Solo game');
    }
    return;
  }

  for (const [playerId, player] of Object.entries(state.players)) {
    if (player.color !== board.teams[player.teamId].color) {
      throw new Error(`Room snapshot player ${playerId} does not use their team colour`);
    }
  }
  for (const [playerId, player] of Object.entries(board.finishedPlayers)) {
    if (player.color !== board.teams[player.teamId].color) {
      throw new Error(`Room snapshot finished player ${playerId} does not use their team colour`);
    }
  }

  if (!board.gameStarted) {
    if (
      teamPlay.slotOrder.length > 0
      || teamPlay.revivedPlayerIds.length > 0
      || teamPlay.reviveWindows.length > 0
      || board.winningTeamId !== null
    ) {
      throw new Error('Room snapshot contains match-level team state in a 2v2 lobby');
    }
    return;
  }

  const known = new Set([...Object.keys(state.players), ...Object.keys(board.finishedPlayers)]);
  const slots = teamPlay.slotOrder;
  const teamOf = (playerId: PlayerId): TeamId => (
    state.players[playerId]?.teamId ?? board.finishedPlayers[playerId]?.teamId ?? TEAM_IDS[0]
  );
  if (
    slots.length !== TEAM_2V2_PLAYER_COUNT
    || known.size !== TEAM_2V2_PLAYER_COUNT
    || slots.some(playerId => !known.has(playerId))
  ) {
    throw new Error('Room snapshot 2v2 turn slots do not match the players of the game');
  }
  const slotTeams = slots.map(teamOf);
  if (
    slotTeams[0] === slotTeams[1]
    || slotTeams[0] !== slotTeams[2]
    || slotTeams[1] !== slotTeams[3]
  ) {
    throw new Error('Room snapshot 2v2 turn slots do not alternate between the teams');
  }

  // The live turn order is the slot order restricted to the players still in the game (same cyclic order).
  const alive = slots.filter(playerId => state.players[playerId]);
  const order = board.players;
  const startIndex = order.length > 0 ? alive.indexOf(order[0]) : 0;
  if (
    order.length !== alive.length
    || (order.length > 0 && (
      startIndex < 0
      || alive.some((_, index) => alive[(startIndex + index) % alive.length] !== order[index])
    ))
  ) {
    throw new Error('Room snapshot turn order does not follow the 2v2 slot order');
  }

  if (teamPlay.revivedPlayerIds.some(playerId => !slots.includes(playerId))) {
    throw new Error('Room snapshot revived player is not part of the game');
  }
  for (const window of teamPlay.reviveWindows) {
    const finished = board.finishedPlayers[window.playerId];
    const survivors = teamActivePlayerIds(view, window.teamId);
    if (
      board.winner
      || !finished
      || finished.reason !== 'BANKRUPT'
      || finished.teamId !== window.teamId
      || snapshot.members[window.playerId]?.membershipStatus !== 'FINISHED'
      || survivors.length === 0
      || window.openedAtTurnNumber > board.turnNumber
    ) {
      throw new Error('Room snapshot revive window is inconsistent');
    }
  }

  if ((board.winningTeamId !== null) !== (board.winner !== null)) {
    throw new Error('Room snapshot team winner and winner disagree');
  }
  if (board.winner && board.winningTeamId !== null) {
    if (
      teamOf(board.winner.playerId) !== board.winningTeamId
      || teamActivePlayerIds(view, getOpposingTeamId(board.winningTeamId)).length > 0
      || teamActivePlayerIds(view, board.winningTeamId).length === 0
    ) {
      throw new Error('Room snapshot team winner is inconsistent');
    }
  }

  const rescue = board.paymentQueue?.rescue;
  if (rescue && board.paymentQueue) {
    const debtor = state.players[rescue.debtorPlayerId];
    const rescuer = state.players[rescue.rescuerPlayerId];
    const plan = planEmergencyRescue(
      board.paymentQueue.orderedClaims,
      board.paymentQueue.activeClaimIndex,
      rescue.debtorPlayerId,
      rescue.rescuerPlayerId,
    );
    if (
      !debtor || !rescuer
      || !areTeammates(view, rescue.debtorPlayerId, rescue.rescuerPlayerId)
      || Object.values(board.ownedProps).some(property => property.id === rescue.debtorPlayerId)
      || plan.payable <= 0
      || plan.payable !== rescue.amount
      || rescuer.accountBalance < plan.payable
    ) {
      throw new Error('Room snapshot emergency rescue offer is inconsistent');
    }
  }
};

export const assertRoomSnapshot = (snapshot: RoomSnapshot): void => {
  normalizeLegacyCharacterIds(snapshot);
  const parsed = roomSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const location = issue?.path.join('.') || 'root';
    throw new Error(`Invalid room snapshot at ${location}: ${issue?.message ?? 'invalid value'}`);
  }

  const state = snapshot.gameState;

  const knownPlayers = new Set(Object.keys(snapshot.members));
  const references: Array<PlayerId | null | undefined> = [
    ...Object.keys(state.players),
    ...state.boardState.players,
    ...Object.keys(state.boardState.finishedPlayers),
    state.boardState.currentPlayer.id || undefined,
    state.boardState.winner?.playerId,
    ...Object.values(state.boardState.ownedProps).map((property) => property.id),
    state.boardState.turnRecovery?.playerId,
    state.turnInfo.pendingPropertyDecision?.playerId,
    state.turnInfo.pendingDevelopmentDecision?.playerId,
    state.turnInfo.pendingCardInteraction?.playerId,
    state.privateState.forcedSaleProposal?.sellerPlayerId,
    state.privateState.forcedSaleProposal?.buyerPlayerId,
    ...(state.boardState.paymentQueue?.orderedClaims.flatMap((claim) => [
      claim.debtorPlayerId,
      claim.creditorPlayerId,
    ]) ?? []),
    state.boardState.paymentQueue?.continuation.playerId,
    state.boardState.paymentQueue?.rescue?.debtorPlayerId,
    state.boardState.paymentQueue?.rescue?.rescuerPlayerId,
    ...state.boardState.teamPlay.slotOrder,
    ...state.boardState.teamPlay.revivedPlayerIds,
    ...state.boardState.teamPlay.reviveWindows.map((window) => window.playerId),
    ...state.boardState.seatSwapRequests.flatMap((request) => [request.requesterPlayerId, request.targetPlayerId]),
  ];

  for (const reference of references) {
    if (reference && !knownPlayers.has(reference)) {
      throw new Error(`Room snapshot references unknown player ${reference}`);
    }
  }

  const joinOrders = Object.values(snapshot.members).map((member) => member.joinOrder);
  if (new Set(joinOrders).size !== joinOrders.length) {
    throw new Error('Room snapshot contains duplicate join orders');
  }
  if (joinOrders.some((joinOrder) => joinOrder >= snapshot.nextJoinOrder)) {
    throw new Error('Room snapshot join-order counter is stale');
  }

  const turnOrder = new Set(state.boardState.players);
  if (turnOrder.size !== state.boardState.players.length) {
    throw new Error('Room snapshot turn order contains duplicate players');
  }
  // The winner of a finished game may leave the room. Leaving a finished game liquidates nothing, so that one member stays in
  // the game state exactly as the game ended (live player, turn slot, properties) while its membership is LEFT; everyone
  // else who left or finished keeps the finished-player record instead.
  const winnerId = state.boardState.winner?.playerId;
  const leftWinnerId = winnerId && snapshot.members[winnerId]?.membershipStatus === 'LEFT' ? winnerId : null;
  for (const [playerId, member] of Object.entries(snapshot.members)) {
    const hasLivePlayer = Boolean(state.players[playerId]);
    const hasFinishedPlayer = Boolean(state.boardState.finishedPlayers[playerId]);
    if (member.membershipStatus === 'ACTIVE') {
      if (!hasLivePlayer || hasFinishedPlayer || !turnOrder.has(playerId)) {
        throw new Error(`Active room member ${playerId} has inconsistent game state`);
      }
    } else if (playerId === leftWinnerId) {
      if (!hasLivePlayer || hasFinishedPlayer || !turnOrder.has(playerId)) {
        throw new Error(`Winner ${playerId} who left has inconsistent game state`);
      }
    } else if (hasLivePlayer || !hasFinishedPlayer || turnOrder.has(playerId)) {
      throw new Error(`Finished room member ${playerId} has inconsistent game state`);
    }
  }
  for (const playerId of Object.keys(state.players)) {
    if (playerId !== leftWinnerId && snapshot.members[playerId]?.membershipStatus !== 'ACTIVE') {
      throw new Error(`Live player ${playerId} is not an active room member`);
    }
  }
  for (const playerId of Object.keys(state.boardState.finishedPlayers)) {
    if (snapshot.members[playerId]?.membershipStatus === 'ACTIVE') {
      throw new Error(`Finished player ${playerId} is still an active room member`);
    }
  }

  for (const tileKey of [
    ...Object.keys(state.boardState.ownedProps),
  ]) {
    const tileID = Number(tileKey);
    if (!Number.isSafeInteger(tileID) || tileID < 0 || tileID > 39) {
      throw new Error(`Room snapshot contains invalid tile ${tileKey}`);
    }
  }

  const recovery = state.boardState.turnRecovery;
  if (recovery && (
    recovery.playerId !== state.boardState.currentPlayer.id
    || recovery.turnNumber !== state.boardState.turnNumber
  )) {
    throw new Error('Room snapshot turn recovery does not match the current turn');
  }

  const decision = state.turnInfo.pendingPropertyDecision;
  const development = state.turnInfo.pendingDevelopmentDecision;
  const cardInteraction = state.turnInfo.pendingCardInteraction;
  if ([decision, development, cardInteraction].filter(Boolean).length > 1) {
    throw new Error('Room snapshot cannot contain multiple pending landing operations');
  }
  if (state.boardState.paymentQueue && (decision || development || cardInteraction)) {
    throw new Error('Room snapshot cannot contain a landing operation during payment shortfall');
  }
  if (decision && (
    decision.playerId !== state.boardState.currentPlayer.id
    || decision.continuation.playerId !== decision.playerId
    || decision.continuation.turnNumber !== state.boardState.turnNumber
    || state.players[decision.playerId]?.currentTile !== decision.tileID
    || state.boardState.ownedProps[decision.tileID]
    || !tileState[decision.tileID]
    || !['normal', 'railroad', 'company'].includes(tileState[decision.tileID].tileType)
    || (tileState[decision.tileID].price ?? 0) <= 0
  )) {
    throw new Error('Room snapshot property decision does not match the current turn');
  }

  if (development && (
    development.playerId !== state.boardState.currentPlayer.id
    || development.turnNumber !== state.boardState.turnNumber
    || development.continuation.playerId !== development.playerId
    || development.continuation.turnNumber !== development.turnNumber
    || state.players[development.playerId]?.currentTile !== development.tileID
  )) {
    throw new Error('Room snapshot development decision does not match the current turn');
  }
  if (development) {
    const property = state.boardState.ownedProps[development.tileID];
    const tile = tileState[development.tileID];
    // The owner develops their own street; in 2v2 the lander may also fund a teammate's street (Team Investment).
    const mayDevelop = property !== undefined
      && (property.id === development.playerId
        || areTeammates(state, development.playerId, property.id));
    if (
      !property || !mayDevelop || tile?.tileType !== 'normal'
      || property.houses !== development.levelAtLanding
      || (development.kind === 'HOUSES' && development.levelAtLanding >= 4)
      || (development.kind === 'HOTEL' && development.levelAtLanding !== 4)
    ) throw new Error('Room snapshot development target is inconsistent');
  }

  if (cardInteraction && (
    cardInteraction.playerId !== state.boardState.currentPlayer.id
    || cardInteraction.turnNumber !== state.boardState.turnNumber
    || cardInteraction.continuation.playerId !== cardInteraction.playerId
    || cardInteraction.continuation.turnNumber !== cardInteraction.turnNumber
    || state.players[cardInteraction.playerId]?.currentTile !== cardInteraction.sourceTile
    || tileState[cardInteraction.sourceTile]?.tileType !== cardInteraction.deck
  )) {
    throw new Error('Room snapshot card interaction does not match the current turn');
  }

  if (recovery?.pendingOperationId !== undefined) {
    const pendingOperationId = decision?.operationId
      ?? development?.operationId
      ?? cardInteraction?.operationId
      ?? null;
    if (recovery.pendingOperationId !== pendingOperationId) {
      throw new Error('Room snapshot turn recovery does not match the pending operation');
    }
  }

  const proposal = state.privateState.forcedSaleProposal;
  if (proposal) {
    const claim = state.boardState.paymentQueue?.orderedClaims[
      state.boardState.paymentQueue.activeClaimIndex
    ];
    const property = state.boardState.ownedProps[proposal.tileID];
    if (
      !claim || claim.claimId !== proposal.claimId
      || state.boardState.paymentQueue?.operationId !== proposal.paymentOperationId
      || claim.debtorPlayerId !== proposal.sellerPlayerId
      || proposal.sellerPlayerId === proposal.buyerPlayerId
      || !state.players[proposal.buyerPlayerId]
      || !property || property.id !== proposal.sellerPlayerId
      || property.houses !== proposal.expectedHouses
      || Date.parse(proposal.expiresAt) > Date.parse(state.boardState.paymentQueue.actionDeadlineAt)
    ) throw new Error('Room snapshot forced-sale proposal is inconsistent');
  }

  const currentTurnMatches = (playerId: PlayerId, turnNumber: number): boolean => (
    playerId === state.boardState.currentPlayer.id
    && turnNumber === state.boardState.turnNumber
  );
  const paymentContinuation = state.boardState.paymentQueue?.continuation;
  if (paymentContinuation && !currentTurnMatches(
    paymentContinuation.playerId,
    paymentContinuation.turnNumber,
  )) {
    throw new Error('Room snapshot payment continuation does not match the current turn');
  }

  for (const [tileKey, property] of Object.entries(state.boardState.ownedProps)) {
    const tileID = Number(tileKey);
    const tile = tileState[tileID];
    if (!state.players[property.id]) {
      throw new Error(`Room snapshot property ${tileID} has no live owner`);
    }
    if (!tile || !['normal', 'railroad', 'company'].includes(tile.tileType)) {
      throw new Error(`Room snapshot property ${tileID} is not purchasable`);
    }
    if (tile.tileType !== 'normal' && property.houses > 0) {
      throw new Error(`Room snapshot non-street property ${tileID} has buildings`);
    }
  }

  const knownCards = new Map(allGameCards.map((card) => [card.id, card]));
  const knownCardIds = new Set(knownCards.keys());
  const chancePile = state.privateState.decks.chance.drawPile;
  const chestPile = state.privateState.decks.chest.drawPile;
  if (chancePile.some((cardId) => knownCards.get(cardId)?.sourceDeck !== 'chance')) {
    throw new Error('Room snapshot chance deck contains a card from another deck');
  }
  if (chestPile.some((cardId) => knownCards.get(cardId)?.sourceDeck !== 'chest')) {
    throw new Error('Room snapshot chest deck contains a card from another deck');
  }
  for (const player of Object.values(state.players)) {
    if (player.heldJailFreeCardIds.some((cardId) => !knownCards.get(cardId)?.getOutOfJailFree)) {
      throw new Error('Room snapshot player holds a non-jail-free card');
    }
  }
  const cardLocations = [
    ...chancePile,
    ...chestPile,
    ...Object.values(state.players).flatMap((player) => player.heldJailFreeCardIds),
    ...(cardInteraction?.revealedCardId ? [cardInteraction.revealedCardId] : []),
  ];
  if (
    cardLocations.some((cardId) => !knownCardIds.has(cardId))
    || new Set(cardLocations).size !== cardLocations.length
    || cardLocations.length !== knownCardIds.size
  ) {
    throw new Error('Room snapshot card ownership/deck state is inconsistent');
  }

  assertTeamState(snapshot);
};

/** Older rows are upgraded transactionally; current V10 rows normalize legacy mascot ids at the boundary. */
export const assertSupportedRoomSnapshot = (
  room: PersistedRoomSnapshotEnvelope,
): void => {
  if (room.snapshotSchemaVersion !== ROOM_SNAPSHOT_SCHEMA_VERSION) {
    throw new UnsupportedRoomSnapshotVersionError(room.snapshotSchemaVersion);
  }
  assertRoomSnapshot(room.gameSnapshot);
  if (
    room.hostPlayerId
    && (!room.gameSnapshot.members[room.hostPlayerId]
      || room.gameSnapshot.members[room.hostPlayerId].membershipStatus === 'LEFT')
  ) {
    throw new Error('Persisted room host is not an eligible room member');
  }
  if (
    room.status
    && room.gameSnapshot.gameState.boardState.gameStarted !== (room.status !== 'LOBBY')
  ) {
    throw new Error('Persisted room lifecycle and game snapshot disagree');
  }
  if (
    room.status
    && (room.status === 'FINISHED')
      !== Boolean(room.gameSnapshot.gameState.boardState.winner)
  ) {
    throw new Error('Persisted room winner and lifecycle disagree');
  }
  if (
    room.status === 'LOBBY'
    && Object.keys(room.gameSnapshot.members).length > 0
    && (
      !room.hostPlayerId
      || room.gameSnapshot.members[room.hostPlayerId]?.membershipStatus !== 'ACTIVE'
    )
  ) {
    throw new Error('Persisted lobby has no active host');
  }
  if (
      room.status === 'FINISHED'
    && (
      room.gameSnapshot.gameState.boardState.turnRecovery
      || room.gameSnapshot.gameState.boardState.paymentQueue
      || room.gameSnapshot.gameState.turnInfo.pendingPropertyDecision
      || room.gameSnapshot.gameState.turnInfo.pendingDevelopmentDecision
      || room.gameSnapshot.gameState.turnInfo.pendingCardInteraction
      || room.gameSnapshot.gameState.privateState.forcedSaleProposal
    )
  ) {
    throw new Error('Finished room contains a live runtime operation');
  }
};
