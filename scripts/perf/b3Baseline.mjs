#!/usr/bin/env node
/**
 * Cold-launch and first-turn baseline (Phase B3 gate, 08D step 4). Every repeat starts a NEW Chrome process with an EMPTY
 * profile (so no shader disk cache, no calibration page), opens the `walk` harness fixture and records from navigation:
 *
 *   load       navigation start -> the harness starts its first scripted turn (it auto-plays 180 ms after mount)
 *   first turn the harness `data-uat-ready` false -> true window of that first scripted turn
 *   second     one more replay with the scene already warm (does anything link again?)
 *
 * Per phase: longest frame (scheduler callback CPU and frame gap), long animation frames/tasks, program links and the first-use
 * signature set. `aggregate` compares the signature sets across repeats. Same bundle, window, GPU selection and FPS cap as the
 * soak series; `--runs` is fixed up front.
 *
 *   node scripts/perf/b3Baseline.mjs run --dist <uat-dist> --runs 10 --out <dir>
 *   node scripts/perf/b3Baseline.mjs aggregate --out <dir>
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFrames, describe } from './metrics.mjs';
import { classifyLinks, diffSignatures, longestFrame, signatureTable } from './signatures.mjs';
import { serveDirectory } from './staticServer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const probePath = path.join(here, 'probe-init.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const WINDOW = '1536x864';

/** Observes the harness ready flag and marks every flip, so the first scripted turn has exact start and end times. */
const READY_OBSERVER = `
(() => {
  const start = () => {
    const main = document.querySelector('main.phase4-uat');
    if (!main) { requestAnimationFrame(start); return; }
    window.__PROBE__.mark('main-mounted');
    let last = main.getAttribute('data-uat-ready');
    window.__PROBE__.mark('ready:' + last);
    new MutationObserver(() => {
      const value = main.getAttribute('data-uat-ready');
      if (value !== last) { last = value; window.__PROBE__.mark('ready:' + value); }
    }).observe(main, { attributes: true, attributeFilter: ['data-uat-ready'] });
  };
  document.addEventListener('DOMContentLoaded', start);
})();
`;

function git(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return (result.stdout ?? '').trim();
}

async function oneRun(dist, runDir, port, cap) {
  const server = await serveDirectory(dist, port);
  const profile = path.join(runDir, 'chrome-profile');
  rmSync(profile, { recursive: true, force: true });
  const [width, height] = WINDOW.split('x').map(Number);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, viewport: null,
    args: ['--ignore-gpu-blocklist', `--window-size=${width},${height}`, '--window-position=0,0',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  try {
    await context.addInitScript({ path: probePath });
    await context.addInitScript({ content: READY_OBSERVER });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    const url = `http://127.0.0.1:${port}/?${new URLSearchParams({ 'phase4-uat': '1', scenario: 'walk', quality: 'balanced', fpsLimit: String(cap) })}`;
    const navigated = Date.now();
    await page.goto(url);
    await page.evaluate(() => window.__PROBE__.setReplay(null));
    await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 180_000 });
    await page.waitForSelector('.game-scene canvas', { state: 'attached', timeout: 60_000 });
    const readySeconds = (Date.now() - navigated) / 1000;
    await sleep(3_000);
    await page.evaluate(() => window.__PROBE__.attachMain());
    const facts = await page.evaluate(() => ({
      userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio, glRenderer: window.__PROBE__.glRenderer,
      viewport: { width: window.innerWidth, height: window.innerHeight }, tier: document.documentElement.dataset.graphicsQuality,
    }));
    const store = { frames: [], links: [], loaf: [], longtasks: [], marks: [], events: [], owners: [], census: [], contexts: [], syncWaits: [], tasks: [], commits: [] };
    const drain = async () => {
      await page.evaluate(async () => { for (let i = 0; i < 12; i += 1) { window.__PROBE__.pollGpu(); await new Promise(resolve => setTimeout(resolve, 40)); } });
      const batch = await page.evaluate(() => window.__PROBE__.drain());
      for (const key of Object.keys(batch)) store[key].push(...batch[key]);
    };
    await drain();
    const marks = store.marks;
    const mounted = marks.find(mark => mark.name === 'main-mounted')?.t ?? null;
    // The harness mounts with data-uat-ready=false and schedules its first scripted turn 180 ms after mount (a setTimeout in
    // Phase4UatHarness.tsx), so the nominal turn start is mount + 180 ms; ready flips to true when that turn has settled.
    const readyFalse = mounted === null ? null : mounted + 180;
    const readyTrueAfter = mounted === null ? null : marks.find(mark => mark.name === 'ready:true' && mark.t > mounted)?.t ?? null;
    // Second turn on the warm scene.
    await page.evaluate(() => window.__PROBE__.setReplay('second-turn'));
    const secondStart = await page.evaluate(() => window.__PROBE__.mark('second-start'));
    await page.getByRole('button', { name: /Chạy lại/ }).click();
    await page.waitForFunction(() => document.querySelector('main.phase4-uat')?.getAttribute('data-uat-ready') === 'false', undefined, { timeout: 5_000 }).catch(() => {});
    await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
    const secondEnd = await page.evaluate(() => window.__PROBE__.mark('second-end'));
    await sleep(1_000);
    await page.evaluate(() => window.__PROBE__.census('after-second-turn'));
    await drain();
    const resources = await page.evaluate(() => window.__PROBE__.resources());

    const inside = (items, from, to, key = 't') => items.filter(item => item[key] >= from && item[key] <= to);
    const phases = {
      load: { from: 0, to: readyFalse ?? mounted ?? 0 },
      firstTurn: { from: readyFalse ?? 0, to: readyTrueAfter ?? 0 },
      settle: { from: readyTrueAfter ?? 0, to: secondStart },
      second: { from: secondStart, to: secondEnd },
    };
    const classified = classifyLinks(store.links, store.events);
    const report = { phases: {}, facts };
    for (const [name, window] of Object.entries(phases)) {
      const links = inside(classified, window.from, window.to);
      const frames = store.frames.filter(frame => frame.start >= window.from && frame.start <= window.to);
      const loaf = inside(store.loaf, window.from, window.to, 'start');
      const longtasks = inside(store.longtasks, window.from, window.to, 'start');
      const waits = inside(store.syncWaits, window.from, window.to);
      report.phases[name] = {
        windowMs: window.to - window.from,
        links: links.length,
        firstUseLinks: links.filter(link => link.kind === 'new-variant').length,
        repeatLinks: links.filter(link => link.kind === 'repeat-link').length,
        signatures: [...new Set(links.map(link => link.sig))].sort(),
        longest: longestFrame(frames),
        // Contiguous interval = rAF gap while an animation was running (idle gaps of the demand-rendered scene excluded).
        contiguousMaxMs: analyzeFrames(frames, { fpsCap: cap, refreshHz: 59.9 }).intervalMs.max,
        maxLoafMs: Math.max(0, ...loaf.map(entry => entry.dur)),
        loafCount: loaf.length,
        maxLongTaskMs: Math.max(0, ...longtasks.map(entry => entry.dur)),
        syncWaitTotalMs: waits.reduce((total, wait) => total + wait.dur, 0),
        syncWaitMaxMs: Math.max(0, ...waits.map(wait => wait.dur)),
      };
    }
    const afterFirstTurnSignatures = [...new Set(classified.filter(link => link.t <= (readyTrueAfter ?? Infinity)).map(link => link.sig))].sort();
    return {
      readySeconds, mountedMs: mounted, readyFalseMs: readyFalse, readyTrueMs: readyTrueAfter, secondStart, secondEnd,
      programsAfterSecondTurn: resources?.programs ?? null, geometriesAfterSecondTurn: resources?.geometries ?? null,
      afterFirstTurnSignatures, signatureTable: signatureTable(store.links), classCounts: classified.reduce((counts, link) => { counts[link.kind] = (counts[link.kind] ?? 0) + 1; return counts; }, {}),
      contextEvents: store.events.filter(event => /context-(lost|restored)|renderer-changed|canvas-changed/.test(event.kind)),
      report, errors,
      frames: store.frames.map(({ ts, start, cpu, continued, rendered, draws }) => ({ ts, start, cpu, continued, rendered, draws })),
    };
  } finally {
    await context.close();
    server.close();
  }
}

function summarize(rows) {
  const first = rows[0];
  const sets = rows.map(row => row.afterFirstTurnSignatures);
  const reference = sets[0];
  const diffs = sets.slice(1).map(set => diffSignatures(reference, set));
  const spread = key => describe(rows.map(row => key(row)));
  return {
    runs: rows.length,
    environment: first?.environment ?? null,
    signaturesAfterFirstTurn: spread(row => row.afterFirstTurnSignatures.length),
    identicalToRun1: diffs.filter(diff => diff.identical).length + 1,
    differencesFromRun1: diffs.map((diff, index) => ({ run: index + 2, onlyInRun1: diff.onlyInA, onlyInThisRun: diff.onlyInB })).filter(entry => entry.onlyInRun1.length || entry.onlyInThisRun.length),
    secondTurnFirstUse: spread(row => row.report.phases.second.firstUseLinks),
    loadLinks: spread(row => row.report.phases.load.links),
    firstTurnLinks: spread(row => row.report.phases.firstTurn.links),
    firstTurnFirstUse: spread(row => row.report.phases.firstTurn.firstUseLinks),
    loadLongestFrameCpuMs: spread(row => row.report.phases.load.longest.maxCpuMs),
    loadLongestFrameGapMs: spread(row => row.report.phases.load.longest.maxGapMs),
    firstTurnLongestFrameCpuMs: spread(row => row.report.phases.firstTurn.longest.maxCpuMs),
    firstTurnLongestFrameGapMs: spread(row => row.report.phases.firstTurn.longest.maxGapMs),
    firstTurnContiguousMaxMs: spread(row => row.report.phases.firstTurn.contiguousMaxMs),
    loadMaxLongTaskMs: spread(row => row.report.phases.load.maxLongTaskMs),
    firstTurnMaxLongTaskMs: spread(row => row.report.phases.firstTurn.maxLongTaskMs),
    secondTurnLongestFrameGapMs: spread(row => row.report.phases.second.longest.maxGapMs),
    readySeconds: spread(row => row.readySeconds),
    programsAfterSecondTurn: spread(row => row.programsAfterSecondTurn),
    withContextEvents: rows.filter(row => row.contextEvents.some(event => /lost|restored/.test(event.kind))).length,
  };
}

function collect(out) {
  const rows = [];
  for (const name of readdirSync(out).filter(entry => /^run-\d+$/.test(entry)).sort()) {
    const file = path.join(out, name, 'baseline.json');
    if (existsSync(file)) rows.push(JSON.parse(readFileSync(file, 'utf8')));
  }
  return rows;
}

function parse(argv) {
  const options = { runs: 10, dist: null, out: null, port: 4173, cap: 60 };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--runs') options.runs = Number(argv[++index]);
    else if (flag === '--dist') options.dist = path.resolve(argv[++index]);
    else if (flag === '--out') options.out = path.resolve(argv[++index]);
    else if (flag === '--port') options.port = Number(argv[++index]);
    else throw new Error(`Unknown option ${flag}`);
  }
  return options;
}

const command = process.argv[2];
const options = parse(process.argv.slice(2));
if (!options.out) throw new Error('--out is required');
mkdirSync(options.out, { recursive: true });
if (command === 'run') {
  if (!options.dist) throw new Error('--dist is required');
  const environment = {
    commit: git(['rev-parse', 'HEAD']), cpu: os.cpus()[0]?.model.trim(), os: `${os.type()} ${os.release()}`, node: process.version,
    window: WINDOW, cap: options.cap, dist: path.basename(options.dist), capturedAt: new Date().toISOString(),
  };
  for (let run = 1; run <= options.runs; run += 1) {
    const runDir = path.join(options.out, `run-${String(run).padStart(2, '0')}`);
    mkdirSync(runDir, { recursive: true });
    console.log(`[baseline] run ${run}/${options.runs}`);
    const row = await oneRun(options.dist, runDir, options.port, options.cap);
    rmSync(path.join(runDir, 'chrome-profile'), { recursive: true, force: true });
    writeFileSync(path.join(runDir, 'baseline.json'), `${JSON.stringify({ run, environment, ...row }, null, 2)}\n`);
    const { load, firstTurn, second } = row.report.phases;
    console.log(`  ready ${row.readySeconds.toFixed(1)} s | load links ${load.links} longest gap ${load.longest.maxGapMs.toFixed(0)} ms | first turn links ${firstTurn.links} (first-use ${firstTurn.firstUseLinks}) longest gap ${firstTurn.longest.maxGapMs.toFixed(0)} ms | second-turn first-use ${second.firstUseLinks} | sigs after first turn ${row.afterFirstTurnSignatures.length}`);
  }
}
const rows = collect(options.out);
const summary = summarize(rows);
writeFileSync(path.join(options.out, 'baseline-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
