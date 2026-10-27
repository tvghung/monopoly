import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { POWER_UP_CONFIG, powerUpConfigSchema } from '@monopoly/shared';
import { addPowerUpInstance, createPowerUpInventory } from './foundation';

describe('Phase 03D approved global configuration', () => {
  it('preserves every approved value and the 100-point rarity distribution', () => {
    expect(POWER_UP_CONFIG).toEqual({
      inventoryCapacity: 3,
      rarityWeights: { COMMON: 60, RARE: 29, EPIC: 10, LEGENDARY: 1 },
      activeLimitPerPlayerTurn: 1,
      reactionLimitPerPlayerEvent: 1,
      reactionWindowSeconds: 15,
      allowDuplicateDefinitions: true,
    });
    expect(Object.values(POWER_UP_CONFIG.rarityWeights).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it('rejects missing, unknown or changed configuration, including swapped rarity weights', () => {
    for (const key of Object.keys(POWER_UP_CONFIG)) {
      const missing: Record<string, unknown> = { ...POWER_UP_CONFIG };
      delete missing[key];
      expect(powerUpConfigSchema.safeParse(missing).success).toBe(false);
    }
    for (const patch of [
      { inventoryCapacity: null }, { inventoryCapacity: 4 }, { inventoryCapacity: 2.5 },
      { inventoryCapacity: NaN }, { inventoryCapacity: Infinity },
      { activeLimitPerPlayerTurn: 0 }, { activeLimitPerPlayerTurn: 2 },
      { reactionLimitPerPlayerEvent: 0 }, { reactionLimitPerPlayerEvent: 2 },
      { reactionWindowSeconds: 15000 }, { reactionWindowSeconds: '15' },
      { allowDuplicateDefinitions: false }, { extra: true },
      { rarityWeights: { COMMON: 29, RARE: 60, EPIC: 10, LEGENDARY: 1 } },
      { rarityWeights: { ...POWER_UP_CONFIG.rarityWeights, LEGENDARY: 0 } },
      { rarityWeights: { COMMON: 60, RARE: 29, EPIC: 10 } },
      { rarityWeights: { ...POWER_UP_CONFIG.rarityWeights, MYTHIC: 0 } },
    ]) {
      expect(powerUpConfigSchema.safeParse({ ...POWER_UP_CONFIG, ...patch }).success).toBe(false);
    }
  });

  it('detaches and freezes both configuration levels, including parsed copies', () => {
    const input = structuredClone(POWER_UP_CONFIG);
    const parsed = powerUpConfigSchema.parse(input);
    expect(parsed).not.toBe(input);
    expect(parsed.rarityWeights).not.toBe(input.rarityWeights);
    for (const config of [POWER_UP_CONFIG, parsed]) {
      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.rarityWeights)).toBe(true);
      expect(Reflect.set(config, 'inventoryCapacity', 99)).toBe(false);
      expect(Reflect.set(config.rarityWeights, 'COMMON', 99)).toBe(false);
    }
    expect(Reflect.set(input.rarityWeights, 'COMMON', 99)).toBe(true);
    expect(parsed.rarityWeights.COMMON).toBe(60);
  });

  it('uses Phase 02 inventory primitives with duplicate definitions and a three-card capacity', () => {
    const inventory = createPowerUpInventory(POWER_UP_CONFIG.inventoryCapacity);
    const ownerPlayerId = randomUUID();
    const card = () => ({
      instanceId: randomUUID(), definitionId: 'fixture-only-duplicate',
      ownerPlayerId, obtainedFromOfferId: randomUUID(),
    });
    for (let index = 0; index < POWER_UP_CONFIG.inventoryCapacity; index++) addPowerUpInstance(inventory, card());
    const before = structuredClone(inventory);
    expect(inventory.cards).toHaveLength(3);
    expect(new Set(inventory.cards.map(instance => instance.definitionId)).size).toBe(1);
    expect(() => addPowerUpInstance(inventory, card())).toThrow();
    expect(() => addPowerUpInstance(inventory, inventory.cards[0])).toThrow();
    expect(inventory).toEqual(before);
    // Phase 02's explicit-capacity model remains usable; no live default is installed.
    expect(createPowerUpInventory(null)).toEqual({ capacity: null, cards: [] });
    expect(createPowerUpInventory(7)).toEqual({ capacity: 7, cards: [] });
  });
});
