/* global DOMParser, Image, document */
/** Reproducible vector → lossless 640×400 PNG export using the project's Playwright/Chromium. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { decodePng, compareImages } from '../perf/pngDiff.mjs';
import { illustrations, categoryBack } from './powerUpIllustrations.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const target=path.join(root,'apps/client/public/art/powerups');
const browser=await chromium.launch({ ...(process.env.POWERUP_CHROME_PATH ? {executablePath:process.env.POWERUP_CHROME_PATH} : process.platform==='win32' ? {executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'} : {}),headless:true });
const page=await browser.newPage();const files=[];const verify=process.argv.includes('--verify');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
 for(const [relative,svg] of [...Object.entries(illustrations).map(([id,draw])=>['fronts/'+id,draw()]),...['ATTACK','DEFENSE','UTILITY'].map(category=>['backs/'+category.toLowerCase(),categoryBack(category)])]) {
  const svgBytes=Buffer.from(svg);await mkdir(path.dirname(path.join(target,relative)),{recursive:true});
  const pngBase64=await page.evaluate(async svg=>{
   const xml=new DOMParser().parseFromString(svg,'image/svg+xml');if(xml.querySelector('parsererror'))throw Error('Invalid XML');
   const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;canvas.getContext('2d').drawImage(image,0,0,640,400);
   return canvas.toDataURL('image/png').split(',')[1];
  },svg);
  const png=Buffer.from(pngBase64,'base64');
  if(verify){const source=await readFile(path.join(target,relative+'.svg'));if(!source.equals(svgBytes))throw Error('SVG differs from authored composition: '+relative);const exported=await readFile(path.join(target,relative+'.png'));if(!compareImages(decodePng(png),decodePng(exported)).identical)throw Error('SVG/PNG pixel mismatch: '+relative)}
  else {await writeFile(path.join(target,relative+'.svg'),svgBytes);await writeFile(path.join(target,relative+'.png'),png)}
  files.push({relative,svgSha256:digest(svgBytes),pngSha256:digest(png),svgBytes:svgBytes.length,pngBytes:png.length});
 }
 const manifest={schemaVersion:1,width:640,height:400,exporter:'Playwright Chromium canvas; RGBA lossless PNG',chromium:browser.version(),files};
 if(!verify) await writeFile(path.join(root,'scripts/art/powerUpExportManifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Exported '+files.length+' original SVG/PNG pairs; '+files.reduce((sum,f)=>sum+f.svgBytes+f.pngBytes,0)+' bytes');
} finally {await browser.close()}
