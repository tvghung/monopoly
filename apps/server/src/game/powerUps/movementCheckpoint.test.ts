import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gameplaySemanticEventSchema } from '@monopoly/shared';
import { P1, subject, putCard } from './testFixtures';
import { activatePowerUp, continuePowerUpMovement, shouldPauseBeforeMovement } from './runtime';
import { projectLivePowerUpOwnerState } from './rewards';
import { assertSupportedRoomSnapshot, createRoomSnapshot, storeGameState, hydrateGameState } from '../../rooms';

function checkpoint(id = 'U02', from = 39) {
  const state = subject(); const card = putCard(state, P1, id); const operationId = randomUUID();
  state.players[P1].currentTile = from; state.boardState.rollSequence = 9;
  state.boardState.diceValue = {dice1:6,dice2:6}; state.boardState.currentPlayer.hasMoved = true;
  state.privateState.powerUps!.pendingMovement = {operationId,playerId:P1,turnNumber:state.boardState.turnNumber,dice:{dice1:6,dice2:6},rollSequence:9};
  return {state,card,operationId};
}
const moved = (state: ReturnType<typeof subject>) => state.boardState.gameplayEvents.events.find(event => event.type === 'PLAYER_MOVED');

describe('OB-8 committed checkpoint movement', () => {
  it.each([false,true])('N=12, use U02=%s: one exact path, unchanged dice, one START reward and stale replay refusal', use => {
    const {state,card,operationId} = checkpoint(); const balance = state.players[P1].accountBalance;
    if (use) activatePowerUp(state,P1,{instanceId:card.instanceId,operationId},1000);
    else continuePowerUpMovement(state,P1,operationId,1000);
    expect(state.players[P1].currentTile).toBe(use?13:11);
    expect(state.boardState.diceValue).toEqual({dice1:6,dice2:6});
    expect(moved(state)).toMatchObject({operationId,playerId:P1,fromTile:39,destinationTile:use?13:11,steps:use?14:12,presentation:'WALK',rollSequence:9});
    expect(gameplaySemanticEventSchema.safeParse(moved(state)).success).toBe(true);
    expect(state.players[P1].accountBalance).toBe(balance+200);
    expect(state.boardState.gameplayEvents.events.filter(event=>event.type==='PASS_GO')).toHaveLength(1);
    expect(state.privateState.powerUps!.inventories[P1].cards.some(item=>item.instanceId===card.instanceId)).toBe(!use);
    expect(projectLivePowerUpOwnerState(state,P1).activeUsedThisTurn).toBe(use);
    const snapshot=createRoomSnapshot();storeGameState(snapshot,state,'IN_PROGRESS');
    expect(hydrateGameState(snapshot,'IN_PROGRESS').boardState.gameplayEvents).toEqual(state.boardState.gameplayEvents);
    const before=structuredClone(state);expect(()=>continuePowerUpMovement(state,P1,operationId,1001)).toThrow();expect(state).toEqual(before);
  });
  it('refuses a stale activation operation without spending the card or allowance',()=>{
    const {state,card}=checkpoint();const before=structuredClone(state);
    expect(()=>activatePowerUp(state,P1,{instanceId:card.instanceId,operationId:randomUUID()},1000)).toThrow();expect(state).toEqual(before);
  });
  it.each([-3,3])('U05 records exact adjusted steps delta=%s',movementDelta=>{
    const {state,card,operationId}=checkpoint('U05',0);activatePowerUp(state,P1,{instanceId:card.instanceId,operationId,movementDelta},1000);
    expect(moved(state)).toMatchObject({steps:12+movementDelta,presentation:'WALK',destinationTile:12+movementDelta});expect(state.boardState.diceValue).toEqual({dice1:6,dice2:6});
  });
  it('U08 to the same destination as a 14-step walk still records TELEPORT',()=>{
    const {state,card,operationId}=checkpoint('U08');activatePowerUp(state,P1,{instanceId:card.instanceId,operationId,targetTileID:13},1000);
    expect(moved(state)).toMatchObject({steps:0,presentation:'TELEPORT',fromTile:39,destinationTile:13});expect(state.boardState.diceValue).toEqual({dice1:6,dice2:6});
  });
  it('U01 records its rerolled dice path, and no card/used allowance does not request a new checkpoint',()=>{
    const {state,card,operationId}=checkpoint('U01',0);activatePowerUp(state,P1,{instanceId:card.instanceId,operationId},1000);
    const total=state.boardState.diceValue.dice1+state.boardState.diceValue.dice2;expect(moved(state)).toMatchObject({steps:total,presentation:'WALK',destinationTile:total});
    expect(shouldPauseBeforeMovement(state,P1)).toBe(false);expect(shouldPauseBeforeMovement(subject(),P1)).toBe(false);
  });
});


it('rejects malformed path facts and historical snapshot 14 envelopes',()=>{
  const {state,operationId}=checkpoint();continuePowerUpMovement(state,P1,operationId,1000);const event=moved(state)!;
  for(const patch of [{steps:16},{steps:0},{destinationTile:20},{operationId:undefined},{presentation:'GUESS'},{definitionId:'U02'}])expect(gameplaySemanticEventSchema.safeParse({...event,...patch}).success).toBe(false);
  expect(()=>assertSupportedRoomSnapshot({snapshotSchemaVersion:14,gameSnapshot:createRoomSnapshot()})).toThrow();
});
