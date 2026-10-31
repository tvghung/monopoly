import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  POWER_UP_CATEGORIES, POWER_UP_RARITIES, POWER_UP_CONFIG,
  officialPowerUpDefinitionSchema, powerUpEffectSchema,
  type PowerUpEffectParameters,
} from '@monopoly/shared';
import { createFreshPlayer, freshState } from '../../rooms';
import { moveBy } from '../dice';
import {
  OFFICIAL_POWER_UP_DEFINITIONS as cards, OFFICIAL_POWER_UP_REGISTRY as registry,
  createOfficialPowerUpRegistry, validateOfficialPowerUpCatalog,
} from './catalog';
import { PowerUpRegistry } from './registry';
import {
  addPowerUpInstance, advancePowerUpReward, createPowerUpInventory, createPowerUpState,
  enqueueStartRewardOffer, projectPowerUpOwnerState,
} from './foundation';
import {
  D03_SUPPORTED_ATTACK_IDS, canD03BlockAttack, planU04Upgrade, sampleU04Output, validateU04Recipe,
  type D03AttackEvent, type U04OutputRarity,
} from './validation';

const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';
const clone = () => structuredClone(cards);
const fixture = (first = 'A01', second = 'D01') => {
  const inventory = createPowerUpInventory(POWER_UP_CONFIG.inventoryCapacity);
  const instances = ['U04', first, second].map(definitionId => ({
    instanceId: randomUUID(), definitionId, ownerPlayerId: P1, obtainedFromOfferId: randomUUID(),
  }));
  instances.forEach(instance => addPowerUpInstance(inventory, instance));
  return { inventory, actorPlayerId: P1, activatorInstanceId: instances[0].instanceId, ingredientInstanceIds: instances.slice(1).map(instance => instance.instanceId) };
};

describe('Approved 30-card catalog and effect contracts', () => {
  it('matches all identities, names, rarities, activations and descriptions in the supplied approved catalog', () => {
    const spec = readFileSync(new URL('../../../../../project-document/powerups/03C_POWERUP_GAMEPLAY_RULES_SPEC_APPROVED.md', import.meta.url), 'utf8');
    const rows = spec.split('\n').filter(line => /^\| [ADU]\d{2} \|/.test(line));
    expect(rows).toHaveLength(30);
    for (const row of rows) {
      const [id, rarity, activation, name, description] = row.split('|').slice(1, 6).map(cell => cell.trim().replaceAll('**', ''));
      expect(registry.get(id)).toMatchObject({
        definitionId: id, name, rarity: rarity.toUpperCase(), activation: activation.toUpperCase(), description,
        category: id[0] === 'A' ? 'ATTACK' : id[0] === 'D' ? 'DEFENSE' : 'UTILITY',
      });
    }
  });

  it('has exactly 10 cards per category with 5/3/1/1 rarity counts, distinct from draw weights', () => {
    expect(cards).toHaveLength(30);
    expect(new Set(cards.map(card => card.definitionId)).size).toBe(30);
    for (const category of POWER_UP_CATEGORIES) {
      const group = cards.filter(card => card.category === category);
      expect(group).toHaveLength(10);
      expect(POWER_UP_RARITIES.map(rarity => group.filter(card => card.rarity === rarity).length)).toEqual([5, 3, 1, 1]);
    }
    expect(cards.filter(card => card.activation === 'REACTION')).toHaveLength(8);
    expect(cards.filter(card => card.activation === 'ACTIVE')).toHaveLength(22);
    expect(cards.filter(card => card.activation === 'TRAP')).toHaveLength(0);
    expect(() => validateOfficialPowerUpCatalog([...cards].reverse())).not.toThrow();
  });

  it.each(cards.map(card => [card.definitionId, card] as const))('%s validates and rejects missing or unknown fields at every contract level', (_id, card) => {
    expect(officialPowerUpDefinitionSchema.safeParse(card).success).toBe(true);
    expect(powerUpEffectSchema.safeParse({ effectKey: card.effectKey, parameters: card.parameters }).success).toBe(true);
    for (const key of Object.keys(card)) {
      const input: Record<string, unknown> = { ...card };
      delete input[key];
      expect(officialPowerUpDefinitionSchema.safeParse(input).success).toBe(false);
    }
    for (const key of Object.keys(card.parameters)) {
      const parameters: Record<string, unknown> = { ...card.parameters };
      delete parameters[key];
      expect(officialPowerUpDefinitionSchema.safeParse({ ...card, parameters }).success).toBe(false);
    }
    for (const patch of [
      { extra: true }, { effectKey: 'UNKNOWN_EFFECT' }, { definitionId: 'A11' },
      { parameters: { ...card.parameters, injected: true } },
      { rules: { ...card.rules, injected: true } },
      { rules: { ...card.rules, timing: 'ANY_TIME' } },
      { rules: { ...card.rules, target: 'ANY_PLAYER' } },
      { rules: { ...card.rules, conditions: ['IGNORE_OWNERSHIP'] } },
      { rules: { ...card.rules, duration: { ...card.rules.duration, injected: true } } },
    ]) expect(officialPowerUpDefinitionSchema.safeParse({ ...card, ...patch }).success).toBe(false);
  });

  it('rejects missing/duplicate IDs and semantic changes even when generic schemas accept parameter ranges', () => {
    expect(() => createOfficialPowerUpRegistry(cards.slice(1))).toThrow('30');
    expect(() => createOfficialPowerUpRegistry([...cards.slice(1), cards[1]])).toThrow('Duplicate');
    const input = clone();
    for (const patch of [
      { name: 'Changed name' }, { rarity: 'RARE' }, { activation: 'REACTION' }, { category: 'UTILITY' },
      { effectKey: 'RENT_DISCOUNT', parameters: { percent: 10, capUnits: 50 } },
      { parameters: { percentOfAvailableCash: 11, capUnits: 50 } },
      { rules: { ...input[0].rules, target: 'SELF' } },
      { rules: { ...input[0].rules, timing: 'PRE_MOVEMENT' } },
    ]) expect(() => createOfficialPowerUpRegistry([{ ...input[0], ...patch }, ...input.slice(1)])).toThrow('approved');
    for (const value of [-1, 101, 0.5, NaN, Infinity, '10']) {
      expect(officialPowerUpDefinitionSchema.safeParse({ ...input[0], parameters: { percentOfAvailableCash: value, capUnits: 50 } }).success).toBe(false);
    }
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '50']) {
      expect(officialPowerUpDefinitionSchema.safeParse({ ...input[0], parameters: { percentOfAvailableCash: 10, capUnits: value } }).success).toBe(false);
    }
  });

  it('preserves approved amounts, durations, caps and effect-specific exceptions', () => {
    const expected = {
      A01: ['TRANSFER_CASH', { percentOfAvailableCash: 10, capUnits: 50 }],
      A02: ['RENT_MODIFIER', { percent: 25, noRentBuffStacking: true }],
      A03: ['PURCHASE_SURCHARGE', { percent: 20, capUnits: 50, recipient: 'BANK' }],
      A04: ['RENT_MODIFIER', { percent: -25 }],
      A05: ['RESTRICT_ACTION', { actions: ['BUILD', 'UPGRADE'], mandatoryDebtActsAllowed: true }],
      A06: ['STEAL_CARD', { spareCapacityAtActivation: true }],
      A07: ['RENT_SHARE', { percent: 50, capUnits: 100, extraPayerCharge: false }],
      A08: ['RENT_MODIFIER', { percent: -50 }],
      A09: ['BUILDING_LEVY', { unitsPerHouse: 10, capUnits: 50, hotelHouseEquivalent: 5 }],
      A10: ['RENT_SURCHARGE', { percent: 50, capUnits: 100, recipient: 'BANK', independentOfRentProtection: true }],
      D01: ['RENT_DISCOUNT', { percent: 40, capUnits: 80 }], D02: ['BLOCK_CASH_THEFT', { capUnits: 50 }],
      D03: ['BLOCK_DEFERRED_ATTACK', { beforeStatusCreation: true }], D04: ['PROPERTY_SHIELD', { charges: 2 }],
      D05: ['REFLECT_ATTACK', { reactionOnReaction: false, effectSpecificDirectionRequired: true }],
      D06: ['CANCEL_ATTACK', { beforeResolutionOnly: true }], D07: ['SHORTFALL_SUBSIDY', { capUnits: 100, remainingDebtUnchanged: true }],
      D08: ['RENT_SUBSIDY', { capUnits: 200, landlordReceivesFullEligibleRent: true }],
      D09: ['BLOCK_INVENTORY_INTERFERENCE', { voluntaryTrade: false }], D10: ['REMOVE_STATUS', { futureOnly: true, retroactiveCompensation: false }],
      U01: ['REROLL_DICE', { mustUseNewResult: true }], U02: ['MOVEMENT_BONUS', { steps: 2, changesRawDice: false }],
      U03: ['PURCHASE_DISCOUNT', { percent: 15, capUnits: 50, auctionAllowed: false, playerTradeAllowed: false }],
      U04: ['UPGRADE_CARDS', { outputTier: 'HIGHEST_INGREDIENT_PLUS_ONE', legendaryIngredientsAllowed: false, excludedIngredientDefinitionIds: ['U04'] }],
      U05: ['ADJUST_MOVEMENT', { minDelta: -3, maxDelta: 3, minSteps: 1 }],
      U06: ['CONSENSUAL_SWAP', { declinedConsumesActivator: false, declinedUsesActiveAllowance: true }],
      U07: ['REMOTE_PURCHASE', { listPricePercent: 125, movesPlayer: false, triggersStart: false, activatesTile: false }],
      U08: ['REPLACE_MOVEMENT', { resolveDestination: true, startPolicy: 'EXISTING_MOVEMENT_HELPER' }],
      U09: ['BUILD_DISCOUNT', { percent: 20, capUnits: 50 }], U10: ['TRANSFORM_CARD', { legendaryAllowed: false, excludeOriginalDefinition: true }],
    };
    for (const [id, [effectKey, parameters]] of Object.entries(expected)) expect(registry.get(id)).toMatchObject({ effectKey, parameters });
    expect(registry.get('A02').rules.duration).toEqual({ basis: 'OWNER_TURNS', turns: 2, maxUses: 1 });
    for (const id of ['A04', 'D04']) expect(registry.get(id).rules.duration).toEqual({ basis: 'PROPERTY_OWNER_TURNS', turns: 3, maxUses: 2 });
    for (const id of ['A03', 'A07', 'A10']) expect(registry.get(id).rules.duration).toEqual({ basis: 'TARGET_TURNS', turns: 2, maxUses: 1 });
    expect(registry.get('A05').rules.duration).toEqual({ basis: 'TARGET_NEXT_TURN' });
    expect(registry.get('A08').rules.duration).toEqual({ basis: 'UNTIL_ATTACKER_NEXT_TURN_BEGINS' });
    expect(registry.get('U03').rules.duration).toEqual({ basis: 'CURRENT_TURN', maxUses: 1 });
    expect(registry.get('U09').rules.duration).toEqual({ basis: 'OWNER_TURNS', turns: 2, maxUses: 1 });
    for (const id of ['U01', 'U05']) expect(registry.get(id).rules.timing).toBe('POST_ROLL_PRE_MOVEMENT');
    expect(registry.get('U02').rules.timing).toBe('PRE_MOVEMENT');
    expect(registry.get('A08').rules.target).toBe('ALL_OPPONENT_PROPERTIES');
    expect(registry.get('D09').rules.compatibility).toBe('INVOLUNTARY_INVENTORY_ONLY');
    for (const id of ['D04', 'D05', 'D06', 'D10']) expect(registry.get(id).rules.compatibility).toContain('OPEN');
    const upgradeParameters: PowerUpEffectParameters<'UPGRADE_CARDS'> = {
      ingredientCount: 2, consumeActivator: true, excludedIngredientDefinitionIds: ['U04'],
      legendaryIngredientsAllowed: false, outputTier: 'HIGHEST_INGREDIENT_PLUS_ONE',
      sampling: 'UNIFORM_CATEGORY_THEN_DEFINITION', duplicateDefinitionsAllowed: true,
    };
    expect(registry.get('U04').parameters).toEqual(upgradeParameters);
  });

  it('copies inputs and recursively freezes registry, lists, parameters, rules and all nested arrays', () => {
    const inputs = clone();
    const local = createOfficialPowerUpRegistry(inputs);
    expect(Reflect.set(inputs[0], 'name', 'Changed input')).toBe(true);
    expect(Reflect.set(inputs[0].parameters, 'capUnits', 999)).toBe(true);
    expect(local.get('A01')).toEqual(registry.get('A01'));
    expect(Object.isFrozen(local)).toBe(true);
    expect(Object.isFrozen(local.list())).toBe(true);
    const verifyFrozen = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      expect(Object.isFrozen(value)).toBe(true);
      expect(Reflect.set(value, 'injected', 1)).toBe(false);
      Object.values(value).forEach(verifyFrozen);
    };
    cards.forEach(verifyFrozen);
    expect(() => registry.get('missing')).toThrow('Unknown');
    expect(() => new PowerUpRegistry([cards[0], cards[0]], officialPowerUpDefinitionSchema)).toThrow('Duplicate');
    // Preserve the original constructor for empty catalogs and inline base definitions.
    expect(new PowerUpRegistry([]).list()).toEqual([]);
    const baseRegistry = new PowerUpRegistry([{
      definitionId: 'fixture-only', name: 'Fixture', description: 'Fixture',
      category: 'ATTACK', rarity: 'COMMON', activation: 'ACTIVE', effectKey: 'fixture-only',
    }]);
    expect(baseRegistry.get('fixture-only').rarity).toBe('COMMON');
  });

  it('uses official contracts through live START and detached foundation projections', () => {
    const state = freshState();
    state.players[P1] = createFreshPlayer('A', 'red');
    state.boardState.players = [P1];
    state.boardState.currentPlayer.id = P1;
    state.players[P1].currentTile = 39;
    moveBy(state, P1, 2);
    expect(state.privateState.powerUps?.rewardQueue.offers).toHaveLength(1);
    state.privateState.powerUps = createPowerUpState();
    state.privateState.powerUps.inventories[P1] = createPowerUpInventory(3);
    const occurrence = state.boardState.gameplayEvents.events.find(event => event.type === 'PASS_GO');
    if (!occurrence || occurrence.type !== 'PASS_GO') throw new Error('Missing existing START occurrence');
    const candidates = ['A03', 'D03', 'U04'].map(id => ({ definitionId: id, category: registry.get(id).category }));
    const offer = enqueueStartRewardOffer(state, occurrence, candidates, registry);
    expect(JSON.stringify(projectPowerUpOwnerState(state, P1, registry))).not.toContain('parameters');
    advancePowerUpReward(state, P1, offer.offerId, 'SELECTING');
    advancePowerUpReward(state, P1, offer.offerId, 'SELECTED', 1);
    advancePowerUpReward(state, P1, offer.offerId, 'REVEALED');
    const projection = projectPowerUpOwnerState(state, P1, registry);
    const definition = projection.offers[0].candidates[1].definition;
    expect(definition).toEqual(registry.get('D03'));
    expect(definition).not.toBe(registry.get('D03'));
    const projected = definition as typeof definition & { parameters: { supportedAttackIds: string[] } };
    expect(projected.parameters).not.toBe(registry.get('D03').parameters);
    projected.parameters.supportedAttackIds[0] = 'A01';
    expect(D03_SUPPORTED_ATTACK_IDS[0]).toBe('A03');
    expect(Reflect.set(definition!, 'parameters', { injected: true })).toBe(true);
    expect(registry.get('D03').parameters).toHaveProperty('beforeStatusCreation', true);
    expect(state.players[P1].accountBalance).toBe(1700);
  });
});

describe('U04 validation and two-stage sampling (no gameplay mutation)', () => {
  const rarityCards = ['A01', 'A05', 'A07', 'A08'];
  const rarityPairs = POWER_UP_RARITIES.flatMap((first, i) => POWER_UP_RARITIES.map((second, j) => ({ first, second, firstId: rarityCards[i], secondId: rarityCards[j], output: POWER_UP_RARITIES[Math.max(i, j) + 1] })));
  it.each(rarityPairs)('$first + $second respects highest tier +1 and rejects Legendary', ({ firstId, secondId, output }) => {
    const request = fixture(firstId, secondId);
    const before = structuredClone(request);
    if (output) expect(validateU04Recipe(request).outputRarity).toBe(output);
    else expect(() => validateU04Recipe(request)).toThrow('Legendary');
    expect(request).toEqual(before);
  });

  it('rejects invalid recipes before drawing and preserves every card', () => {
    const request = fixture();
    const missing = randomUUID();
    const malformedOwner = structuredClone(request);
    malformedOwner.inventory.cards[1].ownerPlayerId = P2;
    const invalid = [
      { ...request, ingredientInstanceIds: [] },
      { ...request, ingredientInstanceIds: [request.ingredientInstanceIds[0]] },
      { ...request, ingredientInstanceIds: [...request.ingredientInstanceIds, missing] },
      { ...request, ingredientInstanceIds: [request.ingredientInstanceIds[0], request.ingredientInstanceIds[0]] },
      { ...request, ingredientInstanceIds: [request.activatorInstanceId, request.ingredientInstanceIds[1]] },
      { ...request, ingredientInstanceIds: [missing, request.ingredientInstanceIds[1]] },
      { ...request, activatorInstanceId: missing }, { ...request, actorPlayerId: P2 },
      { ...request, activatorInstanceId: request.ingredientInstanceIds[0] },
      malformedOwner, fixture('U04', 'A01'), fixture('A01', 'U04'), fixture('A08', 'A01'),
    ];
    const unknown = structuredClone(request);
    unknown.inventory.cards[1].definitionId = 'unknown';
    invalid.push(unknown);
    for (const input of invalid) {
      const before = structuredClone(input);
      const random = vi.fn(() => 0);
      expect(() => planU04Upgrade(input, random)).toThrow();
      expect(random).not.toHaveBeenCalled();
      expect(input).toEqual(before);
    }
  });

  it('allows duplicate ingredient definitions as distinct instances; output can be consumed activator definition U04', () => {
    const request = fixture('A01', 'A01');
    const random = vi.fn().mockReturnValueOnce(2).mockReturnValueOnce(0);
    const result = planU04Upgrade(request, random);
    expect(result.outputDefinition.definitionId).toBe('U04');
    expect(result.outputRarity).toBe('RARE');
    expect(result.consumedInstanceIds).toEqual([request.activatorInstanceId, ...request.ingredientInstanceIds]);
    expect(request.inventory.cards).toHaveLength(3);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.consumedInstanceIds)).toBe(true);
  });

  it.each(['RARE', 'EPIC', 'LEGENDARY'] as const)('%s visits every definition with category then within-category draws', rarity => {
    const all = cards.filter(card => card.rarity === rarity);
    const visited: string[] = [];
    POWER_UP_CATEGORIES.forEach((category, categoryIndex) => {
      const pool = all.filter(card => card.category === category);
      pool.forEach((card, definitionIndex) => {
        const random = vi.fn().mockReturnValueOnce(categoryIndex).mockReturnValueOnce(definitionIndex);
        expect(sampleU04Output(rarity, random)).toBe(card);
        expect(random.mock.calls).toEqual([[3], [pool.length]]);
        visited.push(card.definitionId);
      });
    });
    expect(new Set(visited)).toEqual(new Set(all.map(card => card.definitionId)));
  });

  it('uses only eligible categories and keeps category probability equal for unequal pool sizes', () => {
    const sparse = cards.filter(card => ['A05', 'A06', 'A10', 'D05'].includes(card.definitionId));
    const random = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(0);
    expect(sampleU04Output('RARE', random, sparse).definitionId).toBe('D05');
    expect(random.mock.calls).toEqual([[2], [1]]);
    const first = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(2);
    expect(sampleU04Output('RARE', first, sparse).definitionId).toBe('A10');
    expect(first.mock.calls).toEqual([[2], [3]]);
    const emptyRandom = vi.fn(() => 0);
    expect(() => sampleU04Output('EPIC', emptyRandom, sparse)).toThrow('No eligible');
    expect(emptyRandom).not.toHaveBeenCalled();
  });

  it('rejects invalid RNG indices and invalid target rarity rather than silently rerolling', () => {
    for (const index of [-1, 3, 0.5, NaN, Infinity]) {
      const random = vi.fn(() => index);
      expect(() => sampleU04Output('RARE', random)).toThrow('Random index');
      expect(random).toHaveBeenCalledTimes(1);
    }
    const badDefinitionIndex = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(3);
    expect(() => sampleU04Output('RARE', badDefinitionIndex)).toThrow('Random index');
    expect(() => sampleU04Output('COMMON' as U04OutputRarity)).toThrow();
    // Exercise production unbiased crypto index provider without statistical/flaky assertions.
    expect(sampleU04Output('LEGENDARY').rarity).toBe('LEGENDARY');
  });
});

describe('D03 approved compatibility and target scope', () => {
  const event = (attackId: string, target: D03AttackEvent['target']): D03AttackEvent => ({
    attackId, target, defenderPlayerId: P1, stage: 'BEFORE_STATUS_CREATION',
  });
  it('contains precisely the five approved deferred attacks', () => {
    expect(D03_SUPPORTED_ATTACK_IDS).toEqual(['A03', 'A04', 'A05', 'A07', 'A10']);
    expect(Object.isFrozen(D03_SUPPORTED_ATTACK_IDS)).toBe(true);
  });
  it.each(cards.filter(card => card.category === 'ATTACK').map(card => card.definitionId))('%s respects both the whitelist and defender ownership', attackId => {
    const supported = ['A03', 'A04', 'A05', 'A07', 'A10'].includes(attackId);
    expect(canD03BlockAttack(event(attackId, { kind: 'PLAYER', playerId: P1 }))).toBe(supported && attackId !== 'A04');
    expect(canD03BlockAttack(event(attackId, { kind: 'TILE', tileID: 1, ownerPlayerId: P1 }))).toBe(supported && attackId === 'A04');
    expect(canD03BlockAttack(event(attackId, { kind: 'PLAYER', playerId: P2 }))).toBe(false);
    expect(canD03BlockAttack(event(attackId, { kind: 'TILE', tileID: 1, ownerPlayerId: P2 }))).toBe(false);
    expect(canD03BlockAttack(event(attackId, { kind: 'GLOBAL' }))).toBe(false);
  });
  it('never blocks applied/committed events, Defense/Utility cards or malformed target data', () => {
    const input = event('A03', { kind: 'PLAYER', playerId: P1 });
    for (const stage of ['STATUS_APPLIED', 'EVENT_COMMITTED'] as const) expect(canD03BlockAttack({ ...input, stage })).toBe(false);
    for (const id of [...cards.filter(card => card.category !== 'ATTACK').map(card => card.definitionId), 'unknown']) {
      expect(canD03BlockAttack({ ...input, attackId: id })).toBe(false);
    }
    expect(canD03BlockAttack({ ...input, defenderPlayerId: 'invalid' })).toBe(false);
    expect(canD03BlockAttack({ ...input, target: { kind: 'TILE', tileID: -1, ownerPlayerId: P1 } })).toBe(false);
  });
});
