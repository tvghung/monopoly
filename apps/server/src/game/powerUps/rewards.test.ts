import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { powerUpOwnerStateSchema, powerUpStateSchema, type GameState } from '@monopoly/shared';
import { createFreshPlayer, freshState, createRoomSnapshot, storeGameState, hydrateGameState, calculateNextActionAt } from '../../rooms';
import { moveBy, moveToTile, moveToJail } from '../dice';
import { completeTurnResolution, continuationForRoll, nextTurn, removePlayerFromGame } from '../turn';
import { OFFICIAL_POWER_UP_REGISTRY } from './catalog';
import { createPowerUpInventory, nextPowerUpReward, canPresentPowerUpReward } from './foundation';
import { autoResolvePowerUpRewards, generateStartCandidates, issueStartReward, projectLivePowerUpOwnerState,
  projectPowerUpSummary, resolvePowerUpReward, selectPowerUpReward } from './rewards';

const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';
function subject() {
  const state = freshState();
  state.players[P1] = createFreshPlayer('A', 'red'); state.players[P2] = createFreshPlayer('B', 'blue');
  state.players[P2].teamSlot = 1;
  state.boardState.players = [P1, P2]; state.boardState.currentPlayer.id = P1; state.boardState.gameStarted = true;
  return state;
}
function award(state: GameState, owner = P1) { state.players[owner].currentTile = 39; moveBy(state, owner, 2); return nextPowerUpReward(state, owner)!; }
function choose(state: GameState, index = 0) { const offer = nextPowerUpReward(state, P1)!; selectPowerUpReward(state, P1, { offerId: offer.offerId, selectedIndex: index }); return offer; }
function fullHand(state: GameState) {
  const inventory = state.privateState.powerUps!.inventories[P1] = createPowerUpInventory(3);
  for (let i = 0; i < 3; i++) inventory.cards.push({ instanceId: randomUUID(), definitionId: 'A08', ownerPlayerId: P1, obtainedFromOfferId: randomUUID() });
  return inventory;
}

describe('live START generation and immutable selection', () => {
  it.each([[0, 'COMMON'], [59, 'COMMON'], [60, 'RARE'], [88, 'RARE'], [89, 'EPIC'], [98, 'EPIC'], [99, 'LEGENDARY']] as const)('rarity boundary %i is %s in each category', (roll, rarity) => {
    const candidates = generateStartCandidates(max => max === 100 ? roll : 0);
    expect(candidates.map(card => card.category)).toEqual(['ATTACK', 'DEFENSE', 'UTILITY']);
    expect(candidates.map(card => OFFICIAL_POWER_UP_REGISTRY.get(card.definitionId).rarity)).toEqual([rarity, rarity, rarity]);
  });
  it.each([0, 60, 89, 99])('uniform definition indices enumerate every eligible card for roll %i', roll => {
    const seen = new Set<string>();
    for (let index = 0; index < 5; index++) for (const card of generateStartCandidates(max => max === 100 ? roll : index % max)) seen.add(card.definitionId);
    const rarity = OFFICIAL_POWER_UP_REGISTRY.get([...seen][0]).rarity;
    expect([...seen].sort()).toEqual(OFFICIAL_POWER_UP_REGISTRY.list().filter(card => card.rarity === rarity).map(card => card.definitionId).sort());
  });
  it.each([-1, 100, 0.5, NaN])('rejects invalid randomness %s before returning candidates', value => expect(() => generateStartCandidates(() => value)).toThrow());
  it('ties exactly one offer to each PASS_GO, preserves money and never redraws a duplicate occurrence', () => {
    const state = subject(); const before = state.players[P1].accountBalance;
    const first = award(state);
    const occurrence = state.boardState.gameplayEvents.events.find(event => event.type === 'PASS_GO')!;
    if (occurrence.type !== 'PASS_GO') throw Error('missing');
    const snapshot = structuredClone(first);
    issueStartReward(state, occurrence, () => { throw Error('must not redraw'); });
    expect(first).toEqual(snapshot); expect(first.offerId).toBe(occurrence.eventId);
    award(state); expect(state.privateState.powerUps!.rewardQueue.offers).toHaveLength(2);
    expect(state.players[P1].accountBalance).toBe(before + 400);
    expect(state.boardState.gameplayEvents.events.filter(e => e.type === 'MONEY_TRANSFER')).toHaveLength(2);
  });
  it('keeps original absolute, backward, oversized forward, and jail money rules', () => {
    const state = subject(); state.players[P1].currentTile = 25;
    moveToTile(state, P1, 0, { kind: 'CARD', cardId: 'chance-advance-go' });
    moveBy(state, P1, -2); moveToJail(state, P1); moveBy(state, P1, 120);
    expect(state.players[P1].accountBalance).toBe(1900);
    expect(state.privateState.powerUps!.rewardQueue.offers).toHaveLength(2);
  });
  it('sends categories only before choice, reveals all definitions atomically, and locks selection', () => {
    const state = subject(); const offer = award(state);
    const hidden = projectLivePowerUpOwnerState(state, P1);
    expect(hidden.offers[0].candidates).toEqual([{ category: 'ATTACK' }, { category: 'DEFENSE' }, { category: 'UTILITY' }]);
    expect(JSON.stringify(hidden)).not.toMatch(/definitionId|rarity|effectKey|description/);
    choose(state, 1); const revealed = projectLivePowerUpOwnerState(state, P1);
    expect(revealed.offers[0].candidates.every(card => card.definition)).toBe(true);
    expect(powerUpOwnerStateSchema.safeParse(revealed).success).toBe(true);
    expect(() => selectPowerUpReward(state, P1, { offerId: offer.offerId, selectedIndex: 2 })).toThrow('khóa');
    selectPowerUpReward(state, P1, { offerId: offer.offerId, selectedIndex: 1 });
    expect(offer.selectedIndex).toBe(1);
  });
  it.each([-1, 3, 1.5, NaN])('rejects invalid selection %s without mutation', selectedIndex => {
    const state = subject(); const offer = award(state); const before = structuredClone(state);
    expect(() => selectPowerUpReward(state, P1, { offerId: offer.offerId, selectedIndex })).toThrow(); expect(state).toEqual(before);
  });
  it('rejects foreign offers and later owner offers without mutation', () => {
    const state = subject(); const first = award(state); award(state);
    const second = state.privateState.powerUps!.rewardQueue.offers[1]; const before = structuredClone(state);
    expect(() => selectPowerUpReward(state, P2, { offerId: first.offerId, selectedIndex: 0 })).toThrow();
    expect(() => selectPowerUpReward(state, P1, { offerId: second.offerId, selectedIndex: 0 })).toThrow(); expect(state).toEqual(before);
  });
});

describe('grant, capacity, recovery and lifecycle', () => {
  it('grants only the selected instance, dedupes every retry after completion, and projects summaries only', () => {
    const state = subject(); award(state); const offer = choose(state, 2);
    resolvePowerUpReward(state, P1, { offerId: offer.offerId, action: 'CLAIM' });
    const card = state.privateState.powerUps!.inventories[P1].cards[0];
    expect(card.definitionId).toBe(offer.candidates[2].definitionId);
    for (let i = 0; i < 5; i++) resolvePowerUpReward(state, P1, { offerId: offer.offerId, action: 'CLAIM' });
    expect(state.privateState.powerUps!.inventories[P1].cards).toEqual([card]);
    expect(projectPowerUpSummary(state, P1)).toEqual({ count: 1, categories: { ATTACK: 0, DEFENSE: 0, UTILITY: 1 } });
    expect(projectLivePowerUpOwnerState(state, P2).offers).toEqual([]);
  });
  it('full hand requires explicit replacement and preserves three Legendary cards on decline', () => {
    const state = subject(); award(state); const hand = fullHand(state); const old = structuredClone(hand.cards); const offer = choose(state);
    resolvePowerUpReward(state, P1, { offerId: offer.offerId, action: 'CLAIM' });
    expect(offer.stage).toBe('INVENTORY_RESOLUTION'); expect(hand.cards).toEqual(old);
    expect(() => resolvePowerUpReward(state, P1, { offerId: offer.offerId, action: 'REPLACE', replaceInstanceId: randomUUID() })).toThrow();
    expect(hand.cards).toEqual(old);
    resolvePowerUpReward(state, P1, { offerId: offer.offerId, action: 'DECLINE' });
    expect(hand.cards).toEqual(old); expect(offer.outcome?.kind).toBe('DECLINED');
  });
  it('replaces exactly the authorized instance and permits duplicate definition identities', () => {
    const state = subject(); award(state); const hand = fullHand(state); const kept = hand.cards.slice(1); const replaceInstanceId = hand.cards[0].instanceId;
    const offer = choose(state);
    resolvePowerUpReward(state, P1, { offerId: offer.offerId, action: 'REPLACE', replaceInstanceId });
    expect(hand.cards).toHaveLength(3); expect(hand.cards.slice(0,2)).toEqual(kept);
    expect(hand.cards.some(card => card.instanceId === replaceInstanceId)).toBe(false);
    expect(powerUpStateSchema.safeParse(state.privateState.powerUps).success).toBe(true);
  });
  it.each([false, true])('automatic selection uses stored candidates and preserves existing hand (full=%s)', full => {
    const state = subject(); const offer = award(state); const candidates = structuredClone(offer.candidates);
    const hand = full ? fullHand(state) : state.privateState.powerUps!.inventories[P1]; const before = structuredClone(hand.cards);
    expect(autoResolvePowerUpRewards(state, P1, () => 2)).toBe(true);
    expect(offer.candidates).toEqual(candidates); expect(offer.selectedIndex).toBe(2);
    expect(offer.outcome?.kind).toBe(full ? 'DISCARDED_FULL' : 'GRANTED');
    if (full) expect(hand.cards).toEqual(before); else expect(hand.cards[0].definitionId).toBe(candidates[2].definitionId);
    expect(autoResolvePowerUpRewards(state, P1, () => { throw Error('retry'); })).toBe(false);
  });
  it('recovery preserves a committed selection and its candidates at inventory resolution', () => {
    const state = subject(); award(state); const offer = choose(state, 1); fullHand(state);
    resolvePowerUpReward(state, P1, { offerId: offer.offerId, action: 'CLAIM' });
    autoResolvePowerUpRewards(state, P1, () => { throw Error('locked choice must not reroll'); });
    expect(offer.selectedIndex).toBe(1); expect(offer.outcome?.kind).toBe('DISCARDED_FULL');
  });
  it('suspends a continuation, blocks direct handoff and restores every lifecycle through hydration', () => {
    const state = subject(); award(state); state.boardState.currentPlayer.hasMoved = true;
    const continuation = continuationForRoll(state, P1);
    expect(completeTurnResolution(state, continuation)).toBeNull(); nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe(P1); expect(state.privateState.powerUps!.continuation).toEqual(continuation);
    for (const stage of ['WAITING', 'REVEALED', 'INVENTORY_RESOLUTION'] as const) {
      const offer = nextPowerUpReward(state, P1)!; offer.stage = stage; offer.selectedIndex = stage === 'WAITING' ? null : 1;
      const snapshot = createRoomSnapshot(); storeGameState(snapshot,state,'IN_PROGRESS');
      expect(hydrateGameState(snapshot,'IN_PROGRESS').privateState.powerUps).toEqual(state.privateState.powerUps);
    }
  });
  it('per-owner FIFO lets the current owner proceed past an unrelated waiting offer', () => {
    const state = subject(); award(state, P2); const own = award(state, P1);
    expect(canPresentPowerUpReward(state,P1)).toBe(true); choose(state);
    resolvePowerUpReward(state,P1,{ offerId:own.offerId,action:'CLAIM' });
    expect(nextPowerUpReward(state,P2)).toBeDefined(); expect(powerUpStateSchema.safeParse(state.privateState.powerUps).success).toBe(true);
  });
  it('elimination cancels pending rewards, clears inventory, and match end cancels all pending offers', () => {
    const state=subject(); const offer=award(state); fullHand(state); award(state,P2);
    removePlayerFromGame(state,P1,'BANKRUPT');
    expect(offer.outcome?.kind).toBe('CANCELLED'); expect(state.privateState.powerUps!.inventories).toEqual({});
    expect(state.privateState.powerUps!.rewardQueue.offers.every(o=>o.stage==='COMPLETED')).toBe(true);
    expect(state.boardState.winner).toBeDefined(); expect(powerUpStateSchema.safeParse(state.privateState.powerUps).success).toBe(true);
  });
  it('keeps a due offline reward dormant behind required decisions instead of repeatedly scheduling its expired marker',()=>{
    const state=subject();award(state);const deadline='2026-01-01T00:00:00.000Z';
    state.privateState.powerUps!.offlineDeadlines={[P1]:deadline};
    state.turnInfo.pendingPropertyDecision={operationId:randomUUID(),playerId:P1,tileID:1,continuation:continuationForRoll(state,P1)};
    const snapshot=createRoomSnapshot();storeGameState(snapshot,state,'IN_PROGRESS');
    expect(calculateNextActionAt(snapshot)).toBeNull();
    delete snapshot.gameState.turnInfo.pendingPropertyDecision;
    expect(calculateNextActionAt(snapshot)?.toISOString()).toBe(deadline);
  });

  it('does not turn a bankruptcy handoff into a continuation that skips the successor with an older reward',()=>{
    const state=subject();const third='00000000-0000-4000-8000-000000000003';
    state.players[third]=createFreshPlayer('C','green');state.players[third].teamId='TEAM_2';state.boardState.players.push(third);
    award(state,P2);state.players[P1].accountBalance=-1;nextTurn(state);
    expect(state.boardState.currentPlayer).toEqual({id:P2,hasMoved:false});
    expect(state.privateState.powerUps!.continuation??null).toBeNull();expect(nextPowerUpReward(state,P2)).toBeDefined();
  });

});
