#!/usr/bin/env node
/**
 * Shader warm-up regression check (Phase B3, 08F): "program links during scripted gameplay after warm-up = 0".
 *
 * It opens a UAT bundle in headed Chrome with the probe injected and, for every cold launch (a new Chrome process with an
 * empty profile, so no driver shader cache) asserts that
 *   - `otb:warmup:start` and `otb:warmup:done` were emitted, in that order, and the warm-up report says `complete`;
 *   - no program was linked after `otb:warmup:done` during the scripted turn and one replay (T2);
 *   - the longest scheduler callback after `otb:warmup:done` stays at or under the limit (T1 reads this tool's raw output too);
 *   - there was no page error.
 * Then, on one page, it switches the graphics tier live (the UAT page's own selector), and for each switch asserts the same
 * for the tier's own `otb:warmup:tier-switch:*` marks and for the replay that follows.
 *
 *   node scripts/perf/warmupCheck.mjs --dist <uat-dist> --out <dir>
 *   node scripts/perf/warmupCheck.mjs --dist <uat-dist> --out <dir> --scenarios walk,hotel --tiers balanced
 *
 * Exit code 1 on any failed assertion. The raw per-launch data is written to `<out>/<name>.json`.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDirectory } from './staticServer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const probe = readFileSync(path.join(here, 'probe-init.js'), 'utf8');
const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

const DEFAULT_SCENARIOS = [
  'walk', 'pass-go', 'purchase', 'rent', 'decline', 'partial-debt', 'house-1', 'house-4', 'hotel', 'construction-reduced',
  'chance', 'chest', 'card-chain', 'jail', 'bankrupt', 'reduced-motion', 'dice-contact-shadows', 'landmarks-all', 'stress', 'standees',
];
/** Scenarios that are also run on the other tiers (each cold launch costs about ten seconds). */
const TIER_SCENARIOS = ['walk', 'house-4', 'dice-contact-shadows'];
const SWITCH_SEQUENCE = ['low', 'balanced', 'high', 'low', 'high', 'balanced'];
const CALLBACK_LIMIT_MS = 300;

const READY_OBSERVER = `
(() => {
  const start = () => {
    const main = document.querySelector('main.phase4-uat');
    if (!main) { requestAnimationFrame(start); return; }
    window.__PROBE__.mark('main-mounted');
  };
  document.addEventListener('DOMContentLoaded', start);
})();
`;

function parse(argv) {
  const options = { dist: null, out: null, port: 4190, scenarios: DEFAULT_SCENARIOS, tiers: ['balanced', 'low', 'high'], skipSwitch: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--dist') options.dist = path.resolve(argv[++index]);
    else if (flag === '--out') options.out = path.resolve(argv[++index]);
    else if (flag === '--port') options.port = Number(argv[++index]);
    else if (flag === '--scenarios') options.scenarios = argv[++index].split(',');
    else if (flag === '--tiers') options.tiers = argv[++index].split(',');
    else if (flag === '--skip-switch') options.skipSwitch = true;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!options.dist || !options.out) throw new Error('--dist and --out are required');
  return options;
}

async function launch(profile, width = 1536, height = 864) {
  rmSync(profile, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, viewport: null,
    args: ['--ignore-gpu-blocklist', `--window-size=${width},${height}`, '--window-position=0,0',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  await context.addInitScript({ content: probe });
  await context.addInitScript({ content: READY_OBSERVER });
  const page = await context.newPage();
  const sinks = { pageErrors: [], consoleMessages: [] };
  page.on('pageerror', error => sinks.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') sinks.consoleMessages.push(`${message.type()}: ${message.text().slice(0, 200)}`);
  });
  return { context, page, sinks };
}

async function drain(page, store) {
  await page.evaluate(async () => {
    for (let index = 0; index < 8; index += 1) { window.__PROBE__.pollGpu(); await new Promise(resolve => { setTimeout(resolve, 40); }); }
  });
  const batch = await page.evaluate(() => window.__PROBE__.drain());
  for (const key of Object.keys(store)) store[key].push(...(batch[key] ?? []));
}

const newStore = () => ({ links: [], frames: [], marks: [], syncWaits: [] });

async function replay(page, label) {
  await page.evaluate(name => window.__PROBE__.setReplay(name), label);
  await page.getByRole('button', { name: /Chạy lại/ }).click();
  await page.waitForTimeout(500);
  await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
  await sleep(1_000);
}

/** The warm-up window and what happened after it, from the probe store. */
function judge(store, { fromMark, doneMark, since = -Infinity, until = Infinity }) {
  const marks = store.marks.filter(mark => mark.name.startsWith('otb:warmup')).sort((a, b) => a.t - b.t);
  const starts = marks.filter(mark => mark.name === fromMark && mark.t >= since);
  const dones = marks.filter(mark => mark.name === doneMark && mark.t >= since);
  const start = starts[0] ?? null;
  const done = dones[0] ?? null;
  const rendered = done ? store.frames.filter(frame => frame.rendered && frame.start >= done.t && frame.start <= until) : [];
  const linksAfter = done ? store.links.filter(link => link.t > done.t && link.t <= until) : [];
  return {
    startT: start?.t ?? null,
    doneT: done?.t ?? null,
    ordered: Boolean(start && done && start.t <= done.t),
    warmupMs: start && done ? done.t - start.t : null,
    linksDuring: start && done ? store.links.filter(link => link.t >= start.t && link.t <= done.t).length : null,
    linksAfter: linksAfter.length,
    linksAfterNames: [...new Set(linksAfter.map(link => link.name || '(unnamed)'))],
    worstCallbackAfterMs: Math.max(0, ...rendered.map(frame => frame.cpu)),
    framesAfter: rendered.length,
    marks: marks.map(mark => `${mark.name}@${Math.round(mark.t)}`),
  };
}

async function coldLaunch(options, scenario, tier) {
  const { context, page, sinks } = await launch(path.join(options.out, 'profile'));
  const store = newStore();
  try {
    const params = new URLSearchParams({ 'phase4-uat': '1', scenario, quality: tier, fpsLimit: '60' });
    await page.goto(`http://127.0.0.1:${options.port}/?${params}`);
    await page.evaluate(() => window.__PROBE__.setReplay(null));
    await page.waitForSelector('.game-scene canvas', { state: 'attached', timeout: 60_000 });
    await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
    await sleep(2_500);
    await page.evaluate(() => window.__PROBE__.attachMain());
    if (await page.getByRole('button', { name: /Chạy lại/ }).count()) await replay(page, 'second');
    await drain(page, store);
    const warmup = await page.evaluate(() => window.__OWN_THE_BLOCK_WARMUP__ ?? null);
    const verdict = judge(store, { fromMark: 'otb:warmup:start', doneMark: 'otb:warmup:done' });
    const failures = [];
    if (!verdict.ordered) failures.push('otb:warmup:start/done missing or out of order');
    if (warmup?.outcome !== 'complete') failures.push(`warm-up outcome ${warmup?.outcome ?? 'missing'}`);
    if (verdict.linksAfter !== 0) failures.push(`${verdict.linksAfter} program links after warm-up (${verdict.linksAfterNames.join(', ')})`);
    if (verdict.worstCallbackAfterMs > CALLBACK_LIMIT_MS) failures.push(`callback ${verdict.worstCallbackAfterMs.toFixed(0)} ms after warm-up`);
    if (sinks.pageErrors.length) failures.push(`page errors: ${sinks.pageErrors.join(' | ')}`);
    const row = { kind: 'cold', scenario, tier, verdict, warmup, failures, pageErrors: sinks.pageErrors, consoleMessages: [...new Set(sinks.consoleMessages)] };
    writeFileSync(path.join(options.out, `cold-${tier}-${scenario}.json`), `${JSON.stringify({ ...row, links: store.links.length, frames: store.frames.length }, null, 1)}\n`);
    console.log(`${failures.length ? 'FAIL' : 'ok  '} cold ${tier.padEnd(8)} ${scenario.padEnd(22)} warm-up ${verdict.warmupMs?.toFixed(0)} ms, links during ${verdict.linksDuring}, after ${verdict.linksAfter}, worst callback after ${verdict.worstCallbackAfterMs.toFixed(0)} ms${failures.length ? ` :: ${failures.join('; ')}` : ''}`);
    return row;
  } finally {
    await context.close();
  }
}

async function tierSwitches(options) {
  const { context, page, sinks } = await launch(path.join(options.out, 'profile'));
  const store = newStore();
  const rows = [];
  try {
    const params = new URLSearchParams({ 'phase4-uat': '1', scenario: 'walk', quality: 'balanced', fpsLimit: '60' });
    await page.goto(`http://127.0.0.1:${options.port}/?${params}`);
    await page.evaluate(() => window.__PROBE__.setReplay(null));
    await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
    await sleep(2_500);
    await page.evaluate(() => window.__PROBE__.attachMain());
    const select = page.locator('select[aria-label="Chất lượng đồ họa (UAT)"]');
    let current = 'balanced';
    for (const tier of SWITCH_SEQUENCE) {
      await drain(page, store);
      const since = Math.max(0, ...store.marks.filter(mark => mark.name.endsWith(':done')).map(mark => mark.t));
      await select.selectOption(tier);
      await sleep(3_000);
      await replay(page, `after-${tier}`);
      await drain(page, store);
      const until = await page.evaluate(() => performance.now());
      const warmup = await page.evaluate(() => window.__OWN_THE_BLOCK_WARMUP__ ?? null);
      const verdict = judge(store, { fromMark: 'otb:warmup:tier-switch:start', doneMark: 'otb:warmup:tier-switch:done', since: since + 0.001, until });
      const failures = [];
      if (!verdict.ordered) failures.push('tier-switch marks missing or out of order');
      if (warmup?.outcome !== 'complete' || warmup.tier !== tier) failures.push(`warm-up ${warmup?.tier}/${warmup?.outcome}`);
      if (verdict.linksAfter !== 0) failures.push(`${verdict.linksAfter} program links after the tier warm-up (${verdict.linksAfterNames.join(', ')})`);
      if (verdict.worstCallbackAfterMs > CALLBACK_LIMIT_MS) failures.push(`callback ${verdict.worstCallbackAfterMs.toFixed(0)} ms after the tier warm-up`);
      if (sinks.pageErrors.length) failures.push(`page errors: ${sinks.pageErrors.join(' | ')}`);
      const resources = await page.evaluate(() => window.__PROBE__.resources());
      rows.push({ kind: 'switch', from: current, tier, verdict, warmup, resources, failures });
      console.log(`${failures.length ? 'FAIL' : 'ok  '} switch ${current} -> ${tier.padEnd(8)} warm-up ${verdict.warmupMs?.toFixed(0)} ms, links during ${verdict.linksDuring}, after ${verdict.linksAfter}, worst callback after ${verdict.worstCallbackAfterMs.toFixed(0)} ms, programs ${resources?.programs}${failures.length ? ` :: ${failures.join('; ')}` : ''}`);
      current = tier;
    }
    writeFileSync(path.join(options.out, 'tier-switch.json'), `${JSON.stringify({ rows, consoleMessages: [...new Set(sinks.consoleMessages)] }, null, 1)}\n`);
    return rows;
  } finally {
    await context.close();
  }
}

const options = parse(process.argv.slice(2));
mkdirSync(options.out, { recursive: true });
const server = await serveDirectory(options.dist, options.port);
const results = [];
try {
  for (const tier of options.tiers) {
    for (const scenario of tier === 'balanced' ? options.scenarios : options.scenarios.filter(name => TIER_SCENARIOS.includes(name))) {
      try {
        results.push(await coldLaunch(options, scenario, tier));
      } catch (error) {
        const message = String(error.message).split('\n')[0];
        console.log(`FAIL cold ${tier} ${scenario}: ${message}`);
        results.push({ kind: 'cold', scenario, tier, failures: [message] });
      }
    }
  }
  if (!options.skipSwitch) results.push(...await tierSwitches(options));
} finally {
  server.close();
  rmSync(path.join(options.out, 'profile'), { recursive: true, force: true });
}
const failed = results.filter(row => row.failures.length);
writeFileSync(path.join(options.out, 'summary.json'), `${JSON.stringify({
  checks: results.length, failed: failed.length,
  totalLinksAfterWarmup: results.reduce((sum, row) => sum + (row.verdict?.linksAfter ?? 0), 0),
}, null, 1)}\n`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
