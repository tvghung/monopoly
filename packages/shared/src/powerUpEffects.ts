import { z } from 'zod';
import { powerUpDefinitionSchema } from './powerUps';

const units = z.number().int().nonnegative().safe();
const percent = z.number().int().min(0).max(100);
const flag = z.literal(true);
const params = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape).readonly();
const effect = <K extends string, T extends z.ZodRawShape>(effectKey: K, shape: T) =>
  z.strictObject({ effectKey: z.literal(effectKey), parameters: params(shape) });

/** Serializable contracts only; no handler, state mutation or monetary calculation. */
export const powerUpEffectSchema = z.discriminatedUnion('effectKey', [
  effect('TRANSFER_CASH', { percentOfAvailableCash: percent, capUnits: units }),
  effect('RENT_MODIFIER', { percent: z.number().int().min(-100).max(100), noRentBuffStacking: z.boolean() }),
  effect('PURCHASE_SURCHARGE', { percent, capUnits: units, recipient: z.literal('BANK'), unownedOnly: flag }),
  effect('RESTRICT_ACTION', { actions: z.tuple([z.literal('BUILD'), z.literal('UPGRADE')]).readonly(), mandatoryDebtActsAllowed: flag }),
  effect('STEAL_CARD', { selection: z.literal('UNIFORM_RANDOM_UNPLAYED'), spareCapacityAtActivation: flag }),
  effect('RENT_SHARE', { percent, capUnits: units, extraPayerCharge: z.literal(false) }),
  effect('BUILDING_LEVY', { unitsPerHouse: units, capUnits: units, hotelHouseEquivalent: z.literal(5), recipient: z.literal('BANK') }),
  effect('RENT_SURCHARGE', { percent, capUnits: units, recipient: z.literal('BANK'), independentOfRentProtection: flag }),
  effect('RENT_DISCOUNT', { percent, capUnits: units }),
  effect('BLOCK_CASH_THEFT', { capUnits: units, powerUpDirectCashOnly: flag }),
  effect('BLOCK_DEFERRED_ATTACK', { supportedAttackIds: z.tuple([z.literal('A03'), z.literal('A04'), z.literal('A05'), z.literal('A07'), z.literal('A10')]).readonly(), beforeStatusCreation: flag }),
  effect('PROPERTY_SHIELD', { charges: z.literal(2) }),
  effect('REFLECT_ATTACK', { singleTargetOnly: flag, effectSpecificDirectionRequired: flag, reactionOnReaction: z.literal(false) }),
  effect('CANCEL_ATTACK', { beforeResolutionOnly: flag }),
  effect('SHORTFALL_SUBSIDY', { capUnits: units, contributor: z.literal('BANK'), remainingDebtUnchanged: flag }),
  effect('RENT_SUBSIDY', { capUnits: units, contributor: z.literal('BANK'), landlordReceivesFullEligibleRent: flag, playerPaysExcess: flag }),
  effect('BLOCK_INVENTORY_INTERFERENCE', { theft: flag, forcedSwap: flag, voluntaryTrade: z.literal(false) }),
  effect('REMOVE_STATUS', { count: z.literal(1), futureOnly: flag, retroactiveCompensation: z.literal(false) }),
  effect('REROLL_DICE', { mustUseNewResult: flag, preserveExistingDoubleRules: flag }),
  effect('MOVEMENT_BONUS', { steps: z.literal(2), changesRawDice: z.literal(false), startPolicy: z.literal('EXISTING_MOVEMENT_HELPER') }),
  effect('PURCHASE_DISCOUNT', { percent, capUnits: units, unownedOnly: flag, auctionAllowed: z.literal(false), playerTradeAllowed: z.literal(false) }),
  effect('UPGRADE_CARDS', { ingredientCount: z.literal(2), consumeActivator: flag, excludedIngredientDefinitionIds: z.tuple([z.literal('U04')]).readonly(), legendaryIngredientsAllowed: z.literal(false), outputTier: z.literal('HIGHEST_INGREDIENT_PLUS_ONE'), sampling: z.literal('UNIFORM_CATEGORY_THEN_DEFINITION'), duplicateDefinitionsAllowed: flag }),
  effect('ADJUST_MOVEMENT', { minDelta: z.literal(-3), maxDelta: z.literal(3), minSteps: z.literal(1), startPolicy: z.literal('EXISTING_MOVEMENT_HELPER') }),
  effect('CONSENSUAL_SWAP', { selection: z.literal('UNIFORM_RANDOM_EACH_INVENTORY'), excludeActivatorInstance: flag, declinedConsumesActivator: z.literal(false), declinedUsesActiveAllowance: flag }),
  effect('REMOTE_PURCHASE', { listPricePercent: z.literal(125), unownedOnly: flag, movesPlayer: z.literal(false), activatesTile: z.literal(false), triggersStart: z.literal(false) }),
  effect('REPLACE_MOVEMENT', { destination: z.literal('ANY_PROPERTY'), resolveDestination: flag, startPolicy: z.literal('EXISTING_MOVEMENT_HELPER') }),
  effect('BUILD_DISCOUNT', { percent, capUnits: units }),
  effect('TRANSFORM_CARD', { preserveRarity: flag, chosenCategory: flag, excludeOriginalDefinition: flag, excludeActivatorInstance: flag, legendaryAllowed: z.literal(false), selectionWithinCategory: z.literal('OPEN') }),
]);
export type PowerUpEffect = z.infer<typeof powerUpEffectSchema>;
export type PowerUpEffectKey = PowerUpEffect['effectKey'];
export type PowerUpEffectParameters<K extends PowerUpEffectKey> = Extract<PowerUpEffect, { effectKey: K }>['parameters'];

export const POWER_UP_TIMINGS = [
  'DECLARED_ACTIVE_POINT_OPEN', 'POST_ROLL_PRE_MOVEMENT', 'PRE_MOVEMENT',
  'BEFORE_ELIGIBLE_PURCHASE', 'BEFORE_RENT_SETTLEMENT', 'BEFORE_DIRECT_CASH_THEFT',
  'BEFORE_TARGETED_STATUS_CREATION', 'BEFORE_TARGETED_ATTACK_RESOLUTION',
  'BEFORE_MANDATORY_SHORTFALL_SETTLEMENT', 'BEFORE_INVENTORY_INTERFERENCE',
  'LEGAL_MOVEMENT_POINT_OPEN',
] as const;
export const POWER_UP_TARGETS = [
  'SELF', 'OPPONENT_PLAYER', 'OWNED_PROPERTY', 'OPPONENT_PROPERTY',
  'ALL_OPPONENT_PROPERTIES', 'SELF_OR_OWNED_PROPERTY', 'CONSENTING_OPPONENT',
  'UNOWNED_PROPERTY', 'ANY_PROPERTY', 'TWO_OWN_OTHER_CARDS', 'ONE_OWN_OTHER_CARD',
] as const;
export const POWER_UP_CONDITIONS = [
  'CURRENT_PLAYER', 'ACTOR_OWNS_INSTANCE', 'SPARE_INVENTORY_CAPACITY_AT_ACTIVATION',
  'TARGET_HAS_UNPLAYED_CARD', 'PRE_COMMIT_ONLY', 'ELIGIBLE_UNOWNED_PURCHASE',
  'ELIGIBLE_BUILD_OR_UPGRADE', 'MANDATORY_CASH_SHORTFALL', 'TARGET_CONSENT', 'BOTH_HAVE_ELIGIBLE_SWAP_CARD',
  'TWO_DISTINCT_OTHER_OWNED_NON_LEGENDARY_INSTANCES', 'OTHER_OWNED_NON_LEGENDARY_INSTANCE',
] as const;
const singleUse = z.literal(1);
export const powerUpDurationSchema = z.discriminatedUnion('basis', [
  z.strictObject({ basis: z.literal('IMMEDIATE'), maxUses: singleUse }),
  z.strictObject({ basis: z.literal('OWNER_TURNS'), turns: z.number().int().min(1).max(3), maxUses: z.number().int().min(1).max(2) }),
  z.strictObject({ basis: z.literal('PROPERTY_OWNER_TURNS'), turns: z.literal(3), maxUses: z.literal(2) }),
  z.strictObject({ basis: z.literal('TARGET_TURNS'), turns: z.literal(2), maxUses: singleUse }),
  z.strictObject({ basis: z.literal('TARGET_NEXT_TURN') }),
  z.strictObject({ basis: z.literal('UNTIL_ATTACKER_NEXT_TURN_BEGINS') }),
  z.strictObject({ basis: z.literal('CURRENT_TURN'), maxUses: singleUse }),
]).readonly();

export const powerUpRulesSchema = z.strictObject({
  timing: z.enum(POWER_UP_TIMINGS),
  target: z.enum(POWER_UP_TARGETS),
  trigger: z.enum([
    'ON_ACTIVATION', 'NEXT_ELIGIBLE_RENT_RECEIVED', 'NEXT_ELIGIBLE_UNOWNED_PURCHASE',
    'ELIGIBLE_PROPERTY_RENT', 'NEXT_TARGET_TURN_BUILD_OR_UPGRADE', 'NEXT_ELIGIBLE_RENT_PAID',
    'CURRENT_RENT_OBLIGATION', 'INCOMING_DIRECT_CASH_THEFT', 'INCOMING_TARGETED_STATUS',
    'INCOMING_COMPATIBLE_PROPERTY_ATTACK', 'INCOMING_TARGETED_ATTACK',
    'MANDATORY_CASH_SHORTFALL', 'INCOMING_INVENTORY_INTERFERENCE', 'NEXT_ELIGIBLE_BUILD_OR_UPGRADE',
  ]),
  conditions: z.array(z.enum(POWER_UP_CONDITIONS)).readonly(),
  duration: powerUpDurationSchema,
  compatibility: z.enum([
    'NOT_APPLICABLE', 'RENT_ONLY', 'DIRECT_POWER_UP_CASH_THEFT', 'D03_APPROVED_SET',
    'DIRECT_PROPERTY_ATTACKS_OPEN', 'SINGLE_TARGET_ATTACKS_OPEN', 'TARGETED_ATTACKS_OPEN',
    'NEGATIVE_STATUSES_OPEN', 'INVOLUNTARY_INVENTORY_ONLY', 'MANDATORY_OBLIGATION',
  ]),
  reactionPolicy: z.enum(['REACTABLE', 'COMPATIBILITY_OPEN', 'BEFORE_STATUS_CREATION', 'RESPONSE_TO_EVENT', 'NO_REACTION_ON_REACTION', 'CONSENT_REQUIRED', 'NOT_APPLICABLE']),
  openIssues: z.array(z.enum([
    'ACTIVE_TIMING', 'ROUNDING', 'STATUS_STACKING', 'DURATION_LIFECYCLE',
    'D04_COMPATIBILITY', 'D05_DIRECTION_AND_COMPATIBILITY', 'D06_COMPATIBILITY',
    'D10_STATUS_ELIGIBILITY', 'MOVEMENT_CHECKPOINT', 'MOVEMENT_HELPER',
    'PAYMENT_HOOK', 'CONSENT_FLOW', 'U10_SAMPLING',
  ])).readonly(),
}).readonly();
export type PowerUpRules = z.infer<typeof powerUpRulesSchema>;

const identity = powerUpDefinitionSchema.omit({ effectKey: true }).extend({
  definitionId: z.enum([
    'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10',
    'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10',
    'U01', 'U02', 'U03', 'U04', 'U05', 'U06', 'U07', 'U08', 'U09', 'U10',
  ]),
  rules: powerUpRulesSchema,
});
// Keep a nonempty tuple for Zod's discriminated-union inference.
const [firstEffect, ...otherEffects] = powerUpEffectSchema.options;
export const officialPowerUpDefinitionSchema = z.discriminatedUnion('effectKey', [
  firstEffect.extend(identity.shape), ...otherEffects.map(option => option.extend(identity.shape)),
]).readonly();
export type OfficialPowerUpDefinition = z.infer<typeof officialPowerUpDefinitionSchema>;
export type OfficialPowerUpId = OfficialPowerUpDefinition['definitionId'];
