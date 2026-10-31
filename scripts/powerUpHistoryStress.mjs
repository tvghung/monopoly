/** Synthetic retained-history workload, not a full-match simulation. */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { freshState, createFreshPlayer } from '../apps/server/src/rooms.ts';
import { moveBy } from '../apps/server/src/game/dice.ts';
import { autoResolvePowerUpRewards, projectLivePowerUpOwnerState } from '../apps/server/src/game/powerUps/rewards.ts';
import { persistedGameStateSchema } from '../packages/shared/src/index.ts';
const state=freshState();const owner=randomUUID(),other=randomUUID();state.players[owner]=createFreshPlayer('History owner','red');state.players[other]=createFreshPlayer('Other','blue');state.players[other].teamSlot=1;state.boardState.players=[owner,other];state.boardState.gameStarted=true;state.boardState.currentPlayer={id:owner,hasMoved:false};const sizes=[0,100,500,1000,3000];const samples=[];const started=performance.now();
for(let count=0;count<=3000;count++){
  if(sizes.includes(count)){const timings=[];for(let repeat=0;repeat<5;repeat++){const start=performance.now();const copy=structuredClone(state);delete copy.loaded;persistedGameStateSchema.parse(copy);timings.push(performance.now()-start)}const projected=projectLivePowerUpOwnerState(state,owner);assert.ok((projected.inventory?.cards.length??0)<=3);assert.ok(projected.offers.length<=1);samples.push({completedRewards:count,snapshotBytes:Buffer.byteLength(JSON.stringify(state)),ownerPowerUpProjectionBytes:Buffer.byteLength(JSON.stringify(projected)),cloneAndValidateMs:timings,heapUsed:process.memoryUsage().heapUsed,gameplayEventTail:state.boardState.gameplayEvents.events.length})}
  if(count===3000)break;state.players[owner].currentTile=39;moveBy(state,owner,1);autoResolvePowerUpRewards(state,owner,()=>0);
}
assert.equal(state.players[owner].accountBalance,1500+3000*200);assert.equal(state.privateState.powerUps.rewardQueue.offers.length,3000);assert.ok(state.privateState.powerUps.rewardQueue.offers.every(offer=>offer.stage==='COMPLETED'));
const report={method:'Synthetic single-room retained-history workload: 3000 real moveBy START grants followed by production reward completion, always selecting stored candidate zero. The three-card hand saturates; later offers discard the new card. This is not a full match or a draw-distribution simulation. Each size runs five structuredClone + persisted schema validations.',wallMs:performance.now()-started,samples,limitations:'Completed identity retention deliberately grows with grants; projection and semantic tails remain bounded. Heap samples include uncollected garbage. Clone+validation timing is not network or command latency.'};await mkdir('test-results/powerup-08b',{recursive:true});await writeFile('test-results/powerup-08b/history-stress.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
