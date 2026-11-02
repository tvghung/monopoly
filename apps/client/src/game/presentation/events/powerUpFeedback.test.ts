import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PowerUpOwnerState, PowerUpDefinition, PrivatePlayerState } from '@monopoly/shared';
import { makeRoom } from '../testFixtures';
import { PresentationController } from '../PresentationController';
import { derivePowerUpFeedback } from './powerUpFeedback';

function owner(id = 'A01', rarity: PowerUpDefinition['rarity'] = 'COMMON'): PowerUpOwnerState {
  const definition: PowerUpDefinition = { definitionId:id, name:id, description:id, rarity, category:id.startsWith('A')?'ATTACK':'DEFENSE', activation:'ACTIVE', effectKey:'TEST' };
  return { activeOfferId:null,offers:[],activeUsedThisTurn:false,statuses:[],inventory:{capacity:3,cards:[{instanceId:'instance',definitionId:id,ownerPlayerId:'player-a',obtainedFromOfferId:'offer',definition}]}};
}
const privateState = (powerUps:PowerUpOwnerState):PrivatePlayerState=>({playerId:'player-a',heldJailFreeCardIds:[],gameplayEvents:{sequence:0,events:[]},powerUps});

afterEach(() => vi.useRealTimers());

describe('08B shared-queue Power-up feedback',()=>{
  it.each([['A01','COMMON','ATTACK'],['D08','LEGENDARY','LEGENDARY'],['D05','RARE','REFLECT'],['D03','COMMON','BLOCK']])('%s emits the committed owner feedback %s', (id,rarity,kind)=>{
    const before=owner(id,rarity as PowerUpDefinition['rarity']);if(id.startsWith('D'))before.reaction={kind:'ATTACK',eventId:'event',deadlineAt:new Date().toISOString(),eligibleInstanceIds:['instance']};
    const after=structuredClone(before);after.inventory!.cards=[];after.activeUsedThisTurn=true;after.reaction=null;
    expect(derivePowerUpFeedback(before,after,makeRoom()).map(event=>event.kind)).toEqual(['CONSUMED']);expect(kind).toBeTruthy();
  });
  it('shield creation, charge reduction, final block and owner-turn expiry are distinct',()=>{
    const room=makeRoom();const before=owner('D04');const active=structuredClone(before);active.inventory!.cards=[];active.statuses=[{statusId:'shield',definitionId:'D04',kind:'PROPERTY_SHIELD',remainingUses:2,remainingOwnerTurns:3,targetTileID:1}];
    expect(derivePowerUpFeedback(before,active,room).map(e=>e.kind)).toContain('SHIELD');const used=structuredClone(active);used.statuses![0].remainingUses=1;expect(derivePowerUpFeedback(active,used,room).map(e=>e.kind)).toEqual(['BLOCK']);const ended=structuredClone(used);ended.statuses=[];
    expect(derivePowerUpFeedback(used,ended,room,room.gameState.boardState.turnNumber).map(e=>e.kind)).toEqual(['BLOCK']);expect(derivePowerUpFeedback(used,ended,room,room.gameState.boardState.turnNumber-1).map(e=>e.kind)).toEqual(['EXPIRED']);
  });
  it('sync, hidden updates and reduced motion safely bypass historic feedback',async()=>{
    const room=makeRoom();const controller=new PresentationController();controller.acceptRoomSnapshot(room,'SESSION_SYNC');const before=owner();const after=structuredClone(before);after.inventory!.cards=[];after.activeUsedThisTurn=true;controller.acceptPrivatePlayerState(privateState(before),room,'SESSION_SYNC');controller.acceptPrivatePlayerState(privateState(after),room,'SESSION_SYNC');expect(controller.getState().powerUpFeedback).toBeFalsy();controller.setVisibility(true);controller.acceptPrivatePlayerState(privateState(before),room,'LIVE_UPDATE');controller.acceptPrivatePlayerState(privateState(after),room,'LIVE_UPDATE');expect(controller.queue.getStatus()).toBe('idle');controller.setVisibility(false);controller.setPreferences(true,1);controller.acceptPrivatePlayerState(privateState(before),room,'SESSION_SYNC');controller.acceptPrivatePlayerState(privateState(after),room,'LIVE_UPDATE');await controller.queue.whenIdle();expect(controller.getState().powerUpFeedback?.kind).toBe('CONSUMED');controller.dispose();
  });
  it('skip and reconnect cancel feedback and target highlighting through the existing reset',async()=>{
    const room=makeRoom();const controller=new PresentationController();controller.acceptRoomSnapshot(room,'SESSION_SYNC');const before=owner();const after=structuredClone(before);after.inventory!.cards=[];after.activeUsedThisTurn=true;controller.acceptPrivatePlayerState(privateState(before),room,'SESSION_SYNC');controller.acceptPrivatePlayerState(privateState(after),room,'LIVE_UPDATE');await Promise.resolve();expect(controller.getState().powerUpFeedback?.kind).toBe('CONSUMED');controller.store.setPowerUpTargets({validTileIds:[1],selectedTileId:1});controller.acceptRoomSnapshot(room,'SESSION_SYNC');await controller.queue.whenIdle();expect(controller.getState().powerUpFeedback).toBeFalsy();expect(controller.getState().powerUpTargets).toBeFalsy();controller.dispose();
  });
});


it('ACK-proven reflection uses the same queue and ignores a stale reconnect epoch',async()=>{const room=makeRoom();const controller=new PresentationController();controller.acceptRoomSnapshot(room,'SESSION_SYNC');const epoch=controller.getState().presentationResetEpoch;controller.showPowerUpFeedback('REFLECT','D05','Reflect','card',epoch);await Promise.resolve();expect(controller.getState().powerUpFeedback?.kind).toBe('REFLECT');controller.acceptRoomSnapshot(room,'SESSION_SYNC');await controller.queue.whenIdle();controller.showPowerUpFeedback('REFLECT','D05','Reflect','card',epoch);expect(controller.getState().powerUpFeedback).toBeFalsy();expect(controller.queue.getStatus()).toBe('idle');controller.dispose()});

it('newly authorized cards use the existing queue for acquisition and Legendary discovery; sync stays silent',async()=>{
  const room=makeRoom();const before=owner();before.inventory!.cards=[];const after=owner();
  expect(derivePowerUpFeedback(before,after,room).map(event=>event.kind)).toEqual(['ACQUIRED']);
  const legendary=owner('A08','LEGENDARY');expect(derivePowerUpFeedback(before,legendary,room).map(event=>event.kind)).toEqual(['LEGENDARY']);
  const controller=new PresentationController();controller.acceptRoomSnapshot(room,'SESSION_SYNC');controller.acceptPrivatePlayerState(privateState(before),room,'SESSION_SYNC');controller.acceptPrivatePlayerState(privateState(after),room,'SESSION_SYNC');expect(controller.getState().powerUpFeedback).toBeFalsy();controller.acceptPrivatePlayerState(privateState(before),room,'SESSION_SYNC');controller.acceptPrivatePlayerState(privateState(after),room,'LIVE_UPDATE');await Promise.resolve();expect(controller.getState().powerUpFeedback?.kind).toBe('ACQUIRED');controller.acceptRoomSnapshot(room,'SESSION_SYNC');await controller.queue.whenIdle();expect(controller.getState().powerUpFeedback).toBeFalsy();controller.dispose();
});


it.each([false, true])('keeps independent feedback readable for 5s without a gameplay lock (reduced=%s)', async reduced => {
  vi.useFakeTimers();
  const controller = new PresentationController(reduced, 2); const room = makeRoom();
  controller.acceptRoomSnapshot(room, 'SESSION_SYNC'); const epoch = controller.getState().presentationResetEpoch;
  controller.showPowerUpFeedback('ATTACK', 'A01', 'First', 'first', epoch);
  controller.showPowerUpFeedback('ATTACK', 'A01', 'Second same definition', 'second', epoch);
  await controller.queue.whenIdle();
  expect(controller.queue.getStatus()).toBe('idle');
  expect(controller.getState().powerUpFeedback?.name).toBe('First');
  await vi.advanceTimersByTimeAsync(4999);
  expect(controller.getState().powerUpFeedback?.name).toBe('First');
  await vi.advanceTimersByTimeAsync(1);
  expect(controller.getState().powerUpFeedback?.name).toBe('Second same definition');
  await vi.advanceTimersByTimeAsync(5000); expect(controller.getState().powerUpFeedback).toBeNull();
  controller.dispose();
});

it.each([false, true])('merges removal and ACK by exact instance, regardless of arrival order (ackFirst=%s)', async ackFirst => {
  vi.useFakeTimers(); const controller = new PresentationController(); const room = makeRoom();
  controller.acceptRoomSnapshot(room, 'SESSION_SYNC'); const before = owner(); const after = structuredClone(before); after.inventory!.cards = [];
  controller.acceptPrivatePlayerState(privateState(before), room, 'SESSION_SYNC'); const epoch = controller.getState().presentationResetEpoch;
  const ack = () => controller.showPowerUpFeedback('ATTACK', 'A01', 'A01', 'instance', epoch);
  if (ackFirst) ack();
  controller.acceptPrivatePlayerState(privateState(after), room, 'LIVE_UPDATE'); await controller.queue.whenIdle();
  if (!ackFirst) ack();
  ack(); await controller.queue.whenIdle();
  expect(controller.getState().powerUpFeedback?.kind).toBe('ATTACK');
  await vi.advanceTimersByTimeAsync(5000); expect(controller.getState().powerUpFeedback).toBeNull();
  controller.dispose();
});

it('keeps status facts, theft and ingredient removal without inventing successful activation', async () => {
  vi.useFakeTimers(); const controller = new PresentationController(); const room = makeRoom();
  controller.acceptRoomSnapshot(room, 'SESSION_SYNC'); const before = owner(); const after = structuredClone(before);
  after.inventory!.cards = []; after.statuses = [{statusId:'independent-status',definitionId:'A03',kind:'PURCHASE_SURCHARGE',name:'Surcharge'}];
  controller.acceptPrivatePlayerState(privateState(before), room, 'SESSION_SYNC');
  controller.acceptPrivatePlayerState(privateState(after), room, 'LIVE_UPDATE'); await controller.queue.whenIdle();
  expect(controller.getState().powerUpFeedback?.kind).toBe('CONSUMED');
  await vi.advanceTimersByTimeAsync(5000); expect(controller.getState().powerUpFeedback?.kind).toBe('STATUS');
  controller.acceptRoomSnapshot(room, 'SESSION_SYNC'); await vi.advanceTimersByTimeAsync(10000);
  expect(controller.getState().powerUpFeedback).toBeFalsy(); controller.dispose();
});


it('does not replay a completed removal when its successful ACK arrives late', async () => {
  vi.useFakeTimers(); const controller = new PresentationController(); const room = makeRoom();
  controller.acceptRoomSnapshot(room, 'SESSION_SYNC'); const before = owner(); const after = structuredClone(before); after.inventory!.cards = [];
  controller.acceptPrivatePlayerState(privateState(before), room, 'SESSION_SYNC');
  controller.acceptPrivatePlayerState(privateState(after), room, 'LIVE_UPDATE'); await controller.queue.whenIdle();
  await vi.advanceTimersByTimeAsync(6000);
  controller.showPowerUpFeedback('ATTACK', 'A01', 'A01', 'instance', controller.getState().presentationResetEpoch);
  await controller.queue.whenIdle(); expect(controller.getState().powerUpFeedback).toBeNull(); controller.dispose();
});
