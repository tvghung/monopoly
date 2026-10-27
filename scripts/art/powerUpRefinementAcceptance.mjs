import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { captureSurface, inspectArtwork } from './powerUpArtworkAcceptance.mjs';
import { commitRoomCommand } from '../../apps/server/src/socket/roomCommands.ts';
import { broadcastRoom } from '../../apps/server/src/socket/broadcast.ts';
import { moveBy } from '../../apps/server/src/game/dice.ts';
import { OFFICIAL_POWER_UP_REGISTRY } from '../../apps/server/src/game/powerUps/catalog.ts';

export const REFINED_CARD_IDS = ['A01','A02','A03','A06','A07','A10','D02','D07','D08','U02','U03','U06','U07','U08','U10'];
const detailedAtEverySize = new Set(['A01','A02','D02','D07','U10']);
const large = {width:1440,height:900};

/** Test-only committed fixtures; uses the production renderer and real authenticated decisions.
 * No gameplay definition, client behavior, debug endpoint or artwork export path is changed.
 */
export async function runRefinementAcceptance({owner,other,seed,open,ownerId,otherId,load,runtime,io,roomId,reconnectOwner,shot,pass}) {
 await seed([],[]);
 const reward=await commitRoomCommand(runtime,roomId,({state})=>{
  state.players[ownerId].currentTile=38;moveBy(state,ownerId,2);
  // Deterministic local fixture: retain the normal reward and all server reveal/claim checks.
  const offer=state.privateState.powerUps.rewardQueue.offers.at(-1);
  offer.candidates=[['ATTACK','A01'],['DEFENSE','D02'],['UTILITY','U03']].map(([category,definitionId])=>({category,definitionId}));
 });broadcastRoom(io,runtime,reward.room);
 const rewardDialog=owner.getByRole('dialog',{name:'Quà Xuất Phát'});await expect(rewardDialog).toBeVisible();
 await owner.getByRole('button',{name:'Tấn công',exact:true}).click();await expect(rewardDialog.locator('.power-up-card--revealed')).toHaveCount(3);
 await captureSurface(owner,rewardDialog,'c1-refined-reward',shot);await owner.getByRole('button',{name:'Nhận thẻ',exact:true}).click();await expect(rewardDialog).toBeHidden();
 await pass('09C.1 corrected hand/coin artwork in authorized reward reveal at all required sizes');
 for(let offset=0;offset<REFINED_CARD_IDS.length;offset+=3){
  const ids=REFINED_CARD_IDS.slice(offset,offset+3);await seed(ids,[]);await reconnectOwner();await owner.setViewportSize(large);
  await owner.getByRole('button',{name:/Kho Power-up/}).click();const inventory=owner.getByRole('dialog',{name:'Kho Power-up'});await expect(inventory).toBeVisible();
  await captureSurface(owner,inventory,'c1-refined-inventory-'+String(offset/3+1),shot);
  for(const id of ids){await owner.setViewportSize(large);const definition=OFFICIAL_POWER_UP_REGISTRY.get(id);
   await inventory.getByRole('button',{name:'Xem chi tiết · '+definition.name,exact:true}).click();
   const detail=owner.getByRole('dialog',{name:definition.name,exact:true});await expect(detail).toBeVisible();await inspectArtwork(owner);
   assert.ok((await detail.locator('img').getAttribute('src')).endsWith('/'+id+'.svg'));
   if(detailedAtEverySize.has(id))await captureSurface(owner,detail,'c1-refined-detail-'+id,shot);
   else await shot(owner,'c1-refined-detail-'+id+'-1440x900.png');
   await owner.keyboard.press('Escape');await expect(detail).toBeHidden();await expect(inventory).toBeVisible();
  }
  await owner.keyboard.press('Escape');await expect(inventory).toBeHidden();
 }
 await pass('09C.1 all 15 refined illustrations: real inventory at three sizes, full details, enlarged priority hand/coin/marker cases');
 await seed(['A01'],['D02']);await owner.setViewportSize(large);
 let activation=await open(owner,'Móc Túi');await captureSurface(owner,activation,'c1-refined-activation-A01',shot);
 await activation.getByLabel('Chọn người chơi').selectOption(otherId);await activation.getByRole('button',{name:'Dùng thẻ',exact:true}).click();
 let reaction=other.locator('.power-up-reaction');await expect(reaction).toBeVisible();await reaction.getByRole('button',{name:'Dùng thẻ',exact:true}).click();
 await expect.poll(async()=>Boolean((await load()).gameSnapshot.gameState.privateState.powerUps.pendingReaction)).toBe(false);
 await seed(['D02'],['A01'],otherId);
 activation=await open(other,'Móc Túi');await activation.getByLabel('Chọn người chơi').selectOption(ownerId);await activation.getByRole('button',{name:'Dùng thẻ',exact:true}).click();
 reaction=owner.locator('.power-up-reaction');await expect(reaction).toBeVisible();await captureSurface(owner,reaction,'c1-refined-reaction-D02',shot);
 await reaction.getByRole('button',{name:'Dùng thẻ',exact:true}).click();await expect.poll(async()=>Boolean((await load()).gameSnapshot.gameState.privateState.powerUps.pendingReaction)).toBe(false);
 assert.equal((await load()).gameSnapshot.gameState.players[ownerId].accountBalance,2000);
 await pass('09C.1 corrected hand silhouettes in real A01 activation and recipient D02 Reaction at all required sizes');
 await seed([],[]);await owner.setViewportSize(large);await other.setViewportSize(large);
}
