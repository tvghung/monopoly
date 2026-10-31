import {
  POWER_UP_REWARD_STAGES,
  powerUpInventorySchema,
  powerUpRewardOfferSchema,
  type GameState,
  type GameplaySemanticEvent,
  type PlayerId,
  type PowerUpCandidate,
  type PowerUpInstance,
  type PowerUpInventory,
  type PowerUpRewardOffer,
  type PowerUpState,
} from '@monopoly/shared';
import type { PowerUpRegistry } from './registry';

export const createPowerUpState = (): PowerUpState => ({
  inventories: {}, rewardQueue: { offers: [] }, statuses: [], activeUsage: {},
  pendingReaction: null, resolvedReactionEventIds: [], pendingMovement: null, pendingTrade: null,
});

export function createPowerUpInventory(capacity: number | null): PowerUpInventory {
  return powerUpInventorySchema.parse({ capacity, cards: [] });
}

/** No discard/replace policy: callers must resolve a full hand explicitly in Phase 05. */
export function addPowerUpInstance(inventory: PowerUpInventory, instance: PowerUpInstance): void {
  const next = powerUpInventorySchema.parse({ ...inventory, cards: [...inventory.cards, instance] });
  inventory.cards = next.cards;
}

/** Typed single-producer adapter; never subscribe to both semantic events or inspect cash amounts. */
export function enqueueStartRewardOffer(
  state: GameState,
  occurrence: Extract<GameplaySemanticEvent, { type: 'PASS_GO' }>,
  candidates: readonly PowerUpCandidate[],
  registry: PowerUpRegistry,
): PowerUpRewardOffer {
  if (occurrence.type !== 'PASS_GO' || !state.players[occurrence.playerId]) {
    throw new Error('A START reward for an active player is required');
  }
  const powerUps = state.privateState.powerUps;
  if (!powerUps) throw new Error('Power-up foundation is not initialized');
  const existing = powerUps.rewardQueue.offers.find(offer => offer.offerId === occurrence.eventId);
  if (existing) {
    if (existing.ownerPlayerId !== occurrence.playerId) throw new Error('Reward occurrence owner mismatch');
    return structuredClone(existing); // Retry never replaces stored candidates, even after completion.
  }
  const offer = powerUpRewardOfferSchema.parse({
    offerId: occurrence.eventId,
    ownerPlayerId: occurrence.playerId,
    source: { kind: 'START_REWARD', occurrenceId: occurrence.eventId },
    stage: 'WAITING',
    candidates,
    selectedIndex: null,
  });
  for (const candidate of offer.candidates) {
    if (registry.get(candidate.definitionId).category !== candidate.category) {
      throw new Error('Candidate category does not match definition');
    }
  }
  powerUps.rewardQueue.offers.push(offer);
  return structuredClone(offer);
}

export function nextPowerUpReward(state: GameState, playerId?: PlayerId): PowerUpRewardOffer | undefined {
  return state.privateState.powerUps?.rewardQueue.offers.find(offer => offer.stage !== 'COMPLETED' && (!playerId || offer.ownerPlayerId === playerId));
}

export function hasMandatoryPowerUpReward(state: GameState, playerId: PlayerId): boolean {
  return state.privateState.powerUps?.rewardQueue.offers.some(
    offer => offer.ownerPlayerId === playerId && offer.stage !== 'COMPLETED',
  ) ?? false;
}

export function powerUpInteractionsClear(state: Pick<GameState, 'boardState' | 'turnInfo' | 'privateState'>): boolean {
  return !state.boardState.paymentQueue && !state.turnInfo.pendingPropertyDecision
    && !state.turnInfo.pendingDevelopmentDecision && !state.turnInfo.pendingCardInteraction
    && !state.privateState.forcedSaleProposal
    && !state.privateState.powerUps?.pendingReaction
    && !state.privateState.powerUps?.pendingTrade
    && !state.privateState.powerUps?.pendingMovement;
}

export function canPresentPowerUpReward(state: GameState, playerId: PlayerId): boolean {
  return !state.boardState.winner
    && state.boardState.currentPlayer.id === playerId
    && powerUpInteractionsClear(state)
    && Boolean(state.players[playerId])
    && nextPowerUpReward(state, playerId)?.ownerPlayerId === playerId;
}

/** Lifecycle scaffolding only: no socket command, reveal animation, inventory grant or effect execution. */
export function advancePowerUpReward(
  state: GameState,
  playerId: PlayerId,
  offerId: string,
  nextStage: PowerUpRewardOffer['stage'],
  selectedIndex?: number,
): void {
  const offer = nextPowerUpReward(state, playerId);
  if (!offer || offer.offerId !== offerId || offer.ownerPlayerId !== playerId) throw new Error('Not the owned FIFO head');
  if (!canPresentPowerUpReward(state, playerId)) throw new Error('Existing resolution must finish first');
  if (POWER_UP_REWARD_STAGES.indexOf(nextStage) !== POWER_UP_REWARD_STAGES.indexOf(offer.stage) + 1) {
    throw new Error('Invalid reward lifecycle transition');
  }
  if (selectedIndex !== undefined && nextStage !== 'SELECTED') throw new Error('Selection is locked');
  const next = powerUpRewardOfferSchema.parse({
    ...offer, stage: nextStage, selectedIndex: selectedIndex ?? offer.selectedIndex,
  });
  Object.assign(offer, next);
}

/** A domain guard for the future completion/recovery adapters. Not wired before disconnect policy approval. */
export function assertPowerUpTurnCanEnd(state: GameState, playerId: PlayerId): void {
  if (hasMandatoryPowerUpReward(state, playerId)) throw new Error('Mandatory power-up reward is unresolved');
}

/** Pure projector: caller derives playerId from authenticated session; no broadcast wiring in Phase 02. */
export function projectPowerUpOwnerState(state: GameState, playerId: PlayerId, registry: PowerUpRegistry) {
  if (!state.players[playerId]) throw new Error('Active owner required');
  const inventory = state.privateState.powerUps?.inventories[playerId];
  return {
    inventory: inventory ? {
      capacity: inventory.capacity,
      cards: inventory.cards.map(card => ({ ...card, definition: { ...structuredClone(registry.get(card.definitionId)) } })),
    } : null,
    offers: (state.privateState.powerUps?.rewardQueue.offers ?? [])
      .filter(offer => offer.ownerPlayerId === playerId)
      .map(offer => ({
        offerId: offer.offerId,
        stage: offer.stage,
        selectedIndex: offer.selectedIndex,
        candidates: offer.candidates.map(candidate => (
          ['REVEALED', 'INVENTORY_RESOLUTION', 'COMPLETED'].includes(offer.stage)
            ? { category: candidate.category, definition: { ...structuredClone(registry.get(candidate.definitionId)) } }
            : { category: candidate.category }
        )),
      })),
  };
}
