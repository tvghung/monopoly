#!/usr/bin/env node
/**
 * Bakes the studio environment (Phase B3 follow-up, 08G Task 2): loads a UAT bundle in headed Chrome with `?studioEnv=procedural`
 * (the game then filters the procedural studio into a PMREM, as it did before the baked file existed), reads the PMREM render
 * target back as half-float RGBA and writes it, zlib-deflated, next to `StudioEnvironment.tsx` together with the metadata that
 * ties it to its inputs (`bakedStudioEnvironment.ts` refuses a file whose hash is stale).
 *
 *   VITE_PHASE4_UAT=1 pnpm --filter @monopoly/client exec vite build --mode phase4-uat --minify false --outDir <dist> --emptyOutDir
 *   node scripts/bakeStudioEnvironment.mjs --dist <dist>            # writes the two files
 *   node scripts/bakeStudioEnvironment.mjs --dist <dist> --check    # bakes to memory and reports whether the files match (same GPU only)
 *
 * The picture comes from the GPU that filters it, so a bake is reproducible on the same GPU and driver; another GPU may differ in the
 * last half-float bits. The staleness test (`bakedStudioEnvironment.test.ts`) therefore compares the hash of the inputs, not the pixels.
 */
/* global window */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { serveDirectory } from './perf/staticServer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '..', 'apps', 'client', 'src', 'game', 'scene', 'render', 'environment');
const dataFile = path.join(target, 'studio-environment.cubeuv.f16.z');
const metaFile = path.join(target, 'studio-environment.meta.json');

const options = { dist: null, check: false, port: 4193 };
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--dist') options.dist = path.resolve(argv[++index]);
  else if (argv[index] === '--check') options.check = true;
  else if (argv[index] === '--port') options.port = Number(argv[++index]);
  else throw new Error(`Unknown option ${argv[index]}`);
}
if (!options.dist) throw new Error('--dist is required');

async function bakeOnce(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${options.port}/?phase4-uat=1&scenario=board-readability&quality=balanced&studioEnv=procedural`);
    await page.waitForFunction(() => typeof window.__OWN_THE_BLOCK_STUDIO_ENV_BAKE__ === 'function', undefined, { timeout: 120_000 });
    const baked = await page.evaluate(() => window.__OWN_THE_BLOCK_STUDIO_ENV_BAKE__());
    const bytes = Buffer.from(baked.base64, 'base64');
    if (bytes.length !== baked.width * baked.height * 8) throw new Error(`Unexpected size ${bytes.length}`);
    // An all-zero read-back means the context could not read half-float targets; never commit that.
    if (!bytes.some(value => value !== 0)) throw new Error('The read-back is empty');
    return { bytes, width: baked.width, height: baked.height, inputsHash: baked.inputsHash, threeRevision: baked.threeRevision };
  } finally {
    await context.close();
  }
}

const server = await serveDirectory(options.dist, options.port);
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] });
try {
  const first = await bakeOnce(browser);
  const second = await bakeOnce(browser);
  const identical = first.bytes.equals(second.bytes);
  console.log(`baked ${first.width} x ${first.height} half-float RGBA (${first.bytes.length} bytes); two bakes in this browser are ${identical ? 'identical' : 'DIFFERENT'}`);
  const meta = { inputsHash: first.inputsHash, width: first.width, height: first.height, bytes: first.bytes.length, threeRevision: first.threeRevision };
  if (options.check) {
    const sameBytes = readFileSync(dataFile).equals(deflateSync(first.bytes, { level: 9 }));
    const sameMeta = JSON.stringify(JSON.parse(readFileSync(metaFile, 'utf8'))) === JSON.stringify(meta);
    console.log(`committed data ${sameBytes ? 'matches' : 'differs from'} this GPU's bake; committed metadata ${sameMeta ? 'matches' : 'differs from'} the inputs`);
    process.exitCode = sameMeta ? 0 : 1;
  } else {
    writeFileSync(dataFile, deflateSync(first.bytes, { level: 9 }));
    writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), dataFile)} and ${path.relative(process.cwd(), metaFile)}`);
  }
} finally {
  await browser.close();
  server.close();
}
