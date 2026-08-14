import { z } from 'zod';
import type {
  Auction,
  BankBuildingInventory,
  BankPropertyAuctionQueue,
  BoardState,
  BuildingContention,
  BuildingRequest,
  CurrentPlayer,
  DebtClaim,
  DebtSource,
  DeckState,
  GameDecks,
  GamePrivateState,
  OpenMarketEntry,
  OwnedProp,
  PaymentQueue,
  PendingPropertyDecision,
  PendingDevelopmentDecision,
  PendingTurnContinuation,
  PrivatePlayerState,
  PersistedGameState,
  Player,
  TurnInfo,
} from './types';
import {
  auctionIdSchema,
  gameCardIdSchema,
  isoTimestampSchema,
  moneyAmountSchema,
  nonNegativeMoneyAmountSchema,
  playerIdSchema,
  tileIdSchema,
} from './socketSchemas';

const operationIdSchema = z.uuid();
const turnNumberSchema = z.number().int().min(0);

export const pendingTurnContinuationSchema = z.strictObject({
  playerId: playerIdSchema,
  turnNumber: turnNumberSchema,
  rolledDoubles: z.boolean().optional(),
  forceAdvance: z.boolean().optional(),
  resume: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('COMPLETE_TURN') }),
    z.strictObject({ kind: z.literal('NO_TURN_CHANGE') }),
    z.strictObject({ kind: z.literal('RELEASE_FROM_JAIL') }),
    z.strictObject({
      kind: z.literal('MOVE_STORED_DICE'),
      dice: z.strictObject({
        dice1: z.number().int().min(1).max(6),
        dice2: z.number().int().min(1).max(6),
      }),
    }),
  ]).optional(),
}) satisfies z.ZodType<PendingTurnContinuation>;

export const pendingPropertyDecisionSchema = z.strictObject({
  operationId: operationIdSchema,
  playerId: playerIdSchema,
  tileID: tileIdSchema,
  continuation: pendingTurnContinuationSchema,
}) satisfies z.ZodType<PendingPropertyDecision>;

export const pendingDevelopmentDecisionSchema = z.strictObject({
  operationId: operationIdSchema,
  playerId: playerIdSchema,
  turnNumber: turnNumberSchema,
  tileID: tileIdSchema,
  levelAtLanding: z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4),
  ]),
  kind: z.enum(['HOUSES', 'HOTEL']),
  continuation: pendingTurnContinuationSchema,
}) satisfies z.ZodType<PendingDevelopmentDecision>;

export const turnInfoSchema = z.strictObject({
  canBuyProp: z.boolean().optional(),
  pendingPropertyDecision: pendingPropertyDecisionSchema.optional(),
  pendingDevelopmentDecision: pendingDevelopmentDecisionSchema.optional(),
}) satisfies z.ZodType<TurnInfo>;

export const currentPlayerSchema = z.strictObject({
  id: z.union([z.literal(''), playerIdSchema]),
  hasMoved: z.boolean(),
  doublesStreak: z.number().int().min(0).max(2).optional(),
}) satisfies z.ZodType<CurrentPlayer>;

export const deckStateSchema = z.strictObject({
  drawPile: z
    .array(gameCardIdSchema)
    .max(64)
    .refine((ids) => new Set(ids).size === ids.length, 'Deck card ids must be unique'),
}) satisfies z.ZodType<DeckState>;

export const gameDecksSchema = z.strictObject({
  chance: deckStateSchema,
  chest: deckStateSchema,
}) satisfies z.ZodType<GameDecks>;

export const gamePrivateStateSchema = z.strictObject({
  decks: gameDecksSchema,
  forcedSaleProposal: z.strictObject({
    proposalId: operationIdSchema,
    paymentOperationId: operationIdSchema,
    claimId: operationIdSchema,
    sellerPlayerId: playerIdSchema,
    buyerPlayerId: playerIdSchema,
    tileID: tileIdSchema,
    grossPrice: moneyAmountSchema,
    sellerNetProceeds: nonNegativeMoneyAmountSchema,
    expectedHouses: z.number().int().min(0).max(5),
    expectedMortgaged: z.boolean(),
    expiresAt: isoTimestampSchema,
  }).nullable().optional(),
}) satisfies z.ZodType<GamePrivateState>;

export const privatePlayerStateSchema = z.strictObject({
  playerId: playerIdSchema,
  heldJailFreeCardIds: z
    .array(gameCardIdSchema)
    .max(2)
    .refine((ids) => new Set(ids).size === ids.length, 'Held jail-free card ids must be unique'),
  forcedSaleProposal: z.strictObject({
    proposalId: operationIdSchema,
    paymentOperationId: operationIdSchema,
    claimId: operationIdSchema,
    sellerPlayerId: playerIdSchema,
    buyerPlayerId: playerIdSchema,
    tileID: tileIdSchema,
    grossPrice: moneyAmountSchema,
    sellerNetProceeds: nonNegativeMoneyAmountSchema,
    expectedHouses: z.number().int().min(0).max(5),
    expectedMortgaged: z.boolean(),
    expiresAt: isoTimestampSchema,
  }).nullable().optional(),
}) satisfies z.ZodType<PrivatePlayerState>;

export const buildingTypeSchema = z.enum(['HOUSE', 'HOTEL']);

export const buildingRequestSchema = z.strictObject({
  playerId: playerIdSchema,
  tileID: tileIdSchema,
  buildingType: buildingTypeSchema,
  requestedAt: isoTimestampSchema,
}) satisfies z.ZodType<BuildingRequest>;

export const buildingContentionSchema = z.strictObject({
  contentionId: operationIdSchema,
  buildingType: buildingTypeSchema,
  reservedUnit: z.strictObject({
    buildingType: buildingTypeSchema,
    quantity: z.literal(1),
  }),
  requests: z.record(playerIdSchema, buildingRequestSchema),
  endsAt: isoTimestampSchema,
}).superRefine((contention, context) => {
  const requests = Object.entries(contention.requests);
  if (contention.reservedUnit.buildingType !== contention.buildingType) {
    context.addIssue({
      code: 'custom',
      path: ['reservedUnit', 'buildingType'],
      message: 'Reserved unit type must match the contention',
    });
  }
  if (requests.length === 0) {
    context.addIssue({ code: 'custom', message: 'Building contention requires a request' });
  }
  requests.forEach(([playerId, request]) => {
    if (request.playerId !== playerId) {
      context.addIssue({
        code: 'custom',
        path: ['requests', playerId, 'playerId'],
        message: 'Building request key and player id must match',
      });
    }
    if (request.buildingType !== contention.buildingType) {
      context.addIssue({
        code: 'custom',
        path: ['requests', playerId, 'buildingType'],
        message: 'Building request type must match the contention',
      });
    }
  });
}) satisfies z.ZodType<BuildingContention>;

export const debtSourceSchema: z.ZodType<DebtSource> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('RENT'), tileID: tileIdSchema }),
  z.strictObject({ kind: z.literal('TAX'), tileID: tileIdSchema }),
  z.strictObject({ kind: z.literal('CARD'), cardId: gameCardIdSchema }),
  z.strictObject({ kind: z.literal('BAIL') }),
  z.strictObject({ kind: z.literal('MORTGAGE_INTEREST'), tileID: tileIdSchema }),
  z.strictObject({ kind: z.literal('OTHER'), description: z.string().min(1).max(200) }),
]);

export const debtClaimSchema = z.strictObject({
  claimId: operationIdSchema,
  debtorPlayerId: playerIdSchema,
  creditor: z.enum(['PLAYER', 'BANK']),
  creditorPlayerId: playerIdSchema.optional(),
  amount: moneyAmountSchema,
  remainingAmount: nonNegativeMoneyAmountSchema,
  source: debtSourceSchema,
  status: z.enum(['PENDING', 'SETTLED', 'BANKRUPT']).optional(),
}).superRefine((claim, context) => {
  if (claim.remainingAmount > claim.amount) {
    context.addIssue({
      code: 'custom',
      path: ['remainingAmount'],
      message: 'Remaining debt cannot exceed the original amount',
    });
  }
  const creditorShapeIsValid = claim.creditor === 'PLAYER'
    ? claim.creditorPlayerId !== undefined
    : claim.creditorPlayerId === undefined;
  if (!creditorShapeIsValid) {
    context.addIssue({
      code: 'custom',
      path: ['creditorPlayerId'],
      message: 'Only a player debt has a creditor player id',
    });
  }
}) satisfies z.ZodType<DebtClaim>;

export const paymentQueueSchema = z.strictObject({
  operationId: operationIdSchema,
  orderedClaims: z.array(debtClaimSchema).min(1).max(64),
  activeClaimIndex: z.number().int().min(0),
  continuation: pendingTurnContinuationSchema,
  actionDeadlineAt: isoTimestampSchema,
}).superRefine((queue, context) => {
  if (queue.activeClaimIndex >= queue.orderedClaims.length) {
    context.addIssue({
      code: 'custom',
      path: ['activeClaimIndex'],
      message: 'Active debt claim index must be in range',
    });
  }
  const ids = queue.orderedClaims.map((claim) => claim.claimId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['orderedClaims'], message: 'Debt claim ids must be unique' });
  }
  queue.orderedClaims.forEach((claim, index) => {
    const terminal = claim.status === 'SETTLED' || claim.status === 'BANKRUPT';
    if (terminal && claim.remainingAmount !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['orderedClaims', index, 'remainingAmount'],
        message: 'A terminal debt claim must have no remaining amount',
      });
    }
    if (index < queue.activeClaimIndex && !terminal) {
      context.addIssue({
        code: 'custom',
        path: ['orderedClaims', index, 'status'],
        message: 'Claims before the active index must be terminal',
      });
    }
    if (index === queue.activeClaimIndex && terminal) {
      context.addIssue({
        code: 'custom',
        path: ['orderedClaims', index, 'status'],
        message: 'The active debt claim must remain pending',
      });
    }
    if (index >= queue.activeClaimIndex && !terminal && claim.remainingAmount <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['orderedClaims', index, 'remainingAmount'],
        message: 'Active and future debt claims require a remaining amount',
      });
    }
  });
}) satisfies z.ZodType<PaymentQueue>;

export const bankPropertyAuctionQueueSchema = z.strictObject({
  operationId: operationIdSchema,
  orderedRemainingTileIds: z
    .array(tileIdSchema)
    .max(28)
    .refine((ids) => new Set(ids).size === ids.length, 'Bank auction tile ids must be unique'),
  currentTileId: tileIdSchema.nullable(),
  currentAuctionId: auctionIdSchema.nullable(),
  continuation: pendingTurnContinuationSchema,
}).superRefine((queue, context) => {
  if ((queue.currentTileId === null) !== (queue.currentAuctionId === null)) {
    context.addIssue({
      code: 'custom',
      message: 'Current bank tile and auction id must both be set or both be null',
    });
  }
}) satisfies z.ZodType<BankPropertyAuctionQueue>;

const auctionBaseShape = {
  auctionId: auctionIdSchema,
  highestBid: nonNegativeMoneyAmountSchema,
  highestBidder: playerIdSchema.nullable(),
  highestBidderName: z.string().min(1).max(20).nullable(),
  active: z.array(playerIdSchema).min(1).max(7),
  passed: z.array(playerIdSchema).max(7),
  endsAt: isoTimestampSchema,
  continuation: pendingTurnContinuationSchema.nullable(),
  timer: z.number().int().min(0).optional(),
} as const;

export const propertyAuctionSchema = z.strictObject({
  ...auctionBaseShape,
  kind: z.literal('PROPERTY'),
  tileID: tileIdSchema,
  tileName: z.string().min(1).max(100),
  price: nonNegativeMoneyAmountSchema,
  source: z.enum(['DECLINED_PURCHASE', 'BANKRUPTCY']),
});

export const buildingAuctionSchema = z.strictObject({
  ...auctionBaseShape,
  kind: z.literal('BUILDING'),
  buildingType: buildingTypeSchema,
  requests: z.record(playerIdSchema, buildingRequestSchema),
  minimumBid: moneyAmountSchema,
});

export const auctionSchema = z.discriminatedUnion('kind', [
  propertyAuctionSchema,
  buildingAuctionSchema,
]) satisfies z.ZodType<Auction>;

export const bankBuildingInventorySchema = z.strictObject({
  housesAvailable: z.number().int().min(0).max(32),
  hotelsAvailable: z.number().int().min(0).max(12),
}) satisfies z.ZodType<BankBuildingInventory>;

export const playerSchema = z.strictObject({
  name: z.string().min(1).max(20),
  currentTile: tileIdSchema,
  color: z.string().min(1).max(32),
  accountBalance: z.number().int().min(0).max(2_147_483_647),
  isJail: z.boolean(),
  jailOpponentRoundsElapsed: z.number().int().min(0).max(2).optional(),
  jailRounds: z.number().int().min(0).max(3).optional(),
  heldJailFreeCardIds: z.array(gameCardIdSchema).max(2),
}) satisfies z.ZodType<Player>;

export const ownedPropertySchema = z.strictObject({
  id: playerIdSchema,
  color: z.string().min(1).max(32),
  houses: z.number().int().min(0).max(5),
  mortgaged: z.boolean(),
}) satisfies z.ZodType<OwnedProp>;

export const openMarketEntrySchema = z.strictObject({
  seller: playerIdSchema,
  price: moneyAmountSchema,
  sellerName: z.string().min(1).max(20),
  tileName: z.string().min(1).max(100),
}) satisfies z.ZodType<OpenMarketEntry>;

const finishedPlayerSchema = z.strictObject({
  name: z.string().min(1).max(20),
  color: z.string().min(1).max(32),
  reason: z.enum(['BANKRUPT', 'LEFT']).optional(),
});

export const boardStateSchema = z.strictObject({
  gameStarted: z.boolean(),
  players: z.array(playerIdSchema).max(7),
  finishedPlayers: z.record(playerIdSchema, finishedPlayerSchema),
  currentPlayer: currentPlayerSchema,
  turnNumber: turnNumberSchema,
  turnRecovery: z.strictObject({
    turnNumber: turnNumberSchema,
    playerId: playerIdSchema,
    deadlineAt: isoTimestampSchema,
    pendingOperationId: operationIdSchema.nullable().optional(),
  }).nullable(),
  logs: z.array(z.string().max(2_000)).max(500),
  diceValue: z.strictObject({
    dice1: z.number().int().min(0).max(6),
    dice2: z.number().int().min(0).max(6),
  }),
  ownedProps: z.record(z.string().regex(/^\d+$/), ownedPropertySchema),
  openMarket: z.record(z.string().regex(/^\d+$/), openMarketEntrySchema),
  winner: finishedPlayerSchema.extend({ playerId: playerIdSchema }).nullable(),
  auction: auctionSchema.nullable().optional(),
  buildingContention: buildingContentionSchema.nullable().optional(),
  paymentQueue: paymentQueueSchema.nullable(),
  bankPropertyAuctionQueue: bankPropertyAuctionQueueSchema.nullable().optional(),
}) satisfies z.ZodType<BoardState>;

export const persistedGameStateSchema = z.strictObject({
  boardState: boardStateSchema,
  players: z.record(playerIdSchema, playerSchema),
  turnInfo: turnInfoSchema,
  privateState: gamePrivateStateSchema,
}) satisfies z.ZodType<PersistedGameState>;
