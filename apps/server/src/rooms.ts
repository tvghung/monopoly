import type {
  GameState,
  PersistedGameState,
  PlayerId,
  RoomMembershipStatus,
  RoomStatus,
} from '@monopoly/shared';
import {
  allGameCards,
  colorGroups,
  createCanonicalDecks,
  persistedGameStateSchema,
  tileState,
} from '@monopoly/shared';
import { z } from 'zod';

export const ROOM_SNAPSHOT_SCHEMA_VERSION = 2;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 7;

const PLAYER_COLORS = [
  'yellow',
  'green',
  'blue',
  'red',
  'orange',
  'white',
  'black',
] as const;

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
    players: [],
    finishedPlayers: {},
    currentPlayer: { id: '', hasMoved: false, doublesStreak: 0 },
    turnNumber: 0,
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    ownedProps: {},
    openMarket: {},
    winner: null,
    auction: null,
    buildingContention: null,
    paymentQueue: null,
    bankPropertyAuctionQueue: null,
  },
  players: {},
  turnInfo: {},
  privateState: { decks: createCanonicalDecks() },
  loaded: true,
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

export const nextAvailableColor = (snapshot: RoomSnapshot): string | null => {
  const used = new Set(
    activePlayerIds(snapshot)
      .map((playerId) => snapshot.gameState.players[playerId]?.color)
      .filter((color): color is string => typeof color === 'string'),
  );
  return PLAYER_COLORS.find((color) => !used.has(color)) ?? null;
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
    }
  }
};

export const calculateNextActionAt = (snapshot: RoomSnapshot): Date | null => {
  const deadlines = [
    snapshot.gameState.boardState.auction?.endsAt,
    snapshot.gameState.boardState.turnRecovery?.deadlineAt,
    snapshot.gameState.boardState.paymentQueue?.actionDeadlineAt,
    snapshot.gameState.boardState.buildingContention?.endsAt,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()));

  if (deadlines.length === 0) return null;
  return new Date(Math.min(...deadlines.map((deadline) => deadline.getTime())));
};

export const assertRoomSnapshot = (snapshot: RoomSnapshot): void => {
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
    ...Object.values(state.boardState.openMarket).map((entry) => entry.seller),
    ...(state.boardState.auction?.active ?? []),
    ...(state.boardState.auction?.passed ?? []),
    state.boardState.auction?.highestBidder,
    state.boardState.turnRecovery?.playerId,
    state.turnInfo.pendingPropertyDecision?.playerId,
    ...Object.values(state.boardState.buildingContention?.requests ?? {}).map(
      (request) => request.playerId,
    ),
    ...Object.values(
      state.boardState.auction?.kind === 'BUILDING' ? state.boardState.auction.requests : {},
    ).map((request) => request.playerId),
    ...(state.boardState.paymentQueue?.orderedClaims.flatMap((claim) => [
      claim.debtorPlayerId,
      claim.creditorPlayerId,
    ]) ?? []),
    state.boardState.paymentQueue?.continuation.playerId,
    state.boardState.auction?.continuation?.playerId,
    state.boardState.bankPropertyAuctionQueue?.continuation.playerId,
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
  for (const [playerId, member] of Object.entries(snapshot.members)) {
    const hasLivePlayer = Boolean(state.players[playerId]);
    const hasFinishedPlayer = Boolean(state.boardState.finishedPlayers[playerId]);
    if (member.membershipStatus === 'ACTIVE') {
      if (!hasLivePlayer || hasFinishedPlayer || !turnOrder.has(playerId)) {
        throw new Error(`Active room member ${playerId} has inconsistent game state`);
      }
    } else if (hasLivePlayer || !hasFinishedPlayer || turnOrder.has(playerId)) {
      throw new Error(`Finished room member ${playerId} has inconsistent game state`);
    }
  }
  for (const playerId of Object.keys(state.players)) {
    if (snapshot.members[playerId]?.membershipStatus !== 'ACTIVE') {
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
    ...Object.keys(state.boardState.openMarket),
  ]) {
    const tileID = Number(tileKey);
    if (!Number.isSafeInteger(tileID) || tileID < 0 || tileID > 39) {
      throw new Error(`Room snapshot contains invalid tile ${tileKey}`);
    }
  }

  const auction = state.boardState.auction;
  if (state.boardState.paymentQueue && auction) {
    throw new Error('Room snapshot cannot run a live auction during debt resolution');
  }
  if (auction && state.boardState.buildingContention) {
    throw new Error('Room snapshot cannot contain an auction and building contention together');
  }
  if (auction) {
    if (new Set(auction.active).size !== auction.active.length) {
      throw new Error('Room snapshot auction contains duplicate participants');
    }
    if (auction.passed.some((playerId) => !auction.active.includes(playerId))) {
      throw new Error('Room snapshot auction passed list is not active');
    }
    if (
      (auction.highestBidder === null) !== (auction.highestBidderName === null)
      || (auction.highestBidder !== null && !auction.active.includes(auction.highestBidder))
    ) {
      throw new Error('Room snapshot auction leader is inconsistent');
    }
  }

  const bankQueue = state.boardState.bankPropertyAuctionQueue;
  if (bankQueue?.currentAuctionId) {
    if (
      !auction
      || auction.kind !== 'PROPERTY'
      || auction.source !== 'BANKRUPTCY'
      || auction.auctionId !== bankQueue.currentAuctionId
      || auction.tileID !== bankQueue.currentTileId
    ) {
      throw new Error('Room snapshot Bank auction queue does not match the live auction');
    }
  } else if (auction?.kind === 'PROPERTY' && auction.source === 'BANKRUPTCY') {
    throw new Error('Room snapshot Bank auction has no matching durable queue');
  }

  const recovery = state.boardState.turnRecovery;
  if (recovery && (
    recovery.playerId !== state.boardState.currentPlayer.id
    || recovery.turnNumber !== state.boardState.turnNumber
  )) {
    throw new Error('Room snapshot turn recovery does not match the current turn');
  }

  const decision = state.turnInfo.pendingPropertyDecision;
  if (decision && state.boardState.buildingContention) {
    throw new Error('Room snapshot cannot contain a property decision and building contention together');
  }
  if (decision && (
    decision.playerId !== state.boardState.currentPlayer.id
    || decision.continuation.playerId !== decision.playerId
    || decision.continuation.turnNumber !== state.boardState.turnNumber
  )) {
    throw new Error('Room snapshot property decision does not match the current turn');
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
  const auctionContinuation = state.boardState.auction?.continuation;
  if (auctionContinuation && !currentTurnMatches(
    auctionContinuation.playerId,
    auctionContinuation.turnNumber,
  )) {
    throw new Error('Room snapshot auction continuation does not match the current turn');
  }
  const bankContinuation = state.boardState.bankPropertyAuctionQueue?.continuation;
  if (bankContinuation && !currentTurnMatches(
    bankContinuation.playerId,
    bankContinuation.turnNumber,
  )) {
    throw new Error('Room snapshot Bank queue continuation does not match the current turn');
  }

  let housesOnBoard = 0;
  let hotelsOnBoard = 0;
  const builtGroups = new Set<string>();
  for (const [tileKey, property] of Object.entries(state.boardState.ownedProps)) {
    const tileID = Number(tileKey);
    const tile = tileState[tileID];
    if (!state.players[property.id]) {
      throw new Error(`Room snapshot property ${tileID} has no live owner`);
    }
    if (!tile || !['normal', 'railroad', 'company'].includes(tile.tileType)) {
      throw new Error(`Room snapshot property ${tileID} is not purchasable`);
    }
    if (property.mortgaged && property.houses > 0) {
      throw new Error(`Room snapshot property ${tileID} is mortgaged with buildings`);
    }
    if (tile.tileType !== 'normal' && property.houses > 0) {
      throw new Error(`Room snapshot non-street property ${tileID} has buildings`);
    }
    if (property.houses === 5) hotelsOnBoard += 1;
    else housesOnBoard += property.houses;
    if (property.houses > 0 && tile.color) builtGroups.add(tile.color);
  }
  if (housesOnBoard > 32 || hotelsOnBoard > 12) {
    throw new Error('Room snapshot exceeds the physical Bank building inventory');
  }
  for (const color of builtGroups) {
    const group = colorGroups[color] ?? [];
    const properties = group.map((tileID) => state.boardState.ownedProps[tileID]);
    const ownerId = properties[0]?.id;
    if (
      !ownerId
      || properties.some((property) => !property || property.id !== ownerId || property.mortgaged)
    ) {
      throw new Error(`Room snapshot built group ${color} lacks one valid owner`);
    }
    const levels = properties.map((property) => property.houses);
    if (Math.max(...levels) - Math.min(...levels) > 1) {
      throw new Error(`Room snapshot built group ${color} violates even building`);
    }
  }

  const buildingWait = state.boardState.buildingContention
    ?? (state.boardState.auction?.kind === 'BUILDING' ? state.boardState.auction : null);
  if (buildingWait) {
    const requests = Object.entries(buildingWait.requests);
    if (requests.length === 0) throw new Error('Room snapshot building wait has no claimants');
    for (const [playerId, request] of requests) {
      const property = state.boardState.ownedProps[request.tileID];
      const expectedType = property?.houses === 4 ? 'HOTEL' : 'HOUSE';
      if (
        request.playerId !== playerId
        || request.buildingType !== buildingWait.buildingType
        || expectedType !== buildingWait.buildingType
        || property?.id !== playerId
      ) {
        throw new Error('Room snapshot building request target is inconsistent');
      }
    }
    const available = buildingWait.buildingType === 'HOUSE'
      ? 32 - housesOnBoard
      : 12 - hotelsOnBoard;
    if (available < 1) throw new Error('Room snapshot building wait has no physical unit reserved');
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
  ];
  if (
    cardLocations.some((cardId) => !knownCardIds.has(cardId))
    || new Set(cardLocations).size !== cardLocations.length
    || cardLocations.length !== knownCardIds.size
  ) {
    throw new Error('Room snapshot card ownership/deck state is inconsistent');
  }
};

/** V1 rows are reset transactionally by migration 003; runtime accepts v2 only. */
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
      room.gameSnapshot.gameState.boardState.auction
      || room.gameSnapshot.gameState.boardState.turnRecovery
      || room.gameSnapshot.gameState.boardState.paymentQueue
      || room.gameSnapshot.gameState.boardState.buildingContention
      || room.gameSnapshot.gameState.boardState.bankPropertyAuctionQueue
    )
  ) {
    throw new Error('Finished room contains a live runtime operation');
  }
};
