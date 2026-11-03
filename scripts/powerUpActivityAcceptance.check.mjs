/* global location, document, getComputedStyle, innerWidth, innerHeight */
/** Production-client acceptance. Set POWERUP_NATIVE=1 to exercise the packaged Electron renderer as the acting player. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, _electron, expect } from '@playwright/test';
import { recordActivityEvent } from '../apps/server/src/game/activity.ts';
import { moveBy } from '../apps/server/src/game/dice.ts';
import { createServer } from '../apps/server/src/createServer.ts';
import { loadServerConfig } from '../apps/server/src/config.ts';
import { InMemoryPersistenceStore } from '../apps/server/src/persistence/inMemory.ts';
import { createAppRuntime } from '../apps/server/src/services/runtime.ts';
import { registerSocketHandlers } from '../apps/server/src/socket/index.ts';
import { commitRoomCommand } from '../apps/server/src/socket/roomCommands.ts';
import { broadcastRoom } from '../apps/server/src/socket/broadcast.ts';
import { createPowerUpState, createPowerUpInventory } from '../apps/server/src/game/powerUps/foundation.ts';
import { OFFICIAL_POWER_UP_REGISTRY } from '../apps/server/src/game/powerUps/catalog.ts';
import { DEFAULT_GAME_SETTINGS, SETTINGS_STORAGE_KEY } from '../apps/client/src/settings/defaults.ts';
import { findPackagedApplication } from '../apps/desktop/scripts/packagedRenderer.mjs';

const playerColorsMode=process.argv.includes('--player-colors');
const refinementMode=process.argv.includes('--refinement');
const artworkMode=process.argv.includes('--artwork')||refinementMode;
const artworkChecks=artworkMode ? await import('./art/powerUpArtworkAcceptance.mjs') : null;
const root=fileURLToPath(new URL('../',import.meta.url));const native=(process.env.POWERUP_NATIVE==='1'||process.argv.includes('--native'));const output=path.join(root,playerColorsMode?'test-results/ob14-player-colors':'test-results/powerup-ob12',native?'native':'browser');await mkdir(output,{recursive:true});
const persistence=new InMemoryPersistenceStore();const runtime=createAppRuntime(persistence,loadServerConfig({}).persistenceTiming);const{server,io}=createServer(runtime,{environment:{SERVER_RUNTIME_PROFILE:'desktop'},clientDist:path.join(root,'apps/client/dist')});registerSocketHandlers(io,runtime,'development');await new Promise(resolve=>server.listen(0,native?'0.0.0.0':'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;const lanAddress=Object.values(os.networkInterfaces()).flat().find(item=>item?.family==='IPv4'&&!item.internal)?.address;const inviteOrigin=native?'http://'+lanAddress+':'+server.address().port:origin;
const browser=await chromium.launch({executablePath:process.env.POWERUP_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-webgl']});const contexts=[];let nativeApp;const result={status:'RUNNING',mode:native?'Packaged Electron acting player + Chromium opponent':'Two Chromium players',checks:[],screenshots:[],pageErrors:[],manual:'Physical GPU, refresh rates, listening, cross-device and macOS UAT remain required.'};
async function preferences(context){await context.addInitScript(({key,settings})=>{if(location.origin!=='null'&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({...settings,muted:true,reducedMotion:false,graphicsQuality:'low'}))},{key:SETTINGS_STORAGE_KEY,settings:DEFAULT_GAME_SETTINGS})}
async function webPlayer(name){const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});contexts.push(context);await preferences(context);const page=await context.newPage();await page.goto(origin+'/?room=PU-08B');await page.getByLabel('Tên của bạn').fill(name);await page.getByRole('button',{name:'Vào phòng'}).click();await expect(page.locator('.lobby')).toBeVisible();return page}
async function poll(read,valid){const deadline=Date.now()+15000;while(Date.now()<deadline){const value=await read();if(valid(value))return value;await new Promise(resolve=>setTimeout(resolve,25))}throw Error('Authoritative state timeout')}
async function pass(name){result.checks.push({name,status:'PASS'});console.log('PASS: '+name);await writeFile(path.join(output,'evidence.json'),JSON.stringify(result,null,2))}
async function shot(page,name){if(artworkChecks&&!name.startsWith('failure'))await artworkChecks.inspectArtwork(page);await page.screenshot({path:path.join(output,name),animations:'disabled'});result.screenshots.push(name)}
let owner,other;
try{
  other=await webPlayer('08B Other');
  if(native){const{packageRoot}=await findPackagedApplication();const executable=['OwnTheBlock.exe','Own the Block.exe'].map(name=>path.join(packageRoot,name)).find(existsSync);const profile=await mkdtemp(path.join(os.tmpdir(),'otb-powerup-08b-'));result.profile=profile;nativeApp=await _electron.launch({executablePath:executable,args:['--user-data-dir='+profile],timeout:30000});owner=await nativeApp.firstWindow();await preferences(nativeApp.context());await owner.reload();await owner.locator('#desktop-launcher-title').waitFor();await owner.locator('[data-launcher-choice="join"]').click();await owner.locator('#desktop-player-name').fill('08B Owner');await owner.locator('#desktop-lan-room').fill(inviteOrigin+'/?room=PU-08B');await owner.getByRole('button',{name:/Kết nối và vào phòng|Connect and join room/}).click();await expect(owner.locator('.lobby')).toBeVisible();result.nativeRuntime=await nativeApp.evaluate(({app})=>({packaged:app.isPackaged,versions:process.versions,gpu:app.getGPUFeatureStatus()}));assert.equal(result.nativeRuntime.packaged,true);assert.ok(owner.url().startsWith('app://'));}
  else owner=await webPlayer('08B Owner');
  for(const page of [owner,other]){page.setDefaultTimeout(15000);page.on('pageerror',error=>result.pageErrors.push(error.message))}
  await other.getByRole('button',{name:'Chó',exact:true}).click();await owner.getByRole('button',{name:'Capybara',exact:true}).click();for(const page of [owner,other])await page.getByRole('button',{name:'Sẵn sàng',exact:true}).click();await other.getByRole('button',{name:'Bắt đầu',exact:true}).click();for(const page of [owner,other])await expect(page.getByTestId('game-board')).toBeVisible();
  let room=await persistence.rooms.findByCode('PU-08B');const roomId=room.id;const ids=Object.fromEntries(Object.entries(room.gameSnapshot.gameState.players).map(([id,p])=>[p.name,id]));const ownerId=ids['08B Owner'];const otherId=ids['08B Other'];const load=()=>persistence.rooms.findById(roomId);
  const seed=async(owned,opposing,actor=ownerId,keepStatuses=false)=>{const committed=await commitRoomCommand(runtime,roomId,({state})=>{state.turnInfo={};state.boardState.currentPlayer={id:actor,hasMoved:false};state.boardState.turnNumber++;state.boardState.turnRecovery=null;for(const player of Object.values(state.players)){player.isJail=false;player.accountBalance=2000;player.currentTile=0}const old=state.privateState.powerUps;const pu=state.privateState.powerUps=createPowerUpState();if(keepStatuses)pu.statuses=old.statuses;for(const[who,cards]of [[ownerId,owned],[otherId,opposing]]){pu.inventories[who]=createPowerUpInventory(3);for(const definitionId of cards)pu.inventories[who].cards.push({instanceId:randomUUID(),ownerPlayerId:who,definitionId,obtainedFromOfferId:randomUUID()})}state.boardState.ownedProps[1]={id:ownerId,color:'red',houses:0};state.boardState.ownedProps[3]={id:otherId,color:'blue',houses:0}});broadcastRoom(io,runtime,committed.room);return committed.room};
  const reconnectOwner=async()=>{await owner.reload();if(native){await owner.locator('#desktop-launcher-title').waitFor();await owner.locator('[data-launcher-choice="join"]').click();await owner.locator('#desktop-player-name').fill('08B Owner');await owner.locator('#desktop-lan-room').fill(inviteOrigin+'/?room=PU-08B');await owner.getByRole('button',{name:/Kết nối và vào phòng|Connect and join room/}).click()}await expect(owner.getByTestId('game-board')).toBeVisible()};

  await seed([],[]);
  const grant=await commitRoomCommand(runtime,roomId,({state})=>{state.players[ownerId].currentTile=39;moveBy(state,ownerId,1);state.privateState.powerUps.rewardQueue.offers.at(-1).candidates=['A02','D02','U02'].map(definitionId=>({definitionId,category:OFFICIAL_POWER_UP_REGISTRY.get(definitionId).category}));});broadcastRoom(io,runtime,grant.room);
  const dialog=owner.getByRole('dialog',{name:'Quà Xuất Phát'});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Tiện ích',exact:true}).focus();await owner.keyboard.press('Enter');await expect(dialog.getByRole('button',{name:'Nhận thẻ',exact:true})).toBeVisible();
  assert.equal((await load()).gameSnapshot.gameState.boardState.activityFeed.events.filter(e=>e.type==='POWER_UP_RECEIVED').length,0);
  await dialog.getByRole('button',{name:'Nhận thẻ',exact:true}).evaluate(button=>{button.click();button.click()});await expect(dialog).toBeHidden();
  const receipts=(await load()).gameSnapshot.gameState.boardState.activityFeed.events.filter(e=>e.type==='POWER_UP_RECEIVED');assert.equal(receipts.length,1);assert.deepEqual(Object.keys(receipts[0]).sort(),['eventId','occurredAt','playerId','playerName','sequence','type']);
  const journal=async(page)=>{const toggle=page.locator('button[aria-controls=board-log-panel]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();return page.getByRole('log')};
  for(const page of [owner,other]){const log=await journal(page);await expect(log.getByText('08B Owner đã nhận 1 thẻ Power-up',{exact:true})).toHaveCount(1);}
  await shot(owner,'receipt.png');await pass('Real reward claim double-click logs one generic receipt for Host and Guest without card metadata');
  if(playerColorsMode){
    for(const page of [owner,other]){
      const receiptRow=page.locator('.activity-entry--power_up_received');
      await expect(receiptRow.locator('[data-player-id="'+ownerId+'"]')).toHaveText('08B Owner');
      assert.equal(await receiptRow.locator('span').count(),1);
    }
    await pass('OB-14 real receipt highlights only the actor on both viewers');
  }
  const movement=await commitRoomCommand(runtime,roomId,({state})=>{state.turnInfo={};state.boardState.currentPlayer={id:ownerId,hasMoved:true};state.boardState.rollSequence++;state.boardState.diceValue={dice1:1,dice2:1};state.privateState.powerUps.pendingMovement={operationId:randomUUID(),playerId:ownerId,turnNumber:state.boardState.turnNumber,dice:{dice1:1,dice2:1},rollSequence:state.boardState.rollSequence};});broadcastRoom(io,runtime,movement.room);
  await owner.getByRole('button',{name:'Dùng Tăng Tốc (+2)',exact:true}).click();await owner.getByRole('button',{name:'Dùng thẻ',exact:true}).evaluate(button=>{button.click();button.click()});
  await poll(load,r=>r.gameSnapshot.gameState.boardState.activityFeed.events.some(e=>e.type==='POWER_UP_USED'));
  for(const page of [owner,other]){const log=await journal(page);await expect(log.getByText('08B Owner đã dùng thẻ Tăng Tốc',{exact:true})).toHaveCount(1);}
  const feed=structuredClone((await load()).gameSnapshot.gameState.boardState.activityFeed);await shot(owner,'used.png');await pass('U02 movement activation logs one official card use on both viewers');
  await reconnectOwner();assert.deepEqual((await load()).gameSnapshot.gameState.boardState.activityFeed,feed);const restored=await journal(owner);await expect(restored.getByText('08B Owner đã dùng thẻ Tăng Tốc',{exact:true})).toHaveCount(1);await pass('Reconnect hydrates identical event identities without appending');
  await owner.evaluate(key=>{const settings=JSON.parse(localStorage.getItem(key));localStorage.setItem(key,JSON.stringify({...settings,language:'en'}))},SETTINGS_STORAGE_KEY);await reconnectOwner();const english=await journal(owner);await expect(english.getByText('08B Owner received a Power-up card',{exact:true})).toHaveCount(1);await expect(english.getByText('08B Owner used Tăng Tốc',{exact:true})).toHaveCount(1);await shot(owner,'english.png');await pass('English message rendering uses official catalog proper card name');
  if(playerColorsMode){
    const special='<img>{playerName}XYZ'; // Maximum legal 20-character name; no spaces.
    const fixture=await commitRoomCommand(runtime,roomId,({state})=>{
      state.players[ownerId].color='yellow';state.players[otherId].color='blue';
      state.players[ownerId].name=special;state.players[otherId].name=special;
      recordActivityEvent(state,{type:'MONEY_TRANSFER',source:{kind:'PLAYER',playerId:ownerId,name:special},destination:{kind:'PLAYER',playerId:otherId,name:special},amount:1,reason:'RENT'});
      recordActivityEvent(state,{type:'POWER_UP_USED',playerId:ownerId,playerName:'Tăng Tốc',definitionId:'U02',cardName:'Tăng Tốc'});
      recordActivityEvent(state,{type:'CHAT',senderRole:'PLAYER',senderPlayerId:ownerId,senderName:special,message:special});
    });broadcastRoom(io,runtime,fixture.room);
    const verify=async(page)=>{
      await journal(page);
      const row=page.locator('.activity-entry--money_transfer').filter({has:page.locator('[data-player-id="'+ownerId+'"]')}).last();
      await expect(row.locator('.activity-player-name')).toHaveCount(2);
      const names=await row.locator('.activity-player-name').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.playerId,text:n.textContent,color:getComputedStyle(n).color})));
      assert.deepEqual(names.map(n=>n.id),[ownerId,otherId]);assert.deepEqual(names.map(n=>n.text),[special,special]);assert.notEqual(names[0].color,names[1].color);
      const used=page.locator('.activity-entry--power_up_used').last();assert.equal(await used.locator('span').count(),1);assert.equal(await used.locator('span').textContent(),'Tăng Tốc');
      assert.equal(await page.locator('.activity-entry--chat span').count(),0);assert.equal(await page.locator('.center__log img').count(),0);
      const dims=await page.locator('.center__log').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(dims.scroll<=dims.width+1,JSON.stringify(dims));
    };
    for(const page of [owner,other])await verify(page);
    await pass('OB-14 fixture: matching names use distinct IDs/colors, card/chat remain plain, markup is escaped');
    const before=structuredClone((await load()).gameSnapshot.gameState.boardState.activityFeed);
    for(const theme of ['v1','v2'])for(const[width,height]of [[1440,900],[667,375]]){
      if(native)await nativeApp.evaluate(({BrowserWindow},size)=>{const win=BrowserWindow.getAllWindows()[0];win.setFullScreen(false);win.unmaximize();win.setMinimumSize(0,0);win.setContentSize(...size)},[width,height]);else await owner.setViewportSize({width,height});
      result.resizeDiagnostic={requested:[width,height],actual:await owner.evaluate(()=>[innerWidth,innerHeight]),window:native?await nativeApp.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {content:w.getContentSize(),bounds:w.getBounds(),max:w.isMaximized(),full:w.isFullScreen(),zoom:w.webContents.getZoomFactor()}}):null};
      await owner.waitForFunction(size=>Math.abs(innerWidth-size[0])<=1&&Math.abs(innerHeight-size[1])<=1,[width,height]);
      (result.layouts??=[]).push({theme,requested:[width,height],actual:await owner.evaluate(()=>[innerWidth,innerHeight])});
      await owner.evaluate(value=>document.documentElement.setAttribute('data-visual-theme',value),theme);
      await verify(owner);await shot(owner,'colors-'+theme+'-'+width+'.png');
    }
    await reconnectOwner();await verify(owner);assert.deepEqual((await load()).gameSnapshot.gameState.boardState.activityFeed,before);
    await pass('OB-14 V1/V2 wide and phone layouts wrap long names; reconnect retains identities, order, and colors');
  }
  assert.deepEqual(result.pageErrors,[]);result.status='PASS';console.log('OB-12 activity acceptance PASS');
}catch(error){result.status='FAIL';result.failure=String(error.stack??error);for(const[page,name]of [[owner,'owner'],[other,'other']])if(page){await shot(page,'failure-'+name+'.png').catch(()=>{});result[name+'Text']=(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000)}throw error}
finally{await writeFile(path.join(output,'evidence.json'),JSON.stringify(result,null,2));runtime.flags.shuttingDown=true;if(nativeApp){await nativeApp.evaluate(({app})=>app.exit(0)).catch(()=>{});await nativeApp.close().catch(()=>{})}await browser.close();await io.close();await persistence.close()}
