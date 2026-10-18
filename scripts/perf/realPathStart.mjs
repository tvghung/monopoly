#!/usr/bin/env node
/**
 * The real lobby-to-board path (Phase B3 follow-up, 08H Task 4). A real authoritative server (desktop profile, serving a built,
 * minified, non-UAT client) is started per launch. A Node socket.io client creates the room as its host (the host capability is the
 * server's host secret); the browser (a new Chrome process, empty profile) joins it as a guest through the real launcher and lobby,
 * sets Ready and waits in the lobby for `--dwell` ms. The host then readies and sends `start game`.
 *
 *   click = the instant the host emits `start game` (wall clock). The board is mounted when `[data-testid="game-board"]` appears in
 *   the guest's page; the first board frame is the first rendered scheduler frame at or after that (and after `otb:warmup:done`
 *   where the bundle has a warm-up).
 *
 *   node scripts/perf/realPathStart.mjs run --dist <built client> --label <name> --dwell 10000 --runs 10 --out <dir> [--from n]
 *   node scripts/perf/realPathStart.mjs aggregate --out <dir>
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe } from './metrics.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const probe = readFileSync(path.join(here, 'probe-init.js'), 'utf8');
const requireFromClient = createRequire(path.join(repo, 'apps/client/package.json'));
const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

const ROOM_CODE = 'OTB-PERF01';
const HOST_SECRET = 'a'.repeat(64);
const PROTOCOL_VERSION = 14;

const BOARD_OBSERVER = `
(() => {
  let boardSeen = false;
  let lobbySeen = false;
  new MutationObserver(() => {
    if (!lobbySeen && document.querySelector('[data-testid="lobby"], .lobby')) { lobbySeen = true; performance.mark('otb:real:lobby-shown'); }
    if (!boardSeen && document.querySelector('[data-testid="game-board"]')) { boardSeen = true; performance.mark('otb:real:board-mounted'); }
  }).observe(document, { childList: true, subtree: true });
})();`;

function parse(argv) {
  const options = { command: argv[0], dist: null, label: 'run', out: null, dwell: 10_000, runs: 10, from: 1, port: 4310 };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--dist') options.dist = path.resolve(argv[++index]);
    else if (flag === '--label') options.label = argv[++index];
    else if (flag === '--out') options.out = path.resolve(argv[++index]);
    else if (flag === '--dwell') options.dwell = Number(argv[++index]);
    else if (flag === '--runs') options.runs = Number(argv[++index]);
    else if (flag === '--from') options.from = Number(argv[++index]);
    else if (flag === '--port') options.port = Number(argv[++index]);
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!options.out) throw new Error('--out is required');
  return options;
}

async function startServer(dist, port) {
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(here, 'realServerRun.mjs'),
    path.join(repo, 'apps/server/src/authoritativeServer.ts'), dist, String(port)], {
    cwd: path.join(repo, 'apps/server'),
    env: { ...process.env, SERVER_RUNTIME_PROFILE: 'desktop', OTB_HOST_ROOM_CODE: ROOM_CODE, OTB_HOST_CREATE_SECRET: HOST_SECRET },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The server did not start')), 60_000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('READY')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => reject(new Error(`The server exited (${code})`)));
  });
  return child;
}

const ack = (socket, event, payload) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`No ACK for ${event}`)), 15_000);
  const callback = result => {
    clearTimeout(timer);
    if (result && result.ok === false) reject(new Error(`${event}: ${JSON.stringify(result)}`));
    else resolve(result);
  };
  if (payload === undefined) socket.emit(event, callback);
  else socket.emit(event, payload, callback);
});

async function hostJoin(port) {
  const { io } = requireFromClient('socket.io-client');
  const socket = io(`http://127.0.0.1:${port}`, { auth: { protocolVersion: PROTOCOL_VERSION }, transports: ['websocket'] });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  const joined = await ack(socket, 'join room', { name: 'Chu phong', roomCode: ROOM_CODE, hostCapability: HOST_SECRET });
  // A new session is pending until it is resumed with its token; the room exists from then on.
  if (joined.data.kind === 'PENDING') await ack(socket, 'resume session', { token: joined.data.token });
  return socket;
}

async function launchOnce(options, profile, port) {
  const host = await hostJoin(port);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, viewport: null,
    args: ['--ignore-gpu-blocklist', '--window-size=1536,864', '--window-position=0,0',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  try {
    await context.addInitScript({ content: probe });
    await context.addInitScript({ content: BOARD_OBSERVER });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => window.__PROBE__.setReplay(null));
    await page.getByPlaceholder('Ví dụ: Minh').fill('Khach');
    await page.getByText('Có mã phòng').first().click();
    await page.getByPlaceholder(/OTB-XXXXXX/).fill(ROOM_CODE);
    await page.getByRole('button', { name: 'Vào phòng' }).click();
    await page.waitForFunction(() => performance.getEntriesByName('otb:real:lobby-shown').length > 0, undefined, { timeout: 20_000 }).catch(async error => {
      console.log('PAGE TEXT:', (await page.evaluate(() => document.body.innerText)).slice(0, 400), errors);
      throw error;
    });
    // Ready stays disabled until the player has chosen a mascot.
    await page.getByRole('button', { name: 'Chó', exact: true }).click({ timeout: 15_000 });
    await page.locator('button:enabled', { hasText: /Sẵn sàng/ }).first().click({ timeout: 15_000 }).catch(async error => {
      console.log('LOBBY CONTROLS:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.lobby button, .lobby [role=switch], .lobby input')].map(e => e.tagName + ':' + (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40) + (e.disabled ? '(disabled)' : '')))));
      throw error;
    });
    await sleep(options.dwell);
    await ack(host, 'set appearance', { characterId: 'panda' });
    await ack(host, 'set ready', { ready: true });
    const clickEpoch = Date.now();
    await ack(host, 'start game');
    await page.waitForFunction(() => performance.getEntriesByName('otb:real:board-mounted').length > 0, undefined, { timeout: 60_000 });
    await page.waitForSelector('.game-scene canvas', { state: 'attached', timeout: 60_000 });
    await sleep(6_000);
    await page.evaluate(() => window.__PROBE__.attachMain());
    await page.evaluate(async () => {
      for (let index = 0; index < 8; index += 1) { window.__PROBE__.pollGpu(); await new Promise(resolve => { setTimeout(resolve, 40); }); }
    });
    const batch = await page.evaluate(() => window.__PROBE__.drain());
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const glRenderer = await page.evaluate(() => window.__PROBE__.glRenderer ?? null);
    return { batch, errors, glRenderer, clickEpoch, timeOrigin };
  } finally {
    host.close();
    await context.close();
  }
}

function analyse({ batch, clickEpoch, timeOrigin }) {
  const mark = name => batch.marks.filter(entry => entry.name === name).sort((a, b) => a.t - b.t)[0]?.t ?? null;
  const click = clickEpoch - timeOrigin;
  const mounted = mark('otb:real:board-mounted');
  const lobbyShown = mark('otb:real:lobby-shown');
  const done = mark('otb:warmup:done');
  const warmupStart = mark('otb:warmup:start');
  const layerMounted = mark('otb:scene:layer-mounted');
  const floor = Math.max(mounted ?? 0, done ?? 0);
  const firstFrame = batch.frames.filter(frame => frame.rendered && frame.start >= floor).sort((a, b) => a.start - b.start)[0]?.start ?? null;
  const afterClick = batch.frames.filter(frame => frame.rendered && frame.start >= click);
  const inLobby = entry => lobbyShown !== null && entry.start >= lobbyShown && entry.start < click;
  return {
    lobbyShown, click, mounted, warmupStart, warmupDone: done, layerMounted, firstFrame,
    clickToMounted: mounted !== null ? mounted - click : null,
    mountedToFrame: mounted !== null && firstFrame !== null ? firstFrame - mounted : null,
    clickToFrame: firstFrame !== null ? firstFrame - click : null,
    longestCallbackMs: Math.max(0, ...afterClick.map(frame => frame.cpu)),
    linksAfterDone: done === null ? null : batch.links.filter(link => link.t > done).length,
    startMaxLongTaskMs: Math.max(0, ...batch.longtasks.filter(entry => entry.start >= click).map(entry => entry.dur)),
    lobbyMaxLongTaskMs: Math.max(0, ...batch.longtasks.filter(inLobby).map(entry => entry.dur)),
  };
}

async function oneRun(options, run) {
  const port = options.port + (run % 50);
  const server = await startServer(options.dist, port);
  const profile = path.join(os.tmpdir(), `otb-real-${process.pid}`);
  try {
    rmSync(profile, { recursive: true, force: true });
    const data = await launchOnce(options, profile, port);
    return { ...analyse(data), errors: data.errors, glRenderer: data.glRenderer };
  } finally {
    rmSync(profile, { recursive: true, force: true });
    server.kill();
    await sleep(500);
  }
}

function collect(out) {
  return readdirSync(out).filter(name => /^run-\d+$/.test(name)).sort()
    .map(name => path.join(out, name, 'real.json')).filter(existsSync).map(file => JSON.parse(readFileSync(file, 'utf8')));
}

function summarize(rows) {
  const spread = key => describe(rows.map(row => row[key]).filter(value => value !== null));
  return {
    runs: rows.length,
    clickToFrameMs: spread('clickToFrame'),
    mountedToFrameMs: spread('mountedToFrame'),
    clickToMountedMs: spread('clickToMounted'),
    longestCallbackMs: spread('longestCallbackMs'),
    startMaxLongTaskMs: spread('startMaxLongTaskMs'),
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
    const row = await oneRun(options, run);
    writeFileSync(path.join(runDir, 'real.json'), `${JSON.stringify({ run, label: options.label, dwellMs: options.dwell, dist: path.basename(options.dist), ...row }, null, 2)}\n`);
    console.log(`run ${run} [${options.label}]: click→frame ${row.clickToFrame?.toFixed(0)} ms (click→mounted ${row.clickToMounted?.toFixed(0)}, mounted→frame ${row.mountedToFrame?.toFixed(0)}) | longest callback ${row.longestCallbackMs.toFixed(0)} ms | links after done ${row.linksAfterDone ?? '-'} | errors ${row.errors.length}`);
  }
} else if (options.command !== 'aggregate') {
  throw new Error('The command is `run` or `aggregate`.');
}
const rows = collect(options.out);
if (rows.length > 0) {
  const summary = summarize(rows);
  writeFileSync(path.join(options.out, 'real-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary.clickToFrameMs));
}
