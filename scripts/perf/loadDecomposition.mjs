#!/usr/bin/env node
/**
 * Cold-launch load decomposition (Phase B3 follow-up, 08G Task 0): where the time goes between the page mounting and the first
 * frame. Every launch is a new Chrome process with an empty profile; the `otb:scene:*` and `otb:warmup:*` marks, the first
 * PMREM program link and the first board frame are read from the probe and summarised as medians.
 *
 *   node scripts/perf/loadDecomposition.mjs --dist <uat-dist> --runs 20 --out <file.json>
 */
import { chromium } from '@playwright/test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDirectory } from './staticServer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const probe = readFileSync(path.join(here, 'probe-init.js'), 'utf8');
const READY_OBSERVER = `document.addEventListener('DOMContentLoaded', () => { const start = () => { if (!document.querySelector('main.phase4-uat')) { requestAnimationFrame(start); return; } window.__PROBE__.mark('main-mounted'); }; start(); });`;

const options = { dist: null, runs: 20, out: null, port: 4191, query: '' };
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--dist') options.dist = path.resolve(argv[++index]);
  else if (argv[index] === '--runs') options.runs = Number(argv[++index]);
  else if (argv[index] === '--out') options.out = path.resolve(argv[++index]);
  else if (argv[index] === '--port') options.port = Number(argv[++index]);
  else if (argv[index] === '--query') options.query = argv[++index];
  else throw new Error(`Unknown option ${argv[index]}`);
}
if (!options.dist || !options.out) throw new Error('--dist and --out are required');

const median = values => {
  const sorted = values.filter(value => value !== null && value !== undefined).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

const server = await serveDirectory(options.dist, options.port);
const rows = [];
try {
  for (let run = 1; run <= options.runs; run += 1) {
    const profile = path.join(os.tmpdir(), `otb-load-decomposition-${process.pid}`);
    rmSync(profile, { recursive: true, force: true });
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome', headless: false, viewport: null,
      args: ['--ignore-gpu-blocklist', '--window-size=1536,864', '--window-position=0,0',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    });
    try {
      await context.addInitScript({ content: probe });
      await context.addInitScript({ content: READY_OBSERVER });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${options.port}/?${new URLSearchParams({ 'phase4-uat': '1', scenario: 'walk', quality: 'balanced', fpsLimit: '60' })}${options.query ? `&${options.query}` : ''}`);
      await page.evaluate(() => window.__PROBE__.setReplay(null));
      await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
      await new Promise(resolve => { setTimeout(resolve, 2_500); });
      await page.evaluate(() => window.__PROBE__.attachMain());
      await page.evaluate(async () => {
        for (let index = 0; index < 8; index += 1) { window.__PROBE__.pollGpu(); await new Promise(resolve => { setTimeout(resolve, 40); }); }
      });
      const batch = await page.evaluate(() => window.__PROBE__.drain());
      const mark = name => batch.marks.filter(entry => entry.name === name).sort((a, b) => a.t - b.t)[0]?.t ?? null;
      // Support uses one temporary capability context (also cached for Auto); count it separately
      // from contexts created after the scene chunk loads.
      const glRenderer = await page.evaluate(() => window.__PROBE__.glRenderer ?? null);
      const contexts = batch.events.filter(entry => entry.kind === 'context-created').sort((a, b) => a.t - b.t);
      const chunkLoaded = mark('otb:scene:chunk-loaded') ?? 0;
      const throwawayContext = contexts.find(entry => entry.t < chunkLoaded)?.t ?? null;
      const contextCreated = contexts.find(entry => entry.t >= chunkLoaded)?.t ?? null;
      const pmrem = batch.links.filter(link => /PMREM/.test(link.name ?? '')).sort((a, b) => a.t - b.t)[0]?.t ?? null;
      const done = mark('otb:warmup:done');
      const firstFrame = batch.frames.filter(frame => frame.rendered && (done === null || frame.start >= done)).sort((a, b) => a.start - b.start)[0]?.start ?? null;
      rows.push({
        mounted: mark('main-mounted'),
        chunkRequest: mark('otb:scene:chunk-request'),
        chunkLoaded: mark('otb:scene:chunk-loaded'),
        gameSceneRender: mark('otb:scene:game-scene-render'),
        board3dRender: mark('otb:scene:board3d-render'),
        glRenderer,
        throwawayContext,
        contextCount: contexts.length,
        contextCreated,
        canvasCreated: mark('otb:scene:canvas-created'),
        board3dMounted: mark('otb:scene:board3d-mounted'),
        envStart: mark('otb:scene:env-start'),
        earlyCompileStart: mark('otb:scene:early-compile-start'),
        earlyCompileEnd: mark('otb:scene:early-compile-end'),
        firstPmremLink: pmrem,
        envEnd: mark('otb:scene:env-end'),
        warmupStart: mark('otb:warmup:start'),
        warmupDone: done,
        firstFrame,
      });
      console.log(`run ${run}/${options.runs}`, JSON.stringify(rows.at(-1), (key, value) => (typeof value === 'number' ? Math.round(value) : value)));
    } finally {
      await context.close();
    }
  }
} finally {
  server.close();
}

const keys = Object.keys(rows[0]);
const medians = Object.fromEntries(keys.filter(key => key !== 'glRenderer').map(key => [key, median(rows.map(row => row[key]))]));
medians.glRenderer = [...new Set(rows.map(row => row.glRenderer))].join(' | ');
const step = (from, to) => median(rows.map(row => (row[from] !== null && row[to] !== null ? row[to] - row[from] : null)));
const steps = {
  'mounted -> chunk-request': step('mounted', 'chunkRequest'),
  'chunk-request -> chunk-loaded (fetch + parse + evaluate)': step('chunkRequest', 'chunkLoaded'),
  'chunk-loaded -> game-scene-render': step('chunkLoaded', 'gameSceneRender'),
  'game-scene-render -> WebGL context created (Canvas measure + context)': step('gameSceneRender', 'contextCreated'),
  'context created -> board3d-render (renderer setup)': step('contextCreated', 'board3dRender'),
  'board3d-render -> canvas-created (React build of the scene, commit)': step('board3dRender', 'canvasCreated'),
  'canvas-created -> env-start': step('canvasCreated', 'envStart'),
  'env-start -> env-end (studio PMREM, blocking)': step('envStart', 'envEnd'),
  'env-end -> warmup-start': step('envEnd', 'warmupStart'),
  'warmup-start -> warmup-done': step('warmupStart', 'warmupDone'),
  'mounted -> warmup-start': step('mounted', 'warmupStart'),
  'navigation -> first frame at or after done': median(rows.map(row => row.firstFrame)),
};
writeFileSync(options.out, `${JSON.stringify({ runs: rows.length, medians, steps, rows }, null, 1)}\n`);
console.log(JSON.stringify({ medians, steps }, (key, value) => (typeof value === 'number' ? Math.round(value) : value), 1));
