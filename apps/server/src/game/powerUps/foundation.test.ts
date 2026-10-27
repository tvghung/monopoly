import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  POWER_UP_CATEGORIES, powerUpDefinitionSchema, powerUpInventorySchema,
  powerUpRewardOfferSchema, powerUpStateSchema, type GameplaySemanticEvent,
  type PowerUpCandidate, type PowerUpDefinition,
} from '@monopoly/shared';
import { createFreshPlayer, createRoomSnapshot, freshState, hydrateGameState, storeGameState, assertRoomSnapshot, ROOM_SNAPSHOT_SCHEMA_VERSION } from '../../rooms';
import { moveBy, moveToTile, moveToJail } from '../dice';
import { recordPublicGameplayEvent } from '../semanticEvents';
import { InMemoryPersistenceStore } from '../../persistence/inMemory';
import { RoomCommandExecutor } from '../../services/roomCommandExecutor';
import { ConnectionRegistry } from '../../services/connectionRegistry';
import { projectPrivatePlayerState, projectPublicRoomState } from '../../services/publicState';
import { PowerUpRegistry } from './registry';
import {
  addPowerUpInstance, advancePowerUpReward, assertPowerUpTurnCanEnd,
  canPresentPowerUpReward, createPowerUpInventory, createPowerUpState,
  enqueueStartRewardOffer, nextPowerUpReward, projectPowerUpOwnerState,
} from './foundation';

const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';
const definitions: PowerUpDefinition[] = POWER_UP_CATEGORIES.map(category => ({
  definitionId: 'test-only-' + category, name: 'Fixture ' + category,
  description: 'Test fixture, never a playable card', category, rarity: 'COMMON',
  activation: 'ACTIVE', effectKey: 'fixture-only',
}));
const candidates: PowerUpCandidate[] = definitions.map(({ category, definitionId }) => ({ category, definitionId }));
const registry = new PowerUpRegistry(definitions);
function subject() {
  const state = freshState();
  state.players[P1] = createFreshPlayer('A', 'red');
  state.players[P2] = createFreshPlayer('B', 'blue');
  state.players[P2].teamSlot = 1;
  state.boardState.players = [P1, P2];
  state.boardState.currentPlayer.id = P1;
  state.privateState.powerUps = createPowerUpState();
  return state;
}
function occurrence(state = subject()) {
  // Adapter fixture supplies a distinct authoritative occurrence; live dice integration is covered separately.
  state.players[P1].accountBalance += 200;
  const event = recordPublicGameplayEvent(state, {
    type: 'PASS_GO', playerId: P1, reward: 200, fromTile: 39, destinationTile: 1,
    movement: { kind: 'DICE_WALK', rollSequence: state.boardState.rollSequence },
  });
  recordPublicGameplayEvent(state, {
    type: 'MONEY_TRANSFER', source: { kind: 'BANK' }, destination: { kind: 'PLAYER', playerId: P1 }, amount: 200, reason: 'PASS_GO',
  });
  if (event.type !== 'PASS_GO') throw new Error('Missing START event');
  return event;
}
function enqueue(state = subject()) {
  return enqueueStartRewardOffer(state, occurrence(state), candidates, registry);
}
function reveal(state: ReturnType<typeof subject>, offerId: string) {
  advancePowerUpReward(state, P1, offerId, 'SELECTING');
  advancePowerUpReward(state, P1, offerId, 'SELECTED', 1);
  advancePowerUpReward(state, P1, offerId, 'REVEALED');
}

describe('Power-up definitions and inventory foundation', () => {
  it('validates all category, rarity and activation variants without a catalog', () => {
    for (const rarity of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']) {
      for (const activation of ['ACTIVE', 'REACTION', 'TRAP']) {
        expect(powerUpDefinitionSchema.safeParse({ ...definitions[0], rarity, activation }).success).toBe(true);
      }
    }
    for (const patch of [{ category: 'CHANCE' }, { rarity: 'MYTHIC' }, { activation: 'AUTO' }, { effectKey: '' }, { injected: true }]) {
      expect(powerUpDefinitionSchema.safeParse({ ...definitions[0], ...patch }).success).toBe(false);
    }
  });
  it('copies and freezes immutable definitions and rejects duplicate or missing IDs', () => {
    const input = { ...definitions[0] };
    const local = new PowerUpRegistry([input]);
    input.name = 'Changed';
    expect(local.get(input.definitionId).name).toBe(definitions[0].name);
    expect(Object.isFrozen(local.get(input.definitionId))).toBe(true);
    expect(() => new PowerUpRegistry([input, input])).toThrow('Duplicate');
    expect(() => local.get('missing')).toThrow('Unknown');
  });
  it('requires explicit capacity and never replaces a full inventory', () => {
    const inventory = createPowerUpInventory(1);
    const card = { instanceId: randomUUID(), definitionId: definitions[0].definitionId, ownerPlayerId: P1, obtainedFromOfferId: randomUUID() };
    addPowerUpInstance(inventory, card);
    expect(() => addPowerUpInstance(inventory, { ...card, instanceId: randomUUID() })).toThrow();
    expect(inventory.cards).toEqual([card]);
    expect(() => createPowerUpInventory(-1)).toThrow();
    expect(() => createPowerUpInventory(1.5)).toThrow();
    expect(powerUpInventorySchema.safeParse({ cards: [] }).success).toBe(false);
    expect(() => addPowerUpInstance(createPowerUpInventory(0), card)).toThrow();
    const unlimited = createPowerUpInventory(null);
    for (let index = 0; index < 5; index++) addPowerUpInstance(unlimited, { ...card, instanceId: randomUUID(), obtainedFromOfferId: randomUUID() });
    expect(unlimited.cards).toHaveLength(5);
    expect(() => addPowerUpInstance(unlimited, unlimited.cards[0])).toThrow();
  });
  it('rejects conflicting owners, instance IDs and repeated inventory grants', () => {
    const state = subject();
    const card = { instanceId: randomUUID(), definitionId: definitions[0].definitionId, ownerPlayerId: P2, obtainedFromOfferId: randomUUID() };
    state.privateState.powerUps!.inventories[P1] = { capacity: null, cards: [card] };
    expect(powerUpStateSchema.safeParse(state.privateState.powerUps).success).toBe(false);
    card.ownerPlayerId = P1;
    state.privateState.powerUps!.inventories[P1].cards.push({ ...card, instanceId: randomUUID() });
    expect(powerUpStateSchema.safeParse(state.privateState.powerUps).success).toBe(false);
  });
});

describe('START occurrence adapter and reward FIFO', () => {
  it('derives stable identity from PASS_GO, preserving cash and not using amount or roll identity', () => {
    const state = subject();
    const before = state.players[P1].accountBalance;
    const event = occurrence(state);
    const offer = enqueueStartRewardOffer(state, event, candidates, registry);
    expect(state.players[P1].accountBalance).toBe(before + 200);
    expect(offer.offerId).toBe(event.eventId);
    expect(offer.source).toEqual({ kind: 'START_REWARD', occurrenceId: event.eventId });
    expect(state.boardState.gameplayEvents.events.filter(event => event.type === 'MONEY_TRANSFER')).toHaveLength(1);
    const unusualAmount = { ...event, eventId: randomUUID(), reward: 123 };
    expect(enqueueStartRewardOffer(state, unusualAmount, candidates, registry).offerId).toBe(unusualAmount.eventId);
  });
  it('generates a live offer only from START and rejects ordinary 200 credits', () => {
    const state = freshState();
    state.players[P1] = createFreshPlayer('A', 'red');
    state.players[P1].currentTile = 39;
    moveBy(state, P1, 2);
    expect(state.privateState.powerUps?.rewardQueue.offers).toHaveLength(1);
    const money = recordPublicGameplayEvent(state, {
      type: 'MONEY_TRANSFER', source: { kind: 'BANK' }, destination: { kind: 'PLAYER', playerId: P1 }, amount: 200, reason: 'PASS_GO',
    });
    state.privateState.powerUps = createPowerUpState();
    expect(() => enqueueStartRewardOffer(state, money as Extract<GameplaySemanticEvent, { type: 'PASS_GO' }>, candidates, registry)).toThrow('START');
    expect(state.privateState.powerUps.rewardQueue.offers).toEqual([]);
  });
  it('inherits existing absolute movement and jail reward semantics', () => {
    const state = subject();
    state.players[P1].currentTile = 25;
    moveToTile(state, P1, 0);
    expect(state.players[P1].accountBalance).toBe(1700);
    moveBy(state, P1, -1);
    moveToJail(state, P1);
    expect(state.players[P1].accountBalance).toBe(1700);
    expect(state.boardState.gameplayEvents.events.filter(event => event.type === 'PASS_GO')).toHaveLength(1);
  });
  it('retains candidates on retry, after event-tail eviction, completion and snapshot hydration', () => {
    const state = subject();
    const event = occurrence(state);
    const offer = enqueueStartRewardOffer(state, event, candidates, registry);
    const retry = () => enqueueStartRewardOffer(state, event, [...candidates].reverse(), registry);
    expect(retry()).toEqual(offer);
    reveal(state, offer.offerId);
    advancePowerUpReward(state, P1, offer.offerId, 'INVENTORY_RESOLUTION');
    advancePowerUpReward(state, P1, offer.offerId, 'COMPLETED');
    state.boardState.gameplayEvents.events = [];
    const snapshot = createRoomSnapshot();
    storeGameState(snapshot, state, 'LOBBY');
    const restored = hydrateGameState(snapshot, 'LOBBY');
    expect(enqueueStartRewardOffer(restored, event, [], registry).candidates).toEqual(candidates);
    expect(restored.privateState.powerUps!.rewardQueue.offers).toHaveLength(1);
  });
  it('queues multiple distinct rewards in the same roll FIFO and rejects out-of-order or unauthorized actions', () => {
    const state = subject();
    const first = enqueue(state);
    const second = enqueue(state);
    expect(first.offerId).not.toBe(second.offerId);
    expect(nextPowerUpReward(state)?.offerId).toBe(first.offerId);
    expect(() => advancePowerUpReward(state, P1, second.offerId, 'SELECTING')).toThrow('FIFO');
    expect(() => advancePowerUpReward(state, P2, first.offerId, 'SELECTING')).toThrow('FIFO');
    expect(() => assertPowerUpTurnCanEnd(state, P1)).toThrow('unresolved');
    reveal(state, first.offerId);
    advancePowerUpReward(state, P1, first.offerId, 'INVENTORY_RESOLUTION');
    advancePowerUpReward(state, P1, first.offerId, 'COMPLETED');
    expect(nextPowerUpReward(state)?.offerId).toBe(second.offerId);
    expect(() => assertPowerUpTurnCanEnd(state, P1)).toThrow();
    reveal(state, second.offerId);
    advancePowerUpReward(state, P1, second.offerId, 'INVENTORY_RESOLUTION');
    advancePowerUpReward(state, P1, second.offerId, 'COMPLETED');
    expect(() => assertPowerUpTurnCanEnd(state, P1)).not.toThrow();
  });
  it('rejects skipped lifecycle, missing selection, reselection and bad candidate sets atomically', () => {
    const state = subject();
    for (const bad of [[], candidates.slice(1), [candidates[0], candidates[0], candidates[2]], candidates.map(c => ({ ...c, definitionId: 'unknown' }))]) {
      expect(() => enqueueStartRewardOffer(state, occurrence(state), bad, registry)).toThrow();
      expect(state.privateState.powerUps!.rewardQueue.offers).toHaveLength(0);
    }
    const offer = enqueue(state);
    expect(() => advancePowerUpReward(state, P1, offer.offerId, 'REVEALED')).toThrow();
    advancePowerUpReward(state, P1, offer.offerId, 'SELECTING');
    expect(() => advancePowerUpReward(state, P1, offer.offerId, 'SELECTED')).toThrow();
    advancePowerUpReward(state, P1, offer.offerId, 'SELECTED', 0);
    expect(() => advancePowerUpReward(state, P1, offer.offerId, 'REVEALED', 1)).toThrow('locked');
    expect(nextPowerUpReward(state)?.selectedIndex).toBe(0);
    expect(powerUpRewardOfferSchema.safeParse({ ...offer, offerId: randomUUID() }).success).toBe(false);
  });
  it('rejects owner conflicts and mismatched categories without appending an offer', () => {
    const state = subject();
    const event = occurrence(state);
    const mismatch = candidates.map(candidate => ({ ...candidate, definitionId: definitions[0].definitionId }));
    expect(() => enqueueStartRewardOffer(state, event, mismatch, registry)).toThrow('category');
    expect(state.privateState.powerUps!.rewardQueue.offers).toEqual([]);
    enqueueStartRewardOffer(state, event, candidates, registry);
    expect(() => enqueueStartRewardOffer(state, { ...event, playerId: P2 }, candidates, registry)).toThrow('owner');
  });
  it('retains every pending lifecycle state through a reconnect snapshot without rerolling', () => {
    const state = subject();
    const event = occurrence(state);
    const offer = enqueueStartRewardOffer(state, event, candidates, registry);
    for (const stage of ['WAITING', 'SELECTING', 'SELECTED', 'REVEALED', 'INVENTORY_RESOLUTION', 'COMPLETED'] as const) {
      if (stage !== 'WAITING') advancePowerUpReward(state, P1, offer.offerId, stage, stage === 'SELECTED' ? 2 : undefined);
      const snapshot = createRoomSnapshot();
      storeGameState(snapshot, state, 'LOBBY');
      const restored = hydrateGameState(snapshot, 'LOBBY');
      expect(restored.privateState.powerUps).toEqual(state.privateState.powerUps);
      expect(enqueueStartRewardOffer(restored, event, [], registry).stage).toBe(stage);
      expect(restored.privateState.powerUps!.rewardQueue.offers).toHaveLength(1);
    }
  });
  it('waits behind payment, landing, card and forced-sale resolution without mutating the offer', () => {
    const state = subject();
    const offer = enqueue(state);
    for (const [object, key] of [
      [state.boardState, 'paymentQueue'], [state.turnInfo, 'pendingPropertyDecision'],
      [state.turnInfo, 'pendingDevelopmentDecision'], [state.turnInfo, 'pendingCardInteraction'],
      [state.privateState, 'forcedSaleProposal'],
    ] as const) {
      const target = object as unknown as Record<string, unknown>;
      target[key] = {};
      expect(canPresentPowerUpReward(state, P1)).toBe(false);
      expect(() => advancePowerUpReward(state, P1, offer.offerId, 'SELECTING')).toThrow('resolution');
      delete target[key];
    }
    expect(canPresentPowerUpReward(state, P1)).toBe(true);
    expect(nextPowerUpReward(state)).toEqual(offer);
  });
});

describe('Private aggregate, transaction and projection boundaries', () => {
  function snapshotFixture() {
    const state = subject();
    const offer = enqueue(state);
    state.privateState.powerUps!.inventories[P1] = createPowerUpInventory(7);
    const snapshot = createRoomSnapshot();
    snapshot.members = {
      [P1]: { joinOrder: 1, ready: false, membershipStatus: 'ACTIVE' },
      [P2]: { joinOrder: 2, ready: false, membershipStatus: 'ACTIVE' },
    };
    snapshot.nextJoinOrder = 3;
    storeGameState(snapshot, state, 'LOBBY');
    return { state, offer, snapshot };
  }
  it('validates optional private state and preserves exact queue through room store/hydrate', () => {
    const { state, snapshot } = snapshotFixture();
    expect(() => assertRoomSnapshot(createRoomSnapshot())).not.toThrow();
    expect(() => assertRoomSnapshot(snapshot)).not.toThrow();
    const restored = hydrateGameState(snapshot, 'LOBBY');
    expect(restored.privateState.powerUps).toEqual(state.privateState.powerUps);
    restored.privateState.powerUps!.rewardQueue.offers[0].candidates.reverse();
    expect(snapshot.gameState.privateState.powerUps).toEqual(state.privateState.powerUps);
    const bad = structuredClone(snapshot);
    bad.gameState.privateState.powerUps!.rewardQueue.offers.push(structuredClone(bad.gameState.privateState.powerUps!.rewardQueue.offers[0]));
    expect(() => assertRoomSnapshot(bad)).toThrow();
  });
  it('projects only owner data, hides all choices until reveal, and returns detached values', () => {
    const { state, offer } = snapshotFixture();
    const hidden = projectPowerUpOwnerState(state, P1, registry);
    expect(hidden.offers[0].candidates).toEqual(POWER_UP_CATEGORIES.map(category => ({ category })));
    expect(JSON.stringify(hidden)).not.toContain('fixture-only');
    expect(projectPowerUpOwnerState(state, P2, registry)).toEqual({ inventory: null, offers: [] });
    expect(() => projectPowerUpOwnerState(state, randomUUID(), registry)).toThrow();
    addPowerUpInstance(state.privateState.powerUps!.inventories[P1], {
      instanceId: randomUUID(), definitionId: definitions[0].definitionId,
      ownerPlayerId: P1, obtainedFromOfferId: randomUUID(),
    });
    expect(projectPowerUpOwnerState(state, P1, registry).inventory?.cards[0].definition).toEqual(definitions[0]);
    expect(projectPowerUpOwnerState(state, P2, registry).inventory).toBeNull();
    reveal(state, offer.offerId);
    const revealed = projectPowerUpOwnerState(state, P1, registry);
    expect(revealed.offers[0].candidates[0]).toHaveProperty('definition.definitionId', definitions[0].definitionId);
    const candidate = revealed.offers[0].candidates[0];
    if (candidate.definition) candidate.definition.name = 'Client edit';
    expect(registry.get(definitions[0].definitionId).name).toBe(definitions[0].name);
    expect(projectPowerUpOwnerState(state, P2, registry).offers).toEqual([]);
  });
  it('existing public and private wire snapshots never emit the new internal aggregate', async () => {
    const { snapshot } = snapshotFixture();
    const store = new InMemoryPersistenceStore<typeof snapshot>();
    const room = await store.rooms.create({ id: randomUUID(), code: 'FOUNDATION', hostPlayerId: P1, status: 'LOBBY', snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION, gameSnapshot: snapshot });
    for (const projected of [projectPublicRoomState(room, new ConnectionRegistry()), projectPrivatePlayerState(room, P1), projectPrivatePlayerState(room, P2)]) {
      expect(JSON.stringify(projected)).not.toContain('rewardQueue');
      expect(JSON.stringify(projected)).not.toContain('occurrenceId');
      expect(JSON.stringify(projected)).not.toContain('test-only-');
      expect(JSON.stringify(projected)).not.toContain('fixture-only');
    }
  });
  it('rolls back cash, reward identity and revision on save failure; retry commits once', async () => {
    const { snapshot } = snapshotFixture();
    snapshot.gameState.privateState.powerUps = createPowerUpState();
    const store = new InMemoryPersistenceStore<typeof snapshot>();
    const roomId = randomUUID();
    await store.rooms.create({ id: roomId, code: 'ROLLBACK', status: 'LOBBY', snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION, gameSnapshot: snapshot });
    const executor = new RoomCommandExecutor(store);
    const mutate = ({ room }: Parameters<Parameters<typeof executor.execute>[1]>[0]) => {
      const state = hydrateGameState(room.gameSnapshot, 'LOBBY');
      enqueue(state);
      storeGameState(room.gameSnapshot, state, 'LOBBY');
    };
    const save = vi.spyOn(store, 'transaction');
    const original = store.transaction.bind(store);
    save.mockImplementationOnce(callback => original(async transaction => {
      const saveAttempt = vi.spyOn(transaction.rooms, 'save').mockRejectedValueOnce(new Error('injected save failure'));
      try {
        return await callback(transaction);
      } finally {
        saveAttempt.mockRestore();
      }
    }));
    await expect(executor.execute(roomId, mutate)).rejects.toThrow('injected save failure');
    expect(await store.rooms.findById(roomId)).toMatchObject({ aggregateVersion: 1, gameSnapshot: snapshot });
    const committed = await executor.execute(roomId, mutate);
    expect(committed.room?.aggregateVersion).toBe(2);
    expect(committed.room?.gameSnapshot.gameState.privateState.powerUps?.rewardQueue.offers).toHaveLength(1);
    expect(committed.room?.gameSnapshot.gameState.players[P1].accountBalance).toBe(snapshot.gameState.players[P1].accountBalance + 200);
  });
});
