import { randomUUID } from 'node:crypto';
import type { PowerUpActivationRequest, PowerUpInstance, PowerUpStatus } from '@monopoly/shared';
import { createFreshPlayer, freshState } from '../../rooms';
import { createPowerUpInventory, createPowerUpState } from './foundation';

export const P1 = '00000000-0000-4000-8000-000000000001';
export const P2 = '00000000-0000-4000-8000-000000000002';

export function subject() {
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

export function card(ownerPlayerId: string, definitionId: string): PowerUpInstance {
  return { instanceId: randomUUID(), ownerPlayerId, definitionId, obtainedFromOfferId: randomUUID() };
}

export function putCard(state: ReturnType<typeof subject>, owner: string, definitionId: string): PowerUpInstance {
  const instance = card(owner, definitionId);
  state.privateState.powerUps!.inventories[owner].cards.push(instance);
  return instance;
}

export function status(
  definitionId: PowerUpStatus['definitionId'],
  kind: PowerUpStatus['kind'],
  sourcePlayerId: string,
  values: Partial<PowerUpStatus> = {},
): PowerUpStatus {
  return {
    statusId: randomUUID(), definitionId, kind, sourceInstanceId: randomUUID(), sourcePlayerId, ...values,
  };
}

export function activationCasesFor(actorId = P1, targetId = P2) {
  const activationCases: Array<{
    id: string;
    prepare: (state: ReturnType<typeof subject>) => { card: PowerUpInstance; request: PowerUpActivationRequest };
  }> = [
    { id: 'A01', prepare: state => {
      const card = putCard(state, actorId, 'A01'); return { card, request: { instanceId: card.instanceId, targetPlayerId: targetId } };
    } },
    { id: 'A02', prepare: state => {
      state.boardState.ownedProps[1] = { id: actorId, color: 'red', houses: 0 };
      const card = putCard(state, actorId, 'A02'); return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
    } },
    { id: 'A03', prepare: state => {
      const card = putCard(state, actorId, 'A03'); return { card, request: { instanceId: card.instanceId, targetPlayerId: targetId } };
    } },
    { id: 'A04', prepare: state => {
      state.boardState.ownedProps[1] = { id: targetId, color: 'blue', houses: 0 };
      const card = putCard(state, actorId, 'A04'); return { card, request: { instanceId: card.instanceId, targetPlayerId: targetId, targetTileID: 1 } };
    } },
    { id: 'A05', prepare: state => {
      const card = putCard(state, actorId, 'A05'); return { card, request: { instanceId: card.instanceId, targetPlayerId: targetId } };
    } },
    { id: 'A06', prepare: state => {
      const card = putCard(state, actorId, 'A06'); putCard(state, targetId, 'U01');
      return { card, request: { instanceId: card.instanceId, targetPlayerId: targetId } };
    } },
    { id: 'A07', prepare: state => {
      const card = putCard(state, actorId, 'A07'); return { card, request: { instanceId: card.instanceId, targetPlayerId: targetId } };
    } },
    { id: 'A08', prepare: state => {
      const card = putCard(state, actorId, 'A08'); return { card, request: { instanceId: card.instanceId } };
    } },
    { id: 'A09', prepare: state => {
      state.boardState.ownedProps[1] = { id: targetId, color: 'blue', houses: 1 };
      const card = putCard(state, actorId, 'A09'); return { card, request: { instanceId: card.instanceId, targetPlayerId: targetId } };
    } },
    { id: 'A10', prepare: state => {
      const card = putCard(state, actorId, 'A10'); return { card, request: { instanceId: card.instanceId, targetPlayerId: targetId } };
    } },
    { id: 'D04', prepare: state => {
      state.boardState.ownedProps[1] = { id: actorId, color: 'red', houses: 0 };
      const card = putCard(state, actorId, 'D04'); return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
    } },
    { id: 'D10', prepare: state => {
      const card = putCard(state, actorId, 'D10');
      const negative = status('A05', 'BUILD_RESTRICTION', targetId, { targetPlayerId: actorId });
      state.privateState.powerUps!.statuses = [negative];
      return { card, request: { instanceId: card.instanceId, statusId: negative.statusId } };
    } },
    ...(['U01', 'U02', 'U05', 'U08'] as const).map(id => ({
      id,
      prepare: (state: ReturnType<typeof subject>) => {
        const card = putCard(state, actorId, id);
        state.boardState.rollSequence = 1;
        state.boardState.diceValue = { dice1: 1, dice2: 2 };
        state.boardState.currentPlayer.hasMoved = true;
        state.privateState.powerUps!.pendingMovement = {
          operationId: randomUUID(), playerId: actorId, turnNumber: state.boardState.turnNumber,
          dice: { dice1: 1, dice2: 2 }, rollSequence: 1,
        };
        if (id === 'U05') return { card, request: { instanceId: card.instanceId, movementDelta: -3 } };
        if (id === 'U08') return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
        return { card, request: { instanceId: card.instanceId } };
      },
    })),
    { id: 'U03', prepare: state => {
      state.players[actorId].currentTile = 1;
      const card = putCard(state, actorId, 'U03');
      state.turnInfo.pendingPropertyDecision = { operationId: randomUUID(), playerId: actorId, tileID: 1,
        continuation: { playerId: actorId, turnNumber: state.boardState.turnNumber } };
      return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
    } },
    { id: 'U04', prepare: state => {
      const card = putCard(state, actorId, 'U04');
      const first = putCard(state, actorId, 'A01'); const second = putCard(state, actorId, 'A03');
      return { card, request: { instanceId: card.instanceId, ingredientInstanceIds: [first.instanceId, second.instanceId] } };
    } },
    { id: 'U06', prepare: state => {
      const card = putCard(state, actorId, 'U06'); putCard(state, actorId, 'A01'); putCard(state, targetId, 'D01');
      return { card, request: { instanceId: card.instanceId, targetPlayerId: targetId } };
    } },
    { id: 'U07', prepare: state => {
      const card = putCard(state, actorId, 'U07'); return { card, request: { instanceId: card.instanceId, targetTileID: 1 } };
    } },
    { id: 'U09', prepare: state => {
      state.players[actorId].currentTile = 1;
      const card = putCard(state, actorId, 'U09');
      state.boardState.ownedProps[1] = { id: actorId, color: 'red', houses: 0 };
      state.turnInfo.pendingDevelopmentDecision = { operationId: randomUUID(), playerId: actorId,
        turnNumber: state.boardState.turnNumber, tileID: 1, levelAtLanding: 0, kind: 'HOUSES',
        continuation: { playerId: actorId, turnNumber: state.boardState.turnNumber } };
      return { card, request: { instanceId: card.instanceId } };
    } },
    { id: 'U10', prepare: state => {
      const card = putCard(state, actorId, 'U10'); putCard(state, actorId, 'A02');
      return { card, request: { instanceId: card.instanceId, transformedInstanceId: state.privateState.powerUps!.inventories[actorId].cards[1].instanceId, category: 'ATTACK' } };
    } },
  ];

return activationCases;
}
