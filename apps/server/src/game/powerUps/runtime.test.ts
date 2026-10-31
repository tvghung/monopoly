import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PendingPowerUpReaction, PowerUpActivationRequest, PowerUpInstance, PowerUpStatus } from '@monopoly/shared';
import { createFreshPlayer, freshState } from '../../rooms';
import { createPowerUpInventory, createPowerUpState } from './foundation';
import { beginPowerUpPlayerTurn, completePowerUpOwnerTurn } from './lifecycle';
import {
  applyPowerUpRentModifiers, openPowerUpRentReaction, purchaseBasePrice,
  resolvePowerUpRent, createPowerUpRentEvent,
} from './economy';
import { activatePowerUp, eligiblePowerUpReactionIds, respondPowerUpReaction } from './runtime';
import { enqueuePayments } from '../payment';
import { progressPaymentQueue as advancePayments } from '../paymentResolution';

const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';

function subject() {
  const state = freshState();
  state.players[P1] = createFreshPlayer('A', 'red');
  state.players[P2] = createFreshPlayer('B', 'blue');
  state.players[P2].teamSlot = 1;
  state.boardState.players = [P1, P2];
  state.boardState.gameStarted = true;
  state.boardState.currentPlayer = { id: P1, hasMoved: false };
  state.privateState.powerUps = createPowerUpState();
  state.privateState.powerUps.inventories[P1] = createPowerUpInventory(3);
  state.privateState.powerUps.inventories[P2] = createPowerUpInventory(3);
  return state;
}

function card(ownerPlayerId: string, definitionId: string): PowerUpInstance {
  return { instanceId: randomUUID(), ownerPlayerId, definitionId, obtainedFromOfferId: randomUUID() };
}

function putCard(state: ReturnType<typeof subject>, owner: string, definitionId: string): PowerUpInstance {
  const instance = card(owner, definitionId);
  state.privateState.powerUps!.inventories[owner].cards.push(instance);
  return instance;
}

function status(
  definitionId: PowerUpStatus['definitionId'],
  kind: PowerUpStatus['kind'],
  sourcePlayerId: string,
  values: Partial<PowerUpStatus> = {},
): PowerUpStatus {
  return {
    statusId: randomUUID(), definitionId, kind, sourceInstanceId: randomUUID(), sourcePlayerId, ...values,
  };
}

describe('authoritative Power-up runtime', () => {
  it('creates a targeted Reaction Window and D03 cancels only before status creation', () => {
    const state = subject();
    const attack = putCard(state, P1, 'A05');
    const defense = putCard(state, P2, 'D03');
    activatePowerUp(state, P1, { instanceId: attack.instanceId, targetPlayerId: P2 }, 1_000);
    const event = state.privateState.powerUps!.pendingReaction as PendingPowerUpReaction;
    expect(event.kind).toBe('ATTACK');
    expect(eligiblePowerUpReactionIds(state, P2)).toEqual([defense.instanceId]);
    respondPowerUpReaction(state, P2, { eventId: event.eventId, action: 'REACT', instanceId: defense.instanceId }, 2_000);
    expect(state.privateState.powerUps!.pendingReaction).toBeNull();
    expect(state.privateState.powerUps!.statuses).toHaveLength(0);
    expect(state.privateState.powerUps!.inventories[P1].cards).toHaveLength(0);
    expect(state.privateState.powerUps!.inventories[P2].cards).toHaveLength(0);
  });

  it('lets a property shield intercept two A04 attacks, but only for its current owner', () => {
    const state = subject();
    state.boardState.ownedProps[1] = { id: P2, color: 'blue', houses: 0 };
    state.boardState.currentPlayer = { id: P2, hasMoved: false };
    const shield = putCard(state, P2, 'D04');
    activatePowerUp(state, P2, { instanceId: shield.instanceId, targetTileID: 1 }, 1_000);
    const defense = state.privateState.powerUps!.statuses![0];
    expect(defense.remainingUses).toBe(2);

    state.boardState.currentPlayer = { id: P1, hasMoved: false };
    const first = putCard(state, P1, 'A04');
    activatePowerUp(state, P1, { instanceId: first.instanceId, targetPlayerId: P2, targetTileID: 1 }, 2_000);
    expect(state.privateState.powerUps!.pendingReaction).toBeNull();
    expect(defense.remainingUses).toBe(1);

    state.boardState.turnNumber += 1;
    const second = putCard(state, P1, 'A04');
    activatePowerUp(state, P1, { instanceId: second.instanceId, targetPlayerId: P2, targetTileID: 1 }, 3_000);
    expect(state.privateState.powerUps!.statuses).toHaveLength(0);

    const third = putCard(state, P1, 'A04');
    state.boardState.ownedProps[1].id = P1;
    expect(() => activatePowerUp(state, P1, { instanceId: third.instanceId, targetPlayerId: P2, targetTileID: 1 }, 4_000)).toThrow();
  });

  it('opens one D07 shortfall reaction, contributes at most 100, then returns to normal liquidation rules', () => {
    const state = subject();
    state.players[P1].accountBalance = 50;
    state.boardState.ownedProps[1] = { id: P1, color: 'red', houses: 0 };
    const first = putCard(state, P1, 'D07');
    putCard(state, P1, 'D07');
    enqueuePayments(state, [{
      debtorPlayerId: P1, creditor: 'PLAYER', creditorPlayerId: P2, amount: 200,
      source: { kind: 'OTHER', description: 'mandatory test claim' },
    }], { playerId: P1, turnNumber: state.boardState.turnNumber }, { now: 10_000, operationId: randomUUID() });
    const progress = advancePayments(state, { now: 10_000 });
    expect(progress.status).toBe('WAITING_FOR_REACTION');
    const event = state.privateState.powerUps!.pendingReaction!;
    expect(event.kind).toBe('SHORTFALL');
    respondPowerUpReaction(state, P1, { eventId: event.eventId, action: 'REACT', instanceId: first.instanceId }, 11_000);
    expect(state.players[P2].accountBalance).toBeGreaterThan(50);
    expect(state.boardState.paymentQueue?.orderedClaims[0].remainingAmount).toBe(50);
    expect(state.privateState.powerUps!.pendingReaction).toBeNull();
    expect(state.privateState.powerUps!.inventories[P1].cards).toHaveLength(1);
  });

  it('applies U02 to movement without changing the recorded dice result', () => {
    const state = subject();
    const cardInstance = putCard(state, P1, 'U02');
    state.players[P1].currentTile = 1;
    state.boardState.diceValue = { dice1: 1, dice2: 1 };
    state.boardState.rollSequence = 1;
    state.boardState.currentPlayer.hasMoved = true;
    state.privateState.powerUps!.pendingMovement = {
      operationId: randomUUID(), playerId: P1, turnNumber: state.boardState.turnNumber,
      dice: { dice1: 1, dice2: 1 }, rollSequence: 1,
    };
    activatePowerUp(state, P1, { instanceId: cardInstance.instanceId }, 1_000);
    expect(state.players[P1].currentTile).toBe(5);
    expect(state.boardState.diceValue).toEqual({ dice1: 1, dice2: 1 });
    expect(state.privateState.powerUps!.pendingMovement).toBeNull();
    expect(state.turnInfo.pendingPropertyDecision?.tileID).toBe(5);
  });

  it('does not stack A02 and retains its status until a rent uses the increase', () => {
    const state = subject();
    const boost1 = status('A02', 'RENT_MODIFIER', P1, { targetTileID: 1, percent: 25, remainingUses: 1 });
    const boost2 = status('A02', 'RENT_MODIFIER', P1, { targetTileID: 1, percent: 25, remainingUses: 1 });
    state.privateState.powerUps!.statuses = [boost1, boost2];
    expect(applyPowerUpRentModifiers(state, 1, P2, 100)).toEqual({ amount: 125, consumedStatusIds: [boost1.statusId] });
    state.boardState.ownedProps[1] = { id: P2, color: 'blue', houses: 0 };
    const event = {
      kind: 'RENT' as const, eventId: randomUUID(), debtorPlayerId: P1, landlordPlayerId: P2,
      tileID: 1, rentAmount: 100, diceResult: 6, cause: 'DICE' as const,
      continuation: { playerId: P1, turnNumber: state.boardState.turnNumber }, deadlineAt: new Date(1_000).toISOString(),
    };
    resolvePowerUpRent(state, event, null, null, 2_000, false);
    expect(state.players[P2].accountBalance).toBeGreaterThan(1_500);
    expect(state.privateState.powerUps!.statuses).toEqual([boost2]);
  });

  it('stacks the strongest rent increase and reduction against base rent with integer rounding', () => {
    const state = subject();
    const increase = status('A02', 'RENT_MODIFIER', P1, { targetTileID: 1, percent: 25 });
    const propertyReduction = status('A04', 'RENT_MODIFIER', P1, { targetTileID: 1, percent: -25 });
    const globalReduction = status('A08', 'RENT_MODIFIER', P1, { affectedPlayerIds: [P2], percent: -50 });
    state.privateState.powerUps!.statuses = [increase, propertyReduction, globalReduction];

    expect(applyPowerUpRentModifiers(state, 1, P2, 101)).toEqual({
      amount: 77, consumedStatusIds: [increase.statusId],
    });
    state.privateState.powerUps!.statuses = [increase, propertyReduction];
    expect(applyPowerUpRentModifiers(state, 1, P2, 101)).toEqual({
      amount: 102, consumedStatusIds: [increase.statusId, propertyReduction.statusId],
    });
    expect(applyPowerUpRentModifiers(state, 1, P2, 0)).toEqual({ amount: 0, consumedStatusIds: [] });
  });

  it('steals ten percent of available cash with integer rounding and the approved 50-unit cap', () => {
    const state = subject();
    const attack = putCard(state, P1, 'A01');
    state.players[P2].accountBalance = 499;
    const beforeAttacker = state.players[P1].accountBalance;
    activatePowerUp(state, P1, { instanceId: attack.instanceId, targetPlayerId: P2 }, 1_000);
    expect(state.players[P2].accountBalance).toBe(450);
    expect(state.players[P1].accountBalance).toBe(beforeAttacker + 49);

    const cappedState = subject();
    const cappedAttack = putCard(cappedState, P1, 'A01');
    cappedState.players[P2].accountBalance = 1_000;
    const cappedAttacker = cappedState.players[P1].accountBalance;
    activatePowerUp(cappedState, P1, { instanceId: cappedAttack.instanceId, targetPlayerId: P2 }, 1_000);
    expect(cappedState.players[P2].accountBalance).toBe(950);
    expect(cappedState.players[P1].accountBalance).toBe(cappedAttacker + 50);
  });

  it('rejects self-targeted A04, eliminated targets, and fields outside the card effect contract', () => {
    const state = subject();
    state.boardState.ownedProps[1] = { id: P1, color: 'red', houses: 0 };
    const rumor = putCard(state, P1, 'A04');
    expect(() => activatePowerUp(state, P1, {
      instanceId: rumor.instanceId, targetPlayerId: P1, targetTileID: 1,
    }, 1_000)).toThrow();
    expect(state.privateState.powerUps!.inventories[P1].cards).toContain(rumor);
    expect(state.privateState.powerUps!.activeUsage?.[P1]).toBeUndefined();

    const attack = putCard(state, P1, 'A01');
    state.boardState.players = [P1];
    expect(() => activatePowerUp(state, P1, {
      instanceId: attack.instanceId, targetPlayerId: P2,
    }, 1_000)).toThrow();

    state.boardState.players = [P1, P2];
    expect(() => activatePowerUp(state, P1, {
      instanceId: attack.instanceId, targetPlayerId: P2, movementDelta: 2,
    }, 1_000)).toThrow();
    expect(state.privateState.powerUps!.inventories[P1].cards).toContain(attack);
  });

  it('applies A03 purchase surcharge to U07 remote price and consumes both effects after purchase', () => {
    const state = subject();
    state.boardState.currentPlayer = { id: P2, hasMoved: false };
    const remote = putCard(state, P2, 'U07');
    const surcharge = status('A03', 'PURCHASE_SURCHARGE', P1, {
      targetPlayerId: P2, percent: 20, capUnits: 50,
    });
    state.privateState.powerUps!.statuses = [surcharge];
    const base = purchaseBasePrice(1);
    const remotePrice = Math.ceil(base * 125 / 100);
    const expectedPrice = remotePrice + Math.min(50, Math.ceil(remotePrice * 20 / 100));
    const balanceBefore = state.players[P2].accountBalance;

    activatePowerUp(state, P2, { instanceId: remote.instanceId, targetTileID: 1 }, 1_000);

    expect(state.players[P2].accountBalance).toBe(balanceBefore - expectedPrice);
    expect(state.boardState.ownedProps[1]?.id).toBe(P2);
    expect(state.privateState.powerUps!.statuses).toEqual([]);
    expect(state.privateState.powerUps!.inventories[P2].cards).not.toContain(remote);
  });

  it('reflects A06 by taking a random unplayed card, never the resolving A06 instance', () => {
    const state = subject();
    const steal = putCard(state, P1, 'A06');
    putCard(state, P1, 'A02');
    putCard(state, P2, 'U01');
    const reflect = putCard(state, P2, 'D05');

    activatePowerUp(state, P1, { instanceId: steal.instanceId, targetPlayerId: P2 }, 1_000);
    const event = state.privateState.powerUps!.pendingReaction as PendingPowerUpReaction;
    expect(eligiblePowerUpReactionIds(state, P2)).toContain(reflect.instanceId);
    respondPowerUpReaction(state, P2, {
      eventId: event.eventId, action: 'REACT', instanceId: reflect.instanceId,
    }, 2_000);

    expect(state.privateState.powerUps!.inventories[P1].cards).toEqual([]);
    expect(state.privateState.powerUps!.inventories[P2].cards.map(item => item.definitionId)).toEqual(['U01', 'A02']);
    expect(state.privateState.powerUps!.pendingReaction).toBeNull();
  });

  it('limits D07 to one Reaction per originating payment command', () => {
    const state = subject();
    state.players[P1].accountBalance = 50;
    state.boardState.ownedProps[1] = { id: P1, color: 'red', houses: 0 };
    const first = putCard(state, P1, 'D07');
    const second = putCard(state, P1, 'D07');
    const operationId = randomUUID();
    enqueuePayments(state, [150, 100].map(amount => ({
      debtorPlayerId: P1, creditor: 'PLAYER' as const, creditorPlayerId: P2, amount,
      source: { kind: 'OTHER' as const, description: 'same command claims' },
    })), { playerId: P1, turnNumber: state.boardState.turnNumber }, { now: 10_000, operationId });
    const progress = advancePayments(state, { now: 10_000 });
    expect(progress.status).toBe('WAITING_FOR_REACTION');
    const event = state.privateState.powerUps!.pendingReaction!;
    respondPowerUpReaction(state, P1, {
      eventId: event.eventId, action: 'REACT', instanceId: first.instanceId,
    }, 11_000);

    expect(state.privateState.powerUps!.pendingReaction).toBeNull();
    expect(state.privateState.powerUps!.resolvedReactionEventIds).toContain(operationId);
    expect(state.boardState.paymentQueue?.orderedClaims[1].remainingAmount).toBe(100);
    expect(state.privateState.powerUps!.inventories[P1].cards).toContain(second);
  });

  it('expires owner-turn, use-count and start-bound effects at their authoritative lifecycle boundaries', () => {
    const state = subject();
    const ownerTurns = status('D04', 'PROPERTY_SHIELD', P1, {
      targetPlayerId: P1, targetTileID: 1, ownerTurnPlayerId: P1, remainingOwnerTurns: 3, remainingUses: 2,
    });
    const startBound = status('A08', 'RENT_MODIFIER', P1, {
      affectedPlayerIds: [P2], expiresAtStartPlayerId: P1, percent: -50,
    });
    const thisTurn = status('U03', 'PURCHASE_DISCOUNT', P1, {
      targetTileID: 1, percent: 15, capUnits: 50, expiresAtTurnNumber: state.boardState.turnNumber,
    });
    state.privateState.powerUps!.statuses = [ownerTurns, startBound, thisTurn];

    beginPowerUpPlayerTurn(state, P2);
    expect(state.privateState.powerUps!.statuses).toContain(startBound);
    expect(state.privateState.powerUps!.statuses).toContain(thisTurn);
    completePowerUpOwnerTurn(state, P1);
    expect(ownerTurns.remainingOwnerTurns).toBe(2);
    state.boardState.turnNumber += 1;
    beginPowerUpPlayerTurn(state, P1);
    expect(state.privateState.powerUps!.statuses).not.toContain(startBound);
    expect(state.privateState.powerUps!.statuses).not.toContain(thisTurn);
    expect(state.privateState.powerUps!.statuses).toContain(ownerTurns);
    completePowerUpOwnerTurn(state, P1);
    completePowerUpOwnerTurn(state, P1);
    expect(state.privateState.powerUps!.statuses).not.toContain(ownerTurns);
  });

  it('creates the global A08 rent effect without affecting its owner and applies A09 house levies', () => {
    const state = subject();
    const crisis = putCard(state, P1, 'A08');
    activatePowerUp(state, P1, { instanceId: crisis.instanceId }, 1_000);
    const global = state.privateState.powerUps!.statuses![0];
    expect(global.affectedPlayerIds).toEqual([P2]);
    expect(global.expiresAtStartPlayerId).toBe(P1);

    state.privateState.powerUps!.statuses = [];
    const levy = putCard(state, P1, 'A09');
    state.boardState.turnNumber += 1;
    state.boardState.currentPlayer = { id: P1, hasMoved: false };
    state.boardState.ownedProps[1] = { id: P2, color: 'blue', houses: 5 };
    const before = state.players[P2].accountBalance;
    activatePowerUp(state, P1, { instanceId: levy.instanceId, targetPlayerId: P2 }, 2_000);
    expect(state.players[P2].accountBalance).toBe(before - 50);
    expect(state.privateState.powerUps!.inventories[P1].cards).not.toContain(levy);
  });

  const activationCases: Array<{
    id: string;
    prepare: (state: ReturnType<typeof subject>) => { card: PowerUpInstance; request: PowerUpActivationRequest };
  }> = [
    { id: 'A01', prepare: state => {
      const card = putCard(state, P1, 'A01'); return { card, request: { instanceId: card.instanceId, targetPlayerId: P2 } };
    } },
    { id: 'A02', prepare: state => {
      state.boardState.ownedProps[1] = { id: P1, color: 'red', houses: 0 };
      const card = putCard(state, P1, 'A02'); return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
    } },
    { id: 'A03', prepare: state => {
      const card = putCard(state, P1, 'A03'); return { card, request: { instanceId: card.instanceId, targetPlayerId: P2 } };
    } },
    { id: 'A04', prepare: state => {
      state.boardState.ownedProps[1] = { id: P2, color: 'blue', houses: 0 };
      const card = putCard(state, P1, 'A04'); return { card, request: { instanceId: card.instanceId, targetPlayerId: P2, targetTileID: 1 } };
    } },
    { id: 'A05', prepare: state => {
      const card = putCard(state, P1, 'A05'); return { card, request: { instanceId: card.instanceId, targetPlayerId: P2 } };
    } },
    { id: 'A06', prepare: state => {
      const card = putCard(state, P1, 'A06'); putCard(state, P2, 'U01');
      return { card, request: { instanceId: card.instanceId, targetPlayerId: P2 } };
    } },
    { id: 'A07', prepare: state => {
      const card = putCard(state, P1, 'A07'); return { card, request: { instanceId: card.instanceId, targetPlayerId: P2 } };
    } },
    { id: 'A08', prepare: state => {
      const card = putCard(state, P1, 'A08'); return { card, request: { instanceId: card.instanceId } };
    } },
    { id: 'A09', prepare: state => {
      state.boardState.ownedProps[1] = { id: P2, color: 'blue', houses: 1 };
      const card = putCard(state, P1, 'A09'); return { card, request: { instanceId: card.instanceId, targetPlayerId: P2 } };
    } },
    { id: 'A10', prepare: state => {
      const card = putCard(state, P1, 'A10'); return { card, request: { instanceId: card.instanceId, targetPlayerId: P2 } };
    } },
    { id: 'D04', prepare: state => {
      state.boardState.ownedProps[1] = { id: P1, color: 'red', houses: 0 };
      const card = putCard(state, P1, 'D04'); return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
    } },
    { id: 'D10', prepare: state => {
      const card = putCard(state, P1, 'D10');
      const negative = status('A05', 'BUILD_RESTRICTION', P2, { targetPlayerId: P1 });
      state.privateState.powerUps!.statuses = [negative];
      return { card, request: { instanceId: card.instanceId, statusId: negative.statusId } };
    } },
    ...(['U01', 'U02', 'U05', 'U08'] as const).map(id => ({
      id,
      prepare: (state: ReturnType<typeof subject>) => {
        const card = putCard(state, P1, id);
        state.boardState.rollSequence = 1;
        state.boardState.diceValue = { dice1: 1, dice2: 2 };
        state.boardState.currentPlayer.hasMoved = true;
        state.privateState.powerUps!.pendingMovement = {
          operationId: randomUUID(), playerId: P1, turnNumber: state.boardState.turnNumber,
          dice: { dice1: 1, dice2: 2 }, rollSequence: 1,
        };
        if (id === 'U05') return { card, request: { instanceId: card.instanceId, movementDelta: -3 } };
        if (id === 'U08') return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
        return { card, request: { instanceId: card.instanceId } };
      },
    })),
    { id: 'U03', prepare: state => {
      const card = putCard(state, P1, 'U03');
      state.turnInfo.pendingPropertyDecision = { operationId: randomUUID(), playerId: P1, tileID: 1,
        continuation: { playerId: P1, turnNumber: state.boardState.turnNumber } };
      return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
    } },
    { id: 'U04', prepare: state => {
      const card = putCard(state, P1, 'U04');
      const first = putCard(state, P1, 'A01'); const second = putCard(state, P1, 'A03');
      return { card, request: { instanceId: card.instanceId, ingredientInstanceIds: [first.instanceId, second.instanceId] } };
    } },
    { id: 'U06', prepare: state => {
      const card = putCard(state, P1, 'U06'); putCard(state, P1, 'A01'); putCard(state, P2, 'D01');
      return { card, request: { instanceId: card.instanceId, targetPlayerId: P2 } };
    } },
    { id: 'U07', prepare: state => {
      const card = putCard(state, P1, 'U07'); return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
    } },
    { id: 'U09', prepare: state => {
      const card = putCard(state, P1, 'U09');
      state.boardState.ownedProps[1] = { id: P1, color: 'red', houses: 0 };
      state.turnInfo.pendingDevelopmentDecision = { operationId: randomUUID(), playerId: P1,
        turnNumber: state.boardState.turnNumber, tileID: 1, levelAtLanding: 0, kind: 'HOUSES',
        continuation: { playerId: P1, turnNumber: state.boardState.turnNumber } };
      return { card, request: { instanceId: card.instanceId } };
    } },
    { id: 'U10', prepare: state => {
      const card = putCard(state, P1, 'U10'); putCard(state, P1, 'A02');
      return { card, request: { instanceId: card.instanceId, transformedInstanceId: state.privateState.powerUps!.inventories[P1].cards[1].instanceId, category: 'ATTACK' } };
    } },
  ];

  it.each(activationCases)('$id has a successful server activation handler', ({ id, prepare }) => {
    const state = subject();
    const activationTurn = state.boardState.turnNumber;
    const { card: instance, request } = prepare(state);
    expect(() => activatePowerUp(state, P1, request, 1_000)).not.toThrow();
    expect(state.privateState.powerUps!.activeUsage?.[P1]).toBe(activationTurn);
    if (id === 'U06') {
      expect(state.privateState.powerUps!.pendingTrade?.activatorInstanceId).toBe(instance.instanceId);
    } else {
      expect(state.privateState.powerUps!.inventories[P1].cards.some(item => item.instanceId === instance.instanceId)).toBe(false);
    }
    const afterFirstActivation = structuredClone(state);
    expect(() => activatePowerUp(state, P1, request, 2_000)).toThrow();
    expect(state).toEqual(afterFirstActivation);
  });

  it.each(activationCases)('$id rejects a foreign owner without mutating the room', ({ prepare }) => {
    const state = subject();
    const { request } = prepare(state);
    const before = structuredClone(state);
    expect(() => activatePowerUp(state, P2, request, 1_000)).toThrow();
    expect(state).toEqual(before);
  });

  it.each(activationCases)('$id rejects an invalid timing window without mutating the room', ({ id, prepare }) => {
    const state = subject();
    const { request } = prepare(state);
    state.boardState.currentPlayer.hasMoved = true;
    if (['U01', 'U02', 'U05', 'U08'].includes(id)) state.privateState.powerUps!.pendingMovement = null;
    if (id === 'U03') delete state.turnInfo.pendingPropertyDecision;
    if (id === 'U09') delete state.turnInfo.pendingDevelopmentDecision;
    const before = structuredClone(state);
    expect(() => activatePowerUp(state, P1, request, 1_000)).toThrow();
    expect(state).toEqual(before);
  });

  it.each(['D01', 'D08'] as const)('%s resolves an eligible rent Reaction through the payment path', definitionId => {
    const state = subject();
    state.boardState.ownedProps[1] = { id: P1, color: 'red', houses: 0 };
    const defense = putCard(state, P2, definitionId);
    const beforeDebtor = state.players[P2].accountBalance;
    const beforeLandlord = state.players[P1].accountBalance;
    const event = createPowerUpRentEvent(state, P2, P1, 1, 100, 6, 'DICE', {
      playerId: P2, turnNumber: state.boardState.turnNumber,
    }, 1_000)!;
    expect(openPowerUpRentReaction(state, event, 1_000)).toBe(true);
    expect(eligiblePowerUpReactionIds(state, P2)).toContain(defense.instanceId);
    respondPowerUpReaction(state, P2, {
      eventId: event.eventId, action: 'REACT', instanceId: defense.instanceId,
    }, 2_000);
    expect(state.privateState.powerUps!.inventories[P2].cards).not.toContain(defense);
    if (definitionId === 'D01') {
      expect(state.players[P2].accountBalance).toBe(beforeDebtor - 60);
      expect(state.players[P1].accountBalance).toBe(beforeLandlord + 60);
    } else {
      expect(state.players[P2].accountBalance).toBe(beforeDebtor);
      expect(state.players[P1].accountBalance).toBe(beforeLandlord + 100);
    }
  });

  it.each([
    { attack: 'A01', defense: 'D02' },
    { attack: 'A06', defense: 'D09' },
    { attack: 'A03', defense: 'D06' },
  ])('$defense blocks $attack before its effect commits', ({ attack, defense }) => {
    const state = subject();
    const attackCard = putCard(state, P1, attack);
    const defenseCard = putCard(state, P2, defense);
    if (attack === 'A06') putCard(state, P2, 'U01');
    const targetTileID = attack === 'A04' ? 1 : undefined;
    if (targetTileID !== undefined) state.boardState.ownedProps[targetTileID] = { id: P2, color: 'blue', houses: 0 };
    const beforeAttacker = state.players[P1].accountBalance;
    const beforeDefender = state.players[P2].accountBalance;
    activatePowerUp(state, P1, {
      instanceId: attackCard.instanceId, targetPlayerId: P2,
      ...(targetTileID === undefined ? {} : { targetTileID }),
    }, 1_000);
    const event = state.privateState.powerUps!.pendingReaction as PendingPowerUpReaction;
    expect(eligiblePowerUpReactionIds(state, P2)).toContain(defenseCard.instanceId);
    respondPowerUpReaction(state, P2, {
      eventId: event.eventId, action: 'REACT', instanceId: defenseCard.instanceId,
    }, 2_000);
    expect(state.privateState.powerUps!.statuses).toEqual([]);
    expect(state.privateState.powerUps!.inventories[P1].cards).not.toContain(attackCard);
    expect(state.privateState.powerUps!.inventories[P2].cards).not.toContain(defenseCard);
    expect(state.players[P1].accountBalance).toBe(beforeAttacker);
    expect(state.players[P2].accountBalance).toBe(beforeDefender);
  });

  it.each(['A03', 'A04', 'A05', 'A07', 'A10'] as const)('D03 blocks only the approved %s targeted status', attackId => {
    const state = subject();
    const attack = putCard(state, P1, attackId);
    const defense = putCard(state, P2, 'D03');
    let request: PowerUpActivationRequest = { instanceId: attack.instanceId, targetPlayerId: P2 };
    if (attackId === 'A04') {
      state.boardState.ownedProps[1] = { id: P2, color: 'blue', houses: 0 };
      request = { ...request, targetTileID: 1 };
    }
    activatePowerUp(state, P1, request, 1_000);
    const event = state.privateState.powerUps!.pendingReaction as PendingPowerUpReaction;
    respondPowerUpReaction(state, P2, {
      eventId: event.eventId, action: 'REACT', instanceId: defense.instanceId,
    }, 2_000);
    expect(state.privateState.powerUps!.statuses).toEqual([]);
    expect(state.privateState.powerUps!.inventories[P1].cards).not.toContain(attack);
    expect(state.privateState.powerUps!.inventories[P2].cards).not.toContain(defense);
  });

  it('reflects A01 using the attacker as payer and routes A04 to the attacker’s property', () => {
    const state = subject();
    state.players[P1].accountBalance = 1_000;
    state.players[P2].accountBalance = 1_000;
    const attack = putCard(state, P1, 'A01');
    const defense = putCard(state, P2, 'D05');
    const beforeDefender = state.players[P2].accountBalance;
    activatePowerUp(state, P1, { instanceId: attack.instanceId, targetPlayerId: P2 }, 1_000);
    let event = state.privateState.powerUps!.pendingReaction as PendingPowerUpReaction;
    respondPowerUpReaction(state, P2, { eventId: event.eventId, action: 'REACT', instanceId: defense.instanceId }, 2_000);
    expect(state.players[P1].accountBalance).toBe(950);
    expect(state.players[P2].accountBalance).toBe(beforeDefender + 50);

    state.boardState.turnNumber += 1;
    state.boardState.currentPlayer = { id: P1, hasMoved: false };
    state.boardState.ownedProps[1] = { id: P1, color: 'red', houses: 0 };
    state.boardState.ownedProps[2] = { id: P2, color: 'blue', houses: 0 };
    const rumor = putCard(state, P1, 'A04');
    const reflect = putCard(state, P2, 'D05');
    activatePowerUp(state, P1, { instanceId: rumor.instanceId, targetPlayerId: P2, targetTileID: 2 }, 3_000);
    event = state.privateState.powerUps!.pendingReaction as PendingPowerUpReaction;
    respondPowerUpReaction(state, P2, {
      eventId: event.eventId, action: 'REACT', instanceId: reflect.instanceId, redirectTileID: 1,
    }, 4_000);
    expect(state.privateState.powerUps!.statuses).toHaveLength(1);
    expect(state.privateState.powerUps!.statuses![0].targetTileID).toBe(1);
    expect(state.privateState.powerUps!.statuses![0].targetPlayerId).toBe(P1);
  });
});
