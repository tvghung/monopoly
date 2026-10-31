import { isDeepStrictEqual } from 'node:util';
import {
  POWER_UP_CATEGORIES, POWER_UP_RARITIES, officialPowerUpDefinitionSchema,
  type OfficialPowerUpDefinition, type OfficialPowerUpId, type PowerUpEffect, type PowerUpRules,
} from '@monopoly/shared';
import { PowerUpRegistry } from './registry';

type Identity = Pick<OfficialPowerUpDefinition, 'definitionId' | 'name' | 'description' | 'category' | 'rarity' | 'activation'>;
const immediate = { basis: 'IMMEDIATE', maxUses: 1 } as const;
const active = (target: PowerUpRules['target'], overrides: Partial<PowerUpRules> = {}): PowerUpRules => ({
  timing: 'DECLARED_ACTIVE_POINT_OPEN', target, trigger: 'ON_ACTIVATION',
  conditions: ['CURRENT_PLAYER', 'ACTOR_OWNS_INSTANCE'], duration: immediate,
  compatibility: 'NOT_APPLICABLE', reactionPolicy: 'COMPATIBILITY_OPEN',
  openIssues: ['ACTIVE_TIMING'], ...overrides,
});
const reaction = (
  timing: PowerUpRules['timing'], trigger: PowerUpRules['trigger'], compatibility: PowerUpRules['compatibility'],
  overrides: Partial<PowerUpRules> = {},
): PowerUpRules => ({
  timing, target: 'SELF', trigger, conditions: ['ACTOR_OWNS_INSTANCE', 'PRE_COMMIT_ONLY'],
  duration: immediate, compatibility, reactionPolicy: 'RESPONSE_TO_EVENT', openIssues: [], ...overrides,
});

// Identity and descriptions are transcribed from approved 03C §6 (D03/U04 amendments included).
const identities = [
  ['A01', 'Móc Túi', 'COMMON', 'ACTIVE', "Steal 10% of a chosen opponent's available cash, max 50k; reactable."],
  ['A02', 'Tăng Phí Đột Xuất', 'COMMON', 'ACTIVE', '+25% next eligible rent for one owned property; no rent-buff stacking; expires after 2 owner turns.'],
  ['A03', 'Hợp Đồng Bất Lợi', 'COMMON', 'ACTIVE', "Chosen opponent pays +20% to bank on next eligible unowned-property purchase (max 50k) within 2 target turns."],
  ['A04', 'Tung Tin Đồn', 'COMMON', 'ACTIVE', "Chosen opponent's property rent -25% up to 3 owner turns or 2 successful reduced rents, whichever first."],
  ['A05', 'Phong Tỏa Xây Dựng', 'RARE', 'ACTIVE', 'Target cannot voluntarily build or upgrade in their next turn; mandatory debt resolution not blocked.'],
  ['A06', 'Trộm Thẻ', 'RARE', 'ACTIVE', 'Take a random unplayed inventory card from an opponent; must have spare capacity at activation.'],
  ['A07', 'Chiếm Đoạt Doanh Thu', 'EPIC', 'ACTIVE', 'Claim 50% of next eligible rent received by target, max 100k; no extra payer charge; expiry after 2 target turns.'],
  ['A08', 'Khủng Hoảng Thị Trường', 'LEGENDARY', 'ACTIVE', "All opponents' property rents -50% until the attacker's next turn begins; attacker properties unaffected."],
  ['A09', 'Thanh Tra Bất Ngờ', 'COMMON', 'ACTIVE', 'Chosen opponent pays bank 10k per house, max 50k; hotel counts as five houses.'],
  ['A10', 'Gánh Nặng Tiền Thuê', 'RARE', 'ACTIVE', "On target's next eligible rent paid in next 2 turns: +50% surcharge capped at 100k to bank; once."],
  ['D01', 'Bảo Hiểm Tiền Thuê', 'COMMON', 'REACTION', 'Reduce one rent obligation by 40%, max discount 80k, before settlement.'],
  ['D02', 'Ví Chống Trộm', 'COMMON', 'REACTION', 'Block up to 50k of an incoming direct Power-up cash theft.'],
  ['D03', 'Phá Mưu', 'COMMON', 'REACTION', 'Before status creation, block targeted ongoing/deferred ATTACKs A03/A04/A05/A07/A10 against the defender or a property they own. Excludes global A08 and instant A01/A06/A09.'],
  ['D04', 'Lá Chắn Bất Động Sản', 'COMMON', 'ACTIVE', 'Protect one owned property against 2 compatible direct Power-up attacks; expires after 3 owner turns or 2 charges.'],
  ['D05', 'Phản Đòn', 'RARE', 'REACTION', 'Reflect a compatible single-target Attack onto attacker; effect-specific direction and beneficiaries; no Reaction-on-Reaction.'],
  ['D06', 'Hủy Phép', 'RARE', 'REACTION', 'Cancel a pending Attack targeted at self or owned property before it resolves.'],
  ['D07', 'Quỹ Cứu Trợ', 'EPIC', 'REACTION', 'When lacking cash for mandatory obligation, bank contributes shortfall up to 100k; remaining debt process unchanged.'],
  ['D08', 'Bất Khả Xâm Phạm', 'LEGENDARY', 'REACTION', 'On rent payment, bank covers up to 200k and landlord receives full eligible rent; player pays excess.'],
  ['D09', 'Khóa Kho Thẻ', 'COMMON', 'REACTION', 'Block involuntary Power-up theft/forced swap on own inventory; not voluntary U06 trades.'],
  ['D10', 'Giải Phong Tỏa', 'RARE', 'ACTIVE', 'Remove one negative ongoing status on self/owned property; future only.'],
  ['U01', 'Xúc Xắc May Mắn', 'COMMON', 'ACTIVE', 'After roll but before movement, reroll and mandatorily use the new result; preserve double rules as defined.'],
  ['U02', 'Tăng Tốc', 'COMMON', 'ACTIVE', 'Before movement, add +2 steps to movement distance without modifying raw dice result; START grant follows actual movement helpers.'],
  ['U03', 'Phiếu Giảm Giá Đất', 'COMMON', 'ACTIVE', '-15% on one legal unowned-property purchase that turn, max 50k; excludes auction/player trade.'],
  ['U04', 'Hiến Tế Nâng Cấp', 'RARE', 'ACTIVE', 'Consume U04 + 2 other ingredient Power-ups of ANY rarities; receive random power-up one rarity ABOVE highest ingredient; Legendary ingredients prohibited; output sampling uniform by eligible category then definition, duplicates allowed.'],
  ['U05', 'Định Hướng', 'RARE', 'ACTIVE', 'After roll, before movement, vary steps from -3 to +3 while still moving at least 1; honor existing START hook.'],
  ['U06', 'Trao Đổi Vận May', 'COMMON', 'ACTIVE', 'With consenting target, mutually exchange one randomly selected inventory card; declined request retains U06 but uses Active allowance; U06 itself excluded from swap.'],
  ['U07', 'Đầu Tư Từ Xa', 'EPIC', 'ACTIVE', 'Buy legal unowned property at 125% of list price without moving; no tile activation / START trigger.'],
  ['U08', 'Dịch Chuyển Hoàng Gia', 'LEGENDARY', 'ACTIVE', 'Replace movement with direct travel to any property; resolve destination rules, and preserve exact START grant behavior of the chosen movement helper.'],
  ['U09', 'Phiếu Ưu Đãi Xây Dựng', 'COMMON', 'ACTIVE', "-20% on next eligible build/upgrade once, cap 50k; expires after 2 owner's turns."],
  ['U10', 'Tái Cấu Trúc Kho Thẻ', 'RARE', 'ACTIVE', 'Transform another card into random new card of chosen category, preserving rarity, excluding original definition; excludes Legendary in V1.'],
] as const;

const contracts = {
  A01: { effectKey: 'TRANSFER_CASH', parameters: { percentOfAvailableCash: 10, capUnits: 50 }, rules: active('OPPONENT_PLAYER', { reactionPolicy: 'REACTABLE', openIssues: ['ACTIVE_TIMING', 'ROUNDING'] }) },
  A02: { effectKey: 'RENT_MODIFIER', parameters: { percent: 25, noRentBuffStacking: true }, rules: active('OWNED_PROPERTY', { trigger: 'NEXT_ELIGIBLE_RENT_RECEIVED', duration: { basis: 'OWNER_TURNS', turns: 2, maxUses: 1 }, openIssues: ['ACTIVE_TIMING', 'ROUNDING', 'DURATION_LIFECYCLE'] }) },
  A03: { effectKey: 'PURCHASE_SURCHARGE', parameters: { percent: 20, capUnits: 50, recipient: 'BANK', unownedOnly: true }, rules: active('OPPONENT_PLAYER', { trigger: 'NEXT_ELIGIBLE_UNOWNED_PURCHASE', duration: { basis: 'TARGET_TURNS', turns: 2, maxUses: 1 }, reactionPolicy: 'BEFORE_STATUS_CREATION', openIssues: ['ACTIVE_TIMING', 'ROUNDING', 'STATUS_STACKING', 'DURATION_LIFECYCLE'] }) },
  A04: { effectKey: 'RENT_MODIFIER', parameters: { percent: -25, noRentBuffStacking: false }, rules: active('OPPONENT_PROPERTY', { trigger: 'ELIGIBLE_PROPERTY_RENT', duration: { basis: 'PROPERTY_OWNER_TURNS', turns: 3, maxUses: 2 }, reactionPolicy: 'BEFORE_STATUS_CREATION', openIssues: ['ACTIVE_TIMING', 'ROUNDING', 'STATUS_STACKING', 'DURATION_LIFECYCLE'] }) },
  A05: { effectKey: 'RESTRICT_ACTION', parameters: { actions: ['BUILD', 'UPGRADE'], mandatoryDebtActsAllowed: true }, rules: active('OPPONENT_PLAYER', { trigger: 'NEXT_TARGET_TURN_BUILD_OR_UPGRADE', duration: { basis: 'TARGET_NEXT_TURN' }, reactionPolicy: 'BEFORE_STATUS_CREATION', openIssues: ['ACTIVE_TIMING', 'STATUS_STACKING', 'DURATION_LIFECYCLE'] }) },
  A06: { effectKey: 'STEAL_CARD', parameters: { selection: 'UNIFORM_RANDOM_UNPLAYED', spareCapacityAtActivation: true }, rules: active('OPPONENT_PLAYER', { conditions: ['CURRENT_PLAYER', 'ACTOR_OWNS_INSTANCE', 'SPARE_INVENTORY_CAPACITY_AT_ACTIVATION', 'TARGET_HAS_UNPLAYED_CARD'] }) },
  A07: { effectKey: 'RENT_SHARE', parameters: { percent: 50, capUnits: 100, extraPayerCharge: false }, rules: active('OPPONENT_PLAYER', { trigger: 'NEXT_ELIGIBLE_RENT_RECEIVED', duration: { basis: 'TARGET_TURNS', turns: 2, maxUses: 1 }, reactionPolicy: 'BEFORE_STATUS_CREATION', openIssues: ['ACTIVE_TIMING', 'ROUNDING', 'STATUS_STACKING', 'DURATION_LIFECYCLE'] }) },
  A08: { effectKey: 'RENT_MODIFIER', parameters: { percent: -50, noRentBuffStacking: false }, rules: active('ALL_OPPONENT_PROPERTIES', { trigger: 'ELIGIBLE_PROPERTY_RENT', duration: { basis: 'UNTIL_ATTACKER_NEXT_TURN_BEGINS' }, openIssues: ['ACTIVE_TIMING', 'ROUNDING', 'STATUS_STACKING', 'DURATION_LIFECYCLE'] }) },
  A09: { effectKey: 'BUILDING_LEVY', parameters: { unitsPerHouse: 10, capUnits: 50, hotelHouseEquivalent: 5, recipient: 'BANK' }, rules: active('OPPONENT_PLAYER') },
  A10: { effectKey: 'RENT_SURCHARGE', parameters: { percent: 50, capUnits: 100, recipient: 'BANK', independentOfRentProtection: true }, rules: active('OPPONENT_PLAYER', { trigger: 'NEXT_ELIGIBLE_RENT_PAID', duration: { basis: 'TARGET_TURNS', turns: 2, maxUses: 1 }, reactionPolicy: 'BEFORE_STATUS_CREATION', openIssues: ['ACTIVE_TIMING', 'ROUNDING', 'STATUS_STACKING', 'DURATION_LIFECYCLE'] }) },
  D01: { effectKey: 'RENT_DISCOUNT', parameters: { percent: 40, capUnits: 80 }, rules: reaction('BEFORE_RENT_SETTLEMENT', 'CURRENT_RENT_OBLIGATION', 'RENT_ONLY', { openIssues: ['ROUNDING', 'PAYMENT_HOOK'] }) },
  D02: { effectKey: 'BLOCK_CASH_THEFT', parameters: { capUnits: 50, powerUpDirectCashOnly: true }, rules: reaction('BEFORE_DIRECT_CASH_THEFT', 'INCOMING_DIRECT_CASH_THEFT', 'DIRECT_POWER_UP_CASH_THEFT') },
  D03: { effectKey: 'BLOCK_DEFERRED_ATTACK', parameters: { supportedAttackIds: ['A03', 'A04', 'A05', 'A07', 'A10'], beforeStatusCreation: true }, rules: reaction('BEFORE_TARGETED_STATUS_CREATION', 'INCOMING_TARGETED_STATUS', 'D03_APPROVED_SET', { target: 'SELF_OR_OWNED_PROPERTY' }) },
  D04: { effectKey: 'PROPERTY_SHIELD', parameters: { charges: 2 }, rules: active('OWNED_PROPERTY', { trigger: 'INCOMING_COMPATIBLE_PROPERTY_ATTACK', duration: { basis: 'PROPERTY_OWNER_TURNS', turns: 3, maxUses: 2 }, compatibility: 'DIRECT_PROPERTY_ATTACKS_OPEN', openIssues: ['ACTIVE_TIMING', 'D04_COMPATIBILITY', 'STATUS_STACKING', 'DURATION_LIFECYCLE'] }) },
  D05: { effectKey: 'REFLECT_ATTACK', parameters: { singleTargetOnly: true, effectSpecificDirectionRequired: true, reactionOnReaction: false }, rules: reaction('BEFORE_TARGETED_ATTACK_RESOLUTION', 'INCOMING_TARGETED_ATTACK', 'SINGLE_TARGET_ATTACKS_OPEN', { target: 'SELF_OR_OWNED_PROPERTY', reactionPolicy: 'NO_REACTION_ON_REACTION', openIssues: ['D05_DIRECTION_AND_COMPATIBILITY'] }) },
  D06: { effectKey: 'CANCEL_ATTACK', parameters: { beforeResolutionOnly: true }, rules: reaction('BEFORE_TARGETED_ATTACK_RESOLUTION', 'INCOMING_TARGETED_ATTACK', 'TARGETED_ATTACKS_OPEN', { target: 'SELF_OR_OWNED_PROPERTY', openIssues: ['D06_COMPATIBILITY'] }) },
  D07: { effectKey: 'SHORTFALL_SUBSIDY', parameters: { capUnits: 100, contributor: 'BANK', remainingDebtUnchanged: true }, rules: reaction('BEFORE_MANDATORY_SHORTFALL_SETTLEMENT', 'MANDATORY_CASH_SHORTFALL', 'MANDATORY_OBLIGATION', { conditions: ['ACTOR_OWNS_INSTANCE', 'PRE_COMMIT_ONLY', 'MANDATORY_CASH_SHORTFALL'], openIssues: ['PAYMENT_HOOK'] }) },
  D08: { effectKey: 'RENT_SUBSIDY', parameters: { capUnits: 200, contributor: 'BANK', landlordReceivesFullEligibleRent: true, playerPaysExcess: true }, rules: reaction('BEFORE_RENT_SETTLEMENT', 'CURRENT_RENT_OBLIGATION', 'RENT_ONLY', { openIssues: ['PAYMENT_HOOK'] }) },
  D09: { effectKey: 'BLOCK_INVENTORY_INTERFERENCE', parameters: { theft: true, forcedSwap: true, voluntaryTrade: false }, rules: reaction('BEFORE_INVENTORY_INTERFERENCE', 'INCOMING_INVENTORY_INTERFERENCE', 'INVOLUNTARY_INVENTORY_ONLY') },
  D10: { effectKey: 'REMOVE_STATUS', parameters: { count: 1, futureOnly: true, retroactiveCompensation: false }, rules: active('SELF_OR_OWNED_PROPERTY', { compatibility: 'NEGATIVE_STATUSES_OPEN', openIssues: ['ACTIVE_TIMING', 'D10_STATUS_ELIGIBILITY'] }) },
  U01: { effectKey: 'REROLL_DICE', parameters: { mustUseNewResult: true, preserveExistingDoubleRules: true }, rules: active('SELF', { timing: 'POST_ROLL_PRE_MOVEMENT', openIssues: ['MOVEMENT_CHECKPOINT'] }) },
  U02: { effectKey: 'MOVEMENT_BONUS', parameters: { steps: 2, changesRawDice: false, startPolicy: 'EXISTING_MOVEMENT_HELPER' }, rules: active('SELF', { timing: 'PRE_MOVEMENT', openIssues: ['MOVEMENT_CHECKPOINT'] }) },
  U03: { effectKey: 'PURCHASE_DISCOUNT', parameters: { percent: 15, capUnits: 50, unownedOnly: true, auctionAllowed: false, playerTradeAllowed: false }, rules: active('UNOWNED_PROPERTY', { timing: 'BEFORE_ELIGIBLE_PURCHASE', trigger: 'NEXT_ELIGIBLE_UNOWNED_PURCHASE', conditions: ['CURRENT_PLAYER', 'ACTOR_OWNS_INSTANCE', 'ELIGIBLE_UNOWNED_PURCHASE'], duration: { basis: 'CURRENT_TURN', maxUses: 1 }, openIssues: ['ROUNDING'] }) },
  U04: { effectKey: 'UPGRADE_CARDS', parameters: { ingredientCount: 2, consumeActivator: true, excludedIngredientDefinitionIds: ['U04'], legendaryIngredientsAllowed: false, outputTier: 'HIGHEST_INGREDIENT_PLUS_ONE', sampling: 'UNIFORM_CATEGORY_THEN_DEFINITION', duplicateDefinitionsAllowed: true }, rules: active('TWO_OWN_OTHER_CARDS', { conditions: ['CURRENT_PLAYER', 'ACTOR_OWNS_INSTANCE', 'TWO_DISTINCT_OTHER_OWNED_NON_LEGENDARY_INSTANCES'] }) },
  U05: { effectKey: 'ADJUST_MOVEMENT', parameters: { minDelta: -3, maxDelta: 3, minSteps: 1, startPolicy: 'EXISTING_MOVEMENT_HELPER' }, rules: active('SELF', { timing: 'POST_ROLL_PRE_MOVEMENT', openIssues: ['MOVEMENT_CHECKPOINT'] }) },
  U06: { effectKey: 'CONSENSUAL_SWAP', parameters: { selection: 'UNIFORM_RANDOM_EACH_INVENTORY', excludeActivatorInstance: true, declinedConsumesActivator: false, declinedUsesActiveAllowance: true }, rules: active('CONSENTING_OPPONENT', { conditions: ['CURRENT_PLAYER', 'ACTOR_OWNS_INSTANCE', 'TARGET_CONSENT', 'BOTH_HAVE_ELIGIBLE_SWAP_CARD'], reactionPolicy: 'CONSENT_REQUIRED', openIssues: ['ACTIVE_TIMING', 'CONSENT_FLOW'] }) },
  U07: { effectKey: 'REMOTE_PURCHASE', parameters: { listPricePercent: 125, unownedOnly: true, movesPlayer: false, activatesTile: false, triggersStart: false }, rules: active('UNOWNED_PROPERTY', { conditions: ['CURRENT_PLAYER', 'ACTOR_OWNS_INSTANCE', 'ELIGIBLE_UNOWNED_PURCHASE'], openIssues: ['ACTIVE_TIMING', 'ROUNDING'] }) },
  U08: { effectKey: 'REPLACE_MOVEMENT', parameters: { destination: 'ANY_PROPERTY', resolveDestination: true, startPolicy: 'EXISTING_MOVEMENT_HELPER' }, rules: active('ANY_PROPERTY', { timing: 'LEGAL_MOVEMENT_POINT_OPEN', openIssues: ['MOVEMENT_CHECKPOINT', 'MOVEMENT_HELPER'] }) },
  U09: { effectKey: 'BUILD_DISCOUNT', parameters: { percent: 20, capUnits: 50 }, rules: active('SELF', { trigger: 'NEXT_ELIGIBLE_BUILD_OR_UPGRADE', conditions: ['CURRENT_PLAYER', 'ACTOR_OWNS_INSTANCE', 'ELIGIBLE_BUILD_OR_UPGRADE'], duration: { basis: 'OWNER_TURNS', turns: 2, maxUses: 1 }, openIssues: ['ACTIVE_TIMING', 'ROUNDING', 'DURATION_LIFECYCLE'] }) },
  U10: { effectKey: 'TRANSFORM_CARD', parameters: { preserveRarity: true, chosenCategory: true, excludeOriginalDefinition: true, excludeActivatorInstance: true, legendaryAllowed: false, selectionWithinCategory: 'OPEN' }, rules: active('ONE_OWN_OTHER_CARD', { conditions: ['CURRENT_PLAYER', 'ACTOR_OWNS_INSTANCE', 'OTHER_OWNED_NON_LEGENDARY_INSTANCE'], openIssues: ['ACTIVE_TIMING', 'U10_SAMPLING'] }) },
} satisfies Record<OfficialPowerUpId, PowerUpEffect & { rules: PowerUpRules }>;

const approved = identities.map(([definitionId, name, rarity, activation, description]) => {
  const category = definitionId.startsWith('A') ? 'ATTACK' : definitionId.startsWith('D') ? 'DEFENSE' : 'UTILITY';
  const identity: Identity = { definitionId, name, rarity, activation, description, category };
  return officialPowerUpDefinitionSchema.parse({ ...identity, ...contracts[definitionId] });
});
const approvedById = new Map(approved.map(definition => [definition.definitionId, definition]));

/** Validate schemas, IDs, distribution AND approved semantics; never silently rebalance a definition. */
export function validateOfficialPowerUpCatalog(inputs: readonly unknown[]): readonly OfficialPowerUpDefinition[] {
  if (inputs.length !== 30) throw new Error('Official catalog must contain exactly 30 definitions');
  const parsed = inputs.map(input => officialPowerUpDefinitionSchema.parse(input));
  const ids = new Set(parsed.map(definition => definition.definitionId));
  if (ids.size !== 30) throw new Error('Duplicate official power-up ID');
  for (const definition of parsed) {
    if (!isDeepStrictEqual(definition, approvedById.get(definition.definitionId))) {
      throw new Error(`Definition ${definition.definitionId} differs from approved 03C contract`);
    }
  }
  for (const category of POWER_UP_CATEGORIES) {
    const categoryCards = parsed.filter(definition => definition.category === category);
    const counts = POWER_UP_RARITIES.map(rarity => categoryCards.filter(definition => definition.rarity === rarity).length);
    if (categoryCards.length !== 10 || !isDeepStrictEqual(counts, [5, 3, 1, 1])) throw new Error('Invalid official rarity distribution');
  }
  return Object.freeze(parsed);
}

export function createOfficialPowerUpRegistry(inputs: readonly unknown[] = approved): PowerUpRegistry<OfficialPowerUpDefinition> {
  return new PowerUpRegistry<OfficialPowerUpDefinition>(validateOfficialPowerUpCatalog(inputs), officialPowerUpDefinitionSchema);
}

/** Process-static data. Merely importing this module never initializes a room or activates gameplay. */
export const OFFICIAL_POWER_UP_REGISTRY = createOfficialPowerUpRegistry();
export const OFFICIAL_POWER_UP_DEFINITIONS = OFFICIAL_POWER_UP_REGISTRY.list();
export const OFFICIAL_POWER_UP_CATALOG_MANIFEST = Object.freeze({
  catalogVersion: '1.1', specId: 'OTB-PU-03C', specVersion: '1.1',
  definitions: OFFICIAL_POWER_UP_DEFINITIONS,
});
