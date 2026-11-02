/* global location, document, innerWidth */
/** Production-client acceptance. Set POWERUP_NATIVE=1 to exercise the packaged Electron renderer as the acting player. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, _electron, expect } from '@playwright/test';
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

const refinementMode=process.argv.includes('--refinement');
const artworkMode=process.argv.includes('--artwork')||refinementMode;
const artworkChecks=artworkMode ? await import('./art/powerUpArtworkAcceptance.mjs') : null;
const root=fileURLToPath(new URL('../',import.meta.url));const native=(process.env.POWERUP_NATIVE==='1'||process.argv.includes('--native'));const output=path.join(root,'test-results/powerup-ob11',native?'native':'browser');await mkdir(output,{recursive:true});
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

  const scenarios=[{id:'U03',use:true,size:{width:1440,height:900},deny:true},{id:'U03',use:false,size:{width:1280,height:720}},{id:'U09',use:true,size:{width:900,height:500}},{id:'U09',use:false,size:{width:740,height:360},language:'en',reduced:true}];
  for(const scenario of scenarios){
    await owner.setViewportSize(scenario.size);await owner.emulateMedia({reducedMotion:scenario.reduced?'reduce':'no-preference'});
    await owner.evaluate(({key,language})=>{const settings=JSON.parse(localStorage.getItem(key));localStorage.setItem(key,JSON.stringify({...settings,language,reducedMotion:language==='en'}))},{key:SETTINGS_STORAGE_KEY,language:scenario.language??'vi'});
    await seed([scenario.id],[]);const operationId=randomUUID();const tileID=scenario.id==='U03'?39:37;
    const committed=await commitRoomCommand(runtime,roomId,({state})=>{
      state.players[ownerId].currentTile=tileID;state.boardState.currentPlayer={id:ownerId,hasMoved:true};
      const continuation={playerId:ownerId,turnNumber:state.boardState.turnNumber};
      if(scenario.id==='U03'){delete state.boardState.ownedProps[tileID];state.turnInfo.pendingPropertyDecision={operationId,playerId:ownerId,tileID,continuation};}
      else {state.boardState.ownedProps[tileID]={id:ownerId,color:'red',houses:0};state.turnInfo.pendingDevelopmentDecision={operationId,playerId:ownerId,tileID,turnNumber:state.boardState.turnNumber,levelAtLanding:0,kind:'HOUSES',continuation};}
    });broadcastRoom(io,runtime,committed.room);await reconnectOwner();
    const modal=owner.locator(scenario.id==='U03'?'.buy-prompt':'.development-prompt-modal');await expect(modal).toBeVisible();const panel=modal.locator('.contextual-powerups');await expect(panel).toBeVisible();
    assert.equal(await owner.getByRole('dialog').count(),1);assert.equal(await other.locator('.contextual-powerups').count(),0);assert.equal(await owner.locator('.power-up-detail').count(),0);await expect(owner.locator('.power-up-inventory')).toHaveCount(0);
    await expect(panel.getByText(OFFICIAL_POWER_UP_REGISTRY.get(scenario.id).name,{exact:true})).toBeVisible();
    for(const key of ['Tab','Shift+Tab','Escape']){await owner.keyboard.press(key);assert.ok(await modal.evaluate(element=>element.contains(document.activeElement)));await expect(modal).toBeVisible();}
    const bounds=await modal.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=scenario.size.width+1&&bounds.y+bounds.height<=scenario.size.height+1);assert.ok(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(scenario.language==='en')await expect(panel.getByRole('button',{name:'Continue without a card'})).toBeVisible();
    for(const action of await modal.locator('.decision-sheet__actions button').all()){const a=await action.boundingBox();const p=await panel.boundingBox();if(a&&p)assert.ok(a.x+a.width<=p.x+1||p.x+p.width<=a.x+1||a.y+a.height<=p.y+1||p.y+p.height<=a.y+1,'Context panel must not overlap transaction buttons');}
    await shot(owner,'context-'+scenario.id+'-'+scenario.use+'-'+scenario.size.width+'.png');
    const original=(await load()).gameSnapshot.gameState;
    if(scenario.deny){const transaction=runtime.persistence.transaction.bind(runtime.persistence);runtime.persistence.transaction=async(...args)=>{runtime.persistence.transaction=transaction;void args;throw Error('OB-11 injected activation rollback')};await panel.getByRole('button',{name:/Dùng thẻ|Use card/,exact:true}).click();await expect(panel.getByRole('alert')).toBeVisible();const denied=(await load()).gameSnapshot.gameState;assert.deepEqual(denied.privateState.powerUps.inventories[ownerId],original.privateState.powerUps.inventories[ownerId]);assert.ok(denied.turnInfo.pendingPropertyDecision);await shot(owner,'context-denial.png');await reconnectOwner();await expect(panel).toBeVisible();}
    if(scenario.use){
      await panel.getByRole('button',{name:/Dùng thẻ|Use card/,exact:true}).evaluate(button=>{button.click();button.click()});
      await poll(load,r=>r.gameSnapshot.gameState.privateState.powerUps.inventories[ownerId].cards.length===0);await expect(panel).toHaveCount(0);await expect(modal).toBeVisible();
      const state=(await load()).gameSnapshot.gameState;assert.equal((scenario.id==='U03'?state.turnInfo.pendingPropertyDecision:state.turnInfo.pendingDevelopmentDecision).operationId,operationId);
      if(scenario.id==='U03')await expect(modal.locator('.decision-sheet__price strong')).toHaveText(/350/);
      else await expect(modal.getByRole('button',{name:/Xây 4 Nhà.*750|Build 4 houses.*750/i})).toBeEnabled();
      await expect.poll(()=>modal.evaluate(element=>element.contains(document.activeElement))).toBe(true);
    }else{await panel.getByRole('button',{name:/Không dùng thẻ|Continue without a card/}).click();await expect(panel).toHaveCount(0);const state=(await load()).gameSnapshot.gameState;assert.equal(state.privateState.powerUps.inventories[ownerId].cards.length,1);assert.notEqual(state.privateState.powerUps.activeUsage?.[ownerId],state.boardState.turnNumber);}
    const confirm=scenario.id==='U03'?modal.getByRole('button',{name:/Mua tài sản|Buy property/,exact:true}):modal.getByRole('button',{name:/Xây 4 Nhà|Build 4 houses/i});
    await confirm.evaluate(button=>{button.click();button.click()});
    room=await poll(load,r=>scenario.id==='U03'?r.gameSnapshot.gameState.boardState.ownedProps[tileID]?.id===ownerId:r.gameSnapshot.gameState.boardState.ownedProps[tileID]?.houses===4);
    const expectedCost=scenario.id==='U03'?(scenario.use?350:400):(scenario.use?750:800);assert.equal(room.gameSnapshot.gameState.players[ownerId].accountBalance,2000-expectedCost);
    result.checks.push({name:scenario.id+' use='+scenario.use+' '+scenario.size.width+' language='+(scenario.language??'vi'),status:'PASS',operationId,expectedCost});await pass('Context card and original transaction '+scenario.id+' use='+scenario.use+' '+scenario.size.width);
  }
  await owner.evaluate(key=>{const settings=JSON.parse(localStorage.getItem(key));localStorage.setItem(key,JSON.stringify({...settings,language:'vi'}))},SETTINGS_STORAGE_KEY);
  await seed(['A01'],[]);await reconnectOwner();await owner.getByRole('button',{name:/Kho Power-up/}).click();const inventory=owner.getByRole('dialog',{name:'Kho Power-up'});await expect(inventory.getByText(OFFICIAL_POWER_UP_REGISTRY.get('A01').name,{exact:true})).toBeVisible();assert.equal(await inventory.getByRole('button',{name:/Xem chi tiết/}).count(),0);assert.equal(await owner.locator('.power-up-detail').count(),0);await owner.keyboard.press('Escape');await pass('Inventory remains complete with 3D owned card and no detail entry/modal');
  await seed([],[]);const noCard=await commitRoomCommand(runtime,roomId,({state})=>{state.players[ownerId].currentTile=39;state.boardState.currentPlayer={id:ownerId,hasMoved:true};delete state.boardState.ownedProps[39];state.turnInfo.pendingPropertyDecision={operationId:randomUUID(),playerId:ownerId,tileID:39,continuation:{playerId:ownerId,turnNumber:state.boardState.turnNumber}}});broadcastRoom(io,runtime,noCard.room);await expect(owner.locator('.buy-prompt')).toBeVisible();assert.equal(await owner.locator('.contextual-powerups').count(),0);await pass('No eligible card creates no panel or extra checkpoint');
  assert.deepEqual(result.pageErrors,[]);result.status='PASS';console.log('OB-11 context acceptance PASS');
}catch(error){result.status='FAIL';result.failure=String(error.stack??error);for(const[page,name]of [[owner,'owner'],[other,'other']])if(page){await shot(page,'failure-'+name+'.png').catch(()=>{});result[name+'Text']=(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000)}throw error}
finally{await writeFile(path.join(output,'evidence.json'),JSON.stringify(result,null,2));runtime.flags.shuttingDown=true;if(nativeApp){await nativeApp.evaluate(({app})=>app.exit(0)).catch(()=>{});await nativeApp.close().catch(()=>{})}await browser.close();await io.close();await persistence.close()}
