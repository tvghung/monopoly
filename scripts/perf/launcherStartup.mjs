#!/usr/bin/env node
/** Synthetic desktop launcher load probe. The injected bridge reports an idle Host and performs no IPC or network work. */
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serveDirectory } from './staticServer.mjs';

const args = process.argv.slice(2);
const options = { dist: null, out: null, runs: 5, port: 4196, warm: false, form: false };
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--dist') options.dist = path.resolve(args[++i]);
  else if (args[i] === '--out') options.out = path.resolve(args[++i]);
  else if (args[i] === '--runs') options.runs = Number(args[++i]);
  else if (args[i] === '--port') options.port = Number(args[++i]);
  else if (args[i] === '--warm-cache') options.warm = true;
  else if (args[i] === '--form') options.form = true;
  else throw new Error(`Unknown option ${args[i]}`);
}
if (!options.dist || !options.out) throw new Error('--dist and --out are required');

const bridgeScript = `
(() => {
  const hostStatus = { state: 'IDLE', platform: 'win32', appVersion: '1.9.1', gamePort: null,
    localEndpoint: null, lanAvailable: false, interfaces: [], advertisedEndpoints: [], selectedLanUrl: null };
  window.ownTheBlockDesktop = {
    getRuntimeConfig: async () => ({ ok: true, config: { target: 'desktop', platform: 'win32',
      appVersion: '1.9.1', socketUrl: 'http://127.0.0.1:8080' } }),
    host: { getStatus: async () => hostStatus, refreshNetwork: async () => hostStatus,
      onStatusChanged: () => () => {} },
    window: { getState: async () => ({ fullscreen: false, maximized: false, resizable: true }),
      setFullscreen: async () => {}, toggleFullscreen: async () => {},
      onFullscreenChanged: () => () => {} },
    quit: { onQuitRequested: () => () => {}, respond: () => {}, exitApp: async () => {} },
    openExternal: async () => {},
  };
  window.__B7_LONG_TASKS__ = [];
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) window.__B7_LONG_TASKS__.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: 'longtask', buffered: true });
})();
`;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const server = await serveDirectory(options.dist, options.port);
const rows = [];
try {
  for (let run = 1; run <= options.runs; run += 1) {
    const tempRoot = path.resolve(os.tmpdir());
    const profile = path.join(tempRoot, `otb-b7-launcher-${process.pid}-${run}`);
    if (path.dirname(profile) !== tempRoot) throw new Error('Launcher profile escaped the temp directory');
    rmSync(profile, { recursive: true, force: true });
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome', headless: false, viewport: null,
      args: ['--window-size=1536,864', '--window-position=0,0',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    });
    try {
      await context.addInitScript({ content: bridgeScript });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const url = `http://127.0.0.1:${options.port}/`;
      async function load() {
        await page.goto(url);
        try { await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('OWN THE BLOCK'), null, { timeout: 20_000 }); }
        catch (error) { console.log('launcher debug', await page.locator('body').innerText(), errors); throw error; }
        return page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const resources = performance.getEntriesByType('resource');
          const main = document.querySelector('main');
          const heading = document.querySelector('h1');
          return {
            headingAt: performance.now(),
            domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
            loadEvent: nav?.loadEventEnd ?? null,
            jsTransferBytes: resources.filter(entry => entry.name.endsWith('.js')).reduce((sum, entry) => sum + entry.transferSize, 0),
            jsResourceCount: resources.filter(entry => entry.name.endsWith('.js')).length,
            longTasks: window.__B7_LONG_TASKS__,
            mainPresent: Boolean(main),
            heading: heading?.textContent,
          };
        });
      }
      if (options.warm) await load();
      const result = await load();
      if (options.form) {
        const formClickAt = await page.getByRole('button', { name: 'Tham gia phòng', exact: true }).first().evaluate(button => {
          const startedAt = performance.now();
          button.click();
          return startedAt;
        });
        await page.getByRole('heading', { name: 'Tham gia phòng', level: 2 }).waitFor();
        const formVisibleAt = await page.evaluate(() => performance.now());
        await page.waitForTimeout(1_500);
        result.formClickToVisible = formVisibleAt - formClickAt;
        result.formLongTasks = await page.evaluate(since => window.__B7_LONG_TASKS__.filter(task => task.start >= since), formClickAt);
      }
      rows.push({ ...result, pageErrors: errors });
      if (errors.length || !result.mainPresent) throw new Error(`Launcher run ${run} failed: ${errors.join(' | ')}`);
      console.log(`run ${run}/${options.runs}: launcher ${result.headingAt.toFixed(0)} ms, long tasks ${result.longTasks.length}, JS resources ${result.jsResourceCount}`);
    } finally {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    }
  }
} finally {
  server.close();
}
mkdirSync(path.dirname(options.out), { recursive: true });
const summary = { runs: rows.length, warmCache: options.warm, form: options.form,
  medianHeadingAt: median(rows.map(row => row.headingAt)),
  medianLongTaskTotal: median(rows.map(row => row.longTasks.reduce((sum, task) => sum + task.duration, 0))),
  medianJsTransferBytes: median(rows.map(row => row.jsTransferBytes)), rows };
writeFileSync(options.out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ medianHeadingAt: summary.medianHeadingAt, medianLongTaskTotal: summary.medianLongTaskTotal,
  medianJsTransferBytes: summary.medianJsTransferBytes }));