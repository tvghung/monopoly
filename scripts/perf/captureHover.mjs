#!/usr/bin/env node
/**
 * Before/after check of the hover and selection behavior of the 3D board (Phase B2: hover moved from React state to a store).
 * Serves two UAT bundles in turn, hovers the same tiles in the same fixtures, and compares what a player sees: the canvas
 * pixels with a tile hovered (and with the pointer gone again), the canvas after a tile click, and, in a 2v2 game, whether
 * the owner hover card appears and what it says.
 *
 *   node scripts/perf/captureHover.mjs --before <dist> --after <dist> --out <dir> [--tiles 1,3,12,25] [--renderer gpu|swiftshader]
 *
 * The scene is static while it is hovered, so the screenshots are deterministic; the control (each bundle against itself on a
 * second capture) is part of the report. Exit code 1 when a hovered state differs between the bundles and the control is clean.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compareImages, decodePng } from './pngDiff.mjs';
import { serveDirectory } from './staticServer.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = { before: null, after: null, out: null, tiles: [1, 3, 12, 25, 30], renderer: 'gpu', port: 4175 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    switch (flag) {
      case '--before': options.before = path.resolve(value()); break;
      case '--after': options.after = path.resolve(value()); break;
      case '--out': options.out = path.resolve(value()); break;
      case '--tiles': options.tiles = value().split(',').map(Number); break;
      case '--renderer': options.renderer = value(); break;
      case '--port': options.port = Number(value()); break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  if (!options.before || !options.after || !options.out) throw new Error('--before, --after and --out are required');
  return options;
}

function launchArguments(renderer) {
  const args = ['--ignore-gpu-blocklist', '--window-size=1280,720', '--window-position=0,0'];
  if (renderer === 'swiftshader') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  return args;
}

async function openFixture(context, base, fixture) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${base}/?phase4-uat=1&scenario=${fixture}&quality=balanced&fpsLimit=60&uat-controls=hidden`);
  await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
  await page.waitForSelector('.game-scene canvas', { state: 'attached', timeout: 60_000 });
  await sleep(2_500);
  return page;
}

async function tileCenters(page) {
  const rects = await page.evaluate(() => window.__OWN_THE_BLOCK_TILE_SCREEN_RECTS__ ?? null);
  if (!rects) throw new Error('Tile screen rectangles are unavailable (the page must run with diagnostics on)');
  return new Map(rects.tiles.map(tile => [tile.tileId, {
    x: tile.corners.reduce((total, corner) => total + corner.x, 0) / tile.corners.length,
    y: tile.corners.reduce((total, corner) => total + corner.y, 0) / tile.corners.length,
  }]));
}

async function sceneShot(page) {
  return page.locator('.game-scene canvas').screenshot({ animations: 'disabled' });
}

/** One bundle, one pass: the canvas with each tile hovered, after the pointer left, and after a click on the first tile. */
async function capturePass(context, base, options) {
  const page = await openFixture(context, base, 'board-readability');
  const centers = await tileCenters(page);
  const shots = {};
  await page.mouse.move(2, 2);
  await sleep(600);
  shots.rest = await sceneShot(page);
  for (const tileId of options.tiles) {
    const center = centers.get(tileId);
    await page.mouse.move(center.x, center.y, { steps: 4 });
    await sleep(700);
    shots[`hover-${tileId}`] = await sceneShot(page);
  }
  await page.mouse.move(2, 2);
  await sleep(700);
  shots['after-leave'] = await sceneShot(page);
  const first = centers.get(options.tiles[0]);
  await page.mouse.click(first.x, first.y);
  await sleep(900);
  const dialog = page.getByRole('dialog');
  const inspection = { dialogOpen: (await dialog.count()) > 0 };
  shots['after-click-modal'] = await page.screenshot();
  await page.keyboard.press('Escape');
  await sleep(900);
  inspection.dialogClosedAfterEscape = (await page.getByRole('dialog').count()) === 0;
  await page.close();

  // 2v2: the owner hover card names the real owner of the hovered tile.
  const teams = await openFixture(context, base, 'teams-2v2');
  const teamCenters = await tileCenters(teams);
  const cards = {};
  for (const tileId of [1, 3, 6, 8, 2]) {
    const center = teamCenters.get(tileId);
    await teams.mouse.move(center.x, center.y, { steps: 4 });
    await sleep(600);
    const card = teams.getByTestId('tile-owner-hover');
    cards[tileId] = (await card.count()) > 0 ? (await card.innerText()).replace(/\s+/g, ' ').trim() : null;
  }
  await teams.mouse.move(2, 2);
  await sleep(600);
  cards.afterLeave = (await teams.getByTestId('tile-owner-hover').count()) > 0 ? 'present' : null;
  await teams.close();
  return { shots, inspection, cards };
}

async function captureBundle(dist, label, options) {
  const server = await serveDirectory(dist, options.port);
  const context = await chromium.launchPersistentContext(path.join(options.out, `profile-${label}`), {
    channel: 'chrome', headless: false, viewport: null, args: launchArguments(options.renderer),
  });
  try {
    return await capturePass(context, `http://127.0.0.1:${options.port}`, options);
  } finally {
    await context.close();
    server.close();
  }
}

function compareShots(left, right) {
  const rows = {};
  for (const name of Object.keys(left)) {
    const comparison = compareImages(decodePng(left[name]), decodePng(right[name]), { tolerance: 0 });
    rows[name] = comparison.comparable
      ? { identical: comparison.identical, differingPixels: comparison.differingPixels, maxChannelDelta: comparison.maxChannelDelta }
      : { identical: false, differingPixels: null, maxChannelDelta: null, reason: comparison.reason };
  }
  return rows;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(options.out, { recursive: true });
  const before = await captureBundle(options.before, 'before', options);
  const after = await captureBundle(options.after, 'after', options);
  const beforeAgain = await captureBundle(options.before, 'before-control', options);
  mkdirSync(path.join(options.out, 'png'), { recursive: true });
  for (const [name, buffer] of Object.entries(after.shots)) writeFileSync(path.join(options.out, 'png', `after-${name}.png`), buffer);
  for (const [name, buffer] of Object.entries(before.shots)) writeFileSync(path.join(options.out, 'png', `before-${name}.png`), buffer);
  const report = {
    capturedAt: new Date().toISOString(),
    renderer: options.renderer,
    tiles: options.tiles,
    crossBundle: compareShots(before.shots, after.shots),
    control: compareShots(before.shots, beforeAgain.shots),
    inspection: { before: before.inspection, after: after.inspection },
    ownerCards: { before: before.cards, after: after.cards, same: JSON.stringify(before.cards) === JSON.stringify(after.cards) },
  };
  writeFileSync(path.join(options.out, 'hover-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const names = Object.keys(report.crossBundle);
  const different = names.filter(name => !report.crossBundle[name].identical);
  const controlNoisy = names.filter(name => !report.control[name].identical);
  console.log(`hover/selection states compared: ${names.length}; identical across bundles: ${names.length - different.length}; control (bundle vs itself) identical: ${names.length - controlNoisy.length}`);
  for (const name of different) console.log(`  differs: ${name} (${report.crossBundle[name].differingPixels} px, max delta ${report.crossBundle[name].maxChannelDelta}); control ${report.control[name].identical ? 'identical' : 'also differs'}`);
  console.log(`inspection dialog: before ${JSON.stringify(before.inspection)}, after ${JSON.stringify(after.inspection)}`);
  console.log(`2v2 owner cards identical: ${report.ownerCards.same}`);
  console.log(JSON.stringify(report.ownerCards.after));
  const real = different.filter(name => report.control[name].identical);
  if (real.length > 0 || !report.ownerCards.same) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
