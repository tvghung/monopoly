import type {
  GameState,
  CharacterId,
  PersistedGameState,
  PlayerColorId,
  PlayerId,
  Player,
  PlayerKind,
  RoomMembershipStatus,
  RoomStatus,
  SeatHolder,
  TeamAwareState,
  TeamId,
  TeamSlot,
} from '@monopoly/shared';
import {
  allGameCards,
  CHARACTER_IDS,
  getAppearanceCombinationKey,
  MAX_BOTS_PER_ROOM,
  PLAYER_KINDS,
  areTeammates,
  createCanonicalDecks,
  firstFreeTeamSlot,
  getOpposingTeamId,
  STARTING_CASH,
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

import { powerUpInteractionsClear } from './game/powerUps/foundation';

export const ROOM_SNAPSHOT_SCHEMA_VERSION = 14;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

interface LegacyCharacterRecord { characterId?: unknown }

const normalizeLegacyCharacterIds = (snapshot: RoomSnapshot): void => {
  const normalize = (record: LegacyCharacterRecord): void => {
    if (typeof record.characterId !== 'string') return;
    const canonicalId = LEGACY_CHARACTER_ID_MAP[record.characterId];
    if (canonicalId) record.characterId = canonicalId;
  };

  Object.values(snapshot.gameState.players as unknown as Record<PlayerId, LegacyCharacterRecord>)
    .forEach(normalize);
  Object.values(snapshot.gameState.boardState.finishedPlayers as unknown as Record<PlayerId, LegacyCharacterRecord>)
    .forEach(normalize);
  if (snapshot.gameState.boardState.winner) {
    normalize(snapshot.gameState.boardState.winner);
  }
};

const playerIdValueSchema = z.uuid();
const finiteIntegerSchema = z.number().int().finite().safe();
const roomSnapshotSchema = z.strictObject({
  members: z.record(playerIdValueSchema, z.strictObject({
    joinOrder: finiteIntegerSchema.positive(),
    ready: z.boolean(),
    membershipStatus: z.enum(['ACTIVE', 'FINISHED', 'LEFT']),
    kind: z.enum(PLAYER_KINDS).optional(),
  })),
  nextJoinOrder: finiteIntegerSchema.positive(),
  gameState: persistedGameStateSchema,
});

export interface RoomMember {
  joinOrder: number;
  ready: boolean;
  membershipStatus: RoomMembershipStatus;
  // Absent means HUMAN (every member of a snapshot older than schema 11 is human). A BOT member has no session or connection.
  kind?: PlayerKind;
}

/** The versioned room aggregate kept in RAM; lifecycle status, revision and host live on the room record beside it. */
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
    matchId: null,
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
  accountBalance: STARTING_CASH,
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
): GameState => {
  const gameState = structuredClone(snapshot.gameState);
  gameState.boardState.gameStarted = status !== 'LOBBY';
  gameState.boardState.gameStartedAt = gameState.boardState.gameStartedAt ?? null;
  return { ...gameState, loaded: true };
};

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

export const memberKind = (member: RoomMember | undefined): PlayerKind => member?.kind ?? 'HUMAN';

export const isBotMember = (snapshot: RoomSnapshot, playerId: PlayerId): boolean => (
  memberKind(snapshot.members[playerId]) === 'BOT'
);

/** Active bot seats in join order. */
export const activeBotIds = (snapshot: RoomSnapshot): PlayerId[] => (
  activePlayerIds(snapshot).filter(playerId => isBotMember(snapshot, playerId))
);

/** Active human seats in join order. */
export const activeHumanIds = (snapshot: RoomSnapshot): PlayerId[] => (
  activePlayerIds(snapshot).filter(playerId => !isBotMember(snapshot, playerId))
);

/** Humans who still belong to the room (active or finished, not LEFT). A room without any is abandoned. */
export const remainingHumanIds = (snapshot: RoomSnapshot): PlayerId[] => (
  Object.entries(snapshot.members)
    .filter(([, member]) => member.membershipStatus !== 'LEFT' && memberKind(member) === 'HUMAN')
    .map(([playerId]) => playerId)
);

const BOT_NAME = /^Bot ([1-9])$/;

/** The lowest bot number (1, 2, 3) no other bot of the room uses, or null when every number is taken. */
export const nextBotNumber = (snapshot: RoomSnapshot): number | null => {
  const used = new Set(
    Object.entries(snapshot.members)
      .filter(([, member]) => memberKind(member) === 'BOT' && member.membershipStatus !== 'LEFT')
      .map(([playerId]) => {
        const identity = snapshot.gameState.players[playerId] ?? snapshot.gameState.boardState.finishedPlayers[playerId];
        const match = identity ? BOT_NAME.exec(identity.name) : null;
        return match ? Number(match[1]) : 0;
      }),
  );
  for (let number = 1; number <= MAX_BOTS_PER_ROOM; number += 1) {
    if (!used.has(number)) return number;
  }
  return null;
};

/**
 * A mascot for a bot wearing `color`: one whose mascot+colour combination no other active member holds, preferring a mascot
 * nobody wears at all. Null when every combination with that colour is taken.
 */
export const chooseBotCharacter = (
  snapshot: RoomSnapshot,
  botId: PlayerId,
  color: PlayerColorId,
): CharacterId | null => {
  const others = activePlayerIds(snapshot)
    .filter(playerId => playerId !== botId)
    .map(playerId => snapshot.gameState.players[playerId])
    .filter((player): player is Player => player !== undefined);
  const takenKeys = new Set(others.map(player => getAppearanceCombinationKey(player.characterId, player.color)));
  const worn = new Set(others.map(player => player.characterId));
  const free = CHARACTER_IDS.filter(characterId => !takenKeys.has(getAppearanceCombinationKey(characterId, color)));
  return free.find(characterId => !worn.has(characterId)) ?? free[0] ?? null;
};

/** Dog first, then the shared mascot order for a new seat or a Solo-to-2v2 conflict. */
export const chooseNewHumanCharacter = (
  snapshot: RoomSnapshot,
  color: PlayerColorId,
  teamId: TeamId,
  state: Pick<GameState, 'players' | 'boardState'> = snapshot.gameState,
): CharacterId | null => {
  const players = activePlayerIds(snapshot)
    .map(playerId => state.players[playerId])
    .filter((player): player is Player => player !== undefined);
  return CHARACTER_IDS.find(characterId => players.every(player => (
    getAppearanceCombinationKey(player.characterId, player.color) !== getAppearanceCombinationKey(characterId, color)
    && (state.boardState.gameMode !== 'TEAM_2V2'
      || player.teamId !== teamId || player.characterId !== characterId)
  ))) ?? null;
};

/**
 * Lobby bots are always Ready and always wear a valid, unique mascot+colour combination. Run after every lobby command, so a
 * rule that resets Ready (mode switch, play again) or clears/clashes a mascot (team moves, recolours) never leaves a bot
 * un-Ready or blocking the start. Only bots are changed: a human selection always wins over a bot.
 */
export const normalizeLobbyBots = (snapshot: RoomSnapshot, status: RoomStatus): void => {
  if (status !== 'LOBBY') return;
  const players = snapshot.gameState.players;
  const board = snapshot.gameState.boardState;
  for (const botId of activeBotIds(snapshot)) {
    const bot = players[botId];
    const member = snapshot.members[botId];
    if (!bot || !member) continue;
    if (board.gameMode === 'TEAM_2V2') bot.color = board.teams[bot.teamId].color;
    const key = getAppearanceCombinationKey(bot.characterId, bot.color);
    const clashes = key === null || activePlayerIds(snapshot).some(otherId => (
      otherId !== botId
      && getAppearanceCombinationKey(players[otherId]?.characterId ?? null, players[otherId]?.color ?? bot.color) === key
      // Between two bots the earlier one keeps its mascot.
      && (!isBotMember(snapshot, otherId) || (snapshot.members[otherId]?.joinOrder ?? 0) < member.joinOrder)
    ));
    if (clashes) bot.characterId = chooseBotCharacter(snapshot, botId, bot.color);
    member.ready = true;
  }
};

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
    ...(powerUpInteractionsClear(snapshot.gameState)
      ? Object.values(snapshot.gameState.privateState.powerUps?.offlineDeadlines ?? {}) : []),
    snapshot.gameState.privateState.powerUps?.pendingReaction?.deadlineAt,
    snapshot.gameState.privateState.powerUps?.pendingTrade?.deadlineAt,
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
      claim.rentRevenueShare?.beneficiaryPlayerId,
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

/**
 * Runtime accepts only schema V11; the RAM host does not migrate persisted rows.
 * Historical V4→V11 transforms live in test support.
 */
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
  if (room.hostPlayerId && isBotMember(room.gameSnapshot, room.hostPlayerId)) {
    throw new Error('Persisted room host is a bot');
  }
  const bots = Object.values(room.gameSnapshot.members).filter(member => memberKind(member) === 'BOT');
  if (bots.length > MAX_BOTS_PER_ROOM || bots.some(member => member.membershipStatus === 'LEFT')) {
    throw new Error('Persisted room bot seats are inconsistent');
  }
  if (room.status === 'LOBBY' && bots.some(member => member.membershipStatus === 'ACTIVE' && !member.ready)) {
    throw new Error('Persisted lobby has a bot that is not Ready');
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
