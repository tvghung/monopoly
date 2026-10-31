import { z } from 'zod';

/** Phase 03D values approved in the task. Runtime enforcement belongs to later phases. */
export const powerUpConfigSchema = z.strictObject({
  inventoryCapacity: z.literal(3),
  rarityWeights: z.strictObject({
    COMMON: z.literal(60),
    RARE: z.literal(29),
    EPIC: z.literal(10),
    LEGENDARY: z.literal(1),
  }).readonly(),
  activeLimitPerPlayerTurn: z.literal(1),
  reactionLimitPerPlayerEvent: z.literal(1),
  reactionWindowSeconds: z.literal(15),
  allowDuplicateDefinitions: z.literal(true),
}).readonly();

export type PowerUpConfig = z.infer<typeof powerUpConfigSchema>;

export const POWER_UP_CONFIG: PowerUpConfig = powerUpConfigSchema.parse({
  inventoryCapacity: 3,
  rarityWeights: { COMMON: 60, RARE: 29, EPIC: 10, LEGENDARY: 1 },
  activeLimitPerPlayerTurn: 1,
  reactionLimitPerPlayerEvent: 1,
  reactionWindowSeconds: 15,
  allowDuplicateDefinitions: true,
});
