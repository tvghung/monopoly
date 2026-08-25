import { z } from 'zod';
import { ACTIVITY_FEED_MAX_EVENTS, CHARACTER_IDS, PLAYER_COLOR_IDS } from './types';
import type {
  ActivityEvent,
  ActivityFeed,
  BoardState,
  CurrentPlayer,
  DebtClaim,
  DebtSource,
  DeckState,
  GameDecks,
  GamePrivateState,
  GameplayEventStream,
  GameplaySemanticEvent,
  OwnedProp,
  PaymentQueue,
  PendingPropertyDecision,
  PendingDevelopmentDecision,
  PendingCardInteraction,
  PendingTurnContinuation,
  PrivatePlayerState,
  PersistedGameState,
  Player,
  TurnInfo,
} from './types';
import {
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
  resume: z.strictObject({ kind: z.literal('NO_TURN_CHANGE') }).optional(),
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

export const pendingCardInteractionSchema = z.strictObject({
  operationId: operationIdSchema,
  playerId: playerIdSchema,
  turnNumber: turnNumberSchema,
  deck: z.enum(['chance', 'chest']),
  sourceTile: tileIdSchema,
  stage: z.enum(['AWAITING_DRAW', 'REVEALED']),
  revealedCardId: gameCardIdSchema.optional(),
  continuation: pendingTurnContinuationSchema,
  deadlineAt: isoTimestampSchema,
}).superRefine((interaction, context) => {
  if (interaction.stage === 'AWAITING_DRAW' && interaction.revealedCardId !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['revealedCardId'],
      message: 'An awaiting card interaction cannot expose a card id',
    });
  }
  if (interaction.stage === 'REVEALED' && interaction.revealedCardId === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['revealedCardId'],
      message: 'A revealed card interaction requires a card id',
    });
  }
}) satisfies z.ZodType<PendingCardInteraction>;

export const turnInfoSchema = z.strictObject({
  pendingPropertyDecision: pendingPropertyDecisionSchema.optional(),
  pendingDevelopmentDecision: pendingDevelopmentDecisionSchema.optional(),
  pendingCardInteraction: pendingCardInteractionSchema.optional(),
}) satisfies z.ZodType<TurnInfo>;

const moneyEndpointSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('BANK') }),
  z.strictObject({ kind: z.literal('PLAYER'), playerId: playerIdSchema }),
]);

const semanticEventBase = {
  eventId: operationIdSchema,
  sequence: z.number().int().positive().safe(),
  operationId: operationIdSchema.optional(),
};

export const gameplaySemanticEventSchema: z.ZodType<GameplaySemanticEvent> = z.discriminatedUnion('type', [
  z.strictObject({
    ...semanticEventBase,
    type: z.literal('MONEY_TRANSFER'),
    source: moneyEndpointSchema,
    destination: moneyEndpointSchema,
    amount: moneyAmountSchema,
    reason: z.enum([
      'PROPERTY_PURCHASE', 'PROPERTY_SALE', 'RENT', 'PASS_GO', 'CARD',
      'DEVELOPMENT', 'BAIL', 'TRADE', 'FORCED_SALE', 'FORFEIT', 'OTHER',
    ]),
  }),
  z.strictObject({
    ...semanticEventBase,
    type: z.literal('PROPERTY_TRANSFER'),
    tileID: tileIdSchema,
    from: moneyEndpointSchema,
    to: moneyEndpointSchema,
    cause: z.enum([
      'BANK_PURCHASE', 'BANK_SALE', 'VOLUNTARY_TRADE', 'FORCED_SALE',
      'BANKRUPTCY', 'PLAYER_LEFT', 'OTHER',
    ]),
  }),
  z.strictObject({
    ...semanticEventBase,
    type: z.literal('PASS_GO'),
    playerId: playerIdSchema,
    reward: moneyAmountSchema,
    fromTile: tileIdSchema,
    destinationTile: tileIdSchema,
    movement: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('DICE_WALK'),
        rollSequence: z.number().int().nonnegative().safe(),
      }),
      z.strictObject({ kind: z.literal('CARD'), cardId: gameCardIdSchema }),
    ]),
  }),
  z.strictObject({
    ...semanticEventBase,
    type: z.literal('SENT_TO_JAIL'),
    playerId: playerIdSchema,
    fromTile: tileIdSchema,
    destinationTile: tileIdSchema,
    cause: z.enum(['BOARD_TILE', 'CARD']),
  }),
  z.strictObject({
    ...semanticEventBase,
    type: z.literal('JAIL_ROLL_FAILED'),
    playerId: playerIdSchema,
  }),
  z.strictObject({
    ...semanticEventBase,
    type: z.literal('JAIL_RELEASED'),
    playerId: playerIdSchema,
    cause: z.enum(['BAIL', 'JAIL_FREE_CARD', 'DOUBLES', 'TIME_SERVED']),
  }),
]);

export const gameplayEventStreamSchema = z.strictObject({
  sequence: z.number().int().nonnegative().safe(),
  events: z.array(gameplaySemanticEventSchema).max(64),
}).superRefine((stream, context) => {
  const sequences = stream.events.map(event => event.sequence);
  if ((stream.sequence === 0) !== (stream.events.length === 0)) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Only an empty baseline may omit semantic events' });
  }
  if (new Set(sequences).size !== sequences.length) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Semantic sequences must be unique' });
  }
  if (stream.events.some(event => event.sequence > stream.sequence)) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Semantic event exceeds stream sequence' });
  }
  for (let index = 1; index < sequences.length; index += 1) {
    if (sequences[index] !== sequences[index - 1] + 1) {
      context.addIssue({ code: 'custom', path: ['events'], message: 'Semantic events must form a contiguous tail' });
      break;
    }
  }
  if (sequences.length > 0 && sequences.at(-1) !== stream.sequence) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Semantic tail must end at the authoritative sequence' });
  }
}) satisfies z.ZodType<GameplayEventStream>;

const activityEventBase = {
  eventId: operationIdSchema,
  sequence: z.number().int().positive().safe(),
  occurredAt: isoTimestampSchema,
};

const activityMoneyEndpointSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('BANK') }),
  z.strictObject({ kind: z.literal('PLAYER'), playerId: playerIdSchema, name: z.string().min(1).max(20) }),
]);

export const activityEventSchema: z.ZodType<ActivityEvent> = z.discriminatedUnion('type', [
  z.strictObject({
    ...activityEventBase,
    type: z.literal('PLAYER_JOINED'),
    playerId: playerIdSchema,
    playerName: z.string().min(1).max(20),
    color: z.enum(PLAYER_COLOR_IDS),
    characterId: z.enum(CHARACTER_IDS).nullable(),
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('GAME_STARTED'),
    playerIds: z.array(playerIdSchema).min(2).max(4),
    startingPlayerId: playerIdSchema,
    startingPlayerName: z.string().min(1).max(20),
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('CHAT'),
    senderRole: z.enum(['PLAYER', 'SPECTATOR']),
    senderPlayerId: playerIdSchema.optional(),
    senderName: z.string().min(1).max(20),
    message: z.string().min(1).max(500),
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('DICE_ROLL'),
    playerId: playerIdSchema,
    playerName: z.string().min(1).max(20),
    dice1: z.number().int().min(1).max(6),
    dice2: z.number().int().min(1).max(6),
    total: z.number().int().min(2).max(12),
    context: z.enum(['TURN', 'JAIL']),
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('PROPERTY_PURCHASE'),
    playerId: playerIdSchema,
    playerName: z.string().min(1).max(20),
    tileID: tileIdSchema,
    price: moneyAmountSchema,
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('PROPERTY_TRANSFER'),
    tileID: tileIdSchema,
    from: activityMoneyEndpointSchema,
    to: activityMoneyEndpointSchema,
    cause: z.enum([
      'BANK_PURCHASE', 'BANK_SALE', 'VOLUNTARY_TRADE', 'FORCED_SALE',
      'BANKRUPTCY', 'PLAYER_LEFT', 'OTHER',
    ]),
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('MONEY_TRANSFER'),
    source: activityMoneyEndpointSchema,
    destination: activityMoneyEndpointSchema,
    amount: moneyAmountSchema,
    reason: z.enum([
      'PROPERTY_PURCHASE', 'PROPERTY_SALE', 'RENT', 'PASS_GO', 'CARD',
      'DEVELOPMENT', 'BAIL', 'TRADE', 'FORCED_SALE', 'FORFEIT', 'OTHER',
    ]),
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('PROPERTY_DEVELOPMENT'),
    playerId: playerIdSchema,
    playerName: z.string().min(1).max(20),
    tileID: tileIdSchema,
    fromHouses: z.number().int().min(0).max(5),
    toHouses: z.number().int().min(0).max(5),
    action: z.enum(['BUILD', 'UPGRADE_HOTEL', 'SELL']),
    cost: nonNegativeMoneyAmountSchema.optional(),
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('CARD_REVEALED'),
    playerId: playerIdSchema,
    playerName: z.string().min(1).max(20),
    deck: z.enum(['chance', 'chest']),
    cardId: gameCardIdSchema,
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('JAIL'),
    action: z.enum(['ENTRY', 'RELEASE', 'FAILED_ROLL']),
    playerId: playerIdSchema,
    playerName: z.string().min(1).max(20),
    cause: z.enum([
      'BOARD_TILE', 'CARD', 'BAIL', 'JAIL_FREE_CARD', 'DOUBLES', 'TIME_SERVED',
    ]).optional(),
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('PLAYER_FINISHED'),
    playerId: playerIdSchema,
    playerName: z.string().min(1).max(20),
    reason: z.enum(['BANKRUPT', 'LEFT']),
    finalCash: nonNegativeMoneyAmountSchema,
  }),
  z.strictObject({
    ...activityEventBase,
    type: z.literal('GAME_FINISHED'),
    winnerPlayerId: playerIdSchema,
    winnerName: z.string().min(1).max(20),
    winnerColor: z.enum(PLAYER_COLOR_IDS),
    winnerCharacterId: z.enum(CHARACTER_IDS).nullable(),
    finalCash: nonNegativeMoneyAmountSchema,
  }),
]);

export const activityFeedSchema = z.strictObject({
  sequence: z.number().int().nonnegative().safe(),
  events: z.array(activityEventSchema).max(ACTIVITY_FEED_MAX_EVENTS),
}).superRefine((feed, context) => {
  const sequences = feed.events.map(event => event.sequence);
  if ((feed.sequence === 0) !== (feed.events.length === 0)) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Only an empty baseline may omit activity events' });
  }
  if (new Set(sequences).size !== sequences.length) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Activity sequences must be unique' });
  }
  if (feed.events.some(event => event.sequence > feed.sequence)) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Activity event exceeds feed sequence' });
  }
  for (let index = 1; index < sequences.length; index += 1) {
    if (sequences[index] !== sequences[index - 1] + 1) {
      context.addIssue({ code: 'custom', path: ['events'], message: 'Activity events must form a contiguous tail' });
      break;
    }
  }
  if (sequences.length > 0 && sequences.at(-1) !== feed.sequence) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Activity tail must end at the authoritative sequence' });
  }
}) satisfies z.ZodType<ActivityFeed>;

export const currentPlayerSchema = z.strictObject({
  id: z.union([z.literal(''), playerIdSchema]),
  hasMoved: z.boolean(),
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
    expectedHouses: z.number().int().min(0).max(5),
    expiresAt: isoTimestampSchema,
  }).nullable().optional(),
  privateGameplayEventsByPlayer: z.record(playerIdSchema, gameplayEventStreamSchema),
  completedCardOperations: z.array(z.strictObject({
    operationId: operationIdSchema,
    playerId: playerIdSchema,
  })).max(64),
}).superRefine((privateState, context) => {
  const operationIds = privateState.completedCardOperations.map(operation => operation.operationId);
  if (new Set(operationIds).size !== operationIds.length) {
    context.addIssue({ code: 'custom', path: ['completedCardOperations'], message: 'Completed card operations must be unique' });
  }
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
    expectedHouses: z.number().int().min(0).max(5),
    expiresAt: isoTimestampSchema,
  }).nullable().optional(),
  gameplayEvents: gameplayEventStreamSchema,
}) satisfies z.ZodType<PrivatePlayerState>;

export const debtSourceSchema: z.ZodType<DebtSource> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('RENT'), tileID: tileIdSchema }),
  z.strictObject({ kind: z.literal('CARD'), cardId: gameCardIdSchema }),
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

export const playerSchema = z.strictObject({
  name: z.string().min(1).max(20),
  currentTile: tileIdSchema,
  color: z.enum(PLAYER_COLOR_IDS),
  characterId: z.enum(CHARACTER_IDS).nullable(),
  accountBalance: z.number().int().min(0).max(2_147_483_647),
  isJail: z.boolean(),
  jailOpponentRoundsElapsed: z.number().int().min(0).max(2),
  heldJailFreeCardIds: z.array(gameCardIdSchema).max(2),
}) satisfies z.ZodType<Player>;

export const ownedPropertySchema = z.strictObject({
  id: playerIdSchema,
  color: z.enum(PLAYER_COLOR_IDS),
  houses: z.number().int().min(0).max(5),
}) satisfies z.ZodType<OwnedProp>;

const finishedPlayerSchema = z.strictObject({
  name: z.string().min(1).max(20),
  color: z.enum(PLAYER_COLOR_IDS),
  characterId: z.enum(CHARACTER_IDS).nullable(),
  reason: z.enum(['BANKRUPT', 'LEFT']).optional(),
  accountBalance: nonNegativeMoneyAmountSchema.optional(),
});

export const boardStateSchema = z.strictObject({
  gameStarted: z.boolean(),
  // Older durable snapshots predate the authoritative match-start timestamp.
  gameStartedAt: isoTimestampSchema.nullable().optional(),
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
  rollSequence: z.number().int().nonnegative().safe(),
  ownedProps: z.record(z.string().regex(/^\d+$/), ownedPropertySchema),
  winner: finishedPlayerSchema.extend({ playerId: playerIdSchema }).nullable(),
  paymentQueue: paymentQueueSchema.nullable(),
  gameplayEvents: gameplayEventStreamSchema,
  activityFeed: activityFeedSchema,
}) satisfies z.ZodType<BoardState>;

export const persistedGameStateSchema = z.strictObject({
  boardState: boardStateSchema,
  players: z.record(playerIdSchema, playerSchema),
  turnInfo: turnInfoSchema,
  privateState: gamePrivateStateSchema,
}) satisfies z.ZodType<PersistedGameState>;
