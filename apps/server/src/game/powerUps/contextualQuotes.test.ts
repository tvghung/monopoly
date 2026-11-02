import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {subject,P1,P2,putCard} from './testFixtures';
import {activatePowerUp} from './runtime';
import {createRoomSnapshot,storeGameState,ROOM_SNAPSHOT_SCHEMA_VERSION} from '../../rooms';
import {projectPublicRoomState} from '../../services/publicState';
import {ConnectionRegistry} from '../../services/connectionRegistry';

function project(state:ReturnType<typeof subject>){const snapshot=createRoomSnapshot();snapshot.members[P1]={joinOrder:1,ready:true,membershipStatus:'ACTIVE'};snapshot.members[P2]={joinOrder:2,ready:true,membershipStatus:'ACTIVE'};snapshot.nextJoinOrder=3;storeGameState(snapshot,state,'IN_PROGRESS');return projectPublicRoomState({id:randomUUID(),code:'QUOTE',status:'IN_PROGRESS',hostPlayerId:P1,snapshotSchemaVersion:ROOM_SNAPSHOT_SCHEMA_VERSION,gameSnapshot:snapshot,aggregateVersion:1,createdAt:new Date(),updatedAt:new Date(),lastActivityAt:new Date(),expiresAt:null,nextActionAt:null},new ConnectionRegistry()).gameState.turnInfo.pendingLandingDecision!;}
describe('OB-11 authoritative contextual quotes',()=>{
  it('quotes every development quantity after the 20%/50-unit cap, without changing the pending choice',()=>{
    const state=subject();state.players[P1].currentTile=37;state.boardState.currentPlayer.hasMoved=true;state.boardState.ownedProps[37]={id:P1,color:'red',houses:0};const operationId=randomUUID();
    state.turnInfo.pendingDevelopmentDecision={operationId,playerId:P1,turnNumber:state.boardState.turnNumber,tileID:37,levelAtLanding:0,kind:'HOUSES',continuation:{playerId:P1,turnNumber:state.boardState.turnNumber}};
    const card=putCard(state,P1,'U09');activatePowerUp(state,P1,{instanceId:card.instanceId,operationId},1000);
    const quote=project(state);expect(quote.operationId).toBe(operationId);expect(quote.quantityPrices).toEqual({1:160,2:350,3:550,4:750});expect(quote.unitCost).toBe(200);
    expect(state.turnInfo.pendingDevelopmentDecision.operationId).toBe(operationId);
  });
  it('quotes discounted purchase only for the exact property/operation after successful activation',()=>{
    const state=subject();state.players[P1].currentTile=1;state.boardState.currentPlayer.hasMoved=true;const operationId=randomUUID();state.turnInfo.pendingPropertyDecision={operationId,playerId:P1,tileID:1,continuation:{playerId:P1,turnNumber:state.boardState.turnNumber}};
    const card=putCard(state,P1,'U03');const before=structuredClone(state);
    expect(()=>activatePowerUp(state,P1,{instanceId:card.instanceId,operationId:randomUUID(),targetTileID:1},1000)).toThrow();expect(state).toEqual(before);
    expect(()=>activatePowerUp(state,P2,{instanceId:card.instanceId,operationId,targetTileID:1},1000)).toThrow();expect(state).toEqual(before);
    activatePowerUp(state,P1,{instanceId:card.instanceId,operationId,targetTileID:1},1000);expect(project(state)).toMatchObject({operationId,tileID:1,price:51});
    const after=structuredClone(state);expect(()=>activatePowerUp(state,P1,{instanceId:card.instanceId,operationId,targetTileID:1},1001)).toThrow();expect(state).toEqual(after);
  });
});
