#!/usr/bin/env node
/**
 * Before/after visual equivalence check for the 3D board. Serves two UAT bundles (built with `--minify false` or not, both
 * work), renders the same settled harness states at the same viewport, device pixel ratio and graphics tier in the same
 * browser on the same GPU, and compares the screenshots pixel by pixel.
 *
 *   node scripts/perf/captureCompare.mjs --before <dist> --after <dist> --out <dir> [--states a,b|all] [--renderer gpu|swiftshader]
 *
 * Writes `<out>/before/*.png`, `<out>/after/*.png`, `<out>/diff/*.png` (only for states that differ) and
 * `<out>/visual-report.json`. Exit code 1 when any state is not pixel-identical within `--tolerance` (default 0) and
 * `--assert-identical` is given. Animated frames are not compared here: the states are settled scenes, because mid-animation
 * pixels depend on frame timing; animation behavior is covered by the unit tests and the benchmark counters.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compareImages, decodePng, diffImage, encodePng } from './pngDiff.mjs';
import { serveDirectory } from './staticServer.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Each state: harness fixture, graphics tier, optional crop around one board tile in CSS pixels. Tile ids of the Standard board
 * (packages/shared/src/tileState.ts): 1 Cà Mau (property), 4 and 38 income/luxury tax (expense), 10 Jail.
 */
export const STATES = [
  { name: 'board-low', fixture: 'board-readability', tier: 'low' },
  { name: 'board-balanced', fixture: 'board-readability', tier: 'balanced' },
  { name: 'board-high', fixture: 'board-readability', tier: 'high' },
  { name: 'crop-jail-balanced', fixture: 'board-readability', tier: 'balanced', crop: { tileId: 10, padding: 40 } },
  { name: 'crop-tax-4-balanced', fixture: 'board-readability', tier: 'balanced', crop: { tileId: 4, padding: 40 } },
  { name: 'crop-tax-38-balanced', fixture: 'board-readability', tier: 'balanced', crop: { tileId: 38, padding: 40 } },
  { name: 'crop-property-balanced', fixture: 'board-readability', tier: 'balanced', crop: { tileId: 1, padding: 40 } },
  { name: 'landmarks-balanced', fixture: 'landmarks-all', tier: 'balanced' },
  { name: 'houses-max-balanced', fixture: 'houses-max', tier: 'balanced' },
  { name: 'standees-balanced', fixture: 'standees', tier: 'balanced' },
  { name: 'stations-4-balanced', fixture: 'stations-4', tier: 'balanced' },
  { name: 'dice-settled-balanced', fixture: 'dice-contact-shadows', tier: 'balanced', animated: true },
  { name: 'walk-end-balanced', fixture: 'walk', tier: 'balanced', animated: true },
  { name: 'purchase-end-balanced', fixture: 'purchase', tier: 'balanced', animated: true },
  { name: 'rent-end-balanced', fixture: 'rent', tier: 'balanced', animated: true },
  { name: 'house-2-end-balanced', fixture: 'house-2', tier: 'balanced', animated: true },
  { name: 'hotel-end-balanced', fixture: 'hotel', tier: 'balanced', animated: true },
  { name: 'jail-balanced', fixture: 'jail', tier: 'balanced', animated: true },
  { name: 'walk-end-low', fixture: 'walk', tier: 'low', animated: true },
];

function parseArgs(argv) {
  const options = {
    before: null, after: null, out: null, states: 'all', viewport: '1280x720', dpr: 1, renderer: 'gpu', tolerance: 0, port: 4174, assertIdentical: false,
    readyTimeoutMs: 60_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    switch (flag) {
      case '--before': options.before = path.resolve(value()); break;
      case '--after': options.after = path.resolve(value()); break;
      case '--out': options.out = path.resolve(value()); break;
      case '--states': options.states = value(); break;
      case '--viewport': options.viewport = value(); break;
      case '--dpr': options.dpr = Number(value()); break;
      case '--renderer': options.renderer = value(); break;
      case '--tolerance': options.tolerance = Number(value()); break;
      case '--port': options.port = Number(value()); break;
      case '--ready-timeout': options.readyTimeoutMs = Number(value()) * 1_000; break;
      case '--assert-identical': options.assertIdentical = true; break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  if (!options.before || !options.after || !options.out) throw new Error('--before, --after and --out are required');
  if (!['gpu', 'swiftshader'].includes(options.renderer)) throw new Error('--renderer must be gpu or swiftshader');
  if (!Number.isFinite(options.dpr) || options.dpr <= 0 || options.dpr > 4) throw new Error('--dpr must be in (0, 4]');
  return options;
}

async function settle(page, state) {
  await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: state.timeoutMs ?? 60_000 });
  await page.waitForSelector('.game-scene canvas', { state: 'attached', timeout: 60_000 });
  // Shader compiles, SDF text and procedural textures finish after the ready marker; animated fixtures also play out.
  await sleep(state.animated ? 6_000 : 4_000);
  // Wait for the scene to be quiet: no new frame sequence for 1 s (diagnostics publish the sequence).
  let last = null;
  let stableSince = Date.now();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const sequence = await page.evaluate(() => window.__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?.frameSequence ?? null);
    if (sequence !== last) { last = sequence; stableSince = Date.now(); } else if (Date.now() - stableSince >= 1_000) return;
    await sleep(150);
  }
  throw new Error(`The scene never went quiet for ${state.name}`);
}

async function cropFor(page, crop) {
  const rects = await page.evaluate(() => window.__OWN_THE_BLOCK_TILE_SCREEN_RECTS__ ?? null);
  if (!rects) throw new Error('Tile rectangles are unavailable');
  const tiles = rects.tiles.filter(tile => tile.tileId === crop.tileId);
  if (tiles.length === 0) throw new Error(`No screen rectangle for tile ${crop.tileId}`);
  const xs = tiles.flatMap(tile => tile.corners.map(corner => corner.x));
  const ys = tiles.flatMap(tile => tile.corners.map(corner => corner.y));
  const viewport = page.viewportSize();
  const x = Math.max(0, Math.floor(Math.min(...xs) - crop.padding));
  const y = Math.max(0, Math.floor(Math.min(...ys) - crop.padding));
  return {
    x, y,
    width: Math.min(viewport.width - x, Math.ceil(Math.max(...xs) + crop.padding - x)),
    height: Math.min(viewport.height - y, Math.ceil(Math.max(...ys) + crop.padding - y)),
  };
}

async function captureAll(distDir, options, states) {
  const server = await serveDirectory(distDir, options.port);
  const [width, height] = options.viewport.split('x').map(Number);
  const swiftshader = options.renderer === 'swiftshader';
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: swiftshader,
    args: swiftshader
      ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
      : ['--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const images = new Map();
  let renderer = null;
  try {
    for (const state of states) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: options.dpr, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const params = new URLSearchParams({
        'phase4-uat': '1', scenario: state.fixture, quality: state.tier, fpsLimit: '60', 'uat-controls': 'hidden',
      });
      console.log(`  ${state.name}`);
      try {
        await page.goto(`http://127.0.0.1:${options.port}/?${params.toString()}`);
        await settle(page, { ...state, timeoutMs: options.readyTimeoutMs });
        renderer ??= await page.evaluate(() => window.__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?.glRenderer ?? null);
        const clip = state.crop ? await cropFor(page, state.crop) : undefined;
        const png = await page.screenshot({ animations: 'disabled', caret: 'hide', ...(clip ? { clip } : {}) });
        images.set(state.name, { png, errors });
      } catch (error) {
        // One failing state must not hide the others; it is reported as not comparable with its reason.
        images.set(state.name, { png: null, errors: [...errors, `capture failed: ${error.message.split('\n')[0]}`] });
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return { images, renderer };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const wanted = options.states === 'all' ? null : new Set(options.states.split(','));
  const states = STATES.filter(state => !wanted || wanted.has(state.name));
  if (states.length === 0) throw new Error('No state selected');
  mkdirSync(path.join(options.out, 'before'), { recursive: true });
  mkdirSync(path.join(options.out, 'after'), { recursive: true });
  mkdirSync(path.join(options.out, 'diff'), { recursive: true });
  console.log(`Capturing ${states.length} states from the "before" bundle (${options.renderer})`);
  const before = await captureAll(options.before, options, states);
  console.log('Capturing the same states from the "after" bundle');
  const after = await captureAll(options.after, options, states);

  const results = [];
  for (const state of states) {
    const left = before.images.get(state.name);
    const right = after.images.get(state.name);
    if (left.png) writeFileSync(path.join(options.out, 'before', `${state.name}.png`), left.png);
    if (right.png) writeFileSync(path.join(options.out, 'after', `${state.name}.png`), right.png);
    let comparison;
    if (left.png && right.png) {
      const a = decodePng(left.png);
      const b = decodePng(right.png);
      comparison = compareImages(a, b, { tolerance: options.tolerance });
      if (comparison.comparable && !comparison.identical) {
        writeFileSync(path.join(options.out, 'diff', `${state.name}.png`), encodePng(diffImage(a, b, { tolerance: options.tolerance })));
      }
    } else {
      comparison = { comparable: false, identical: false, reason: `no screenshot from the ${left.png ? 'after' : right.png ? 'before' : 'before or after'} bundle` };
    }
    results.push({ state: state.name, fixture: state.fixture, tier: state.tier, ...comparison, pageErrors: [...left.errors, ...right.errors] });
    const verdict = !comparison.comparable ? `NOT COMPARABLE (${comparison.reason})`
      : comparison.identical ? 'IDENTICAL'
        : `DIFFERENT: ${comparison.differingPixels} px (${(comparison.differingRatio * 100).toFixed(3)} %), max channel delta ${comparison.maxChannelDelta}, mean ${comparison.meanAbsDelta.toFixed(4)}`;
    console.log(`${state.name.padEnd(28)} ${verdict}`);
  }
  const report = {
    renderer: before.renderer, rendererAfter: after.renderer, viewport: options.viewport, deviceScaleFactor: options.dpr, tolerance: options.tolerance, results,
  };
  writeFileSync(path.join(options.out, 'visual-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const failing = results.filter(result => !result.comparable || result.differingPixels > 0);
  console.log(`${results.length - failing.length}/${results.length} states pixel-identical within tolerance ${options.tolerance}`);
  if (options.assertIdentical && failing.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
