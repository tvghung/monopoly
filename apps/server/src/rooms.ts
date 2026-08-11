import type {
  GameState,
  PersistedGameState,
  PlayerId,
  RoomMembershipStatus,
  RoomStatus,
} from '@monopoly/shared';
import { z } from 'zod';

export const ROOM_SNAPSHOT_SCHEMA_VERSION = 1;
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
const timestampSchema = z.iso.datetime({ offset: true });
const finishedPlayerSchema = z.strictObject({
  name: z.string().min(1).max(20),
  color: z.string().min(1).max(32),
  reason: z.enum(['BANKRUPT', 'LEFT']).optional(),
});
const playerSchema = z.strictObject({
  name: z.string().min(1).max(20),
  currentTile: finiteIntegerSchema.min(0).max(39),
  color: z.string().min(1).max(32),
  accountBalance: finiteIntegerSchema,
  isJail: z.boolean(),
  jailRounds: finiteIntegerSchema.min(0),
  getOutOfJailCards: finiteIntegerSchema.min(0),
});
const ownedPropertySchema = z.strictObject({
  id: playerIdValueSchema,
  color: z.string().min(1).max(32),
  houses: finiteIntegerSchema.min(0).max(5),
  mortgaged: z.boolean(),
});
const openMarketEntrySchema = z.strictObject({
  seller: playerIdValueSchema,
  price: finiteIntegerSchema.positive(),
  sellerName: z.string().min(1).max(20),
  tileName: z.string().min(1).max(100),
});
const auctionSchema = z.strictObject({
  auctionId: z.uuid(),
  tileID: finiteIntegerSchema.min(0).max(39),
  tileName: z.string().min(1).max(100),
  price: finiteIntegerSchema.min(0),
  highestBid: finiteIntegerSchema.min(0),
  highestBidder: playerIdValueSchema.nullable(),
  highestBidderName: z.string().min(1).max(20).nullable(),
  active: z.array(playerIdValueSchema).max(MAX_PLAYERS),
  passed: z.array(playerIdValueSchema).max(MAX_PLAYERS),
  endsAt: timestampSchema,
});
const roomSnapshotSchema = z.strictObject({
  members: z.record(playerIdValueSchema, z.strictObject({
    joinOrder: finiteIntegerSchema.positive(),
    ready: z.boolean(),
    membershipStatus: z.enum(['ACTIVE', 'FINISHED', 'LEFT']),
  })),
  nextJoinOrder: finiteIntegerSchema.positive(),
  gameState: z.strictObject({
    boardState: z.strictObject({
      gameStarted: z.boolean(),
      players: z.array(playerIdValueSchema).max(MAX_PLAYERS),
      finishedPlayers: z.record(playerIdValueSchema, finishedPlayerSchema),
      currentPlayer: z.strictObject({
        id: z.union([z.literal(''), playerIdValueSchema]),
        hasMoved: z.boolean(),
      }),
      turnNumber: finiteIntegerSchema.min(0),
      turnRecovery: z.strictObject({
        turnNumber: finiteIntegerSchema.min(0),
        playerId: playerIdValueSchema,
        deadlineAt: timestampSchema,
      }).nullable(),
      logs: z.array(z.string().max(2_000)).max(500),
      diceValue: z.strictObject({
        dice1: finiteIntegerSchema.min(0).max(6),
        dice2: finiteIntegerSchema.min(0).max(6),
      }),
      ownedProps: z.record(z.string().regex(/^\d+$/), ownedPropertySchema),
      openMarket: z.record(z.string().regex(/^\d+$/), openMarketEntrySchema),
      winner: finishedPlayerSchema.extend({
        playerId: playerIdValueSchema,
      }).nullable(),
      auction: auctionSchema.nullable(),
    }),
    players: z.record(playerIdValueSchema, playerSchema),
    turnInfo: z.strictObject({
      canBuyProp: z.boolean().optional(),
    }),
  }),
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
    auction: null,
  },
  players: {},
  turnInfo: {},
  loaded: true,
});

export const createRoomSnapshot = (): RoomSnapshot => {
  const state = freshState();
  const gameState: PersistedGameState = {
    boardState: state.boardState,
    players: state.players,
    turnInfo: state.turnInfo,
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

  const recovery = state.boardState.turnRecovery;
  if (recovery && (
    recovery.playerId !== state.boardState.currentPlayer.id
    || recovery.turnNumber !== state.boardState.turnNumber
  )) {
    throw new Error('Room snapshot turn recovery does not match the current turn');
  }
};

/**
 * Version 1 is the first durable format, so there is no legacy snapshot to
 * transform yet. Rejecting every other version prevents newer/older JSON from
 * being interpreted with the wrong domain model.
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
    )
  ) {
    throw new Error('Finished room contains a live runtime operation');
  }
};
