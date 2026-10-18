#!/usr/bin/env node
/**
 * Pixel parity of the board reached through the lobby (Phase B3 follow-up, 08H Task 3). Opens the UAT page's lobby route for each bundle
 * (`--before` is a bundle that mounts the board from nothing, `--after` one with the persistent scene layer, `?persist=layer`), waits for
 * the settled `board-readability` scene and compares the screenshots pixel by pixel: the scene built in the lobby and then moved into
 * the board must look exactly like the scene built by the board.
 *
 *   node scripts/perf/lobbyVisualCompare.mjs --before <dist> --after <dist> --out <dir> [--dwell 6000] [--tiers balanced,high,low]
 *
 * Writes `<out>/<tier>-before.png`, `<out>/<tier>-after.png`, `<out>/<tier>-diff.png` (when they differ) and `<out>/report.json`.
 * Exit code 1 when a tier differs by more than `--tolerance` channel levels (default 0).
 */
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareImages, decodePng, diffImage, encodePng } from './pngDiff.mjs';
import { serveDirectory } from './staticServer.mjs';

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

function parse(argv) {
  const options = { before: null, after: null, out: null, dwell: 6000, tiers: ['balanced', 'high', 'low'], tolerance: 0, port: 4178 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--before') options.before = path.resolve(argv[++index]);
    else if (flag === '--after') options.after = path.resolve(argv[++index]);
    else if (flag === '--out') options.out = path.resolve(argv[++index]);
    else if (flag === '--dwell') options.dwell = Number(argv[++index]);
    else if (flag === '--tiers') options.tiers = argv[++index].split(',');
    else if (flag === '--tolerance') options.tolerance = Number(argv[++index]);
    else if (flag === '--port') options.port = Number(argv[++index]);
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!options.before || !options.after || !options.out) throw new Error('--before, --after and --out are required');
  return options;
}

async function capture(dist, port, query) {
  const server = await serveDirectory(dist, port);
  const profile = path.join(os.tmpdir(), `otb-lobby-visual-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, viewport: { width: 1280, height: 720 },
    args: ['--ignore-gpu-blocklist', '--window-position=0,0', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/?${query}`);
    await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
    await sleep(3_000);
    return await page.screenshot({ type: 'png' });
  } finally {
    await context.close();
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

const options = parse(process.argv.slice(2));
mkdirSync(options.out, { recursive: true });
const report = [];
let failed = false;
for (const tier of options.tiers) {
  const base = { 'phase4-uat': '1', scenario: 'board-readability', quality: tier, fpsLimit: '60', lobby: String(options.dwell) };
  const before = await capture(options.before, options.port, new URLSearchParams(base).toString());
  const after = await capture(options.after, options.port, new URLSearchParams({ ...base, persist: 'layer' }).toString());
  writeFileSync(path.join(options.out, `${tier}-before.png`), before);
  writeFileSync(path.join(options.out, `${tier}-after.png`), after);
  const left = decodePng(before);
  const right = decodePng(after);
  const comparison = compareImages(left, right, { tolerance: options.tolerance });
  if (!comparison.identical) {
    writeFileSync(path.join(options.out, `${tier}-diff.png`), encodePng(diffImage(left, right, { tolerance: options.tolerance })));
    failed = true;
  }
  report.push({ tier, ...comparison });
  console.log(`${tier}: ${comparison.identical ? 'identical' : `differs (${JSON.stringify(comparison)})`}`);
}
writeFileSync(path.join(options.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.exit(failed ? 1 : 0);
