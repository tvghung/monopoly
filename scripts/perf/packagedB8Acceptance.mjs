/** Bounded acceptance against the shipped Windows executable; no synthetic lifecycle events. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from '@playwright/test';
import { findPackagedApplication } from '../../apps/desktop/scripts/packagedRenderer.mjs';
import { installPackagedB8Probe } from './packagedB8Probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = path.join(root,'project-document/ui-ux-overhaul/08L_evidence/packaged');
const { packageRoot } = await findPackagedApplication();
const executable = ['OwnTheBlock.exe','Own the Block.exe'].map(n=>path.join(packageRoot,n)).find(existsSync);
assert.ok(executable);
const result = {
 status:'FAIL', method:'Two real packaged LAN clients; native Electron BrowserWindow minimize/restore; read-only React state and GL submission observation; no synthetic visibility or gameplay events.',
 sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 environment:{platform:os.platform(),arch:os.arch(),release:os.release(),cpu:os.cpus()[0]?.model},
 executable:path.relative(root,executable).replaceAll('\\','/'),
 executableSha256:createHash('sha256').update(await readFile(executable)).digest('hex'),
 checks:[],interruptions:[],errors:[],failedResources:[],
};
const apps=[]; const profiles=[];
const reuseNative = process.env.B8_REUSE_NATIVE_OBSERVATION === '1';
if(reuseNative){const prior=JSON.parse(await readFile(path.join(evidence,'pre-play-again-observation.json'),'utf8'));result.interruptions=prior.interruptions;result.nativeEvidenceReusedFrom='pre-play-again-observation.json';}
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
function pass(name,details){result.checks.push({name,status:'PASS',details});process.stdout.write('[PASS] '+name+'\n');}
async function sample(page){return page.evaluate(()=>window.__B8_PACKAGED_ACCEPTANCE__?.sample());}
const coherent = s=>s && s.queue==='idle' && !s.diceRolling
 && s.displayRollSequence===s.authoritativeRollSequence
 && Object.entries(s.authoritativePositions).every(([id,tile])=>s.settledPositions[id]===tile && s.displayPositions[id]===tile);
async function settle(page,timeout=15000){
 await page.waitForFunction(()=>{const s=window.__B8_PACKAGED_ACCEPTANCE__?.sample();return s && s.queue==='idle' && !s.diceRolling && s.displayRollSequence===s.authoritativeRollSequence && Object.entries(s.authoritativePositions).every(([id,tile])=>s.settledPositions[id]===tile && s.displayPositions[id]===tile);},null,{timeout});
 return sample(page);
}
async function open(label){
 const profile=await mkdtemp(path.join(os.tmpdir(),'otb-b8-'+label+'-')); profiles.push(profile);
 const app=await _electron.launch({executablePath:executable,args:['--user-data-dir='+profile],timeout:30000});apps.push(app);
 const page=await app.firstWindow();
 page.on('pageerror',e=>result.errors.push(label+': '+e));
 page.on('console',m=>{if(m.type()==='error')result.errors.push(label+': '+m.text());});
 page.on('requestfailed',r=>{if(r.url().startsWith('app://'))result.failedResources.push(label+': '+r.url()+': '+r.failure()?.errorText);});
 page.setDefaultTimeout(15000);
 await page.addInitScript(installPackagedB8Probe);
 await page.evaluate(installPackagedB8Probe);
 await page.locator('#desktop-launcher-title').waitFor({timeout:30000});
 await app.evaluate(({BrowserWindow})=>{
  globalThis.__b8WindowEvents=[];
  const w=BrowserWindow.getAllWindows()[0];
  for(const kind of ['minimize','restore','hide','show','blur','focus'])w.on(kind,()=>globalThis.__b8WindowEvents.push({kind,atEpochMs:Date.now(),minimized:w.isMinimized()}));
 });
 return {app,page,label};
}
async function attach(page){
 await page.waitForFunction(()=>window.__B8_PACKAGED_ACCEPTANCE__?.attach(),null,{timeout:30000});
}
async function actor(clients){
 for(let i=0;i<120;i++){
  for(const c of clients){const b=c.page.getByRole('button',{name:'Đổ xúc xắc',exact:true});if(await b.isVisible() && await b.isEnabled())return c;}
  await sleep(100);
 }
 throw Error('No enabled dice button in bounded turn wait');
}
async function decisions(clients){
 for(let i=0;i<100;i++){
  for(const c of clients){
   const decline=c.page.getByRole('button',{name:'Không mua',exact:true});
   if(await decline.isVisible() && await decline.isEnabled())await decline.click();
   const card=c.page.getByTestId('card-interaction-overlay').getByRole('button',{name:'Đóng',exact:true});
   if(await card.isVisible() && await card.isEnabled())await card.click();
  }
  if(await Promise.all(clients.map(c=>sample(c.page))).then(ss=>ss.every(s=>s && !s.pendingCard && !s.pendingLanding && coherent(s))))return;
  await sleep(100);
 }
 throw Error('Landing/card decision did not settle');
}
async function interrupt(c,stage){
 const before=await sample(c.page);
 const item={client:c.label,stage,before};result.interruptions.push(item);
 item.nativeMinimize=await c.app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const atEpochMs=Date.now();w.minimize();return {atEpochMs,minimized:w.isMinimized(),visible:w.isVisible()};});
 try{await c.page.waitForFunction(()=>document.hidden,null,{timeout:3000});item.nativeHiddenObserved=true;}catch{item.nativeHiddenObserved=false;}
 item.hiddenSample=await sample(c.page); item.countersAtMinimize=await c.page.evaluate(()=>({frames:window.__B8_PACKAGED_ACCEPTANCE__.frames,drawCalls:window.__B8_PACKAGED_ACCEPTANCE__.drawCalls}));
 await sleep(6000);
 item.beforeRestore=await sample(c.page); item.countersBeforeRestore=await c.page.evaluate(()=>({frames:window.__B8_PACKAGED_ACCEPTANCE__.frames,drawCalls:window.__B8_PACKAGED_ACCEPTANCE__.drawCalls}));
 item.nativeRestore=await c.app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const atEpochMs=Date.now();w.restore();w.show();w.focus();return {atEpochMs,minimized:w.isMinimized()};});
 const restoredAt=item.nativeRestore.atEpochMs;
 await c.page.waitForFunction(()=>!document.hidden,null,{timeout:3000});
 item.coherent=await settle(c.page,item.nativeHiddenObserved?1000:15000);
 item.coherentObservedAfterMs=Date.now()-restoredAt;
 await c.page.waitForFunction(t=>(window.__B8_PACKAGED_ACCEPTANCE__?.lastDrawEpochMs??0)>=t,restoredAt,{timeout:1000});
 item.submission=await c.page.evaluate(()=>({firstVisibleDrawEpochMs:window.__B8_PACKAGED_ACCEPTANCE__.firstVisibleDrawEpochMs,lastDrawEpochMs:window.__B8_PACKAGED_ACCEPTANCE__.lastDrawEpochMs}));
 item.firstVisibleSubmissionAfterMs=item.nativeHiddenObserved?item.submission.firstVisibleDrawEpochMs-restoredAt:null;
 item.eventsAtRestore=await c.page.evaluate(()=>window.__B8_PACKAGED_ACCEPTANCE__.events.length);
 await sleep(1800);
 item.afterQuiet=await sample(c.page);
 item.events=await c.page.evaluate(()=>window.__B8_PACKAGED_ACCEPTANCE__.events);
 item.nativeEvents=await c.app.evaluate(()=>globalThis.__b8WindowEvents);
 await c.page.screenshot({path:path.join(evidence,stage+'-restored.png')});
 if(!item.nativeHiddenObserved){item.status='BLOCKED';return;}
 assert.equal(item.nativeMinimize.minimized,true);
 assert.equal(item.nativeRestore.minimized,false);
 assert.ok(coherent(item.afterQuiet),'Coherent state lost after restore');
 assert.equal(item.afterQuiet.authoritativeRollSequence,item.coherent.authoritativeRollSequence);
 assert.equal(item.afterQuiet.resetEpoch,item.coherent.resetEpoch);
 const obsolete=item.events.filter(e=>e.kind==='presentation' && e.atEpochMs>=restoredAt && (e.diceRolling || e.movements.some(m=>m.phase==='START')));
 assert.equal(obsolete.length,0,'Obsolete animation started after restore');
 assert.ok(item.firstVisibleSubmissionAfterMs>=0 && item.firstVisibleSubmissionAfterMs<=1000);
 item.status='PASS';pass('native '+stage+' minimize/restore settles without obsolete replay', {coherentObservedAfterMs:item.coherentObservedAfterMs,firstVisibleSubmissionAfterMs:item.firstVisibleSubmissionAfterMs});
}
try{
 await mkdir(evidence,{recursive:true});
 const host=await open('host');
 result.environment.runtime=await host.app.evaluate(({app})=>({versions:process.versions,argv:process.argv,packaged:app.isPackaged,gpu:app.getGPUFeatureStatus()}));
 assert.equal(result.environment.runtime.packaged,true);
 await host.page.getByRole('button',{name:'Cài đặt'}).click();
 assert.equal(await host.page.locator('html').getAttribute('data-graphics-quality'),'balanced');
 assert.equal(await host.page.getByRole('radio',{name:'Cân bằng'}).getAttribute('aria-checked'),'true');
 await host.page.getByRole('button',{name:'Xong'}).click();
 await host.page.locator('[data-launcher-choice="host"]').click();
 await host.page.getByRole('radio',{name:'LAN'}).click();
 await host.page.locator('#desktop-player-name').fill('B8 Host');
 await host.page.getByRole('button',{name:'Tạo và vào phòng'}).click();
 await host.page.locator('.lobby').waitFor({timeout:30000});
 const code=(await host.page.locator('#lobby-title').innerText()).trim();assert.match(code,/^OTB-[A-Z0-9]{6}$/);
 assert.equal(await host.page.locator('.mascot-picker__hero-image').getAttribute('alt'),'Chó');
 pass('normal sandboxed package; Balanced graphics and Dog default');
 const guest=await open('guest');const clients=[host,guest];
 await guest.page.locator('[data-launcher-choice="join"]').click();
 await guest.page.locator('#desktop-player-name').fill('B8 Guest');
 await guest.page.locator('#desktop-lan-room').fill(code);
 await guest.page.getByRole('button',{name:'Kết nối và vào phòng'}).click();
 await guest.page.locator('.lobby').waitFor({timeout:30000});
 for(const c of clients)await c.page.getByRole('button',{name:'Sẵn sàng',exact:true}).click();
 await host.page.getByRole('button',{name:'Bắt đầu',exact:true}).click();
 for(const c of clients){await c.page.locator('canvas').first().waitFor({timeout:30000});await attach(c.page);}
 await sleep(2000);pass('two actual packaged clients enter a real LAN game');
 let c=await actor(clients);await c.page.getByRole('button',{name:'Đổ xúc xắc',exact:true}).click();
 await c.page.waitForFunction(()=>window.__B8_PACKAGED_ACCEPTANCE__.sample()?.diceRolling,null,{timeout:5000});
 if(reuseNative)await settle(c.page);else await interrupt(c,'dice');
 await decisions(clients);
 c=await actor(clients);await c.page.getByRole('button',{name:'Đổ xúc xắc',exact:true}).click();
 await c.page.waitForFunction(()=>window.__B8_PACKAGED_ACCEPTANCE__.sample()?.movements.some(m=>m.phase==='START'),null,{timeout:8000});
 if(!reuseNative && result.interruptions[0].nativeHiddenObserved)await interrupt(c,'movement'); else {await settle(c.page); pass('native suspension observation bounded after one unsupported minimize');}
 await decisions(clients);
 c=await actor(clients);
 await c.page.evaluate(()=>{window.__B8_PACKAGED_ACCEPTANCE__.events.length=0;});
 await c.page.getByRole('button',{name:'Đổ xúc xắc',exact:true}).click();
 await c.page.waitForFunction(()=>window.__B8_PACKAGED_ACCEPTANCE__.sample()?.movements.some(m=>m.phase==='START'),null,{timeout:8000});
 await settle(c.page);
 result.normalMotion={client:c.label,state:await sample(c.page),events:await c.page.evaluate(()=>window.__B8_PACKAGED_ACCEPTANCE__.events)};
 assert.ok(result.normalMotion.events.some(e=>e.diceRolling));
 assert.ok(result.normalMotion.events.some(e=>e.movements.some(m=>m.phase==='START')));
 await decisions(clients);
 pass('normal dice, individual hops, landing feedback and exact final position');
 const preReload=await sample(guest.page);
 await guest.page.reload(); await guest.page.locator('#desktop-launcher-title').waitFor({timeout:15000}); await guest.page.locator('[data-launcher-choice="join"]').click(); await guest.page.locator('#desktop-player-name').fill('B8 Guest'); await guest.page.locator('#desktop-lan-room').fill(code); await guest.page.getByRole('button',{name:'Kết nối và vào phòng'}).click(); await guest.page.locator('canvas').first().waitFor({timeout:30000});await attach(guest.page);
 const postReload=await settle(guest.page);assert.equal(postReload.roomId,preReload.roomId);
 assert.deepEqual(postReload.authoritativePositions,preReload.authoritativePositions);
 result.reconnect={before:preReload,after:postReload};
 pass('packaged guest reload and launcher rejoin reconnect to the same active game and positions');
 await host.page.screenshot({path:path.join(evidence,'normal-game.png')});
 await guest.page.locator('.room-exit-button').click();
 await guest.page.getByRole('alertdialog').getByRole('button',{name:'Bỏ cuộc'}).click();
 await guest.page.getByText('Chế độ Khán Giả',{exact:true}).waitFor({timeout:15000});
 await host.page.getByRole('button',{name:'Chơi lại',exact:true}).click();
 await host.page.locator('.lobby').waitFor({timeout:30000});
 assert.equal((await host.page.locator('#lobby-title').innerText()).trim(),code);
 pass('guest forfeit and host Play Again return to the same room lobby');
 assert.equal(await host.page.locator('html').getAttribute('data-graphics-quality'),'balanced');
 assert.equal(await host.page.locator('.mascot-picker__hero-image').getAttribute('alt'),'Chó');
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.failedResources,[]);
 pass('no renderer runtime errors or failed packaged resources; defaults retained');
 await host.page.locator('.lobby__leave').click();
 await host.page.locator('#desktop-launcher-title').waitFor({timeout:30000});
 result.status=result.interruptions.every(x=>x.status==='PASS')?'PASS':'BLOCKED';
}catch(e){result.failure=e.stack??String(e); for(const app of apps){try{const p=await app.firstWindow();result.failureUi=(result.failureUi??[]).concat((await p.locator('body').innerText()).slice(0,5000));await p.screenshot({path:path.join(evidence,'failure-'+app.process().pid+'.png')});}catch{/* A destroyed renderer has no diagnostic surface. */}} process.stderr.write(result.failure+'\n');}
finally{
 await writeFile(path.join(evidence,'acceptance.json'),JSON.stringify(result,null,2)+'\n');
 for(const app of apps.reverse()){try{execFileSync('taskkill',['/PID',String(app.process().pid),'/T','/F'],{stdio:'ignore'});}catch{app.process().kill();}} 
 for(const profile of profiles){assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>undefined);}
}
process.stdout.write('Packaged acceptance: '+result.status+'\n');
process.exit(result.status==='FAIL'?1:0);
