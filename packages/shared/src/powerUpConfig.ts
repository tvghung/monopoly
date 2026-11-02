import { z } from 'zod';

/** Official values; OB-9 supersedes the Phase 03D default rarity pool. */
export const powerUpConfigSchema = z.strictObject({
  inventoryCapacity: z.literal(3),
  rarityWeights: z.strictObject({
    COMMON: z.literal(40),
    RARE: z.literal(30),
    EPIC: z.literal(20),
    LEGENDARY: z.literal(10),
  }).readonly(),
  activeLimitPerPlayerTurn: z.literal(1),
  reactionLimitPerPlayerEvent: z.literal(1),
  reactionWindowSeconds: z.literal(15),
  allowDuplicateDefinitions: z.literal(true),
}).readonly();

export type PowerUpConfig = z.infer<typeof powerUpConfigSchema>;

export const POWER_UP_CONFIG: PowerUpConfig = powerUpConfigSchema.parse({
  inventoryCapacity: 3,
  rarityWeights: { COMMON: 40, RARE: 30, EPIC: 20, LEGENDARY: 10 },
  activeLimitPerPlayerTurn: 1,
  reactionLimitPerPlayerEvent: 1,
  reactionWindowSeconds: 15,
  allowDuplicateDefinitions: true,
});
