#!/usr/bin/env node
/**
 * Mid-animation visual comparison of two UAT bundles for the tile impact (the depression, rebound and highlight of a tile that a
 * mover lands on or crosses). The harness's tile-impact probe (`?tile-impact-probe=1`) freezes the tile-motion clock, so the page
 * renders the scene at exact simulated times and captures the canvas at each one; the same times in two bundles are compared
 * pixel by pixel.
 *
 *   node scripts/perf/captureMotion.mjs --before <dist> --after <dist> --out <dir> [--repeat-self]
 *
 * `--repeat-self` also captures the "before" bundle a second time: only a scene that is pixel-identical in that control is
 * evidence for or against a change. This tool deliberately covers only what is deterministic; dice, destination-preview and
 * construction-burst animation could not be made reproducible (a stepped fake clock gave different frames for one bundle
 * against itself), so they have no pixel evidence here (08B §7).
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compareImages, decodePng, diffImage, encodePng } from './pngDiff.mjs';
import { serveDirectory } from './staticServer.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Tile 1 is a street (district surface), 4 an expense tile (special surface), 10 the Jail corner. Times are simulated ms. */
export const IMPACT_SCENES = [
  { name: 'impact-property-1', tileId: 1, tier: 'balanced', times: [0, 20, 40, 60, 80, 100, 140, 200, 260, 300] },
  { name: 'impact-tax-4', tileId: 4, tier: 'balanced', times: [0, 40, 80, 100, 160, 260] },
  { name: 'impact-jail-10', tileId: 10, tier: 'balanced', times: [0, 40, 80, 100, 160, 260] },
  { name: 'impact-property-1-low', tileId: 1, tier: 'low', times: [0, 60, 100, 200] },
  { name: 'impact-property-1-high', tileId: 1, tier: 'high', times: [0, 60, 100, 200] },
];

function parseArgs(argv) {
  const options = { before: null, after: null, out: null, viewport: '1280x720', port: 4176, repeatSelf: false, tolerance: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    if (flag === '--before') options.before = path.resolve(value());
    else if (flag === '--after') options.after = path.resolve(value());
    else if (flag === '--out') options.out = path.resolve(value());
    else if (flag === '--viewport') options.viewport = value();
    else if (flag === '--port') options.port = Number(value());
    else if (flag === '--tolerance') options.tolerance = Number(value());
    else if (flag === '--repeat-self') options.repeatSelf = true;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!options.before || !options.after || !options.out) throw new Error('--before, --after and --out are required');
  return options;
}

async function captureImpactScene(browser, base, scene, viewport) {
  const [width, height] = viewport.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const frames = new Map();
  try {
    const params = new URLSearchParams({
      'phase4-uat': '1', scenario: 'board-readability', quality: scene.tier, fpsLimit: '60', 'uat-controls': 'hidden', 'tile-impact-probe': '1',
    });
    await page.goto(`${base}/?${params.toString()}`);
    await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 180_000 });
    await page.waitForFunction(() => Boolean(window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__), undefined, { timeout: 60_000 });
    await sleep(4_000);
    await page.evaluate(tileId => window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__.press(tileId), scene.tileId);
    for (const time of scene.times) {
      await page.evaluate(ms => window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__.seek(ms), time);
      await sleep(250);
    }
    const sample = await page.evaluate(tileId => window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__.sample(tileId), scene.tileId);
    for (const time of scene.times) {
      const dataUrl = sample.images[time];
      if (dataUrl) frames.set(time, Buffer.from(dataUrl.split(',')[1], 'base64'));
    }
  } finally {
    await context.close();
  }
  return { frames, errors };
}

async function runBundle(dist, options) {
  const server = await serveDirectory(dist, options.port);
  const browser = await chromium.launch({
    channel: 'chrome', headless: false,
    args: ['--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const results = new Map();
  try {
    for (const scene of IMPACT_SCENES) {
      console.log(`  ${scene.name}`);
      try {
        results.set(scene.name, await captureImpactScene(browser, `http://127.0.0.1:${options.port}`, scene, options.viewport));
      } catch (error) {
        results.set(scene.name, { frames: new Map(), errors: [`capture failed: ${error.message.split('\n')[0]}`] });
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return results;
}

function compareRuns(left, right, tolerance, outDir, label) {
  const summary = {};
  for (const scene of IMPACT_SCENES) {
    const entry = { frames: 0, identical: 0, differing: 0, missing: 0, maxPixels: 0, maxDelta: 0 };
    for (const time of scene.times) {
      entry.frames += 1;
      const pa = left.get(scene.name)?.frames.get(time);
      const pb = right.get(scene.name)?.frames.get(time);
      if (!pa || !pb) { entry.missing += 1; continue; }
      const a = decodePng(pa);
      const b = decodePng(pb);
      const result = compareImages(a, b, { tolerance });
      if (!result.comparable) { entry.missing += 1; continue; }
      if (result.identical) { entry.identical += 1; continue; }
      entry.differing += 1;
      entry.maxPixels = Math.max(entry.maxPixels, result.differingPixels);
      entry.maxDelta = Math.max(entry.maxDelta, result.maxChannelDelta);
      writeFileSync(path.join(outDir, `diff_${label}_${scene.name}_${time}.png`), encodePng(diffImage(a, b, { tolerance })));
    }
    summary[scene.name] = entry;
  }
  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(options.out, { recursive: true });
  console.log(`Capturing ${IMPACT_SCENES.length} scenes from the "before" bundle`);
  const before = await runBundle(options.before, options);
  console.log('Capturing the same scenes from the "after" bundle');
  const after = await runBundle(options.after, options);
  const report = { viewport: options.viewport, tolerance: options.tolerance, cross: compareRuns(before, after, options.tolerance, options.out, 'cross') };
  // Identical frames prove nothing if nothing moves: count how many successive times show a different picture in one bundle.
  report.animationVisible = Object.fromEntries(IMPACT_SCENES.map(scene => {
    const shots = scene.times.map(time => before.get(scene.name)?.frames.get(time));
    const changed = shots.filter((shot, index) => index > 0 && shot && shots[index - 1] && !compareImages(decodePng(shots[index - 1]), decodePng(shot)).identical).length;
    return [scene.name, { successivePairs: scene.times.length - 1, differing: changed }];
  }));
  report.pageErrors = Object.fromEntries([...before, ...after].filter(([, run]) => run.errors.length > 0).map(([name, run]) => [name, run.errors.slice(0, 3)]));
  if (options.repeatSelf) {
    console.log('Capturing the "before" bundle a second time (determinism control)');
    report.control = compareRuns(before, await runBundle(options.before, options), options.tolerance, options.out, 'control');
  }
  writeFileSync(path.join(options.out, 'motion-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const line = (name, entry) => `${name.padEnd(24)} frames ${entry.frames}: identical ${entry.identical}, differing ${entry.differing}${entry.differing ? ` (max ${entry.maxPixels} px, delta ${entry.maxDelta})` : ''}${entry.missing ? `, missing ${entry.missing}` : ''}`;
  console.log('\nbefore vs after');
  Object.entries(report.cross).forEach(([name, entry]) => console.log(line(name, entry)));
  if (report.control) {
    console.log('\ncontrol: before vs before (determinism)');
    Object.entries(report.control).forEach(([name, entry]) => console.log(line(name, entry)));
  }
  console.log('\nanimation visible (successive times that differ within one bundle)');
  Object.entries(report.animationVisible).forEach(([name, entry]) => console.log(`${name.padEnd(24)} ${entry.differing} of ${entry.successivePairs}`));
  if (Object.keys(report.pageErrors).length > 0) console.log('\npage errors:', JSON.stringify(report.pageErrors));
  const bad = Object.values(report.cross).some(entry => entry.differing > 0 || entry.missing > 0);
  if (bad) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
