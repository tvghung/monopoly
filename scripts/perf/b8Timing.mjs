#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serveDirectory } from './staticServer.mjs';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const out = path.resolve(option('--out'));
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { kind: 'headed Chrome real-device motion traces; synthetic authoritative UAT fixture', platform: os.platform(), browser: null, results: [] };
for (const label of ['before', 'after']) {
  const server = await serveDirectory(path.resolve(option('--' + label)), 4378);
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  report.browser = browser.version();
  try {
    for (const cap of (args.includes('--caps') ? option('--caps').split(',').map(Number) : [30, 60, 120, 180, 240])) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:4378/?phase4-uat=1&scenario=walk&quality=balanced&fpsLimit=' + cap + '&motion-trace=1');
      await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { timeout: 120000 });
      await sleep(1000);
      await page.evaluate(() => { window.__OWN_THE_BLOCK_MOVEMENT_TRACE__ = []; });
      await page.getByRole('button', { name: /Chạy lại/ }).click();
      await page.waitForSelector('main.phase4-uat[data-uat-ready="false"]', { timeout: 5000 }).catch(() => { });
      await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { timeout: 120000 });
      await sleep(250);
      const trace = await page.evaluate(() => window.__OWN_THE_BLOCK_MOVEMENT_TRACE__ ?? []);
      writeFileSync(path.join(out, label + '-' + cap + '-trace.json'), JSON.stringify(trace, null, 2) + '\n');
      const starts = trace.filter(e => e.stage === 'STORE_START' && e.transition === 'TILE_HOP');
      const completes = trace.filter(e => e.stage === 'STORE_COMPLETE');
      const callbackGaps = starts.slice(1).map((s, i) => s.atMs - (completes.find(c => c.toTileId === starts[i].toTileId && c.atMs >= starts[i].atMs)?.atMs ?? s.atMs));
      const nominalGaps = starts.slice(1).map((s, i) => (s.startedAtMs ?? s.atMs) - ((starts[i].startedAtMs ?? starts[i].atMs) + starts[i].durationMs));
      const facts = await page.evaluate(() => { const c = document.querySelector('canvas'); const gl = c?.getContext('webgl2'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, hidden: document.hidden }; });
      const row = { label, cap, ...facts, hops: starts.length, callbackGapsMs: callbackGaps, nominalGapsMs: nominalGaps, lastSettledTile: completes.at(-1)?.settledTileId, errors };
      report.results.push(row);
      console.log(JSON.stringify(row));
      if (cap === 60) {
        await page.evaluate(() => { window.__OWN_THE_BLOCK_MOVEMENT_TRACE__ = []; });
        await page.getByRole('button', { name: /Chạy lại/ }).click();
        await page.waitForFunction(() => window.__OWN_THE_BLOCK_MOVEMENT_TRACE__?.some(e => e.stage === 'STORE_START'));
        for (let i = 0; i < 8; i++) {
          await sleep(65);
          await page.locator('canvas').first().screenshot({ path: path.join(out, label + '-motion-' + i + '.png') });
        }
      }
      await context.close();
    }
  }
  finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
writeFileSync(path.join(out, 'motion-summary.json'), JSON.stringify(report, null, 2) + '\n');
if (report.results.some(r => r.hops === 0 || r.errors.length))
  process.exitCode = 1;
