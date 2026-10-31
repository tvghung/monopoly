import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { artworkRoot, validatePowerUpArtwork, inspectPowerUpSvg, inspectPowerUpPng } from './validatePowerUpArtwork.mjs';
test('complete original asset set: 30 fronts, 3 backs, 4 frames, valid XML and PNG',async()=>{
 const result=await validatePowerUpArtwork();assert.deepEqual(result.errors,[]);assert.equal(result.files.length,33);
 assert.equal(new Set(result.files.map(f=>f.svgSha256)).size,33);assert.equal(new Set(result.files.map(f=>f.pngSha256)).size,33);
});
test('rejects malformed XML and active or remote SVG content',()=>{
 const wrap=body=>'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">'+body+'</svg>';
 for(const body of ['<g>','<script>alert(1)</script>','<image href="https://example.com/a.png"/>','<rect onclick="x()"/>','<foreignObject/>','<path style="fill:red"/>','<path fill="url(#missing)"/>','<text>Effect</text>'])assert.throws(()=>inspectPowerUpSvg(wrap(body)),body);
});
test('rejects corrupt PNG even with a valid signature',async()=>{
 const valid=await readFile(path.join(artworkRoot,'fronts/A01.png'));inspectPowerUpPng(valid);
 const corrupt=Buffer.from(valid);corrupt[80]^=1;assert.throws(()=>inspectPowerUpPng(corrupt));assert.throws(()=>inspectPowerUpPng(valid.subarray(0,80)));
});
test('fails missing, stale, orphan and unequal build assets instead of masking them with fallbacks',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'otb-pu-art-'));
 try{const source=path.join(temp,'source');await cp(artworkRoot,source,{recursive:true});await rm(path.join(source,'fronts/A01.svg'));let r=await validatePowerUpArtwork({sourceDirectory:source});assert.ok(r.errors.some(e=>e.startsWith('fronts/A01:')));
 await cp(artworkRoot,source,{recursive:true});await writeFile(path.join(source,'fronts/A02.svg'),(await readFile(path.join(source,'fronts/A02.svg'),'utf8')).replace('#e76b62','#e76b63'));await writeFile(path.join(source,'orphan.svg'),'<svg/>');r=await validatePowerUpArtwork({sourceDirectory:source});assert.ok(r.errors.some(e=>e.includes('Stale')));assert.ok(r.errors.some(e=>e.includes('Orphan')));
 const build=path.join(temp,'dist');await cp(artworkRoot,path.join(build,'art/powerups'),{recursive:true});await writeFile(path.join(build,'art/powerups/fronts/A03.png'),Buffer.from('corrupt'));r=await validatePowerUpArtwork({buildDirectory:build});assert.ok(r.errors.some(e=>e.includes('build bytes differ')));
 }finally{await rm(temp,{recursive:true,force:true})}
});
