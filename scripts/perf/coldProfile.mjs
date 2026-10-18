#!/usr/bin/env node
/**
 * V8 CPU profile of one cold launch, ranked by self time inside a window of the load (08G Task 0): where does the main thread spend
 * the time between two load marks. The profile starts before navigation, so a sample's offset from the profile start is
 * approximately its time since navigation (the error is the few milliseconds between starting the profiler and the request).
 *
 *   node scripts/perf/coldProfile.mjs --dist <uat-dist> --from 860 --to 1490 [--top 25]
 */
import { chromium } from '@playwright/test';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serveDirectory } from './staticServer.mjs';

const options = { dist: null, from: 0, to: 1_000_000, top: 25, port: 4192 };
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--dist') options.dist = path.resolve(argv[++index]);
  else if (argv[index] === '--from') options.from = Number(argv[++index]);
  else if (argv[index] === '--to') options.to = Number(argv[++index]);
  else if (argv[index] === '--top') options.top = Number(argv[++index]);
  else throw new Error(`Unknown option ${argv[index]}`);
}
if (!options.dist) throw new Error('--dist is required');

const server = await serveDirectory(options.dist, options.port);
const profileDir = path.join(os.tmpdir(), `otb-cold-profile-${process.pid}`);
rmSync(profileDir, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chrome', headless: false, viewport: null,
  args: ['--ignore-gpu-blocklist', '--window-size=1536,864', '--window-position=0,0'],
});
try {
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 500 });
  await session.send('Profiler.start');
  await page.goto(`http://127.0.0.1:${options.port}/?${new URLSearchParams({ 'phase4-uat': '1', scenario: 'walk', quality: 'balanced', fpsLimit: '60' })}`);
  await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
  const { profile } = await session.send('Profiler.stop');
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  let offsetUs = 0;
  const self = new Map();
  for (let index = 0; index < profile.samples.length; index += 1) {
    offsetUs += profile.timeDeltas[index];
    const offsetMs = offsetUs / 1000;
    if (offsetMs < options.from || offsetMs > options.to) continue;
    const frame = byId.get(profile.samples[index]).callFrame;
    const label = `${frame.functionName || '(anonymous)'}  ${frame.url.split('/').slice(-1)[0]}:${frame.lineNumber + 1}`;
    self.set(label, (self.get(label) ?? 0) + profile.timeDeltas[index] / 1000);
  }
  const total = [...self.values()].reduce((sum, value) => sum + value, 0);
  console.log(`window ${options.from}-${options.to} ms: ${total.toFixed(0)} ms of samples`);
  for (const [label, ms] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, options.top)) console.log(`${ms.toFixed(1).padStart(8)} ms  ${label}`);
} finally {
  await context.close();
  server.close();
  rmSync(profileDir, { recursive: true, force: true });
}
