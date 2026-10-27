import { describe, expect, it, vi } from 'vitest';
import { POWER_UP_CATEGORIES } from '@monopoly/shared';
import { P1, P2, subject, putCard, status, activationCasesFor } from './testFixtures';
import { activatePowerUp, eligiblePowerUpReactionIds, respondPowerUpReaction, resolvePowerUpTrade, expirePowerUpInteraction, playerBuildRestricted } from './runtime';
import { applyPowerUpRentModifiers, powerUpPurchasePrice, powerUpBuildPrice, resolvePowerUpRent, createPowerUpRentEvent } from './economy';
import { beginPowerUpPlayerTurn, completePowerUpOwnerTurn, removePowerUpPlayerState } from './lifecycle';
import { OFFICIAL_POWER_UP_REGISTRY } from './catalog';
import { enqueuePayments } from '../payment';
import { progressPaymentQueue } from '../paymentResolution';
import { acceptEmergencyRescue } from '../rescueResolution';
import { removePlayerFromGame, nextTurn } from '../turn';

vi.mock('node:crypto', async importOriginal => ({ ...await importOriginal<typeof import('node:crypto')>(), randomInt: (upper: number) => upper - 1 }));

const P3 = '00000000-0000-4000-8000-000000000003';
const prepare = (id: string) => { const state = subject(); const value = activationCasesFor().find(c => c.id === id)!.prepare(state); return { state, ...value }; };
const rent = (state: ReturnType<typeof subject>, base: number, defense: string | null = null) => {
  state.boardState.ownedProps[1] = { id: P2, color: 'blue', houses: 0 };
  return resolvePowerUpRent(state, createPowerUpRentEvent(state, P1, P2, 1, base, 6, 'DICE', { playerId: P1, turnNumber: state.boardState.turnNumber, resume: { kind: 'NO_TURN_CHANGE' } }, 1000)!, defense, null, 2000, false);
};

describe('08B financial boundaries and explicit combinations', () => {
  it.each([1, 9, 10, 499, 500, 501, 10000])('A01 cash=%i floors ten percent and caps at 50', cash => {
    const { state, request } = prepare('A01'); state.players[P2].accountBalance = cash;
    activatePowerUp(state, P1, request, 1000);
    const amount = Math.min(50, Math.floor(cash / 10));
    expect(state.players[P2].accountBalance).toBe(cash - amount); expect(state.players[P1].accountBalance).toBe(1500 + amount);
  });
  it.each([0, -1])('A01 rejects unavailable cash %i before consumption', cash => {
    const { state, request } = prepare('A01'); state.players[P2].accountBalance = cash; const before = structuredClone(state);
    expect(() => activatePowerUp(state, P1, request, 1000)).toThrow(); expect(state).toEqual(before);
  });
  it.each([1, 3, 101, 250, 400])('A02+A04+A08 rent=%i uses strongest components once', base => {
    const state = subject(); state.privateState.powerUps!.statuses = [status('A02','RENT_MODIFIER',P2,{ targetTileID:1,percent:25,remainingUses:1 }), status('A04','RENT_MODIFIER',P1,{ targetTileID:1,percent:-25,remainingUses:2 }),status('A08','RENT_MODIFIER',P1,{affectedPlayerIds:[P2],percent:-50})];
    const amount=base+Math.ceil(base*.25)-Math.floor(base*.5); rent(state,base);
    expect(state.players[P1].accountBalance).toBe(1500-amount);expect(state.players[P2].accountBalance).toBe(1500+amount);
    expect(state.privateState.powerUps!.statuses?.map(s=>s.definitionId)).toEqual(['A04','A08']);
  });
  it.each([1, 101, 250, 400])('A03+U03 purchase=%i has independent caps and rounding', base => {
    const { state, request } = prepare('U03');state.privateState.powerUps!.statuses=[status('A03','PURCHASE_SURCHARGE',P2,{targetPlayerId:P1,percent:20,capUnits:50})];activatePowerUp(state,P1,request,1000);
    expect(powerUpPurchasePrice(state,P1,1,base)).toBe(base+Math.min(50,Math.ceil(base*.2))-Math.min(50,Math.floor(base*.15)));
    expect(powerUpPurchasePrice(state,P1,3,base)).toBe(base+Math.min(50,Math.ceil(base*.2)));
  });
  it.each([1, 249, 250, 400])('U09 build=%i discounts once and A05 blocks voluntary building', base=>{
    const {state,request}=prepare('U09');activatePowerUp(state,P1,request,1000);expect(powerUpBuildPrice(state,P1,base)).toBe(base-Math.min(50,Math.floor(base*.2)));
    state.privateState.powerUps!.statuses!.push(status('A05','BUILD_RESTRICTION',P2,{targetPlayerId:P1}));expect(playerBuildRestricted(state,P1)).toBe(true);
  });
  it.each(['D01','D08',null])('A07+A10+%s keeps creditors and bank surcharge separate', defense=>{
    const state=subject();state.privateState.powerUps!.statuses=[status('A07','RENT_SHARE',P1,{targetPlayerId:P2,percent:50,capUnits:100,remainingUses:1}),status('A10','RENT_SURCHARGE',P2,{targetPlayerId:P1,percent:50,capUnits:100,remainingUses:1})];
    rent(state,300,defense);const due=defense==='D01'?220:300;const bank=defense==='D08'?200:0;
    // P1 is both debtor and A07 beneficiary: 100 diverted income returns to P1.
    expect(state.players[P1].accountBalance).toBe(1500-(due-bank)-100+100);expect(state.players[P2].accountBalance).toBe(1500+due-100);expect(state.privateState.powerUps!.statuses).toEqual([]);
  });
  it.each([1, 101, 199, 200, 201, 1000])('D01/D08 rent=%i have exact caps', base=>{
    for(const defense of ['D01','D08']){const state=subject();rent(state,base,defense);const discount=defense==='D01'?Math.min(80,Math.floor(base*.4)):0;const contribution=defense==='D08'?Math.min(200,base):0;expect(state.players[P1].accountBalance).toBe(1500-base+discount+contribution);expect(state.players[P2].accountBalance).toBe(1500+base-discount)}
  });
  it.each([1, 99, 100, 101, 250])('D07 shortfall=%i contributes at most 100 without duplicating credit', shortfall=>{
    const state=subject();state.players[P1].accountBalance=50;state.boardState.ownedProps[1]={id:P1,color:'red',houses:0};const defense=putCard(state,P1,'D07');
    enqueuePayments(state,[{debtorPlayerId:P1,creditor:'PLAYER',creditorPlayerId:P2,amount:50+shortfall,source:{kind:'OTHER',description:'boundary'}}],{playerId:P1,turnNumber:state.boardState.turnNumber,resume:{kind:'NO_TURN_CHANGE'}},{now:1000});progressPaymentQueue(state,{now:1000});const event=state.privateState.powerUps!.pendingReaction!;
    respondPowerUpReaction(state,P1,{eventId:event.eventId,action:'REACT',instanceId:defense.instanceId},2000);
    expect(state.players[P2].accountBalance).toBe(1550+Math.min(100,shortfall));expect(state.players[P1].accountBalance).toBe(0);expect(state.boardState.paymentQueue?.orderedClaims[0]?.remainingAmount??0).toBe(Math.max(0,shortfall-100));
    const before=structuredClone(state);expect(()=>respondPowerUpReaction(state,P1,{eventId:event.eventId,action:'REACT',instanceId:defense.instanceId},2001)).toThrow();expect(state).toEqual(before);
  });
});

describe('08B recipes, targeting, movement and lifecycle',()=>{
  it.each([['A01','D01','RARE'],['A01','A05','EPIC'],['A05','D05','EPIC'],['A01','A07','LEGENDARY'],['A05','D07','LEGENDARY'],['A07','D07','LEGENDARY']])('U04 %s + %s yields %s', (a,b,rarity)=>{
    const state=subject();const activator=putCard(state,P1,'U04');const first=putCard(state,P1,a);const second=putCard(state,P1,b);activatePowerUp(state,P1,{instanceId:activator.instanceId,ingredientInstanceIds:[first.instanceId,second.instanceId]},1000);const output=state.privateState.powerUps!.inventories[P1].cards;expect(output).toHaveLength(1);expect(OFFICIAL_POWER_UP_REGISTRY.get(output[0].definitionId).rarity).toBe(rarity);expect([activator.instanceId,first.instanceId,second.instanceId]).not.toContain(output[0].instanceId);
  });
  it.each(['A08','U04','D08'])('U04 rejects forbidden %s ingredient before any spending', id=>{
    const state=subject();const activator=putCard(state,P1,'U04');const first=putCard(state,P1,id);const second=putCard(state,P1,'A01');const before=structuredClone(state);expect(()=>activatePowerUp(state,P1,{instanceId:activator.instanceId,ingredientInstanceIds:[first.instanceId,second.instanceId]},1000)).toThrow();expect(state).toEqual(before);
  });
  it('U10 may produce a fresh U10 while transforming a different Rare Utility definition',()=>{const state=subject();const activator=putCard(state,P1,'U10');const original=putCard(state,P1,'U05');activatePowerUp(state,P1,{instanceId:activator.instanceId,transformedInstanceId:original.instanceId,category:'UTILITY'},1000);expect(state.privateState.powerUps!.inventories[P1].cards).toMatchObject([{definitionId:'U10'}]);expect(state.privateState.powerUps!.inventories[P1].cards[0].instanceId).not.toBe(activator.instanceId)});
  it.each(POWER_UP_CATEGORIES)('U10 preserves each permitted rarity into %s', category=>{
    for(const original of ['A01','A05','A07']){const state=subject();const activator=putCard(state,P1,'U10');const source=putCard(state,P1,original);if(category==='ATTACK'&&original==='A07'){const before=structuredClone(state);expect(()=>activatePowerUp(state,P1,{instanceId:activator.instanceId,transformedInstanceId:source.instanceId,category},1000)).toThrow();expect(state).toEqual(before);continue}activatePowerUp(state,P1,{instanceId:activator.instanceId,transformedInstanceId:source.instanceId,category},1000);const output=state.privateState.powerUps!.inventories[P1].cards;expect(output).toHaveLength(1);expect(OFFICIAL_POWER_UP_REGISTRY.get(output[0].definitionId)).toMatchObject({category,rarity:OFFICIAL_POWER_UP_REGISTRY.get(original).rarity});expect(output[0].definitionId).not.toBe(original);expect(output[0].instanceId).not.toBe(source.instanceId)}
  });
  it.each([-3,-2,-1,0,1,2,3])('U05 delta=%i preserves raw dice and moves at least one', delta=>{const{state,request}=prepare('U05');request.movementDelta=delta;activatePowerUp(state,P1,request,1000);expect(state.players[P1].currentTile).toBe(Math.max(1,3+delta));expect(state.boardState.diceValue).toEqual({dice1:1,dice2:2})});
  it.each([-4,4,0.5,NaN])('U05 rejects invalid domain delta=%s without spending',delta=>{const{state,request}=prepare('U05');request.movementDelta=delta;const before=structuredClone(state);expect(()=>activatePowerUp(state,P1,request,1000)).toThrow();expect(state).toEqual(before)});
  it.each(['U01','U02','U05','U08'])('%s crossing START grants exactly one cash award and offer',id=>{const{state,request}=prepare(id);state.players[P1].currentTile=39;const dice=vi.spyOn(Math,'random').mockReturnValue(0);try{activatePowerUp(state,P1,request,1000)}finally{dice.mockRestore()}expect(state.boardState.gameplayEvents.events.filter(e=>e.type==='MONEY_TRANSFER'&&e.reason==='PASS_GO').map(e=>e.type==='MONEY_TRANSFER'?e.amount:0)).toEqual([200]);expect(state.privateState.powerUps!.rewardQueue.offers).toHaveLength(1);expect(state.boardState.gameplayEvents.events.filter(e=>e.type==='PASS_GO')).toHaveLength(1);expect(state.boardState.rollSequence).toBe(1)});
  it.each(['U01','U02','U05'])('%s cannot be combined with a second movement Active',id=>{const{state,request}=prepare(id);const second=putCard(state,P1,'U02');activatePowerUp(state,P1,request,1000);const before=structuredClone(state);expect(()=>activatePowerUp(state,P1,{instanceId:second.instanceId},1100)).toThrow();expect(state).toEqual(before)});
  it.each(['A01','A03','A04','A05','A06','A07','A09','A10'])('D05 reflects %s with effect-specific target and beneficiary',id=>{
    const{state,request}=prepare(id);if(id==='A06')putCard(state,P1,'A02');state.boardState.ownedProps[3]={id:P1,color:'red',houses:2};const defense=putCard(state,P2,'D05');activatePowerUp(state,P1,request,1000);const event=state.privateState.powerUps!.pendingReaction!;expect(event).toBeTruthy();respondPowerUpReaction(state,P2,{eventId:event.eventId,action:'REACT',instanceId:defense.instanceId,...(id==='A04'?{redirectTileID:3}:{})},2000);expect(state.privateState.powerUps!.pendingReaction).toBeNull();if(id==='A01')expect([state.players[P1].accountBalance,state.players[P2].accountBalance]).toEqual([1450,1550]);else if(id==='A09')expect(state.players[P1].accountBalance).toBe(1480);else if(id==='A06')expect(state.privateState.powerUps!.inventories[P2].cards.every(c=>c.definitionId!=='A06')).toBe(true);else expect(state.privateState.powerUps!.statuses).toMatchObject([{sourcePlayerId:P2,...(id==='A04'?{targetTileID:3}:{targetPlayerId:P1})}]);
  });
  it('D05 can receive an A06 reflection at capacity because the Reaction frees a slot',()=>{const{state,request}=prepare('A06');putCard(state,P1,'A02');const defense=putCard(state,P2,'D05');putCard(state,P2,'U02');activatePowerUp(state,P1,request,1000);const event=state.privateState.powerUps!.pendingReaction!;expect(event).toBeTruthy();expect(eligiblePowerUpReactionIds(state,P2)).toContain(defense.instanceId);respondPowerUpReaction(state,P2,{eventId:event.eventId,action:'REACT',instanceId:defense.instanceId},2000);expect(state.privateState.powerUps!.inventories[P2].cards).toHaveLength(3)});
  it.each(['D03','D06'])('A04 + %s prevents the two-use status',defenseId=>{const{state,request}=prepare('A04');const defense=putCard(state,P2,defenseId);activatePowerUp(state,P1,request,1000);respondPowerUpReaction(state,P2,{eventId:state.privateState.powerUps!.pendingReaction!.eventId,action:'REACT',instanceId:defense.instanceId},2000);expect(state.privateState.powerUps!.statuses).toEqual([])});
  it('A04 + D10 removes future rent reduction without cash compensation',()=>{const{state,request}=prepare('A04');activatePowerUp(state,P1,request,1000);const rumor=state.privateState.powerUps!.statuses![0];state.boardState.currentPlayer={id:P2,hasMoved:false};state.boardState.turnNumber++;const defense=putCard(state,P2,'D10');activatePowerUp(state,P2,{instanceId:defense.instanceId,statusId:rumor.statusId},2000);expect(applyPowerUpRentModifiers(state,1,P2,100).amount).toBe(100);expect(state.players[P2].accountBalance).toBe(1500)});
  it('D10 removes only its owner from a global A08 effect',()=>{const{state,request}=prepare('D10');state.privateState.powerUps!.statuses=[status('A08','RENT_MODIFIER',P2,{affectedPlayerIds:[P1,P3],percent:-50,expiresAtStartPlayerId:P2})];request.statusId=state.privateState.powerUps!.statuses[0].statusId;activatePowerUp(state,P1,request,1000);expect(state.privateState.powerUps!.statuses).toMatchObject([{affectedPlayerIds:[P3]}])});
  it.each([false,true])('U06 full-hand consent=%s swaps atomically or retains the activator',accept=>{const{state,request,card}=prepare('U06');putCard(state,P1,'U02');putCard(state,P2,'D02');putCard(state,P2,'D09');activatePowerUp(state,P1,request,1000);const trade=state.privateState.powerUps!.pendingTrade!;resolvePowerUpTrade(state,P2,{requestId:trade.requestId,accept},2000);expect(state.privateState.powerUps!.pendingTrade).toBeNull();expect(state.privateState.powerUps!.inventories[P1].cards).toHaveLength(accept?2:3);expect(state.privateState.powerUps!.inventories[P2].cards).toHaveLength(3);expect(state.privateState.powerUps!.inventories[P1].cards.some(c=>c.instanceId===card.instanceId)).toBe(!accept)});
  it('U06 times out at the absolute deadline and retains its card and spent allowance',()=>{const{state,request,card}=prepare('U06');activatePowerUp(state,P1,request,1000);expect(expirePowerUpInteraction(state,15999)).toBe(false);expect(expirePowerUpInteraction(state,16000)).toBe(true);expect(expirePowerUpInteraction(state,16001)).toBe(false);expect(state.privateState.powerUps!.inventories[P1].cards).toContain(card);expect(state.privateState.powerUps!.activeUsage?.[P1]).toBe(state.boardState.turnNumber)});
  it.each(['A02','A03','A04','A05','A07','A10','D04','U03','U09'])('%s expires at its declared owner-turn/current-turn boundary',id=>{const{state,request}=prepare(id);activatePowerUp(state,P1,request,1000);const effect=state.privateState.powerUps!.statuses![0];const turns=effect.remainingOwnerTurns;if(turns!==undefined){for(let turn=1;turn<turns;turn++){completePowerUpOwnerTurn(state,effect.ownerTurnPlayerId!);expect(state.privateState.powerUps!.statuses).toContain(effect)}completePowerUpOwnerTurn(state,effect.ownerTurnPlayerId!)}else{state.boardState.turnNumber++;beginPowerUpPlayerTurn(state,P1)}expect(state.privateState.powerUps!.statuses).not.toContain(effect)});
  it('eliminating the current actor expires A08 when its named successor starts',()=>{const state=subject();state.players[P3]={...state.players[P2],name:'C'};state.boardState.players.push(P3);state.privateState.powerUps!.statuses=[status('A08','RENT_MODIFIER',P2,{affectedPlayerIds:[P3],percent:-50,expiresAtStartPlayerId:P2})];removePlayerFromGame(state,P1);expect(state.boardState.currentPlayer.id).toBe(P2);expect(state.privateState.powerUps!.statuses).toEqual([])});
  it.each(['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10','D04','D10','U01','U02','U03','U04','U05','U06','U07','U08','U09','U10'])('%s cleans its source inventory/status/pending references on elimination',id=>{const{state,request}=prepare(id);activatePowerUp(state,P1,request,1000);removePowerUpPlayerState(state,P1);expect(state.privateState.powerUps!.inventories[P1]).toBeUndefined();expect(state.privateState.powerUps!.statuses?.some(s=>s.sourcePlayerId===P1||s.targetPlayerId===P1)).toBe(false);expect(state.privateState.powerUps!.pendingTrade).toBeFalsy();expect(state.privateState.powerUps!.pendingMovement).toBeFalsy()});
  it('D04 keeps two charges until a compatible property attack or its third owner-turn completion',()=>{const{state,request}=prepare('D04');activatePowerUp(state,P1,request,1000);nextTurn(state);expect(state.privateState.powerUps!.statuses![0]).toMatchObject({remainingUses:2,remainingOwnerTurns:2});nextTurn(state);nextTurn(state);expect(state.privateState.powerUps!.statuses![0]).toMatchObject({remainingUses:2,remainingOwnerTurns:1});nextTurn(state);nextTurn(state);expect(state.privateState.powerUps!.statuses).toEqual([])});
});


describe('08B realized rent revenue under bankruptcy',()=>{
  it.each([null,'D08'])('A07 splits actually collected revenue with %s rather than prioritizing the landlord',defense=>{
    const state=subject();state.players[P3]={...state.players[P2],name:'Share beneficiary'};state.boardState.players.push(P3);state.players[P1].accountBalance=defense?0:30;state.privateState.powerUps!.statuses=[status('A07','RENT_SHARE',P3,{targetPlayerId:P2,percent:50,capUnits:100,remainingUses:1})];rent(state,defense?300:100,defense);const realized=defense?200:30;expect(state.players[P2].accountBalance).toBe(1500+realized/2);expect(state.players[P3].accountBalance).toBe(1500+realized/2);
  });
});


describe('08B rent share through liquidation and team rescue',()=>{
  it('preserves cumulative rounding across partial cash collections and the 100-unit cap',()=>{
    const state=subject();state.players[P3]={...state.players[P2],name:'Beneficiary'};state.boardState.players.push(P3);state.players[P1].accountBalance=31;state.boardState.ownedProps[3]={id:P1,color:'red',houses:0};state.privateState.powerUps!.statuses=[status('A07','RENT_SHARE',P3,{targetPlayerId:P2,percent:50,capUnits:100,remainingUses:1})];rent(state,300);expect(state.players[P3].accountBalance).toBe(1515);expect(state.boardState.paymentQueue?.orderedClaims[0].rentRevenueShare).toMatchObject({grossCollected:31,forwardedUnits:15});state.players[P1].accountBalance=1;progressPaymentQueue(state,{now:3000});expect(state.players[P3].accountBalance).toBe(1516);state.players[P1].accountBalance=268;progressPaymentQueue(state,{now:4000});expect(state.players[P3].accountBalance).toBe(1600);expect(state.players[P2].accountBalance).toBe(1700);expect(state.boardState.paymentQueue).toBeNull();
  });
  it('A07 beneficiary can be the debtor without losing returned cash or stalling',()=>{const state=subject();state.players[P1].accountBalance=50;state.privateState.powerUps!.statuses=[status('A07','RENT_SHARE',P1,{targetPlayerId:P2,percent:50,capUnits:100,remainingUses:1})];rent(state,100);expect(state.players[P1].accountBalance).toBe(0);expect(state.players[P2].accountBalance).toBe(1550);expect(state.boardState.paymentQueue).toBeNull()});
  it('team rescue charges only the rescuer net cost when A07 returns part of the rent',()=>{
    const state=subject();const P4='00000000-0000-4000-8000-000000000004';state.boardState.gameMode='TEAM_2V2';state.players[P1].teamId='TEAM_1';state.players[P2].teamId='TEAM_2';state.players[P2].teamSlot=0;state.players[P3]={...state.players[P1],teamSlot:1,name:'Rescuer',accountBalance:50};state.players[P4]={...state.players[P2],teamSlot:1,name:'Opponent'};state.boardState.players=[P1,P2,P3,P4];state.players[P1].accountBalance=0;state.privateState.powerUps!.statuses=[status('A07','RENT_SHARE',P3,{targetPlayerId:P2,percent:50,capUnits:100,remainingUses:1})];rent(state,100);const rescue=state.boardState.paymentQueue?.rescue;expect(rescue?.amount).toBe(50);expect(acceptEmergencyRescue(state,P3,rescue!.rescueId,{now:2001}).ok).toBe(true);expect(state.players[P3].accountBalance).toBe(0);expect(state.players[P2].accountBalance).toBe(1550);expect(state.players[P1]).toBeTruthy();expect(state.boardState.paymentQueue).toBeNull();
  });
});


describe('08B remaining card interaction and legality boundaries',()=>{
  it('A07 shares modified rent after the strongest A02/A04/A08 adjustment',()=>{const state=subject();state.players[P3]={...state.players[P2],name:'Beneficiary'};state.boardState.players.push(P3);state.privateState.powerUps!.statuses=[status('A02','RENT_MODIFIER',P2,{targetTileID:1,percent:25,remainingUses:1}),status('A04','RENT_MODIFIER',P1,{targetTileID:1,percent:-25,remainingUses:2}),status('A08','RENT_MODIFIER',P1,{affectedPlayerIds:[P2],percent:-50}),status('A07','RENT_SHARE',P3,{targetPlayerId:P2,percent:50,capUnits:100,remainingUses:1})];rent(state,101);expect(state.players[P1].accountBalance).toBe(1423);expect(state.players[P2].accountBalance).toBe(1539);expect(state.players[P3].accountBalance).toBe(1538)});
  it('U04 then U10 is refused in the same turn and transforms at the same rarity next turn',()=>{const{state,request}=prepare('U04');activatePowerUp(state,P1,request,1000);const output=state.privateState.powerUps!.inventories[P1].cards[0];const transform=putCard(state,P1,'U10');const category=OFFICIAL_POWER_UP_REGISTRY.get(output.definitionId).category==='ATTACK'?'DEFENSE':'ATTACK';const second={instanceId:transform.instanceId,transformedInstanceId:output.instanceId,category} as const;const before=structuredClone(state);expect(()=>activatePowerUp(state,P1,second,2000)).toThrow();expect(state).toEqual(before);state.boardState.turnNumber++;activatePowerUp(state,P1,second,3000);expect(OFFICIAL_POWER_UP_REGISTRY.get(state.privateState.powerUps!.inventories[P1].cards[0].definitionId).rarity).toBe(OFFICIAL_POWER_UP_REGISTRY.get(output.definitionId).rarity)});
  it.each([0,74,75,76])('U07 cash=%i enforces exact 125 percent purchase cost',cash=>{const{state,request}=prepare('U07');state.players[P1].accountBalance=cash;const before=structuredClone(state);if(cash<75){expect(()=>activatePowerUp(state,P1,request,1000)).toThrow();expect(state).toEqual(before)}else{activatePowerUp(state,P1,request,1000);expect(state.players[P1].accountBalance).toBe(cash-75);expect(state.boardState.ownedProps[1].id).toBe(P1);expect(state.players[P1].currentTile).toBe(0)}});
  it.each([0,4,10,20,30,40])('U07 rejects non-property tile %i without spending',tile=>{const{state,request}=prepare('U07');request.targetTileID=tile;const before=structuredClone(state);expect(()=>activatePowerUp(state,P1,request,1000)).toThrow();expect(state).toEqual(before)});
  it.each(activationCasesFor())('$id cannot activate while jailed',({prepare})=>{const state=subject();const{request}=prepare(state);state.players[P1].isJail=true;const before=structuredClone(state);expect(()=>activatePowerUp(state,P1,request,1000)).toThrow();expect(state).toEqual(before)});
});


describe('08B explicit targeted Attack/Reaction compatibility matrix',()=>{
  const pairs=['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10'].flatMap(attack=>['D01','D02','D03','D05','D06','D07','D08','D09'].map(defense=>({attack,defense})));
  it.each(pairs)('$attack + $defense exposes only legal pre-commit responses',({attack,defense})=>{const{state,request}=prepare(attack);if(attack==='A06')putCard(state,P1,'A02');state.boardState.ownedProps[3]={id:P1,color:'red',houses:0};const reaction=putCard(state,P2,defense);activatePowerUp(state,P1,request,1000);const targeted=!['A02','A08'].includes(attack);const expected=targeted&&(['D05','D06'].includes(defense)||(defense==='D02'&&attack==='A01')||(defense==='D09'&&attack==='A06')||(defense==='D03'&&['A03','A04','A05','A07','A10'].includes(attack)));expect(eligiblePowerUpReactionIds(state,P2).includes(reaction.instanceId)).toBe(expected);if(!expected)expect(state.privateState.powerUps!.pendingReaction).toBeFalsy()});
});


describe('08B passive shield on reflected property attacks',()=>{
  it('A04 + D05 + D04 consumes a shield charge without opening a Reaction chain',()=>{const{state,request}=prepare('A04');state.boardState.ownedProps[3]={id:P1,color:'red',houses:0};state.privateState.powerUps!.statuses=[status('D04','PROPERTY_SHIELD',P1,{targetPlayerId:P1,targetTileID:3,remainingUses:2,remainingOwnerTurns:3,ownerTurnPlayerId:P1})];const reflect=putCard(state,P2,'D05');activatePowerUp(state,P1,request,1000);respondPowerUpReaction(state,P2,{eventId:state.privateState.powerUps!.pendingReaction!.eventId,action:'REACT',instanceId:reflect.instanceId,redirectTileID:3},2000);expect(state.privateState.powerUps!.pendingReaction).toBeNull();expect(state.privateState.powerUps!.statuses).toMatchObject([{definitionId:'D04',remainingUses:1}])});
});


it('U10 rejects Legendary inputs and preserves every inventory instance',()=>{const state=subject();const activator=putCard(state,P1,'U10');const input=putCard(state,P1,'A08');const before=structuredClone(state);expect(()=>activatePowerUp(state,P1,{instanceId:activator.instanceId,transformedInstanceId:input.instanceId,category:'DEFENSE'},1000)).toThrow();expect(state).toEqual(before)});
