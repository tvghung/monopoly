import { randomInt, randomUUID } from 'node:crypto';
import {
  POWER_UP_CATEGORIES, POWER_UP_RARITIES, POWER_UP_CONFIG,
  type GameState, type GameplaySemanticEvent, type PlayerId, type PowerUpCandidate,
  type PowerUpDefinition, type PowerUpOwnerState, type PowerUpPublicSummary,
  type ResolvePowerUpRequest, type SelectPowerUpRequest,
} from '@monopoly/shared';
import { OFFICIAL_POWER_UP_REGISTRY } from './catalog';
import { clearFinishedPowerUpRuntime, removePowerUpPlayerState } from './lifecycle';
import {
  addPowerUpInstance, canPresentPowerUpReward, createPowerUpInventory, createPowerUpState,
  enqueueStartRewardOffer, nextPowerUpReward,
} from './foundation';
import { CommandError } from '../../socket/errors';
import { eligiblePowerUpReactionIds } from './runtime';

export type RewardRandom = (exclusiveMax: number) => number;
export const rewardRandom: RewardRandom = max => randomInt(max);
const draw = (random: RewardRandom, max: number): number => {
  const value = random(max);
  if (!Number.isInteger(value) || value < 0 || value >= max) throw new Error('Invalid reward random result');
  return value;
};

export function generateStartCandidates(random: RewardRandom = rewardRandom): PowerUpCandidate[] {
  return POWER_UP_CATEGORIES.map(category => {
    const roll = draw(random, 100);
    let boundary = 0;
    const rarity = POWER_UP_RARITIES.find(tier => {
      boundary += POWER_UP_CONFIG.rarityWeights[tier];
      return roll < boundary;
    });
    const pool = OFFICIAL_POWER_UP_REGISTRY.list().filter(card => card.category === category && card.rarity === rarity);
    if (!pool.length) throw new Error('Official reward pool is empty');
    return { category, definitionId: pool[draw(random, pool.length)].definitionId };
  });
}

/** Called only from awardStartReward, on the same transaction draft as the cash award. */
export function issueStartReward(
  state: GameState, occurrence: Extract<GameplaySemanticEvent, { type: 'PASS_GO' }>,
  random: RewardRandom = rewardRandom,
): void {
  const powerUps = state.privateState.powerUps ??= createPowerUpState();
  if (powerUps.rewardQueue.offers.some(offer => offer.offerId === occurrence.eventId)) {
    enqueueStartRewardOffer(state, occurrence, [], OFFICIAL_POWER_UP_REGISTRY);
    return;
  }
  enqueueStartRewardOffer(state, occurrence, generateStartCandidates(random), OFFICIAL_POWER_UP_REGISTRY);
  powerUps.inventories[occurrence.playerId] ??= createPowerUpInventory(POWER_UP_CONFIG.inventoryCapacity);
}

const ownedOffer = (state: GameState, actor: PlayerId, offerId: string) => {
  const offer = state.privateState.powerUps?.rewardQueue.offers.find(candidate => candidate.offerId === offerId);
  if (!offer || offer.ownerPlayerId !== actor || !state.players[actor]) {
    throw new CommandError('FORBIDDEN', 'Phần thưởng này không thuộc về bạn.');
  }
  return offer;
};
const assertReady = (state: GameState, actor: PlayerId, offerId: string): void => {
  if (!canPresentPowerUpReward(state, actor) || nextPowerUpReward(state, actor)?.offerId !== offerId) {
    throw new CommandError('CONFLICT', 'Hãy hoàn tất quyết định đang chờ trước.');
  }
};

export function selectPowerUpReward(state: GameState, actor: PlayerId, request: SelectPowerUpRequest): void {
  const offer = ownedOffer(state, actor, request.offerId);
  if (!Number.isInteger(request.selectedIndex) || request.selectedIndex < 0 || request.selectedIndex > 2) {
    throw new CommandError('INVALID_REQUEST', 'Lựa chọn thẻ không hợp lệ.');
  }
  if (offer.selectedIndex !== null) {
    if (offer.selectedIndex === request.selectedIndex) return;
    throw new CommandError('CONFLICT', 'Lựa chọn thẻ đã được khóa.');
  }
  assertReady(state, actor, offer.offerId);
  if (!['WAITING', 'SELECTING'].includes(offer.stage)) throw new CommandError('CONFLICT', 'Phần thưởng đã kết thúc.');
  // SELECTED is a transient server checkpoint. All three are revealed in the same commit that locks the choice.
  offer.selectedIndex = request.selectedIndex;
  offer.stage = 'REVEALED';
}

export function resolvePowerUpReward(
  state: GameState, actor: PlayerId, request: ResolvePowerUpRequest, automatic = false,
): void {
  const offer = ownedOffer(state, actor, request.offerId);
  if (offer.stage === 'COMPLETED') return; // Completion identity is retained even after replacement/removal.
  if (!automatic) assertReady(state, actor, offer.offerId);
  if (!['REVEALED', 'INVENTORY_RESOLUTION'].includes(offer.stage) || offer.selectedIndex === null) {
    throw new CommandError('CONFLICT', 'Hãy chọn một thẻ trước.');
  }
  const powerUps = state.privateState.powerUps!;
  const inventory = powerUps.inventories[actor] ??= createPowerUpInventory(POWER_UP_CONFIG.inventoryCapacity);
  const full = inventory.cards.length >= POWER_UP_CONFIG.inventoryCapacity;
  if (request.action === 'CLAIM' && full && !automatic) {
    offer.stage = 'INVENTORY_RESOLUTION';
    return;
  }
  if (request.action === 'REPLACE') {
    const index = inventory.cards.findIndex(card => card.instanceId === request.replaceInstanceId && card.ownerPlayerId === actor);
    if (!full || index < 0 || automatic) throw new CommandError('FORBIDDEN', 'Thẻ thay thế không hợp lệ.');
    inventory.cards.splice(index, 1);
  }
  const discard = request.action === 'DECLINE' || (full && automatic);
  if (!discard) {
    addPowerUpInstance(inventory, {
      instanceId: randomUUID(), ownerPlayerId: actor, obtainedFromOfferId: offer.offerId,
      definitionId: offer.candidates[offer.selectedIndex].definitionId,
    });
  }
  offer.outcome = {
    kind: discard ? (automatic && full ? 'DISCARDED_FULL' : 'DECLINED') : request.action === 'REPLACE' ? 'REPLACED' : 'GRANTED',
    automatic,
  };
  offer.stage = 'COMPLETED';
}

/** Server-only policy. Already locked choices survive disconnect; no replacement of held cards. */
export function autoResolvePowerUpRewards(state: GameState, actor: PlayerId, random: RewardRandom = rewardRandom): boolean {
  if (!state.players[actor] || state.boardState.winner) return false;
  let changed = false;
  for (let offer = nextPowerUpReward(state, actor); offer; offer = nextPowerUpReward(state, actor)) {
    if (offer.selectedIndex === null) offer.selectedIndex = draw(random, 3);
    offer.stage = 'REVEALED';
    resolvePowerUpReward(state, actor, { offerId: offer.offerId, action: 'CLAIM' }, true);
    changed = true;
  }
  return changed;
}

/** Terminal owners lose unplayed cards, including revivable bankrupt seats. Revival starts empty. */
export function cleanupPowerUpOwner(state: GameState, actor: PlayerId): void {
  const powerUps = state.privateState.powerUps;
  if (!powerUps) return;
  removePowerUpPlayerState(state, actor);
  if (powerUps.offlineDeadlines) delete powerUps.offlineDeadlines[actor];
  if (powerUps.continuation?.playerId === actor) powerUps.continuation = null;
  for (const offer of powerUps.rewardQueue.offers) {
    if (offer.ownerPlayerId !== actor || offer.stage === 'COMPLETED') continue;
    offer.stage = 'COMPLETED';
    offer.outcome = { kind: 'CANCELLED', automatic: true };
  }
}
export function cleanupFinishedPowerUps(state: GameState): void {
  const powerUps = state.privateState.powerUps;
  if (!powerUps) return;
  for (const owner of new Set(powerUps.rewardQueue.offers.map(offer => offer.ownerPlayerId))) cleanupPowerUpOwner(state, owner);
  powerUps.inventories = {};
  powerUps.offlineDeadlines = {};
  powerUps.continuation = null;
  clearFinishedPowerUpRuntime(state);
}

// Explicit whitelist: future registry internals cannot silently become network fields.
const displayDefinition = (id: string): PowerUpDefinition => {
  const { definitionId, name, description, category, rarity, activation, effectKey } = OFFICIAL_POWER_UP_REGISTRY.get(id);
  return { definitionId, name, description, category, rarity, activation, effectKey };
};
export function projectLivePowerUpOwnerState(state: GameState, owner: PlayerId): PowerUpOwnerState {
  const powerUps = state.privateState.powerUps;
  const inventory = powerUps?.inventories[owner];
  const owned = (powerUps?.rewardQueue.offers ?? []).filter(offer => offer.ownerPlayerId === owner);
  const pending = owned.filter(offer => offer.stage !== 'COMPLETED');
  // Keep every identity server-side; send pending plus only the latest completed outcome on reconnect.
  const lastCompleted = [...owned].reverse().find(offer => offer.stage === 'COMPLETED');
  const statuses = (powerUps?.statuses ?? []).filter(status => (
    status.sourcePlayerId === owner
    || status.targetPlayerId === owner
    || status.affectedPlayerIds?.includes(owner)
    || (status.targetTileID !== undefined && state.boardState.ownedProps[status.targetTileID]?.id === owner)
  )).map(status => ({
    statusId: status.statusId,
    definitionId: status.definitionId,
    name: displayDefinition(status.definitionId).name,
    description: displayDefinition(status.definitionId).description,
    kind: status.kind,
    ...(status.targetPlayerId ? { targetPlayerId: status.targetPlayerId } : {}),
    ...(status.targetTileID !== undefined ? { targetTileID: status.targetTileID } : {}),
    ...(status.remainingOwnerTurns !== undefined ? { remainingOwnerTurns: status.remainingOwnerTurns } : {}),
    ...(status.remainingUses !== undefined ? { remainingUses: status.remainingUses } : {}),
  }));
  const pendingReaction = powerUps?.pendingReaction;
  const reactionTarget = pendingReaction?.kind === 'ATTACK' ? pendingReaction.defenderPlayerId
    : pendingReaction?.kind === 'RENT' || pendingReaction?.kind === 'SHORTFALL'
      ? pendingReaction.debtorPlayerId : null;
  const reaction = pendingReaction && reactionTarget === owner ? {
    eventId: pendingReaction.eventId,
    kind: pendingReaction.kind,
    ...(pendingReaction.kind === 'ATTACK' ? {
      attackerPlayerId: pendingReaction.attackerPlayerId,
      attackerName: state.players[pendingReaction.attackerPlayerId]?.name ?? 'Unknown',
      attackDefinitionId: pendingReaction.attackDefinitionId,
      attackName: displayDefinition(pendingReaction.attackDefinitionId).name,
      ...(pendingReaction.targetPlayerId ? { targetPlayerId: pendingReaction.targetPlayerId } : {}),
      ...(pendingReaction.targetTileID !== undefined ? { targetTileID: pendingReaction.targetTileID } : {}),
    } : pendingReaction.kind === 'RENT' ? {
      attackerPlayerId: pendingReaction.landlordPlayerId,
      attackerName: state.players[pendingReaction.landlordPlayerId]?.name ?? 'Unknown',
      targetPlayerId: pendingReaction.debtorPlayerId,
      targetTileID: pendingReaction.tileID,
      rentAmount: pendingReaction.rentAmount,
    } : {}),
    deadlineAt: pendingReaction.deadlineAt,
    eligibleInstanceIds: eligiblePowerUpReactionIds(state, owner),
  } : null;
  const trade = powerUps?.pendingTrade?.targetPlayerId === owner ? powerUps.pendingTrade : null;
  const movement = powerUps?.pendingMovement?.playerId === owner ? powerUps.pendingMovement : null;
  return {
    inventory: inventory ? { capacity: inventory.capacity, cards: inventory.cards.map(card => ({ ...card, definition: displayDefinition(card.definitionId) })) } : null,
    activeUsedThisTurn: powerUps?.activeUsage?.[owner] === state.boardState.turnNumber,
    activeOfferId: canPresentPowerUpReward(state, owner) ? nextPowerUpReward(state, owner)!.offerId : null,
    offers: [...(lastCompleted ? [lastCompleted] : []), ...pending].map(offer => ({
      offerId: offer.offerId, stage: offer.stage, selectedIndex: offer.selectedIndex,
      ...(offer.outcome ? { outcome: { ...offer.outcome } } : {}),
      candidates: offer.candidates.map(candidate => ({
        category: candidate.category,
        ...(['REVEALED', 'INVENTORY_RESOLUTION', 'COMPLETED'].includes(offer.stage) && offer.outcome?.kind !== 'CANCELLED'
          ? { definition: displayDefinition(candidate.definitionId) } : {}),
      })),
    })),
    statuses,
    reaction,
    tradeRequest: trade ? {
      requestId: trade.requestId,
      initiatorPlayerId: trade.initiatorPlayerId,
      initiatorName: state.players[trade.initiatorPlayerId]?.name ?? 'Unknown',
      deadlineAt: trade.deadlineAt,
    } : null,
    movement: movement ? {
      operationId: movement.operationId,
      dice: structuredClone(movement.dice),
      total: movement.dice.dice1 + movement.dice.dice2,
    } : null,
  };
}
export function projectPowerUpSummary(state: GameState, owner: PlayerId): PowerUpPublicSummary {
  const cards = state.privateState.powerUps?.inventories[owner]?.cards ?? [];
  const categories = { ATTACK: 0, DEFENSE: 0, UTILITY: 0 };
  for (const card of cards) categories[OFFICIAL_POWER_UP_REGISTRY.get(card.definitionId).category] += 1;
  return { count: cards.length, categories };
}
