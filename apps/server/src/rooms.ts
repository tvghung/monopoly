import type {
  GameState,
  PersistedGameState,
  PlayerId,
  RoomMembershipStatus,
  RoomStatus,
} from '@monopoly/shared';
import {
  allGameCards,
  createCanonicalDecks,
  persistedGameStateSchema,
  tileState,
} from '@monopoly/shared';
import { z } from 'zod';

export const ROOM_SNAPSHOT_SCHEMA_VERSION = 3;
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
    currentPlayer: { id: '', hasMoved: false },
    turnNumber: 0,
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    ownedProps: {},
    openMarket: {},
    winner: null,
    paymentQueue: null,
  },
  players: {},
  turnInfo: {},
  privateState: { decks: createCanonicalDecks(), forcedSaleProposal: null },
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
    snapshot.gameState.boardState.turnRecovery?.deadlineAt,
    snapshot.gameState.boardState.paymentQueue?.actionDeadlineAt,
    snapshot.gameState.privateState.forcedSaleProposal?.expiresAt,
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
    state.turnInfo.pendingDevelopmentDecision?.playerId,
    state.privateState.forcedSaleProposal?.sellerPlayerId,
    state.privateState.forcedSaleProposal?.buyerPlayerId,
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

  if (
    state.boardState.auction
    || state.boardState.buildingContention
    || state.boardState.bankPropertyAuctionQueue
  ) {
    throw new Error('Room snapshot v3 cannot contain auction or building-scarcity state');
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
  if (state.turnInfo.canBuyProp !== undefined) {
    throw new Error('Room snapshot v3 cannot contain the legacy canBuyProp flag');
  }
  if (decision && development) {
    throw new Error('Room snapshot cannot contain two pending landing decisions');
  }
  if (state.boardState.paymentQueue && (decision || development)) {
    throw new Error('Room snapshot cannot contain a landing decision during payment shortfall');
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
    if (
      !property || property.id !== development.playerId || tile?.tileType !== 'normal'
      || property.mortgaged || property.houses !== development.levelAtLanding
      || (development.kind === 'HOUSES' && development.levelAtLanding >= 4)
      || (development.kind === 'HOTEL' && development.levelAtLanding !== 4)
    ) throw new Error('Room snapshot development target is inconsistent');
  }

  if (recovery?.pendingOperationId !== undefined) {
    const pendingOperationId = decision?.operationId ?? development?.operationId ?? null;
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
    const tile = tileState[proposal.tileID];
    const invested = tile?.tileType === 'normal'
      ? proposal.expectedHouses * (tile.houseCost ?? 0)
      : 0;
    const expectedGross = Math.floor(((tile?.price ?? 0) + invested) * 70 / 100);
    const mortgagePrincipal = Math.floor((tile?.price ?? 0) / 2);
    const expectedNet = Math.max(
      0,
      expectedGross - (proposal.expectedMortgaged ? mortgagePrincipal : 0),
    );
    if (
      !claim || claim.claimId !== proposal.claimId
      || state.boardState.paymentQueue?.operationId !== proposal.paymentOperationId
      || claim.debtorPlayerId !== proposal.sellerPlayerId
      || proposal.sellerPlayerId === proposal.buyerPlayerId
      || !state.players[proposal.buyerPlayerId]
      || !property || property.id !== proposal.sellerPlayerId
      || property.houses !== proposal.expectedHouses
      || property.mortgaged !== proposal.expectedMortgaged
      || proposal.grossPrice !== expectedGross
      || proposal.sellerNetProceeds !== expectedNet
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
    if (property.mortgaged && property.houses > 0) {
      throw new Error(`Room snapshot property ${tileID} is mortgaged with buildings`);
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
  ];
  if (
    cardLocations.some((cardId) => !knownCardIds.has(cardId))
    || new Set(cardLocations).size !== cardLocations.length
    || cardLocations.length !== knownCardIds.size
  ) {
    throw new Error('Room snapshot card ownership/deck state is inconsistent');
  }
};

/** Older rows are upgraded transactionally; runtime accepts v3 only. */
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
      || room.gameSnapshot.gameState.turnInfo.pendingPropertyDecision
      || room.gameSnapshot.gameState.turnInfo.pendingDevelopmentDecision
      || room.gameSnapshot.gameState.privateState.forcedSaleProposal
    )
  ) {
    throw new Error('Finished room contains a live runtime operation');
  }
};
