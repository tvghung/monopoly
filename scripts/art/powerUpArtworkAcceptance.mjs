/* global document, innerWidth, getComputedStyle */
/** Exercises the production components through real server transactions and authenticated UI commands.
 * This module is opt-in from the existing stabilization harness (--artwork); no debug endpoint ships.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { commitRoomCommand } from '../../apps/server/src/socket/roomCommands.ts';
import { broadcastRoom } from '../../apps/server/src/socket/broadcast.ts';
import { moveBy } from '../../apps/server/src/game/dice.ts';
import { OFFICIAL_POWER_UP_DEFINITIONS } from '../../apps/server/src/game/powerUps/catalog.ts';
const sizes=[{width:1440,height:900},{width:1280,height:720},{width:900,height:500}];
export async function inspectArtwork(page) {
 await page.locator('.power-up-artwork img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 for(const state of await page.locator('.power-up-artwork').evaluateAll(items=>items.map(item=>item.dataset.artworkState)))assert.equal(state,'svg','Official artwork must not use fallback during acceptance');
 assert.ok(await page.locator('.power-up-artwork img').evaluateAll(images=>images.every(image=>image.naturalWidth===640&&image.naturalHeight===400)));
 assert.ok(await page.locator('.power-up-artwork img').evaluateAll(images=>images.every(image=>{const a=image.getBoundingClientRect(),b=image.parentElement.getBoundingClientRect();return a.x>=b.x-1&&a.y>=b.y-1&&a.right<=b.right+1&&a.bottom<=b.bottom+1})),'Artwork image must fit its clipping container at compact sizes');
}
export async function captureSurface(page,dialog,prefix,shot){
 for(const size of sizes){await page.setViewportSize(size);await expect(dialog).toBeVisible();await inspectArtwork(page);
  const b=await dialog.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=size.width+1&&b.y+b.height<=size.height+1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'No modal horizontal overflow');
  await shot(page,prefix+'-'+size.width+'x'+size.height+'.png');
  const body=dialog.locator('.ds-modal__body');if(await body.evaluate(element=>element.scrollHeight>element.clientHeight+1)){await body.evaluate(element=>{element.scrollTop=element.scrollHeight});await shot(page,prefix+'-'+size.width+'x'+size.height+'-scrolled.png');await body.evaluate(element=>{element.scrollTop=0})}
 }
}
export async function runArtworkAcceptance({owner,other,seed,load,ownerId,roomId,runtime,io,output,shot,pass,browser,reconnectOwner}){
 await mkdir(path.join(output,'frames'),{recursive:true});
 const frontRequests=[];owner.on('request',request=>{if(request.url().includes('/art/powerups/fronts/'))frontRequests.push(request.url())});
 await seed([],[]);
 const reward=await commitRoomCommand(runtime,roomId,({state})=>{state.players[ownerId].currentTile=38;moveBy(state,ownerId,2)});broadcastRoom(io,runtime,reward.room);
 const rewardDialog=owner.getByRole('dialog',{name:'Quà Xuất Phát'});await expect(rewardDialog).toBeVisible();
 const candidates=(await load()).gameSnapshot.gameState.privateState.powerUps.rewardQueue.offers.at(-1).candidates;
 assert.equal(await rewardDialog.locator('.power-up-card--back').count(),3);
 assert.equal(await rewardDialog.locator('[data-rarity], [data-frame], .power-up-card__rarity').count(),0);
 assert.ok(!(await rewardDialog.innerHTML()).includes('/fronts/'));
 for(const definition of OFFICIAL_POWER_UP_DEFINITIONS)assert.ok(!(await rewardDialog.innerHTML()).includes(definition.name));
 await captureSurface(owner,rewardDialog,'09-hidden-reward',shot);await reconnectOwner();await expect(rewardDialog).toBeVisible();await inspectArtwork(owner);assert.equal(frontRequests.length,0,'No identity-specific image request before authorized reveal');
 await pass('Artwork secrecy: three category backs, no rarity/identity in DOM or image requests; hidden reconnect and all viewports');
 await owner.getByRole('button',{name:'Tấn công',exact:true}).click();await expect(rewardDialog.locator('.power-up-card--revealed')).toHaveCount(3);
 await inspectArtwork(owner);const sources=await rewardDialog.locator('img').evaluateAll(images=>images.map(image=>image.src));for(const candidate of candidates)assert.ok(sources.some(src=>src.endsWith('/'+candidate.definitionId+'.svg')));
 await captureSurface(owner,rewardDialog,'10-authorized-reveal',shot);await reconnectOwner();await expect(rewardDialog).toBeVisible();await inspectArtwork(owner);assert.equal(await rewardDialog.locator('.power-up-card--reveal-motion').count(),0,'Hydration must not replay a live flip');
 await owner.getByRole('button',{name:'Nhận thẻ',exact:true}).click();await expect(rewardDialog).toBeHidden();await pass('Authorized three-card artwork reveal, selected identity, reconnect without flip replay and claim');
 await owner.setViewportSize(sizes[0]);
 const frameFiles=[];const seen=new Set();
 for(let i=0;i<OFFICIAL_POWER_UP_DEFINITIONS.length;i+=3){const definitions=OFFICIAL_POWER_UP_DEFINITIONS.slice(i,i+3);await seed(definitions.map(d=>d.definitionId),[]);
  await owner.getByRole('button',{name:/Kho Power-up/}).click();const inventory=owner.getByRole('dialog',{name:'Kho Power-up'});await expect(inventory).toBeVisible();await inspectArtwork(owner);
  const cards=inventory.locator('.power-up-card');assert.equal(await cards.count(),definitions.length);
  for(let n=0;n<definitions.length;n++){const definition=definitions[n];const card=cards.nth(n);assert.ok((await card.locator('img').getAttribute('src')).endsWith('/'+definition.definitionId+'.svg'));assert.equal(await card.getAttribute('data-rarity'),definition.rarity);await expect(card.getByText(definition.name,{exact:true})).toBeVisible();
   if(!seen.has(definition.rarity)){seen.add(definition.rarity);const file=path.join(output,'frames',definition.rarity+'.png');await card.screenshot({path:file,animations:'disabled'});frameFiles.push({rarity:definition.rarity,file})}
  }
  await shot(owner,'11-inventory-'+String(i/3+1).padStart(2,'0')+'.png');
  if(i===21){await inventory.getByRole('button',{name:'Xem chi tiết · '+definitions[0].name,exact:true}).click();const detail=owner.getByRole('dialog',{name:definitions[0].name,exact:true});await expect(detail).toBeVisible();await captureSurface(owner,detail,'12-full-card-details',shot);await owner.keyboard.press('Escape');await expect(detail).toBeHidden();await expect(inventory).toBeVisible();await owner.setViewportSize(sizes[0]);}
  await owner.keyboard.press('Escape');await expect(inventory).toBeHidden();
 }
 assert.equal(seen.size,4);await pass('All 30 official IDs render their own artwork in inventory; four production rarity frames and full-detail view');
 // Build a comparison from actual production component screenshots, never a parallel mock card implementation.
 const frameContext=await browser.newContext({viewport:{width:1320,height:1000}});try{const page=await frameContext.newPage();const items=[];for(const f of frameFiles)items.push('<figure><figcaption>'+f.rarity+'</figcaption><img src="data:image/png;base64,'+(await readFile(f.file)).toString('base64')+'"></figure>');await page.setContent('<style>body{margin:0;padding:24px;background:#e9e4d9;font:700 16px Arial;color:#26394a}main{display:flex;align-items:start;gap:20px}figure{margin:0;width:300px}figcaption{margin-bottom:12px}img{display:block;width:100%}</style><main>'+items.join('')+'</main>');await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));await page.screenshot({path:path.join(output,'13-rarity-comparison.png'),fullPage:true})}finally{await frameContext.close()}
 // Browser media preference is independent of the player's persisted override.
 await owner.emulateMedia({reducedMotion:'reduce'});await seed(['A08'],[]);await owner.getByRole('button',{name:/Kho Power-up/}).click();const inventory=owner.getByRole('dialog',{name:'Kho Power-up'});await expect(inventory).toBeVisible();assert.ok(await inventory.locator('.power-up-card').evaluateAll(cards=>cards.every(card=>getComputedStyle(card).animationName==='none')));await shot(owner,'14-reduced-motion.png');await owner.keyboard.press('Escape');await owner.emulateMedia({reducedMotion:'no-preference'});await pass('OS reduced-motion bypass verified on actual Legendary card');
 // Keep the original harness scenarios independent of this inventory matrix.
 await seed([],[]);await owner.setViewportSize(sizes[0]);await other.setViewportSize(sizes[0]);
}

/** Put the acting renderer in both recipient roles, including native Electron. */
export async function runOwnerDecisionArtwork({owner,other,seed,open,ownerId,otherId,load,shot,pass,reconnectOwner}) {
 await seed(['D03'],['A05'],otherId);
 let dialog=await open(other,'Phong Tỏa Xây Dựng');await dialog.getByLabel('Chọn người chơi').selectOption(ownerId);await dialog.getByRole('button',{name:'Dùng thẻ',exact:true}).click();
 const reaction=owner.locator('.power-up-reaction');await expect(reaction).toBeVisible();await captureSurface(owner,reaction,'17-acting-player-reaction',shot);await reaction.getByRole('button',{name:'Dùng thẻ',exact:true}).click();
 await expect.poll(async()=>Boolean((await load()).gameSnapshot.gameState.privateState.powerUps.pendingReaction)).toBe(false);
 assert.ok(!(await load()).gameSnapshot.gameState.privateState.powerUps.statuses.some(status=>status.definitionId==='A05'));
 await seed(['D01','D02','D09'],['U06','A01'],otherId);
 dialog=await open(other,'Trao Đổi Vận May');await dialog.getByLabel('Chọn người chơi').selectOption(ownerId);await dialog.getByRole('button',{name:'Dùng thẻ',exact:true}).click();
 const consent=owner.getByRole('dialog').filter({has:owner.getByRole('button',{name:'Chấp nhận trao đổi',exact:true})});await expect(consent).toBeVisible();await reconnectOwner();await expect(consent).toBeVisible();
 await captureSurface(owner,consent,'18-acting-player-consent-reconnect',shot);await consent.getByRole('button',{name:'Chấp nhận trao đổi',exact:true}).click();
 await expect.poll(async()=>Boolean((await load()).gameSnapshot.gameState.privateState.powerUps.pendingTrade)).toBe(false);
 assert.equal((await load()).gameSnapshot.gameState.privateState.powerUps.inventories[ownerId].cards.length,3);
 await pass('Acting renderer receives and resolves illustrated Reaction and reconnect-restored full-hand consent at all three sizes');
}
