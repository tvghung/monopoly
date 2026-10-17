#!/usr/bin/env node
/**
 * Retained-heap diagnosis (Phase B2 diagnosis tool, not a benchmark). Warms a harness fixture up, then samples V8 allocations with
 * the sampling heap profiler during `--replays` replays and prints the allocation sites whose objects are still alive after two
 * forced collections, with the heap growth over the run. `JSFLAGS="--no-opt --no-sparkplug --no-maglev"` runs the same thing with
 * the JIT tiers off, which separates retained objects from compiled-code growth (the 08C record uses this).
 *
 *   node scripts/perf/heapSample.mjs --dist <dir> --scenario walk|dice --warmup 3 --replays 30 [--port 4191]
 */
import { chromium } from '@playwright/test';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const dist = path.resolve(opt('--dist'));
const scenario = opt('--scenario', 'walk');
const warmup = Number(opt('--warmup', '3'));
const replays = Number(opt('--replays', '30'));
const port = Number(opt('--port', '4191'));
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
const fixtures = { walk: 'walk', dice: 'dice-contact-shadows' };
const ctx = await chromium.launchPersistentContext(path.join(dist, '..', 'heap-profile'), {
  channel: 'chrome', headless: false, viewport: null, args: ['--ignore-gpu-blocklist', '--window-size=1536,864', '--window-position=0,0', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...(process.env.JSFLAGS ? ['--js-flags=' + process.env.JSFLAGS] : [])],
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
  await new Promise(r => setTimeout(r, 500));
};
for (let i = 0; i < warmup; i += 1) await replay();
const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
const before = await heap();
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: false, includeObjectsCollectedByMinorGC: false });
for (let i = 0; i < replays; i += 1) await replay();
await cdp.send('HeapProfiler.collectGarbage');
await cdp.send('HeapProfiler.collectGarbage');
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const after = await heap();
console.log(`heap before ${(before / 1e6).toFixed(2)} MB, after ${(after / 1e6).toFixed(2)} MB, growth ${((after - before) / 1e6).toFixed(2)} MB over ${replays} replays`);
const sites = new Map();
let total = 0;
const walk = (node, stack) => {
  const f = node.callFrame;
  const here = [...stack, `${f.functionName || '(anon)'} ${path.basename(f.url)}:${f.lineNumber + 1}`];
  if (node.selfSize > 0) {
    total += node.selfSize;
    const leaf = here[here.length - 1];
    const rec = sites.get(leaf) ?? { size: 0, stack: here.slice(-4).join(' < ') };
    rec.size += node.selfSize;
    sites.set(leaf, rec);
  }
  node.children.forEach(child => walk(child, here));
};
walk(profile.head, []);
console.log(`retained sampled ${(total / 1e6).toFixed(2)} MB`);
for (const [leaf, rec] of [...sites.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 40)) {
  console.log(`${(rec.size / 1024).toFixed(0).padStart(7)} KB  ${leaf}   <= ${rec.stack}`);
}
await ctx.close();
server.close();
