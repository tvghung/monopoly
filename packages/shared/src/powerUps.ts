import { z } from 'zod';

export const POWER_UP_CATEGORIES = ['ATTACK', 'DEFENSE', 'UTILITY'] as const;
export const POWER_UP_RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;
export const POWER_UP_ACTIVATIONS = ['ACTIVE', 'REACTION', 'TRAP'] as const;
export const POWER_UP_REWARD_STAGES = [
  'OFFER_GENERATED', 'WAITING', 'SELECTING', 'SELECTED', 'REVEALED',
  'INVENTORY_RESOLUTION', 'COMPLETED',
] as const;

const key = z.string().trim().min(1).max(128);
const count = z.number().int().nonnegative().safe();

export const powerUpDefinitionSchema = z.strictObject({
  definitionId: key,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  category: z.enum(POWER_UP_CATEGORIES),
  rarity: z.enum(POWER_UP_RARITIES),
  activation: z.enum(POWER_UP_ACTIVATIONS),
  effectKey: key,
});
export type PowerUpDefinition = Readonly<z.infer<typeof powerUpDefinitionSchema>>;
export type PowerUpCategory = PowerUpDefinition['category'];

export const powerUpInstanceSchema = z.strictObject({
  instanceId: z.uuid(),
  definitionId: key,
  ownerPlayerId: z.uuid(),
  obtainedFromOfferId: z.uuid(),
});
export type PowerUpInstance = z.infer<typeof powerUpInstanceSchema>;

export const powerUpInventorySchema = z.strictObject({
  // null explicitly means unlimited. There is no default product capacity.
  capacity: count.nullable(),
  cards: z.array(powerUpInstanceSchema),
}).superRefine((inventory, context) => {
  if (inventory.capacity !== null && inventory.cards.length > inventory.capacity) {
    context.addIssue({ code: 'custom', message: 'Inventory exceeds configured capacity' });
  }
  if (new Set(inventory.cards.map(card => card.instanceId)).size !== inventory.cards.length) {
    context.addIssue({ code: 'custom', message: 'Duplicate inventory instance' });
  }
  if (new Set(inventory.cards.map(card => card.obtainedFromOfferId)).size !== inventory.cards.length) {
    context.addIssue({ code: 'custom', message: 'An offer can grant only one inventory instance' });
  }
});
export type PowerUpInventory = z.infer<typeof powerUpInventorySchema>;

export const powerUpCandidateSchema = z.strictObject({
  category: z.enum(POWER_UP_CATEGORIES),
  definitionId: key,
});
export type PowerUpCandidate = z.infer<typeof powerUpCandidateSchema>;

export const powerUpRewardOfferSchema = z.strictObject({
  offerId: z.uuid(),
  ownerPlayerId: z.uuid(),
  source: z.strictObject({ kind: z.literal('START_REWARD'), occurrenceId: z.uuid() }),
  stage: z.enum(POWER_UP_REWARD_STAGES),
  candidates: z.array(powerUpCandidateSchema).length(POWER_UP_CATEGORIES.length),
  selectedIndex: z.number().int().min(0).max(POWER_UP_CATEGORIES.length - 1).nullable(),
  outcome: z.strictObject({
    kind: z.enum(['GRANTED', 'REPLACED', 'DECLINED', 'DISCARDED_FULL', 'CANCELLED']),
    automatic: z.boolean(),
  }).optional(),
}).superRefine((offer, context) => {
  if (new Set(offer.candidates.map(candidate => candidate.category)).size !== POWER_UP_CATEGORIES.length) {
    context.addIssue({ code: 'custom', message: 'Offer requires one candidate per category' });
  }
  if (offer.offerId !== offer.source.occurrenceId) {
    context.addIssue({ code: 'custom', message: 'Offer identity must equal START occurrence identity' });
  }
  if (offer.outcome && offer.stage !== 'COMPLETED') {
    context.addIssue({ code: 'custom', message: 'Only completed offers have an outcome' });
  }
  const locked = ['SELECTED', 'REVEALED', 'INVENTORY_RESOLUTION', 'COMPLETED'].includes(offer.stage);
  if (offer.outcome?.kind === 'CANCELLED' ? offer.stage !== 'COMPLETED' : locked !== (offer.selectedIndex !== null)) {
    context.addIssue({ code: 'custom', message: 'Selected index must match lifecycle stage' });
  }
});
export type PowerUpRewardOffer = z.infer<typeof powerUpRewardOfferSchema>;

export const powerUpRewardQueueSchema = z.strictObject({
  // Completed records are retained for match-lifetime idempotency, never a bounded event tail.
  offers: z.array(powerUpRewardOfferSchema),
}).superRefine((queue, context) => {
  if (new Set(queue.offers.map(offer => offer.offerId)).size !== queue.offers.length) {
    context.addIssue({ code: 'custom', message: 'Duplicate reward occurrence' });
  }
  for (const owner of new Set(queue.offers.map(offer => offer.ownerPlayerId))) {
    const owned = queue.offers.filter(offer => offer.ownerPlayerId === owner);
    const firstPending = owned.findIndex(offer => offer.stage !== 'COMPLETED');
    if (firstPending < 0) continue;
    if (owned.slice(firstPending).some(offer => offer.stage === 'COMPLETED')
      || owned.slice(firstPending + 1).some(offer => !['OFFER_GENERATED', 'WAITING'].includes(offer.stage))) {
      context.addIssue({ code: 'custom', message: 'Rewards must resolve FIFO per owner' });
    }
  }
});
export type PowerUpRewardQueue = z.infer<typeof powerUpRewardQueueSchema>;

const powerUpDefinitionIdSchema = z.enum([
  'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10',
  'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10',
  'U01', 'U02', 'U03', 'U04', 'U05', 'U06', 'U07', 'U08', 'U09', 'U10',
]);
const powerUpStatusSchema = z.strictObject({
  statusId: z.uuid(),
  kind: z.enum([
    'RENT_MODIFIER', 'PURCHASE_SURCHARGE', 'BUILD_RESTRICTION', 'RENT_SHARE',
    'RENT_SURCHARGE', 'PROPERTY_SHIELD', 'PURCHASE_DISCOUNT', 'BUILD_DISCOUNT',
  ]),
  definitionId: powerUpDefinitionIdSchema,
  sourceInstanceId: z.uuid(),
  sourcePlayerId: z.uuid(),
  targetPlayerId: z.uuid().optional(),
  targetTileID: z.number().int().min(0).max(39).optional(),
  affectedPlayerIds: z.array(z.uuid()).optional(),
  percent: z.number().int().min(-100).max(100).optional(),
  capUnits: count.optional(),
  unitsPerHouse: count.optional(),
  remainingOwnerTurns: count.optional(),
  ownerTurnPlayerId: z.uuid().optional(),
  remainingUses: count.optional(),
  expiresAtTurnNumber: count.optional(),
  expiresAtStartPlayerId: z.uuid().optional(),
});
export type PowerUpStatus = z.infer<typeof powerUpStatusSchema>;

const continuationSchema = z.strictObject({
  playerId: z.uuid(), turnNumber: count,
  resume: z.strictObject({ kind: z.literal('NO_TURN_CHANGE') }).optional(),
});
const deadline = z.iso.datetime({ offset: true });
const powerUpAttackIdSchema = z.enum(['A01', 'A03', 'A04', 'A05', 'A06', 'A07', 'A09', 'A10']);
const pendingPowerUpReactionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('ATTACK'), eventId: z.uuid(), attackerPlayerId: z.uuid(), defenderPlayerId: z.uuid(),
    attackInstanceId: z.uuid(), attackDefinitionId: powerUpAttackIdSchema,
    targetPlayerId: z.uuid().optional(), targetTileID: z.number().int().min(0).max(39).optional(),
    deadlineAt: deadline,
  }),
  z.strictObject({
    kind: z.literal('RENT'), eventId: z.uuid(), debtorPlayerId: z.uuid(), landlordPlayerId: z.uuid(),
    tileID: z.number().int().min(0).max(39), rentAmount: count, diceResult: count,
    cause: z.enum(['DICE', 'CARD']), continuation: continuationSchema, deadlineAt: deadline,
  }),
  z.strictObject({
    kind: z.literal('SHORTFALL'), eventId: z.uuid(), debtorPlayerId: z.uuid(),
    claimId: z.uuid(), paymentOperationId: z.uuid(), deadlineAt: deadline,
  }),
]);
export type PendingPowerUpReaction = z.infer<typeof pendingPowerUpReactionSchema>;

const pendingPowerUpMovementSchema = z.strictObject({
  operationId: z.uuid(), playerId: z.uuid(), turnNumber: count,
  dice: z.strictObject({ dice1: z.number().int().min(1).max(6), dice2: z.number().int().min(1).max(6) }),
  rollSequence: count,
});
export type PendingPowerUpMovement = z.infer<typeof pendingPowerUpMovementSchema>;

const pendingPowerUpTradeSchema = z.strictObject({
  requestId: z.uuid(), initiatorPlayerId: z.uuid(), targetPlayerId: z.uuid(),
  activatorInstanceId: z.uuid(), deadlineAt: deadline,
});
export type PendingPowerUpTrade = z.infer<typeof pendingPowerUpTradeSchema>;

export const powerUpStateSchema = z.strictObject({
  inventories: z.record(z.uuid(), powerUpInventorySchema),
  rewardQueue: powerUpRewardQueueSchema,
  offlineDeadlines: z.record(z.uuid(), z.iso.datetime({ offset: true })).optional(),
  continuation: z.strictObject({
    playerId: z.uuid(), turnNumber: count,
    resume: z.strictObject({ kind: z.literal('NO_TURN_CHANGE') }).optional(),
  }).nullable().optional(),
  statuses: z.array(powerUpStatusSchema).optional(),
  activeUsage: z.record(z.uuid(), count).optional(),
  pendingReaction: pendingPowerUpReactionSchema.nullable().optional(),
  resolvedReactionEventIds: z.array(z.uuid()).max(256).optional(),
  pendingMovement: pendingPowerUpMovementSchema.nullable().optional(),
  pendingTrade: pendingPowerUpTradeSchema.nullable().optional(),
}).superRefine((state, context) => {
  const allInstances = new Set<string>();
  const allGrants = new Set<string>();
  for (const [owner, inventory] of Object.entries(state.inventories)) {
    for (const card of inventory.cards) {
      if (card.ownerPlayerId !== owner || allInstances.has(card.instanceId) || allGrants.has(card.obtainedFromOfferId)) {
        context.addIssue({ code: 'custom', message: 'Invalid instance owner or duplicate grant' });
      }
      allInstances.add(card.instanceId);
      allGrants.add(card.obtainedFromOfferId);
    }
  }
});
export type PowerUpState = z.infer<typeof powerUpStateSchema>;

export const powerUpActivationRequestSchema = z.strictObject({
  instanceId: z.uuid(),
  targetPlayerId: z.uuid().optional(),
  targetTileID: z.number().int().min(0).max(39).optional(),
  ingredientInstanceIds: z.array(z.uuid()).length(2).optional(),
  transformedInstanceId: z.uuid().optional(),
  category: z.enum(POWER_UP_CATEGORIES).optional(),
  movementDelta: z.number().int().min(-3).max(3).optional(),
  statusId: z.uuid().optional(),
});
export type PowerUpActivationRequest = z.infer<typeof powerUpActivationRequestSchema>;

export const powerUpReactionRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ eventId: z.uuid(), action: z.literal('PASS') }),
  z.strictObject({
    eventId: z.uuid(), action: z.literal('REACT'), instanceId: z.uuid(),
    redirectPlayerId: z.uuid().optional(), redirectTileID: z.number().int().min(0).max(39).optional(),
  }),
]);
export type PowerUpReactionRequest = z.infer<typeof powerUpReactionRequestSchema>;
export const resolvePowerUpTradeRequestSchema = z.strictObject({ requestId: z.uuid(), accept: z.boolean() });
export type ResolvePowerUpTradeRequest = z.infer<typeof resolvePowerUpTradeRequestSchema>;
export const continuePowerUpMovementRequestSchema = z.strictObject({ operationId: z.uuid() });
export type ContinuePowerUpMovementRequest = z.infer<typeof continuePowerUpMovementRequestSchema>;

// Wire projections deliberately contain display fields only, never hidden candidate IDs.
export const powerUpPublicSummarySchema = z.strictObject({
  count, categories: z.strictObject({ ATTACK: count, DEFENSE: count, UTILITY: count }),
});
export type PowerUpPublicSummary = z.infer<typeof powerUpPublicSummarySchema>;
export const powerUpOwnerStateSchema = z.strictObject({
  inventory: z.strictObject({ capacity: count.nullable(), cards: z.array(
    powerUpInstanceSchema.extend({ definition: powerUpDefinitionSchema }),
  ) }).nullable(),
  activeUsedThisTurn: z.boolean().optional(),
  activeOfferId: z.uuid().nullable(),
  offers: z.array(z.strictObject({
    offerId: z.uuid(), stage: z.enum(POWER_UP_REWARD_STAGES),
    selectedIndex: z.number().int().min(0).max(2).nullable(),
    candidates: z.array(z.strictObject({
      category: z.enum(POWER_UP_CATEGORIES), definition: powerUpDefinitionSchema.optional(),
    })).length(3),
    outcome: z.strictObject({
      kind: z.enum(['GRANTED', 'REPLACED', 'DECLINED', 'DISCARDED_FULL', 'CANCELLED']), automatic: z.boolean(),
    }).optional(),
  })),
  statuses: z.array(z.strictObject({
    statusId: z.uuid(), definitionId: powerUpDefinitionIdSchema, kind: powerUpStatusSchema.shape.kind,
    name: z.string().optional(), description: z.string().optional(),
    targetPlayerId: z.uuid().optional(), targetTileID: z.number().int().min(0).max(39).optional(),
    remainingOwnerTurns: count.optional(), remainingUses: count.optional(),
  })).optional(),
  reaction: z.strictObject({
    eventId: z.uuid(), kind: z.enum(['ATTACK', 'RENT', 'SHORTFALL']),
    attackerPlayerId: z.uuid().optional(), attackerName: z.string().optional(),
    attackDefinitionId: powerUpAttackIdSchema.optional(), attackName: z.string().optional(),
    targetPlayerId: z.uuid().optional(), rentAmount: count.optional(),
    targetTileID: z.number().int().min(0).max(39).optional(), deadlineAt: deadline,
    eligibleInstanceIds: z.array(z.uuid()),
  }).nullable().optional(),
  tradeRequest: z.strictObject({
    requestId: z.uuid(), initiatorPlayerId: z.uuid(), initiatorName: z.string(), deadlineAt: deadline,
  }).nullable().optional(),
  movement: z.strictObject({
    operationId: z.uuid(), dice: z.strictObject({ dice1: z.number().int().min(1).max(6), dice2: z.number().int().min(1).max(6) }),
    total: z.number().int().min(2).max(12),
  }).nullable().optional(),
});
export type PowerUpOwnerState = z.infer<typeof powerUpOwnerStateSchema>;
export interface SelectPowerUpRequest { offerId: string; selectedIndex: number }
export type ResolvePowerUpRequest =
  | { offerId: string; action: 'CLAIM' | 'DECLINE' }
  | { offerId: string; action: 'REPLACE'; replaceInstanceId: string };
