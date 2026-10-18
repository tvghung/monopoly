#!/usr/bin/env node
/**
 * Lobby-to-board measurement (Phase B3 follow-up, 08H Task 0). The UAT page shows the real `Lobby` for `--dwell` milliseconds and then
 * mounts the board from nothing, the way `App.tsx` switches from its Lobby branch to its Board branch when a room starts. Every
 * launch is a new Chrome process with an empty profile (no driver shader cache) unless `--warm-cache` is given.
 *
 *   T5-lobby = `otb:uat:start` (set right before the commit that mounts the board) to the first rendered board frame at or after
 *   `otb:warmup:done` (the first board frame for a bundle that has no warm-up).
 *
 *   node scripts/perf/lobbyToBoard.mjs run --dist <uat-dist> --dwell 3000 --runs 20 --out <dir> [--from n] [--warm-cache]
 *   node scripts/perf/lobbyToBoard.mjs aggregate --out <dir>
 *
 * `--from n --runs 1` measures one launch into `run-<n>`, so bundles can be measured alternately (A1, B1, A2, B2, ...) into one folder each.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe } from './metrics.mjs';
import { serveDirectory } from './staticServer.mjs';

const probe = readFileSync(new URL('./probe-init.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

function parse(argv) {
  const options = { command: argv[0], dist: null, out: null, dwell: 3000, runs: 20, from: 1, port: 4175, warmCache: false, scenario: 'walk', persist: null, memory: false };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--dist') options.dist = path.resolve(argv[++index]);
    else if (flag === '--out') options.out = path.resolve(argv[++index]);
    else if (flag === '--dwell') options.dwell = Number(argv[++index]);
    else if (flag === '--runs') options.runs = Number(argv[++index]);
    else if (flag === '--from') options.from = Number(argv[++index]);
    else if (flag === '--port') options.port = Number(argv[++index]);
    else if (flag === '--scenario') options.scenario = argv[++index];
    else if (flag === '--warm-cache') options.warmCache = true;
    else if (flag === '--persist') options.persist = argv[++index];
    else if (flag === '--memory') options.memory = true;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!options.out) throw new Error('--out is required');
  return options;
}

/**
 * Private memory (MB) of the Chrome processes that belong to this profile, by process type, read from the operating system (Windows).
 * The GPU process is where a WebGL context's textures and buffers live; the renderer process is the page (JS heap, canvases).
 */
function processMemory(profile) {
  const script = "$p = '" + profile.replace(/'/g, "''") + "'; Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like ('*' + $p + '*') } | ForEach-Object { $t = 'browser'; if ($_.CommandLine -match '--type=([a-z-]+)') { $t = $Matches[1] }; $proc = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($proc) { '{0} {1}' -f $t, $proc.PrivateMemorySize64 } }";
  const out = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout ?? '';
  const byType = {};
  for (const line of out.split(/\r?\n/)) {
    const [type, bytes] = line.trim().split(' ');
    if (type && bytes) byType[type] = (byType[type] ?? 0) + Number(bytes) / 1048576;
  }
  return byType;
}

async function sampleMemory(context, page, profile) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576;
  const resources = await page.evaluate(() => window.__PROBE__.resources());
  await cdp.detach();
  return { heapMB: heap, resources, processMB: processMemory(profile) };
}

async function launchOnce(options, profile) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, viewport: null,
    args: ['--ignore-gpu-blocklist', '--window-size=1536,864', '--window-position=0,0',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  try {
    await context.addInitScript({ content: probe });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const query = new URLSearchParams({
      'phase4-uat': '1', scenario: options.scenario, quality: 'balanced', fpsLimit: '60', lobby: String(options.dwell),
      ...(options.persist ? { persist: options.persist } : {}),
    });
    await page.goto(`http://127.0.0.1:${options.port}/?${query}`);
    await page.evaluate(() => window.__PROBE__.setReplay(null));
    let memory = null;
    if (options.memory) {
      // In the lobby, 1.5 s before the board is mounted: whatever the lobby keeps alive is there by now.
      await page.waitForFunction(() => performance.getEntriesByName('otb:uat:lobby-shown').length > 0, undefined, { timeout: 60_000 });
      await sleep(Math.max(0, options.dwell - 2_000));
      memory = { lobby: await sampleMemory(context, page, profile) };
    }
    await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 180_000 });
    await sleep(2_500);
    if (memory) memory.board = await sampleMemory(context, page, profile);
    // A late sample, to tell memory that settles from memory that stays.
    if (memory) { await sleep(10_000); memory.late = await sampleMemory(context, page, profile); }
    await page.evaluate(() => window.__PROBE__.attachMain());
    await page.evaluate(async () => {
      for (let index = 0; index < 8; index += 1) { window.__PROBE__.pollGpu(); await new Promise(resolve => { setTimeout(resolve, 40); }); }
    });
    const batch = await page.evaluate(() => window.__PROBE__.drain());
    const glRenderer = await page.evaluate(() => window.__PROBE__.glRenderer ?? null);
    return { batch, errors, glRenderer, memory };
  } finally {
    await context.close();
  }
}

function analyse(batch) {
  const mark = name => batch.marks.filter(entry => entry.name === name).sort((a, b) => a.t - b.t)[0]?.t ?? null;
  const lobbyShown = mark('otb:uat:lobby-shown');
  const start = mark('otb:uat:start');
  const done = mark('otb:warmup:done');
  const warmupStart = mark('otb:warmup:start');
  const revealed = mark('otb:uat:revealed');
  const prewarmFirst = mark('otb:scene:prewarm-first');
  const prewarmDone = mark('otb:scene:prewarm-done');
  const turnStart = batch.marks.filter(entry => entry.name.startsWith('otb:uat:turn-start:')).sort((a, b) => a.t - b.t)[0]?.t ?? null;
  const floor = Math.max(start ?? 0, done ?? 0);
  const rendered = batch.frames.filter(frame => frame.rendered && frame.start >= floor).sort((a, b) => a.start - b.start);
  const firstFrame = rendered[0]?.start ?? null;
  const afterStart = batch.frames.filter(frame => frame.rendered && frame.start >= (start ?? 0));
  const inLobby = (items, key) => items.filter(item => start !== null && lobbyShown !== null && item[key] >= lobbyShown && item[key] < start);
  return {
    lobbyShown,
    start,
    warmupStart,
    prewarmFirst,
    prewarmDone,
    warmupDone: done,
    turnStart,
    firstFrame,
    revealed,
    // Spike designs (08H Task 3): the board is visible two frames after the commit that revealed or mounted it.
    t5Reveal: start !== null && revealed !== null ? revealed - start : null,
    t5Lobby: start !== null && firstFrame !== null ? firstFrame - start : null,
    warmupMs: warmupStart !== null && done !== null ? done - warmupStart : null,
    // The longest callback and rAF gap of the board's frames from the start on (the T1 reading for this route).
    longestCallbackMs: Math.max(0, ...afterStart.map(frame => frame.cpu)),
    linksAfterDone: done === null ? null : batch.links.filter(link => link.t > done).length,
    linksTotal: batch.links.length,
    // What the lobby itself had to put up with: long tasks and long animation frames while the lobby was shown.
    lobbyMaxLongTaskMs: Math.max(0, ...inLobby(batch.longtasks, 'start').map(entry => entry.dur)),
    lobbyMaxLongFrameMs: Math.max(0, ...inLobby(batch.loaf, 'start').map(entry => entry.dur)),
    startMaxLongTaskMs: Math.max(0, ...batch.longtasks.filter(entry => start !== null && entry.start >= start).map(entry => entry.dur)),
  };
}

async function oneRun(options) {
  const server = await serveDirectory(options.dist, options.port);
  const profile = path.join(os.tmpdir(), `otb-lobby-${process.pid}`);
  try {
    rmSync(profile, { recursive: true, force: true });
    // A warm driver cache: one launch to fill it (discarded), the measured launch reuses the same profile.
    if (options.warmCache) await launchOnce(options, profile);
    const { batch, errors, glRenderer, memory } = await launchOnce(options, profile);
    return { ...analyse(batch), errors, glRenderer, memory };
  } finally {
    rmSync(profile, { recursive: true, force: true });
    server.close();
  }
}

function collect(out) {
  return readdirSync(out).filter(name => /^run-\d+$/.test(name)).sort()
    .map(name => path.join(out, name, 'lobby.json')).filter(existsSync).map(file => JSON.parse(readFileSync(file, 'utf8')));
}

function summarize(rows) {
  const spread = key => describe(rows.map(row => row[key]).filter(value => value !== null));
  return {
    runs: rows.length,
    dwellMs: rows[0]?.dwellMs ?? null,
    warmCache: rows[0]?.warmCache ?? false,
    glRenderer: [...new Set(rows.map(row => row.glRenderer))],
    t5LobbyMs: spread('t5Lobby'),
    t5RevealMs: spread('t5Reveal'),
    warmupMs: spread('warmupMs'),
    longestCallbackMs: spread('longestCallbackMs'),
    startMaxLongTaskMs: spread('startMaxLongTaskMs'),
    lobbyMaxLongTaskMs: spread('lobbyMaxLongTaskMs'),
    lobbyMaxLongFrameMs: spread('lobbyMaxLongFrameMs'),
    linksAfterDone: rows.map(row => row.linksAfterDone),
    pageErrors: rows.reduce((sum, row) => sum + row.errors.length, 0),
  };
}

const options = parse(process.argv.slice(2));
mkdirSync(options.out, { recursive: true });
if (options.command === 'run') {
  if (!options.dist) throw new Error('--dist is required');
  for (let run = options.from; run < options.from + options.runs; run += 1) {
    const runDir = path.join(options.out, `run-${String(run).padStart(2, '0')}`);
    mkdirSync(runDir, { recursive: true });
    const row = await oneRun(options);
    writeFileSync(path.join(runDir, 'lobby.json'), `${JSON.stringify({ run, dwellMs: options.dwell, warmCache: options.warmCache, dist: path.basename(options.dist), ...row }, null, 2)}\n`);
    console.log(`run ${run}: T5-lobby ${row.t5Lobby?.toFixed(0)} ms | warm-up ${row.warmupMs?.toFixed(0) ?? '-'} ms | longest callback ${row.longestCallbackMs.toFixed(0)} ms | lobby long task ${row.lobbyMaxLongTaskMs.toFixed(0)} ms | links after done ${row.linksAfterDone ?? '-'}`);
  }
} else if (options.command !== 'aggregate') {
  throw new Error('The command is `run` or `aggregate`.');
}
const summary = summarize(collect(options.out));
writeFileSync(path.join(options.out, 'lobby-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary.t5LobbyMs));
