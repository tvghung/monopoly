/* global location, document, window, MutationObserver */
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
import { DEFAULT_GAME_SETTINGS, SETTINGS_STORAGE_KEY } from '../apps/client/src/settings/defaults.ts';
import { findPackagedApplication } from '../apps/desktop/scripts/packagedRenderer.mjs';

const refinementMode=process.argv.includes('--refinement');
const artworkMode=process.argv.includes('--artwork')||refinementMode;
const artworkChecks=artworkMode ? await import('./art/powerUpArtworkAcceptance.mjs') : null;
const root=fileURLToPath(new URL('../',import.meta.url));const native=(process.env.POWERUP_NATIVE==='1'||process.argv.includes('--native'));const output=path.join(root,refinementMode?'test-results/powerup-09c1':artworkMode?'test-results/powerup-09bc':'test-results/powerup-08b',native?'native-ob7':'browser-ob7');await mkdir(output,{recursive:true});
const persistence=new InMemoryPersistenceStore();const runtime=createAppRuntime(persistence,loadServerConfig({}).persistenceTiming);const{server,io}=createServer(runtime,{environment:{SERVER_RUNTIME_PROFILE:'desktop'},clientDist:path.join(root,'apps/client/dist')});registerSocketHandlers(io,runtime,'development');await new Promise(resolve=>server.listen(0,native?'0.0.0.0':'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;const lanAddress=Object.values(os.networkInterfaces()).flat().find(item=>item?.family==='IPv4'&&!item.internal)?.address;const inviteOrigin=native?'http://'+lanAddress+':'+server.address().port:origin;
const browser=await chromium.launch({executablePath:process.env.POWERUP_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-webgl']});const contexts=[];let nativeApp;const result={status:'RUNNING',mode:native?'Packaged Electron acting player + Chromium opponent':'Two Chromium players',checks:[],screenshots:[],pageErrors:[],manual:'Physical GPU, refresh rates, listening, cross-device and macOS UAT remain required.'};
async function preferences(context){await context.addInitScript(({key,settings})=>{if(location.origin!=='null')localStorage.setItem(key,JSON.stringify({...settings,muted:true,reducedMotion:false,graphicsQuality:'low'}))},{key:SETTINGS_STORAGE_KEY,settings:DEFAULT_GAME_SETTINGS})}
async function webPlayer(name){const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});contexts.push(context);await preferences(context);const page=await context.newPage();await page.goto(origin+'/?room=PU-08B');await page.getByLabel('Tên của bạn').fill(name);await page.getByRole('button',{name:'Vào phòng'}).click();await expect(page.locator('.lobby')).toBeVisible();return page}
async function poll(read,valid){const deadline=Date.now()+15000;while(Date.now()<deadline){const value=await read();if(valid(value))return value;await new Promise(resolve=>setTimeout(resolve,25))}throw Error('Authoritative state timeout')}
async function pass(name){result.checks.push({name,status:'PASS'});console.log('PASS: '+name);await writeFile(path.join(output,'evidence.json'),JSON.stringify(result,null,2))}
async function shot(page,name){if(artworkChecks&&!name.startsWith('failure'))await artworkChecks.inspectArtwork(page);await page.screenshot({path:path.join(output,name),animations:'disabled'});result.screenshots.push(name)}
let owner,other;
try{
  other=await webPlayer('08B Other');
  if(native){const{packageRoot}=await findPackagedApplication();const executable=['OwnTheBlock.exe','Own the Block.exe'].map(name=>path.join(packageRoot,name)).find(existsSync);const profile=await mkdtemp(path.join(os.tmpdir(),'otb-powerup-08b-'));result.profile=profile;nativeApp=await _electron.launch({executablePath:executable,args:['--user-data-dir='+profile],timeout:30000});owner=await nativeApp.firstWindow();await preferences(nativeApp.context());await owner.reload();await owner.locator('#desktop-launcher-title').waitFor();await owner.locator('[data-launcher-choice="join"]').click();await owner.locator('#desktop-player-name').fill('08B Owner');await owner.locator('#desktop-lan-room').fill(inviteOrigin+'/?room=PU-08B');await owner.getByRole('button',{name:'Kết nối và vào phòng'}).click();await expect(owner.locator('.lobby')).toBeVisible();result.nativeRuntime=await nativeApp.evaluate(({app})=>({packaged:app.isPackaged,versions:process.versions,gpu:app.getGPUFeatureStatus()}));assert.equal(result.nativeRuntime.packaged,true);assert.ok(owner.url().startsWith('app://'));}
  else owner=await webPlayer('08B Owner');
  for(const page of [owner,other]){page.setDefaultTimeout(15000);page.on('pageerror',error=>result.pageErrors.push(error.message))}
  await other.getByRole('button',{name:'Chó',exact:true}).click();await owner.getByRole('button',{name:'Capybara',exact:true}).click();for(const page of [owner,other])await page.getByRole('button',{name:'Sẵn sàng',exact:true}).click();await other.getByRole('button',{name:'Bắt đầu',exact:true}).click();for(const page of [owner,other])await expect(page.getByTestId('game-board')).toBeVisible();
  let room=await persistence.rooms.findByCode('PU-08B');const roomId=room.id;const ids=Object.fromEntries(Object.entries(room.gameSnapshot.gameState.players).map(([id,p])=>[p.name,id]));const ownerId=ids['08B Owner'];const otherId=ids['08B Other'];const load=()=>persistence.rooms.findById(roomId);
  const seed=async(owned,opposing,actor=ownerId,keepStatuses=false)=>{const committed=await commitRoomCommand(runtime,roomId,({state})=>{state.turnInfo={};state.boardState.currentPlayer={id:actor,hasMoved:false};state.boardState.turnNumber++;state.boardState.turnRecovery=null;for(const player of Object.values(state.players)){player.isJail=false;player.accountBalance=2000;player.currentTile=0}const old=state.privateState.powerUps;const pu=state.privateState.powerUps=createPowerUpState();if(keepStatuses)pu.statuses=old.statuses;for(const[who,cards]of [[ownerId,owned],[otherId,opposing]]){pu.inventories[who]=createPowerUpInventory(3);for(const definitionId of cards)pu.inventories[who].cards.push({instanceId:randomUUID(),ownerPlayerId:who,definitionId,obtainedFromOfferId:randomUUID()})}state.boardState.ownedProps[1]={id:ownerId,color:'red',houses:0};state.boardState.ownedProps[3]={id:otherId,color:'blue',houses:0}});broadcastRoom(io,runtime,committed.room);return committed.room};
  const open=async(page,name)=>{await page.getByRole('button',{name:/Kho Power-up/}).click();const inventory=page.getByRole('dialog',{name:'Kho Power-up'});const entry=inventory.locator('.power-up-grid > div').filter({has:page.getByText(name,{exact:true})});await entry.getByRole('button',{name:'Dùng thẻ',exact:true}).click();return page.getByRole('dialog',{name,exact:true})};
  const reconnectOwner=async()=>{await owner.reload();if(native){await owner.locator('#desktop-launcher-title').waitFor();await owner.locator('[data-launcher-choice="join"]').click();await owner.locator('#desktop-player-name').fill('08B Owner');await owner.locator('#desktop-lan-room').fill(inviteOrigin+'/?room=PU-08B');await owner.getByRole('button',{name:'Kết nối và vào phòng'}).click()}await expect(owner.getByTestId('game-board')).toBeVisible()};

  for (const reduced of [false, true]) {
    await owner.emulateMedia({reducedMotion: reduced ? 'reduce' : 'no-preference'});
    await seed(['A08'], []); await reconnectOwner();
    await owner.evaluate(() => {
      window.ob7Timeline = [];
      const record = () => { const node = document.querySelector('[data-feedback-id]'); const id = node?.getAttribute('data-feedback-id') ?? null;
        const previous = window.ob7Timeline.at(-1); if (previous?.id === id) { if (node) { previous.kind = node.getAttribute('data-powerup-feedback'); previous.text = node.textContent; } return; }
        window.ob7Timeline.push({id, kind:node?.getAttribute('data-powerup-feedback'), text:node?.textContent, at:performance.now()});
      }; new MutationObserver(record).observe(document.body, {subtree:true,childList:true,attributes:true}); record();
    });
    const dialog = await open(owner, 'Khủng Hoảng Thị Trường');
    await dialog.getByRole('button', {name:'Dùng thẻ',exact:true}).click();
    await poll(load, r => r.gameSnapshot.gameState.privateState.powerUps.statuses.some(s => s.definitionId === 'A08'));
    await expect(owner.locator('[data-feedback-id]')).toBeVisible();
    await expect(owner.getByRole('button', {name:/Kho Power-up/})).toBeEnabled();
    await shot(owner, 'ob7-feedback-' + reduced + '.png');
    await owner.waitForTimeout(11000);
    const timeline = await owner.evaluate(() => window.ob7Timeline);
    const shown = timeline.filter(item => item.id); assert.equal(shown.length, 2);
    for (const cue of shown) { const end = timeline[timeline.indexOf(cue)+1]; assert.ok(end.at-cue.at >= 4900, JSON.stringify(timeline)); }
    result.checks.push({name:'OB-7 A08 ACK/removal + independent status; 5s per cue; gameplay free; reduced='+reduced,status:'PASS',timeline});
    await pass('Readable A08 feedback and exact-instance merge, reduced='+reduced);
    await reconnectOwner(); await expect(owner.locator('[data-feedback-id]')).toHaveCount(0);
  }
  assert.deepEqual(result.pageErrors, []); result.status='PASS'; console.log('OB-7 acceptance PASS');
}catch(error){result.status='FAIL';result.failure=String(error.stack??error);for(const[page,name]of [[owner,'owner'],[other,'other']])if(page){await shot(page,'failure-'+name+'.png').catch(()=>{});result[name+'Text']=(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000)}throw error}
finally{await writeFile(path.join(output,'evidence.json'),JSON.stringify(result,null,2));runtime.flags.shuttingDown=true;if(nativeApp){await nativeApp.evaluate(({app})=>app.exit(0)).catch(()=>{});await nativeApp.close().catch(()=>{})}await browser.close();await io.close();await persistence.close()}
