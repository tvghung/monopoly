#!/usr/bin/env node
/**
 * CPU profile of warm replays of one harness fixture (Phase B2 diagnosis tool, not a benchmark). Serves a UAT bundle, replays the
 * fixture once to warm it up, profiles `--replays` more replays with the V8 sampling profiler and prints the heaviest functions
 * by self time and the heaviest PascalCase functions (React components, geometry builders) by inclusive time. The bundle must be
 * unminified (`pnpm perf:benchmark --build` builds one) or the function names are meaningless.
 *
 *   node scripts/perf/cpuProfile.mjs --dist <dir> --scenario walk|dice|purchase|rent|build [--replays 3] [--port 4190]
 *
 * It is diagnostic: it runs with the production-style scene tree (`renderDiagnostics=off`) and attaches the profiler for the
 * whole run, so absolute times are inflated; use it to rank causes, never to quote a frame time.
 */
import { chromium } from '@playwright/test';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const dist = path.resolve(opt('--dist'));
const scenario = opt('--scenario', 'walk');
const replays = Number(opt('--replays', '3'));
const port = Number(opt('--port', '4190'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(port, '127.0.0.1', r));
const fixtures = { walk: 'walk', dice: 'dice-contact-shadows', purchase: 'purchase', rent: 'rent', build: 'house-2' };
const ctx = await chromium.launchPersistentContext(path.join(dist, '..', 'prof-profile'), {
  channel: 'chrome', headless: false, viewport: null, args: ['--ignore-gpu-blocklist', '--window-size=1536,864', '--window-position=0,0', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/?phase4-uat=1&scenario=${fixtures[scenario]}&quality=balanced&fpsLimit=60&renderDiagnostics=off`);
await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 180000 });
await page.waitForSelector('.game-scene canvas', { state: 'attached', timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));
const cdp = await ctx.newCDPSession(page);
const replay = async () => {
  await page.getByRole('button', { name: /Chạy lại/ }).click();
  await page.waitForFunction(() => document.querySelector('main.phase4-uat')?.getAttribute('data-uat-ready') === 'false', undefined, { timeout: 5000 }).catch(() => {});
  await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120000 });
  await new Promise(r => setTimeout(r, 800));
};
await replay(); // warm-up
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
for (let i = 0; i < replays; i += 1) await replay();
const { profile } = await cdp.send('Profiler.stop');
const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map();
const total = profile.samples.length;
const dt = profile.timeDeltas;
let totalUs = 0;
profile.samples.forEach((id, i) => {
  const n = nodes.get(id);
  const f = n.callFrame;
  const key = `${f.functionName || '(anon)'} ${path.basename(f.url)}:${f.lineNumber + 1}`;
  const us = dt[i] ?? 0;
  totalUs += us;
  self.set(key, (self.get(key) ?? 0) + us);
});
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
console.log(`samples ${total}, total ${(totalUs / 1000).toFixed(0)} ms over ${replays} replays`);
for (const [key, us] of top) console.log(`${(us / 1000).toFixed(1).padStart(8)} ms  ${key}`);
// inclusive time by component-ish function names (PascalCase), using parent links
const parent = new Map();
profile.nodes.forEach(n => (n.children ?? []).forEach(c => parent.set(c, n.id)));
const inclusive = new Map();
profile.samples.forEach((id, i) => {
  const seen = new Set();
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const f = nodes.get(cur).callFrame;
    const name = f.functionName;
    if (name && /^[A-Z]/.test(name) && !seen.has(name)) { seen.add(name); inclusive.set(name, (inclusive.get(name) ?? 0) + (dt[i] ?? 0)); }
  }
});
console.log('--- inclusive, PascalCase functions');
for (const [name, us] of [...inclusive.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log(`${(us / 1000).toFixed(1).padStart(8)} ms  ${name}`);
await ctx.close();
server.close();
