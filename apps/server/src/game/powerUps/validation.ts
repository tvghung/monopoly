import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  POWER_UP_CATEGORIES, POWER_UP_RARITIES, powerUpInventorySchema,
  type OfficialPowerUpDefinition, type PowerUpInventory,
} from '@monopoly/shared';
import { OFFICIAL_POWER_UP_DEFINITIONS, OFFICIAL_POWER_UP_REGISTRY } from './catalog';

const outputRaritySchema = z.enum(['RARE', 'EPIC', 'LEGENDARY']);
export type U04OutputRarity = z.infer<typeof outputRaritySchema>;
const recipeSchema = z.strictObject({
  actorPlayerId: z.uuid(), activatorInstanceId: z.uuid(),
  ingredientInstanceIds: z.tuple([z.uuid(), z.uuid()]),
});
export interface U04RecipeRequest {
  actorPlayerId: string;
  inventory: PowerUpInventory;
  activatorInstanceId: string;
  ingredientInstanceIds: readonly string[];
}
export interface U04Recipe {
  readonly outputRarity: U04OutputRarity;
  readonly consumedInstanceIds: readonly [string, string, string];
}

/** Pure preflight. No inventory consumption, instance grant, allowance use or room mutation. */
export function validateU04Recipe(request: U04RecipeRequest): U04Recipe {
  const { inventory: inputInventory, ...input } = request;
  const recipe = recipeSchema.parse(input);
  const inventory = powerUpInventorySchema.parse(inputInventory);
  const consumedIds = [recipe.activatorInstanceId, ...recipe.ingredientInstanceIds] as const;
  if (new Set(consumedIds).size !== 3) throw new Error('U04 requires three distinct inventory instances');
  const cards = consumedIds.map(id => {
    const card = inventory.cards.find(instance => instance.instanceId === id);
    if (!card || card.ownerPlayerId !== recipe.actorPlayerId) throw new Error('U04 requires owned inventory instances');
    return OFFICIAL_POWER_UP_REGISTRY.get(card.definitionId);
  });
  if (cards[0].definitionId !== 'U04') throw new Error('U04 activator required');
  const ingredients = cards.slice(1);
  // Owner clarification (26/10/2026): §9 excludes EVERY U04 definition, including other instances.
  if (ingredients.some(card => card.definitionId === 'U04')) throw new Error('U04 definitions cannot be ingredients');
  if (ingredients.some(card => card.rarity === 'LEGENDARY')) throw new Error('Legendary ingredients are prohibited');
  const highestTier = Math.max(...ingredients.map(card => POWER_UP_RARITIES.indexOf(card.rarity)));
  const outputRarity = outputRaritySchema.parse(POWER_UP_RARITIES[highestTier + 1]);
  return Object.freeze({ outputRarity, consumedInstanceIds: Object.freeze(consumedIds) });
}

export type RandomPowerUpIndex = (upperExclusive: number) => number;
function choose<T>(values: readonly T[], randomIndex: RandomPowerUpIndex): T {
  const index = randomIndex(values.length);
  if (!Number.isSafeInteger(index) || index < 0 || index >= values.length) throw new Error('Random index outside eligible pool');
  return values[index];
}

/** Two uniform integer draws, independent of START rarity weights. No consumed-definition exclusion. */
export function sampleU04Output(
  rarity: U04OutputRarity,
  randomIndex: RandomPowerUpIndex = randomInt,
  definitions: readonly OfficialPowerUpDefinition[] = OFFICIAL_POWER_UP_DEFINITIONS,
): OfficialPowerUpDefinition {
  const outputRarity = outputRaritySchema.parse(rarity);
  const pools = POWER_UP_CATEGORIES.map(category => definitions.filter(card => card.category === category && card.rarity === outputRarity))
    .filter(pool => pool.length > 0);
  if (!pools.length) throw new Error('No eligible U04 output category');
  const categoryPool = choose(pools, randomIndex);
  return choose(categoryPool, randomIndex);
}

/** A reviewable preview only. Later commands must validate again and grant a NEW instance atomically. */
export function planU04Upgrade(request: U04RecipeRequest, randomIndex: RandomPowerUpIndex = randomInt) {
  const recipe = validateU04Recipe(request); // Invalid recipes fail before any randomness or spending.
  return Object.freeze({ ...recipe, outputDefinition: sampleU04Output(recipe.outputRarity, randomIndex) });
}

const d03 = OFFICIAL_POWER_UP_REGISTRY.get('D03');
if (d03.effectKey !== 'BLOCK_DEFERRED_ATTACK') throw new Error('Invalid D03 effect contract');
export const D03_SUPPORTED_ATTACK_IDS = d03.parameters.supportedAttackIds;
const d03EventSchema = z.strictObject({
  attackId: z.string(), defenderPlayerId: z.uuid(),
  stage: z.enum(['BEFORE_STATUS_CREATION', 'STATUS_APPLIED', 'EVENT_COMMITTED']),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('PLAYER'), playerId: z.uuid() }),
    z.strictObject({ kind: z.literal('TILE'), tileID: z.number().int().min(0).max(39), ownerPlayerId: z.uuid() }),
    z.strictObject({ kind: z.literal('GLOBAL') }),
  ]),
});
export type D03AttackEvent = z.infer<typeof d03EventSchema>;

/** Caller supplies authoritative target ownership. This predicate never opens a Reaction Window. */
export function canD03BlockAttack(input: D03AttackEvent): boolean {
  const parsed = d03EventSchema.safeParse(input);
  if (!parsed.success) return false;
  const event = parsed.data;
  if (event.stage !== 'BEFORE_STATUS_CREATION' || !D03_SUPPORTED_ATTACK_IDS.some(id => id === event.attackId)) return false;
  const attack = OFFICIAL_POWER_UP_REGISTRY.get(event.attackId);
  if (event.target.kind === 'PLAYER') return attack.rules.target === 'OPPONENT_PLAYER' && event.target.playerId === event.defenderPlayerId;
  if (event.target.kind === 'TILE') return attack.rules.target === 'OPPONENT_PROPERTY' && event.target.ownerPlayerId === event.defenderPlayerId;
  return false;
}
