import { describe, expect, it } from 'vitest';
import { activityEventSchema } from '@monopoly/shared';
import { subject, P1, P2, activationCasesFor, putCard } from './testFixtures';
import { activatePowerUp, resolvePowerUpTrade, respondPowerUpReaction } from './runtime';
import { resolvePowerUpReward, selectPowerUpReward, autoResolvePowerUpRewards } from './rewards';
import { moveBy } from '../dice';
import { nextPowerUpReward } from './foundation';
import { recordPowerUpReceived } from './activity';
const events = (state: ReturnType<typeof subject>) => state.boardState.activityFeed.events.filter(event => event.type.startsWith('POWER_UP_'));
function reward(state: ReturnType<typeof subject>) { state.players[P1].currentTile=39; moveBy(state,P1,1); const offer=nextPowerUpReward(state,P1)!; selectPowerUpReward(state,P1,{offerId:offer.offerId,selectedIndex:0}); return offer; }
describe('OB-12 committed Power-up activity boundaries',()=>{
  it('receipt has only public identity, is absent before grant, and repeated claims do not append',()=>{
    const state=subject(); const offer=reward(state); expect(events(state)).toEqual([]);
    resolvePowerUpReward(state,P1,{offerId:offer.offerId,action:'CLAIM'}); const first=structuredClone(events(state));
    for(let i=0;i<3;i++)resolvePowerUpReward(state,P1,{offerId:offer.offerId,action:'CLAIM'});
    expect(events(state)).toEqual(first);expect(first).toHaveLength(1);
    expect(Object.keys(first[0]).sort()).toEqual(['eventId','occurredAt','playerId','playerName','sequence','type']);
    expect(activityEventSchema.safeParse({...first[0],definitionId:'A01'}).success).toBe(false);
    reward(state);resolvePowerUpReward(state,P1,{offerId:nextPowerUpReward(state,P1)!.offerId,action:'CLAIM'});
    expect(events(state)).toHaveLength(2);expect(events(state)[0].eventId).not.toBe(events(state)[1].eventId);
  });
  it.each(['DECLINE','REPLACE','AUTO'] as const)('full inventory %s reports only an actual acquired card',action=>{
    const state=subject();const offer=reward(state);for(let i=0;i<3;i++)putCard(state,P1,'A01');
    resolvePowerUpReward(state,P1,{offerId:offer.offerId,action:'CLAIM'});expect(events(state)).toEqual([]);
    if(action==='AUTO')autoResolvePowerUpRewards(state,P1);
    else resolvePowerUpReward(state,P1,action==='REPLACE'?{offerId:offer.offerId,action,replaceInstanceId:state.privateState.powerUps!.inventories[P1].cards[0].instanceId}:{offerId:offer.offerId,action});
    expect(events(state)).toHaveLength(action==='REPLACE'?1:0);
  });
  it.each(['A06','U04','U10'] as const)('%s receives an output without naming it or using ingredients',id=>{
    const state=subject();const {request}=activationCasesFor().find(c=>c.id===id)!.prepare(state);activatePowerUp(state,P1,request,1000);
    const log=events(state);expect(log.filter(e=>e.type==='POWER_UP_USED').map(e=>e.definitionId)).toEqual([id]);
    expect(log.filter(e=>e.type==='POWER_UP_RECEIVED').map(e=>e.playerId)).toEqual([P1]);
  });
  it.each(['accepted','declined','expired'] as const)('U06 %s logs only actual committed exchange',mode=>{
    const state=subject();const {request}=activationCasesFor().find(c=>c.id==='U06')!.prepare(state);activatePowerUp(state,P1,request,1000);expect(events(state)).toEqual([]);
    const trade=state.privateState.powerUps!.pendingTrade!;resolvePowerUpTrade(state,P2,{requestId:trade.requestId,accept:mode!=='declined'},mode==='expired'?Date.parse(trade.deadlineAt):2000);
    const log=events(state);expect(log.map(e=>e.type)).toEqual(mode==='accepted'?['POWER_UP_USED','POWER_UP_RECEIVED','POWER_UP_RECEIVED']:[]);
    const before=structuredClone(log);expect(()=>resolvePowerUpTrade(state,P2,{requestId:trade.requestId,accept:true},2001)).toThrow();expect(events(state)).toEqual(before);
  });
  it('A06 reflection credits the actual receiver and publishes use only at resolution',()=>{
    const state=subject();const {request}=activationCasesFor().find(c=>c.id==='A06')!.prepare(state);putCard(state,P1,'A01');const defense=putCard(state,P2,'D05');
    activatePowerUp(state,P1,request,1000);expect(events(state)).toEqual([]);const event=state.privateState.powerUps!.pendingReaction!;
    respondPowerUpReaction(state,P2,{eventId:event.eventId,action:'REACT',instanceId:defense.instanceId},2000);
    expect(events(state).filter(e=>e.type==='POWER_UP_RECEIVED').map(e=>e.playerId)).toEqual([P2]);
    expect(events(state).filter(e=>e.type==='POWER_UP_USED').map(e=>e.definitionId).sort()).toEqual(['A06','D05']);
  });
  it('keeps bounded history and independent identical messages',()=>{
    const state=subject();for(let i=0;i<510;i++)recordPowerUpReceived(state,P1);expect(state.boardState.activityFeed.events).toHaveLength(128);expect(state.boardState.logs).toHaveLength(500);expect(state.boardState.activityFeed.sequence).toBe(510);
    expect(new Set(events(state).map(e=>e.eventId)).size).toBe(128);
  });
});
