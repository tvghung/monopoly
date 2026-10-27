import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { decodePng } from '../../../scripts/perf/pngDiff.mjs';
import { listFiles, runArtworkCli } from './artworkValidation.mjs';

const clientRoot=fileURLToPath(new URL('../',import.meta.url));
export const artworkRoot=path.join(clientRoot,'public/art/powerups');
export const frontIds=['A','D','U'].flatMap(prefix=>Array.from({length:10},(_,i)=>prefix+String(i+1).padStart(2,'0')));
export const backNames=['attack','defense','utility'];
const expected=frontIds.map(id=>'fronts/'+id).concat(backNames.map(name=>'backs/'+name));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const dom=new JSDOM('');
const tags=new Set(['svg','title','g','path','rect','circle','ellipse','polygon','polyline','line']);
export function inspectPowerUpSvg(source) {
 if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|url\s*\(|@import/iu.test(source))throw Error('Unsafe SVG dependency');
 const doc=new dom.window.DOMParser().parseFromString(source,'image/svg+xml');
 if(doc.querySelector('parsererror'))throw Error('Invalid SVG XML');
 if(doc.documentElement.localName!=='svg'||doc.documentElement.getAttribute('viewBox')!=='0 0 640 400'||doc.documentElement.getAttribute('width')!=='640'||doc.documentElement.getAttribute('height')!=='400')throw Error('Invalid SVG viewBox');
 for(const el of doc.querySelectorAll('*')){
  if(!tags.has(el.localName)||el.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('Unsafe SVG element: '+el.localName);
  for(const attr of el.attributes)if(/^on|href|style/iu.test(attr.name)||(/https?:|data:|file:|javascript:/iu.test(attr.value)&&attr.name!=='xmlns'))throw Error('Unsafe SVG attribute');
 }
 return doc;
}
export function inspectPowerUpPng(bytes) {
 let offset=8,ended=false;
 while(offset<bytes.length){
  if(offset+12>bytes.length)throw Error('Truncated PNG chunk');
  const size=bytes.readUInt32BE(offset);if(offset+12+size>bytes.length)throw Error('Truncated PNG data');
  if(crc32(bytes.subarray(offset+4,offset+8+size))!==bytes.readUInt32BE(offset+8+size))throw Error('Invalid PNG checksum');
  const type=bytes.toString('ascii',offset+4,offset+8);offset+=12+size;
  if(type==='IEND'){ended=true;break}
 }
 if(!ended||offset!==bytes.length)throw Error('PNG must end with IEND');
 const image=decodePng(bytes);if(image.width!==640||image.height!==400)throw Error('PNG must be 640×400');
 return image;
}
export async function validatePowerUpArtwork({sourceDirectory=artworkRoot,buildDirectory}={}) {
 const report={schemaVersion:1,expected:33,fronts:30,backs:3,rarities:4,files:[],errors:[]};
 const manifest=JSON.parse(await readFile(path.join(clientRoot,'../../scripts/art/powerUpExportManifest.json'),'utf8'));
 const mapping=await readFile(path.join(clientRoot,'src/game/ui/powerUps/powerUpArtManifest.ts'),'utf8');
 const registry=await readFile(path.join(clientRoot,'../server/src/game/powerUps/catalog.ts'),'utf8');
 const registryIds=[...registry.split('const identities = [')[1].split('] as const;')[0].matchAll(/\['([ADU]\d{2})', '/g)].map(m=>m[1]);
 if(registryIds.length!==30||frontIds.some(id=>!registryIds.includes(id)))report.errors.push('Official registry IDs differ from artwork contract');
 for(const id of frontIds)if(!mapping.includes(id+": 'fronts/"+id+"'"))report.errors.push('Missing ID mapping: '+id);
 for(const back of backNames)if(!mapping.includes(back.toUpperCase()+": 'backs/"+back+"'"))report.errors.push('Missing back mapping: '+back);
 for(const rarity of ['COMMON','RARE','EPIC','LEGENDARY'])if(!new RegExp(rarity+": '[^']+'").test(mapping))report.errors.push('Missing rarity: '+rarity);
 if(manifest.files.length!==33||new Set(manifest.files.map(f=>f.relative)).size!==33)report.errors.push('Invalid export inventory');
 const allowed=new Set(expected.flatMap(relative=>[relative+'.svg',relative+'.png']));
 for(const relative of expected){
  try{
   const svg=await readFile(path.join(sourceDirectory,relative+'.svg'));const png=await readFile(path.join(sourceDirectory,relative+'.png'));
   inspectPowerUpSvg(svg.toString('utf8'));inspectPowerUpPng(png);
   if(svg.length>30000||png.length>180000)throw Error('Artwork exceeds package size budget');
   const record=manifest.files.find(file=>file.relative===relative);
   if(record?.svgSha256!==digest(svg)||record?.pngSha256!==digest(png))throw Error('Stale or changed export; regenerate SVG/PNG pair');
   if(buildDirectory)for(const [ext,bytes]of [['svg',svg],['png',png]]){const built=await readFile(path.join(buildDirectory,'art/powerups',relative+'.'+ext));if(!built.equals(bytes))throw Error('Packaged/build bytes differ: '+ext)}
   report.files.push({relative,svgBytes:svg.length,pngBytes:png.length,svgSha256:digest(svg),pngSha256:digest(png)});
  }catch(error){report.errors.push(relative+': '+error.message)}
 }
 for(const relative of await listFiles(sourceDirectory))if(!allowed.has(relative))report.errors.push('Orphan artwork: '+relative);
 if(buildDirectory)for(const relative of await listFiles(path.join(buildDirectory,'art/powerups')))if(!allowed.has(relative))report.errors.push('Orphan built artwork: '+relative);
 return report;
}
await runArtworkCli({scriptUrl:import.meta.url,scriptName:'validatePowerUpArtwork.mjs',label:'Power-up SVG/PNG pairs (30 fronts + 3 category backs)',clientRoot,validate:validatePowerUpArtwork});
