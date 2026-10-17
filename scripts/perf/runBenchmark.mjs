#!/usr/bin/env node
/**
 * Reproducible renderer benchmark for the 3D board (Phase B0). Drives the production-React build of the Phase 4 UAT
 * harness in a real, headed Chrome on the real GPU and reports pacing, CPU/GPU time, shader links, React work and
 * resource growth. Nothing is written into the repository unless `--out` points there.
 *
 *   node scripts/perf/runBenchmark.mjs --build --label b0-baseline --tiers balanced --scenarios idle,walk
 *   node scripts/perf/runBenchmark.mjs --dist <prebuilt dir> --label after-b1 --scenarios all
 *
 * Definitions of every metric: scripts/perf/README.md. Analysis code: scripts/perf/metrics.mjs (unit tested).
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeFrames,
  framesInWindow,
  idleStats,
  longAnimationFrameStats,
  programLinkStats,
  reactStats,
  resourceTrend,
  syncWaitStats,
} from './metrics.mjs';
import { classCounts, classifyLinks, familyView, signatureTable, stallFrames, throttledIntervals } from './signatures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const probePath = path.join(here, 'probe-init.js');

const ALL_SCENARIOS = ['idle', 'dice', 'walk', 'hover', 'volume', 'socket', 'purchase', 'rent', 'build', 'soak'];
/** Harness fixture behind each benchmark scenario (apps/client/src/dev/phase4-uat/Phase4UatHarness.tsx). */
const FIXTURE = {
  idle: 'board-readability',
  dice: 'dice-contact-shadows',
  walk: 'walk',
  hover: 'board-readability',
  volume: 'board-readability',
  socket: 'board-readability',
  purchase: 'purchase',
  rent: 'rent',
  build: 'house-2',
  soak: 'walk',
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon',
};

function parseArgs(argv) {
  const options = {
    label: 'run', tiers: ['balanced'], scenarios: ['idle', 'walk'], cap: 60, replays: 5, soakReplays: 30, soakWarmup: 3,
    idleSeconds: 10, gpu: 'default', diagnostics: 'on', lite: false, window: '1536x864', build: false, dist: null,
    out: null, port: 4173, assertIdle: false, hoverTiles: 18, volumeSteps: 20, cold: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    switch (flag) {
      case '--label': options.label = value(); break;
      case '--tiers': options.tiers = value().split(','); break;
      case '--scenarios': { const list = value(); options.scenarios = list === 'all' ? ALL_SCENARIOS : list.split(','); break; }
      case '--cap': options.cap = Number(value()); break;
      case '--replays': options.replays = Number(value()); break;
      case '--soak-replays': options.soakReplays = Number(value()); break;
      case '--soak-warmup': options.soakWarmup = Number(value()); break;
      case '--idle-seconds': options.idleSeconds = Number(value()); break;
      case '--gpu': options.gpu = value(); break;
      case '--diagnostics': options.diagnostics = value(); break;
      case '--lite': options.lite = true; break;
      case '--window': options.window = value(); break;
      case '--build': options.build = true; break;
      case '--dist': options.dist = path.resolve(value()); break;
      case '--out': options.out = path.resolve(value()); break;
      case '--port': options.port = Number(value()); break;
      case '--volume-steps': options.volumeSteps = Number(value()); break;
      case '--assert-idle': options.assertIdle = true; break;
      case '--cold': options.cold = true; break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  for (const scenario of options.scenarios) {
    if (!ALL_SCENARIOS.includes(scenario)) throw new Error(`Unknown scenario ${scenario}; choose from ${ALL_SCENARIOS.join(', ')}`);
  }
  for (const tier of options.tiers) {
    if (!['low', 'balanced', 'high', 'auto'].includes(tier)) throw new Error(`Unknown tier ${tier}`);
  }
  if (!['on', 'off'].includes(options.diagnostics)) throw new Error('--diagnostics must be on or off');
  if (!['default', 'intel', 'nvidia'].includes(options.gpu)) throw new Error('--gpu must be default, intel or nvidia');
  return options;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
  return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() };
}

function buildUatBundle(outDir) {
  console.log(`Building the UAT bundle (production React, unminified) into ${outDir}`);
  // One command string: `pnpm` is a .cmd shim on Windows, so it needs a shell, and an args array plus a shell is deprecated.
  const command = `pnpm --filter @monopoly/client exec vite build --mode phase4-uat --minify false --outDir "${outDir}" --emptyOutDir`;
  const result = spawnSync(command, { cwd: repoRoot, stdio: 'inherit', shell: true, env: { ...process.env, VITE_PHASE4_UAT: '1' } });
  if (result.status !== 0) throw new Error('UAT bundle build failed');
}

function serveDirectory(root, port) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let relative = decodeURIComponent(url.pathname);
    if (relative.endsWith('/')) relative += 'index.html';
    const file = path.join(root, relative);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function describeEnvironment(options) {
  const git = args => run('git', args).stdout;
  const dirty = git(['status', '--porcelain']).length > 0;
  const cpus = os.cpus();
  return {
    commit: git(['rev-parse', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    workingTreeDirty: dirty,
    capturedAt: new Date().toISOString(),
    node: process.version,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: cpus.length > 0 ? `${cpus[0].model.trim()} (${cpus.length} logical)` : 'unknown',
    memoryGiB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    options: { ...options, dist: options.dist ? path.basename(options.dist) : null, out: null },
  };
}

function chromeArguments(options) {
  const [width, height] = options.window.split('x').map(Number);
  const args = [
    '--ignore-gpu-blocklist', `--window-size=${width},${height}`, '--window-position=0,0',
    // An automation window can be covered by other windows; these keep timers and rendering at full speed regardless.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ];
  if (options.gpu === 'intel') args.push('--force_low_power_gpu');
  if (options.gpu === 'nvidia') args.push('--force_high_performance_gpu');
  return args;
}

function harnessUrl(base, { fixture, tier, cap, diagnostics, lite }) {
  const params = new URLSearchParams({ 'phase4-uat': '1', scenario: fixture, quality: tier, fpsLimit: String(cap) });
  if (diagnostics === 'off') params.set('renderDiagnostics', 'off');
  if (lite) params.set('probeLite', '1');
  return `${base}/?${params.toString()}`;
}

async function openHarness(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.goto(url);
  await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 180_000 });
  await page.waitForSelector('.game-scene canvas', { state: 'attached', timeout: 60_000 });
  // The first replay of an animated fixture starts 180 ms after mount; let the load work and shader compiles finish.
  await sleep(3_000);
  const attached = await page.evaluate(() => window.__PROBE__.attachMain());
  if (attached !== 'ok') throw new Error(`Probe could not attach to the board canvas (${attached})`);
  return { page, errors };
}

async function measureRefreshHz(page) {
  return page.evaluate(() => new Promise(resolve => {
    const stamps = [];
    const tick = stamp => {
      stamps.push(stamp);
      if (stamps.length < 120) { requestAnimationFrame(tick); return; }
      const gaps = stamps.slice(1).map((value, index) => value - stamps[index]).sort((a, b) => a - b);
      resolve(1000 / gaps[Math.floor(gaps.length / 2)]);
    };
    requestAnimationFrame(tick);
  }));
}

async function pageFacts(page) {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    glRenderer: window.__PROBE__.glRenderer,
    drawingBuffer: window.__PROBE__.drawingBuffer,
    gpuTimerQuery: window.__PROBE__.gpuSupported,
    renderers: window.__PROBE__.renderers,
  }));
}

/** Pulls the probe's records (after letting pending GPU timer queries resolve) and merges them into `store`. */
async function drain(page, store) {
  await page.evaluate(async () => {
    for (let index = 0; index < 12; index += 1) {
      window.__PROBE__.pollGpu();
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  });
  const batch = await page.evaluate(() => window.__PROBE__.drain());
  for (const key of Object.keys(batch)) store[key].push(...batch[key]);
}

const newStore = () => ({
  frames: [], links: [], syncWaits: [], tasks: [], commits: [], loaf: [], longtasks: [], marks: [], events: [], owners: [], census: [], contexts: [],
});

async function replayOnce(page, label = null) {
  if (label) await page.evaluate(value => window.__PROBE__.setReplay(value), label);
  const start = await page.evaluate(() => window.__PROBE__.mark('replay-start'));
  await page.getByRole('button', { name: /Chạy lại/ }).click();
  await page.waitForFunction(
    () => document.querySelector('main.phase4-uat')?.getAttribute('data-uat-ready') === 'false',
    undefined,
    { timeout: 5_000 },
  ).catch(() => { /* a very short fixture may already be ready again */ });
  await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
  const end = await page.evaluate(() => window.__PROBE__.mark('replay-end'));
  return { start, end };
}

function summarize(store, windows, { cap, refreshHz }) {
  return {
    frames: analyzeFrames(framesInWindow(store.frames, windows), { fpsCap: cap, refreshHz }),
    programLinks: programLinkStats(store.links, windows),
    syncWaits: syncWaitStats(store.syncWaits, windows),
    react: reactStats(store.tasks, store.commits, windows),
    longAnimationFrames: longAnimationFrameStats(store.loaf, windows),
  };
}

async function runReplayScenario(context, base, options, tier, scenario, facts) {
  const { page, errors } = await openHarness(context, harnessUrl(base, {
    fixture: FIXTURE[scenario], tier, cap: options.cap, diagnostics: options.diagnostics, lite: options.lite,
  }));
  try {
    const refreshHz = facts.refreshHz;
    // The load-time records stay in the store (outside every window) so first-use shader links are told from repeats.
    const store = newStore();
    await drain(page, store);
    // Replay 0 is the first replay after load: report it separately from the measured, warm replays.
    const first = await replayOnce(page);
    await sleep(1_000);
    await drain(page, store);
    const firstWindows = [first];
    const measured = [];
    for (let replay = 0; replay < options.replays; replay += 1) {
      measured.push(await replayOnce(page));
      await sleep(1_000);
      await drain(page, store);
    }
    const resources = await page.evaluate(() => window.__PROBE__.resources());
    return {
      tier, scenario, fixture: FIXTURE[scenario], fpsCap: options.cap, replays: options.replays,
      firstReplay: summarize(store, firstWindows, { cap: options.cap, refreshHz }),
      warm: summarize(store, measured, { cap: options.cap, refreshHz }),
      resourcesAfter: resources,
      errors,
    };
  } finally {
    await page.close();
  }
}

async function runIdle(context, base, options, tier, facts) {
  const { page, errors } = await openHarness(context, harnessUrl(base, {
    fixture: FIXTURE.idle, tier, cap: options.cap, diagnostics: options.diagnostics, lite: options.lite,
  }));
  try {
    // Everything that legitimately loads or animates has finished (ready marker + the open-page settle time); now rest.
    await sleep(2_000);
    const start = await page.evaluate(() => window.__PROBE__.mark('idle-start'));
    await sleep(options.idleSeconds * 1_000);
    const end = await page.evaluate(() => window.__PROBE__.mark('idle-end'));
    const store = newStore();
    await drain(page, store);
    const idle = idleStats(store.frames, store.commits, { start, end });
    // A zero is only evidence if the probe could have seen a frame: it must have observed the scene render during load.
    const loadFrames = store.frames.filter(frame => frame.rendered && frame.start < start).length;
    return {
      tier, scenario: 'idle', fixture: FIXTURE.idle, fpsCap: options.cap, windowSeconds: options.idleSeconds,
      idle, loadFrames, probeSawFrames: loadFrames > 0, refreshHz: facts.refreshHz, errors,
    };
  } finally {
    await page.close();
  }
}

async function tileCenters(page) {
  const rects = await page.evaluate(() => window.__OWN_THE_BLOCK_TILE_SCREEN_RECTS__ ?? null);
  if (!rects) return null;
  return rects.tiles.map(tile => ({
    tileId: tile.tileId,
    x: tile.corners.reduce((total, corner) => total + corner.x, 0) / tile.corners.length,
    y: tile.corners.reduce((total, corner) => total + corner.y, 0) / tile.corners.length,
  }));
}

async function runHover(context, base, options, tier, facts, cachedCenters) {
  const { page, errors } = await openHarness(context, harnessUrl(base, {
    fixture: FIXTURE.hover, tier, cap: options.cap, diagnostics: options.diagnostics, lite: options.lite,
  }));
  try {
    const centers = (await tileCenters(page)) ?? cachedCenters;
    if (!centers) throw new Error('Tile screen rectangles are unavailable (they come from a diagnostics-on page)');
    const sweep = async () => {
      const start = await page.evaluate(() => window.__PROBE__.mark('hover-start'));
      for (const tile of centers.slice(0, options.hoverTiles)) {
        await page.mouse.move(tile.x, tile.y);
        await sleep(150);
      }
      await page.mouse.move(2, 2);
      await sleep(500);
      const end = await page.evaluate(() => window.__PROBE__.mark('hover-end'));
      return { start, end };
    };
    const store = newStore();
    await drain(page, store);
    await sweep(); // warm-up sweep
    await sleep(500);
    await drain(page, store);
    const measured = [];
    for (let index = 0; index < options.replays; index += 1) {
      measured.push(await sweep());
      await sleep(500);
      await drain(page, store);
    }
    return {
      tier, scenario: 'hover', fixture: FIXTURE.hover, fpsCap: options.cap, sweeps: options.replays,
      tilesPerSweep: options.hoverTiles, hoverEvents: options.hoverTiles * options.replays,
      warm: summarize(store, measured, { cap: options.cap, refreshHz: facts.refreshHz }),
      errors,
    };
  } finally {
    await page.close();
  }
}

/**
 * Drags the harness's master-volume slider through `--volume-steps` values, 50 ms apart, `--replays` times. A volume change has
 * nothing to do with the picture, so it must cost the scene nothing: no R3F commit and no scene submission.
 */
async function runVolume(context, base, options, tier, facts) {
  const { page, errors } = await openHarness(context, harnessUrl(base, {
    fixture: FIXTURE.volume, tier, cap: options.cap, diagnostics: options.diagnostics, lite: options.lite,
  }));
  try {
    const slider = page.getByRole('slider', { name: /Âm lượng chính/ });
    await slider.waitFor({ state: 'attached', timeout: 10_000 });
    let level = 0;
    const sweep = async () => {
      const start = await page.evaluate(() => window.__PROBE__.mark('volume-start'));
      for (let step = 0; step < options.volumeSteps; step += 1) {
        level = level >= 0.95 ? 0.05 : Math.round((level + 0.05) * 100) / 100;
        await slider.fill(String(level));
        await sleep(50);
      }
      await sleep(500);
      const end = await page.evaluate(() => window.__PROBE__.mark('volume-end'));
      return { start, end };
    };
    const store = newStore();
    await drain(page, store);
    await sweep(); // warm-up sweep
    await sleep(500);
    await drain(page, store);
    const measured = [];
    for (let index = 0; index < options.replays; index += 1) {
      measured.push(await sweep());
      await sleep(500);
      await drain(page, store);
    }
    return {
      tier, scenario: 'volume', fixture: FIXTURE.volume, fpsCap: options.cap, sweeps: options.replays,
      changesPerSweep: options.volumeSteps,
      warm: summarize(store, measured, { cap: options.cap, refreshHz: facts.refreshHz }),
      errors,
    };
  } finally {
    await page.close();
  }
}

/**
 * Sends `--volume-steps` room updates that change nothing on the board (the harness's "Cập nhật phòng" button appends a log
 * line, as a chat or presence update does), 50 ms apart, `--replays` times. The picture is the same, so the scene must not
 * submit a frame for them.
 */
async function runSocket(context, base, options, tier, facts) {
  const { page, errors } = await openHarness(context, harnessUrl(base, {
    fixture: FIXTURE.socket, tier, cap: options.cap, diagnostics: options.diagnostics, lite: options.lite,
  }));
  try {
    const button = page.getByRole('button', { name: /Cập nhật phòng/ });
    await button.waitFor({ state: 'attached', timeout: 10_000 });
    const sweep = async () => {
      const start = await page.evaluate(() => window.__PROBE__.mark('socket-start'));
      for (let step = 0; step < options.volumeSteps; step += 1) {
        await button.click();
        await sleep(50);
      }
      await sleep(500);
      const end = await page.evaluate(() => window.__PROBE__.mark('socket-end'));
      return { start, end };
    };
    const store = newStore();
    await drain(page, store);
    await sweep(); // warm-up sweep
    await sleep(500);
    await drain(page, store);
    const measured = [];
    for (let index = 0; index < options.replays; index += 1) {
      measured.push(await sweep());
      await sleep(500);
      await drain(page, store);
    }
    return {
      tier, scenario: 'socket', fixture: FIXTURE.socket, fpsCap: options.cap, sweeps: options.replays,
      changesPerSweep: options.volumeSteps,
      warm: summarize(store, measured, { cap: options.cap, refreshHz: facts.refreshHz }),
      errors,
    };
  } finally {
    await page.close();
  }
}

async function sampleResources(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = await cdp.send('Runtime.getHeapUsage');
  const resources = await page.evaluate(() => window.__PROBE__.resources());
  return { heapBytes: heap.usedSize, ...(resources ?? { geometries: null, textures: null, programs: null }) };
}

/** Scene census after a replay (objects, lights, materials, new geometries); the probe hands it over with the next drain. */
async function censusAfterReplay(page, label) {
  await page.evaluate(value => window.__PROBE__.census(value), label);
}

/** First-use program signatures and the events around them (08D): everything needed to diff two runs by signature. */
function signatureReport(store, windows = null) {
  const classified = classifyLinks(store.links, store.events);
  const table = signatureTable(store.links);
  const samples = store.census.map(entry => ({ t: entry.t, ...(entry.memory ?? {}) }));
  return {
    probeVersion: 3,
    classCounts: classCounts(classified),
    totalLinks: classified.length,
    signatureCount: table.length,
    signatures: table,
    families: familyView(table),
    links: classified.map(({ defines, ...rest }) => rest),
    events: store.events,
    owners: store.owners,
    census: store.census,
    contexts: store.contexts,
    stalls: stallFrames(store.frames, store.links, { windows }),
    throttled: throttledIntervals(store.frames, store.links, samples, { windows }),
  };
}

async function runSoak(context, base, options, tier, facts) {
  const { page, errors } = await openHarness(context, harnessUrl(base, {
    fixture: FIXTURE.soak, tier, cap: options.cap, diagnostics: options.diagnostics, lite: options.lite,
  }));
  const cdp = await context.newCDPSession(page);
  try {
    const store = newStore();
    await drain(page, store);
    const windows = [];
    for (let warm = 0; warm < options.soakWarmup; warm += 1) {
      await replayOnce(page, `warmup:${warm + 1}`);
      await censusAfterReplay(page, `warmup:${warm + 1}`);
      await sleep(500);
      await drain(page, store);
    }
    const samples = [{ replay: 0, ...(await sampleResources(page, cdp)) }];
    const checkpoint = Math.max(1, Math.round(options.soakReplays / 3));
    for (let replay = 1; replay <= options.soakReplays; replay += 1) {
      windows.push(await replayOnce(page, `soak:${replay}`));
      await censusAfterReplay(page, `soak:${replay}`);
      await sleep(500);
      await drain(page, store);
      if (replay % checkpoint === 0 || replay === options.soakReplays) {
        samples.push({ replay, ...(await sampleResources(page, cdp)) });
      }
    }
    return {
      tier, scenario: 'soak', fixture: FIXTURE.soak, fpsCap: options.cap, replays: options.soakReplays, warmupReplays: options.soakWarmup,
      samples,
      trend: resourceTrend(samples),
      warm: summarize(store, windows, { cap: options.cap, refreshHz: facts.refreshHz }),
      signatures: signatureReport(store, windows),
      errors,
    };
  } finally {
    await page.close();
  }
}

function formatNumber(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function printSummary(result) {
  const head = `${result.tier.padEnd(8)} ${result.scenario.padEnd(9)}`;
  if (result.scenario === 'idle') {
    const { idle } = result;
    console.log(`${head} idle ${formatNumber(idle.seconds, 0)} s: scene submissions ${idle.sceneSubmissions}, scheduler callbacks ${idle.schedulerCallbacks}, DOM commits ${idle.domCommits}, R3F commits ${idle.r3fCommits}`);
    return;
  }
  const warm = result.warm;
  const frames = warm.frames;
  console.log(
    `${head} fps ${formatNumber(frames.effectiveFps)} | interval p50/p95/p99/max ${formatNumber(frames.intervalMs.median)}/${formatNumber(frames.intervalMs.p95)}/${formatNumber(frames.intervalMs.p99)}/${formatNumber(frames.intervalMs.max)} ms`
    + ` | cpu p95 ${formatNumber(frames.cpuMs.p95)} gpu p50 ${formatNumber(frames.gpuMs.median)} ms`
    + ` | links ${warm.programLinks.total} (repeat ${warm.programLinks.repeat}) | react p95 ${formatNumber(warm.react.tasks.p95)} ms`
    + ` | commits dom ${warm.react.domCommits} r3f ${warm.react.r3fCommits}`,
  );
  if (result.trend) {
    const { trend } = result;
    console.log(`${' '.repeat(18)}soak ${trend.replays} replays: heap ${formatNumber(trend.heapBytes.growth / 1e6, 2)} MB, geometries ${trend.geometries.growth}, textures ${trend.textures.growth}, programs ${trend.programs.growth}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const out = options.out ?? path.join(os.tmpdir(), 'otb-perf', `${options.label}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(out, { recursive: true });
  let dist = options.dist;
  if (options.build || !dist) {
    dist = path.join(out, 'uat-dist');
    buildUatBundle(dist);
  }
  if (!existsSync(path.join(dist, 'index.html'))) throw new Error(`${dist} has no index.html`);
  const server = await serveDirectory(dist, options.port);
  const base = `http://127.0.0.1:${options.port}`;
  const profileDir = path.join(out, 'chrome-profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome', headless: false, viewport: null, args: chromeArguments(options),
  });
  await context.addInitScript({ path: probePath });
  const report = { environment: describeEnvironment(options), page: null, runs: [] };
  try {
    // Calibration page: display facts, refresh rate, tile rectangles for the hover sweep, and shader-cache warm-up.
    const calibration = await openHarness(context, harnessUrl(base, {
      fixture: FIXTURE.idle, tier: options.tiers[0], cap: options.cap, diagnostics: 'on', lite: false,
    }));
    const facts = await pageFacts(calibration.page);
    facts.refreshHz = await measureRefreshHz(calibration.page);
    const centers = await tileCenters(calibration.page);
    report.page = facts;
    await calibration.page.close();
    console.log(`Chrome: ${facts.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? facts.userAgent}`);
    console.log(`GPU: ${facts.glRenderer} | DPR ${facts.devicePixelRatio} | viewport ${facts.viewport.width}x${facts.viewport.height} | buffer ${facts.drawingBuffer.width}x${facts.drawingBuffer.height} | refresh ${formatNumber(facts.refreshHz, 1)} Hz | GPU timer ${facts.gpuTimerQuery ? 'yes' : 'no'}`);

    for (const tier of options.tiers) {
      for (const scenario of options.scenarios) {
        let result;
        if (scenario === 'idle') result = await runIdle(context, base, options, tier, facts);
        else if (scenario === 'hover') result = await runHover(context, base, options, tier, facts, centers);
        else if (scenario === 'socket') result = await runSocket(context, base, options, tier, facts);
        else if (scenario === 'volume') result = await runVolume(context, base, options, tier, facts);
        else if (scenario === 'soak') result = await runSoak(context, base, options, tier, facts);
        else result = await runReplayScenario(context, base, options, tier, scenario, facts);
        report.runs.push(result);
        printSummary(result);
        if (result.errors?.length) console.warn(`  page errors: ${result.errors.slice(0, 3).join(' | ')}`);
      }
    }
  } finally {
    writeFileSync(path.join(out, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
    await context.close();
    server.close();
  }
  console.log(`Results: ${path.join(out, 'results.json')}`);

  const idleRuns = report.runs.filter(run => run.scenario === 'idle');
  const failedIdle = idleRuns.filter(run => run.idle.sceneSubmissions !== 0);
  const blindIdle = idleRuns.filter(run => !run.probeSawFrames);
  if (options.assertIdle && (idleRuns.length === 0 || failedIdle.length > 0 || (blindIdle.length > 0 && !options.lite))) {
    console.error(`IDLE CHECK FAILED: ${failedIdle.map(run => `${run.tier}=${run.idle.sceneSubmissions}`).join(', ')
      || (blindIdle.length > 0 ? 'the probe saw no frame during load (blind)' : 'no idle run')}`);
    process.exitCode = 1;
  }
  // `volume` and `socket` pass by drawing nothing, so zero rendered frames there is the result, not a blind probe; the probe is
  // blind only when another scenario (or the idle load) also saw no frame, or when nothing in the report could have shown one.
  const expectsNoFrames = new Set(['volume', 'socket']);
  const sawFrames = report.runs.some(run => run.probeSawFrames || (run.warm && run.warm.frames.renderedFrames > 0));
  const blind = report.runs.some(run => run.scenario !== 'idle' && run.warm && run.warm.frames.renderedFrames === 0
    && !(expectsNoFrames.has(run.scenario) && sawFrames));
  if (blind && !options.lite) {
    console.error('The probe observed no rendered scheduler frames: the build is minified or the scheduler changed (see probe-init.js).');
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
