/* global location */
/** Server-validated turn fixtures through production clients; --native uses a packaged Electron guest. */
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
import { recordActivityEvent } from '../apps/server/src/game/activity.ts';
import { moveBy } from '../apps/server/src/game/dice.ts';
import { nextTurn } from '../apps/server/src/game/turn.ts';
import { createPowerUpState } from '../apps/server/src/game/powerUps/foundation.ts';
import { DEFAULT_GAME_SETTINGS, SETTINGS_STORAGE_KEY } from '../apps/client/src/settings/defaults.ts';
import { findPackagedApplication } from '../apps/desktop/scripts/packagedRenderer.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const native=process.argv.includes('--native');
const output=path.join(root,'test-results/ob15-turn-logs',native?'native':'browser');
await mkdir(output,{recursive:true});
const persistence=new InMemoryPersistenceStore();
const runtime=createAppRuntime(persistence,loadServerConfig({}).persistenceTiming);
const {server,io}=createServer(runtime,{environment:{SERVER_RUNTIME_PROFILE:'desktop'},clientDist:path.join(root,'apps/client/dist')});
registerSocketHandlers(io,runtime,'development');
await new Promise(resolve=>server.listen(0,native?'0.0.0.0':'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const lan=Object.values(os.networkInterfaces()).flat().find(i=>i?.family==='IPv4'&&!i.internal)?.address;
const invite=native?'http://'+lan+':'+server.address().port:origin;
const browser=await chromium.launch({executablePath:process.env.POWERUP_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-webgl']});
let nativeApp;const pages=[];const result={status:'RUNNING',mode:native?'Packaged Electron Guest + Chromium Host/players/Spectator':'Chromium Host/4 players/Spectator',checks:[],handoffs:[],screenshots:[],pageErrors:[]};
async function preferences(context){await context.addInitScript(({key,settings})=>{if(location.origin!=='null'&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({...settings,muted:true,reducedMotion:false,graphicsQuality:'low'}))},{key:SETTINGS_STORAGE_KEY,settings:DEFAULT_GAME_SETTINGS})}
async function join(name,started=false){const context=await browser.newContext({viewport:{width:1440,height:900}});await preferences(context);const page=await context.newPage();pages.push(page);await page.goto(origin+'/?room=LOG15');await page.getByLabel('Tên của bạn').fill(name);await page.getByRole('button',{name:'Vào phòng'}).click();await expect(started?page.getByTestId('game-board'):page.locator('.lobby')).toBeVisible();return page}
async function journal(page){const toggle=page.locator('button[aria-controls=board-log-panel]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();return page.getByRole('log')}
async function pass(name){result.checks.push({name,status:'PASS'});console.log('PASS: '+name)}
async function shot(page,name){await page.screenshot({path:path.join(output,name),animations:'disabled'});result.screenshots.push(name)}
let host,guest,spectator;
try{
  host=await join('Log Host');
  if(native){const {packageRoot}=await findPackagedApplication();const executable=['OwnTheBlock.exe','Own the Block.exe'].map(n=>path.join(packageRoot,n)).find(existsSync);const profile=await mkdtemp(path.join(os.tmpdir(),'otb-ob15-'));nativeApp=await _electron.launch({executablePath:executable,args:['--user-data-dir='+profile],timeout:30000});guest=await nativeApp.firstWindow();pages.push(guest);await preferences(nativeApp.context());await guest.reload();await guest.locator('#desktop-launcher-title').waitFor();await guest.locator('[data-launcher-choice="join"]').click();await guest.locator('#desktop-player-name').fill('Log Guest');await guest.locator('#desktop-lan-room').fill(invite+'/?room=LOG15');await guest.getByRole('button',{name:/Kết nối và vào phòng|Connect and join room/}).click();await expect(guest.locator('.lobby')).toBeVisible();result.nativeRuntime=await nativeApp.evaluate(({app})=>({packaged:app.isPackaged,versions:process.versions}));assert.equal(result.nativeRuntime.packaged,true);assert.ok(guest.url().startsWith('app://'));}
  else guest=await join('Log Guest');
  const third=await join('Log Third');const fourth=await join('Log Fourth');
  const seats=[host,guest,third,fourth];const mascots=['Chó','Capybara','Mèo','Vịt'];
  for(let i=0;i<seats.length;i++){await seats[i].getByRole('button',{name:mascots[i],exact:true}).click();await seats[i].getByRole('button',{name:'Sẵn sàng',exact:true}).click()}
  await host.getByRole('button',{name:'Bắt đầu',exact:true}).click();
  for(const page of seats)await expect(page.getByTestId('game-board')).toBeVisible();
  spectator=await join('Log Viewer',true);
  const views=[host,guest,spectator];for(const page of pages)page.on('pageerror',e=>result.pageErrors.push(e.message));
  for(const page of views)await journal(page);
  let room=await persistence.rooms.findByCode('LOG15');const roomId=room.id;const load=()=>persistence.rooms.findById(roomId);
  const commit=async(action)=>{const saved=await commitRoomCommand(runtime,roomId,({state})=>action(state));broadcastRoom(io,runtime,saved.room);return saved.room};
  await commit(state=>{state.turnInfo={};state.boardState.paymentQueue=null;state.boardState.turnRecovery=null;state.boardState.currentPlayer.hasMoved=false;state.privateState.powerUps=createPowerUpState();for(const player of Object.values(state.players)){player.currentTile=18;player.isJail=false;player.accountBalance=1500}});
  await new Promise(resolve=>setTimeout(resolve,1200));
  for(let turn=0;turn<4;turn++){
    room=await load();const actor=room.gameSnapshot.gameState.boardState.currentPlayer.id;const name=room.gameSnapshot.gameState.players[actor].name;
    await commit(state=>{state.boardState.rollSequence++;state.boardState.diceValue={dice1:1,dice2:1};state.boardState.currentPlayer.hasMoved=true;moveBy(state,actor,2);recordActivityEvent(state,{type:'TILE_LANDED',playerId:actor,playerName:name,tileID:20})});
    const row=page=>page.locator('.activity-entry--tile_landed').filter({has:page.locator('[data-player-id="'+actor+'"]')});
    for(const page of views)assert.equal(await row(page).count(),0,'Active turn leaked before handoff');
    const start=performance.now();await commit(state=>nextTurn(state));
    for(const page of views)await expect(row(page)).toHaveCount(1,{timeout:650});
    result.handoffs.push({actor,name,publishedWithinMs:Math.round(performance.now()-start)});
    for(const page of views)assert.equal(await row(page).locator('.activity-player-name').textContent(),name);
  }
  await pass('Four consecutive authoritative handoffs publish each completed actor on Host/Guest/Spectator without waiting for anchor or dice/walk queue idle');
  await shot(guest,'four-handoffs.png');
  room=await load();const actor=room.gameSnapshot.gameState.boardState.currentPlayer.id;const name=room.gameSnapshot.gameState.players[actor].name;
  await commit(state=>{state.boardState.currentPlayer.hasMoved=true;state.players[actor].currentTile=21;delete state.boardState.ownedProps[21];state.turnInfo.pendingPropertyDecision={operationId:randomUUID(),playerId:actor,tileID:21,continuation:{playerId:actor,turnNumber:state.boardState.turnNumber}};recordActivityEvent(state,{type:'PROPERTY_PURCHASE',playerId:actor,playerName:name,tileID:21,price:220});recordActivityEvent(state,{type:'CHAT',senderRole:'PLAYER',senderPlayerId:actor,senderName:name,message:'OB15 chat now'})});
  for(const page of views){await expect(page.locator('.activity-entry--chat').filter({hasText:'OB15 chat now'})).toHaveCount(1);assert.equal(await page.locator('.activity-entry--property_purchase').count(),0);assert.equal(await page.locator('.activity-entry--tile_landed').count(),4)}
  await pass('New pending purchase does not hide earlier completed turns; current gameplay stays gated and authoritative chat remains immediate');
  await commit(state=>{state.turnInfo={};nextTurn(state)});
  for(const page of views)await expect(page.locator('.activity-entry--property_purchase')).toHaveCount(1,{timeout:650});
  const feed=structuredClone((await load()).gameSnapshot.gameState.boardState.activityFeed);
  const reconnectGuest=async()=>{await guest.reload();if(native){await guest.locator('#desktop-launcher-title').waitFor();await guest.locator('[data-launcher-choice="join"]').click();await guest.locator('#desktop-player-name').fill('Log Guest');await guest.locator('#desktop-lan-room').fill(invite+'/?room=LOG15');await guest.getByRole('button',{name:/Kết nối và vào phòng|Connect and join room/}).click()}await expect(guest.getByTestId('game-board')).toBeVisible();await journal(guest)};
  await reconnectGuest();assert.deepEqual((await load()).gameSnapshot.gameState.boardState.activityFeed,feed);await expect(guest.locator('.activity-entry--tile_landed')).toHaveCount(4);await expect(guest.locator('.activity-entry--property_purchase')).toHaveCount(1);
  await pass('Reconnect hydrates the same committed identities/order without duplicate gameplay or chat');
  await guest.evaluate(key=>{const settings=JSON.parse(localStorage.getItem(key));localStorage.setItem(key,JSON.stringify({...settings,language:'en'}))},SETTINGS_STORAGE_KEY);await reconnectGuest();await expect(guest.locator('.activity-entry--tile_landed').first()).toContainText('landed on');assert.equal(await guest.locator('.activity-player-name').count()>=5,true);await shot(guest,'english-history.png');
  await pass('VI/EN copy and OB-14 player-name colors survive the new timing and reconnect');
  assert.deepEqual(result.pageErrors,[]);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=String(error.stack??error);for(const [page,name] of [[host,'host'],[guest,'guest'],[spectator,'spectator']])if(page)await shot(page,'failure-'+name+'.png').catch(()=>{});throw error}
finally{await writeFile(path.join(output,'evidence.json'),JSON.stringify(result,null,2));runtime.flags.shuttingDown=true;if(nativeApp){await nativeApp.evaluate(({app})=>app.exit(0)).catch(()=>{});await nativeApp.close().catch(()=>{})}await browser.close();await io.close();await persistence.close()}
