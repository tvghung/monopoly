#!/usr/bin/env node
/**
 * Structural check of GPU-resource ownership in a real browser, during live animation. It inspects the actual three.js scene
 * graph (through the probe's access to the R3F store) while the harness plays dice rolls, walks with the destination preview and
 * construction bursts, then switches quality tiers live and finally forces a WebGL context loss, which unmounts the whole board
 * (the legacy fallback takes over). It reports facts and, with `--expect-persistent`, asserts them:
 *
 *   - one highlight material, one contact-shadow material, one pair of preview materials and one set of trail/puff materials
 *     for the whole session (identity never changes across replays, dice hide/show and previews mounting and unmounting);
 *   - the effects are really drawn: trails visible during rolls, the preview present with its opacity in the documented pulse
 *     range, puff meshes present during construction;
 *   - no page error and no console warning or error at any point, including live tier switches and the context-loss unmount.
 *
 * This is structural evidence, not pixel evidence (pixels: scripts/perf/captureCompare.mjs and captureMotion.mjs).
 *
 *   node scripts/perf/lifecycleCheck.mjs (--dist <dist> | --base-url <url of a running dev server>) --out <results.json> [--expect-persistent]
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDirectory } from './staticServer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = { dist: null, out: null, port: 4177, expectPersistent: false, replays: 4 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    if (flag === '--dist') options.dist = path.resolve(value());
    else if (flag === '--base-url') options.baseUrl = value();
    else if (flag === '--out') options.out = path.resolve(value());
    else if (flag === '--port') options.port = Number(value());
    else if (flag === '--replays') options.replays = Number(value());
    else if (flag === '--expect-persistent') options.expectPersistent = true;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!options.dist && !options.baseUrl) throw new Error('--dist or --base-url is required');
  return options;
}

/** Installed in the page: samples the scene every 25 ms into a record the driver reads and resets. */
const INSTALL_SAMPLER = () => {
  const hex = color => color.getHexString();
  const record = () => ({
    samples: 0, highlight: new Set(), contact: new Set(), previewSurface: new Set(), previewEdge: new Set(), trail: new Set(), puff: new Set(),
    previewSamples: 0, previewSurfaceOpacity: [Infinity, -Infinity], previewEdgeOpacity: [Infinity, -Infinity], previewColors: new Set(),
    trailVisibleSamples: 0, trailMaxOpacity: 0, puffSamples: 0, puffProps: new Set(),
  });
  window.__LC_RECORD__ = record();
  const sample = () => {
    const root = window.__PROBE__._r3fRoot;
    const state = root && root.containerInfo && root.containerInfo.getState();
    if (!state) return;
    const rec = window.__LC_RECORD__;
    rec.samples += 1;
    state.scene.traverse(object => {
      if (object.name === 'TileImpactHighlightBatch') rec.highlight.add(object.material.uuid);
      else if (object.name === 'DiceContactShadowBatch') rec.contact.add(object.material.uuid);
      else if (object.name.startsWith('DestinationPreview:')) {
        const meshes = object.children.filter(child => child.isMesh);
        if (meshes.length === 2) {
          const [surface, edge] = meshes;
          rec.previewSamples += 1;
          rec.previewSurface.add(surface.material.uuid);
          rec.previewEdge.add(edge.material.uuid);
          rec.previewSurfaceOpacity = [Math.min(rec.previewSurfaceOpacity[0], surface.material.opacity), Math.max(rec.previewSurfaceOpacity[1], surface.material.opacity)];
          rec.previewEdgeOpacity = [Math.min(rec.previewEdgeOpacity[0], edge.material.opacity), Math.max(rec.previewEdgeOpacity[1], edge.material.opacity)];
          rec.previewColors.add(`${hex(surface.material.color)}/${hex(edge.material.color)}`);
        }
      } else if (object.isMesh && object.renderOrder === 1 && object.name === '' && object.material && object.material.isMeshBasicMaterial
        && object.material.transparent) {
        let inDice = false;
        for (let parent = object.parent; parent; parent = parent.parent) if (parent.name === 'DiceArena') { inDice = true; break; }
        if (inDice) {
          rec.trail.add(object.material.uuid);
          if (object.visible && object.material.opacity > 0) {
            rec.trailVisibleSamples += 1;
            rec.trailMaxOpacity = Math.max(rec.trailMaxOpacity, object.material.opacity);
          }
        }
      } else if (object.isInstancedMesh && object.parent && object.parent.parent && object.parent.parent.name === 'TubeHouseInstances') {
        rec.puffSamples += 1;
        rec.puff.add(object.material.uuid);
        rec.puffProps.add(`${object.material.type}/${object.material.opacity}/${object.material.vertexColors}/${object.count}`);
      }
    });
  };
  window.__LC_TIMER__ = window.setInterval(sample, 25);
  window.__LC_READ__ = () => {
    const rec = window.__LC_RECORD__;
    const out = {};
    for (const [key, value] of Object.entries(rec)) out[key] = value instanceof Set ? [...value] : value;
    window.__LC_RECORD__ = record();
    return out;
  };
};

async function open(browser, base, fixture, tier, sinks) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript({ path: path.join(here, 'probe-init.js') });
  const page = await context.newPage();
  page.on('pageerror', error => sinks.errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') sinks.warnings.push(`${message.type()}: ${message.text().slice(0, 300)}`);
  });
  const params = new URLSearchParams({ 'phase4-uat': '1', scenario: fixture, quality: tier, fpsLimit: '60' });
  await page.goto(`${base}/?${params.toString()}`);
  await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 180_000 });
  await page.waitForSelector('.game-scene canvas', { state: 'attached', timeout: 60_000 });
  await sleep(3_000);
  await page.evaluate(INSTALL_SAMPLER);
  return { context, page };
}

async function replay(page) {
  await page.getByRole('button', { name: /Chạy lại/ }).click();
  await page.waitForFunction(() => document.querySelector('main.phase4-uat')?.getAttribute('data-uat-ready') === 'false', undefined, { timeout: 5_000 }).catch(() => {});
  await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: 120_000 });
  await sleep(600);
}

/** Replays `count` times and returns the per-replay records so identity across replays can be judged. */
async function playReplays(page, count) {
  const records = [];
  await page.evaluate(() => window.__LC_READ__());
  for (let index = 0; index < count; index += 1) {
    await replay(page);
    records.push(await page.evaluate(() => window.__LC_READ__()));
  }
  return records;
}

const union = (records, key) => [...new Set(records.flatMap(record => record[key]))];

function summarizeScenario(records) {
  return {
    replays: records.length,
    samples: records.reduce((sum, record) => sum + record.samples, 0),
    highlightMaterials: union(records, 'highlight').length,
    contactShadowMaterials: union(records, 'contact').length,
    previewSurfaceMaterials: union(records, 'previewSurface').length,
    previewEdgeMaterials: union(records, 'previewEdge').length,
    previewSamples: records.reduce((sum, record) => sum + record.previewSamples, 0),
    previewSurfaceOpacity: [Math.min(...records.map(record => record.previewSurfaceOpacity[0])), Math.max(...records.map(record => record.previewSurfaceOpacity[1]))],
    previewEdgeOpacity: [Math.min(...records.map(record => record.previewEdgeOpacity[0])), Math.max(...records.map(record => record.previewEdgeOpacity[1]))],
    previewColors: union(records, 'previewColors'),
    trailMaterials: union(records, 'trail').length,
    trailVisibleSamples: records.reduce((sum, record) => sum + record.trailVisibleSamples, 0),
    trailMaxOpacity: Math.max(...records.map(record => record.trailMaxOpacity)),
    puffMaterials: union(records, 'puff').length,
    puffSamples: records.reduce((sum, record) => sum + record.puffSamples, 0),
    puffProps: union(records, 'puffProps'),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const server = options.baseUrl ? null : await serveDirectory(options.dist, options.port);
  const base = options.baseUrl ?? `http://127.0.0.1:${options.port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const sinks = { errors: [], warnings: [] };
  const report = { dist: options.baseUrl ?? path.basename(options.dist), scenarios: {}, tierSwitch: [], contextLoss: null };
  try {
    // 1. Live animation, one page per fixture so a fixture's own state starts clean.
    for (const [name, fixture] of [['walk', 'walk'], ['dice', 'dice-contact-shadows'], ['house-2', 'house-2'], ['hotel', 'hotel']]) {
      console.log(`scenario ${name}`);
      const { context, page } = await open(browser, base, fixture, 'balanced', sinks);
      report.scenarios[name] = summarizeScenario(await playReplays(page, options.replays));
      await context.close();
    }

    // 2. Live tier switches on one page with the effects playing at every step, then the context loss.
    console.log('tier switch and context loss');
    const { context, page } = await open(browser, base, 'walk', 'balanced', sinks);
    const select = page.locator('select[aria-label="Chất lượng đồ họa (UAT)"]');
    for (const tier of ['low', 'balanced', 'high', 'balanced', 'low']) {
      await select.selectOption(tier);
      await sleep(3_000);
      await page.evaluate(() => window.__LC_READ__());
      const records = await playReplays(page, 2);
      const resources = await page.evaluate(() => window.__PROBE__.resources());
      report.tierSwitch.push({ tier, ...summarizeScenario(records), resources });
    }
    const errorsBefore = sinks.errors.length;
    await page.evaluate(() => {
      const state = window.__PROBE__._r3fRoot.containerInfo.getState();
      state.gl.getContext().getExtension('WEBGL_lose_context').loseContext();
    });
    let legacy = false;
    try {
      await page.waitForSelector('[data-renderer-mode="legacy"]', { timeout: 15_000 });
      legacy = true;
    } catch { /* reported below */ }
    await sleep(1_500);
    report.contextLoss = { fellBackToLegacyBoard: legacy, newPageErrors: sinks.errors.length - errorsBefore };
    await context.close();
  } finally {
    await browser.close();
    server?.close();
  }
  report.pageErrors = sinks.errors;
  report.consoleWarningsAndErrors = sinks.warnings;
  if (options.out) writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);

  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };
  const { walk, dice, 'house-2': house, hotel } = report.scenarios;
  // Facts that hold for any build: the effects are really drawn.
  expect(dice.trailVisibleSamples > 0 && dice.trailMaxOpacity > 0, 'dice trails were never visible during a roll');
  expect(walk.previewSamples > 0, 'the destination preview was never present during the walk');
  expect(walk.previewSurfaceOpacity[0] >= 0.119 && walk.previewSurfaceOpacity[1] <= 0.371, `preview surface opacity out of the pulse range ${walk.previewSurfaceOpacity}`);
  expect(walk.previewEdgeOpacity[0] >= 0.419 && walk.previewEdgeOpacity[1] <= 0.881, `preview edge opacity out of the pulse range ${walk.previewEdgeOpacity}`);
  expect(walk.previewColors.every(colors => colors !== 'ffffff/ffffff'), 'the preview kept the default white color');
  // The hotel transition scales the old houses instead of bursting puffs, so only the house fixture must show puffs.
  expect(house.puffSamples > 0, 'no construction puff was present during a build');
  expect(report.pageErrors.length === 0, `page errors: ${report.pageErrors.slice(0, 3).join(' | ')}`);
  // Messages the B0 baseline already produced (checked by running this script on it): library deprecation notices, shader-compiler
  // precision notes and the deliberate context-loss error. Anything else, such as a three.js warning about a disposed or
  // incomplete resource, fails the check.
  const KNOWN_MESSAGES = [
    /THREE\.Clock: This module has been deprecated/,
    /THREE\.WebGLProgram: Program Info Log: .*warning X(4122|3595)/s,
    /THREE\.BufferGeometry\.toNonIndexed\(\): BufferGeometry is already non-indexed/,
    /Switching to the legacy board fallback after a renderer error\. Error: WebGL context was lost/s,
    /THREE\.WebGLRenderer: WEBGL_lose_context extension not supported/,
  ];
  const unexpected = report.consoleWarningsAndErrors.filter(message => !KNOWN_MESSAGES.some(pattern => pattern.test(message)));
  report.unexpectedConsoleMessages = unexpected;
  expect(unexpected.length === 0, `unexpected console warnings/errors: ${unexpected.slice(0, 3).join(' | ')}`);
  expect(report.contextLoss.fellBackToLegacyBoard && report.contextLoss.newPageErrors === 0, 'context loss did not unmount cleanly');
  if (options.expectPersistent) {
    expect(walk.highlightMaterials === 1, `highlight materials across replays: ${walk.highlightMaterials}`);
    expect(walk.previewSurfaceMaterials === 1 && walk.previewEdgeMaterials === 1, `preview materials across replays: ${walk.previewSurfaceMaterials}/${walk.previewEdgeMaterials}`);
    expect(dice.contactShadowMaterials === 1, `contact-shadow materials across replays: ${dice.contactShadowMaterials}`);
    expect(dice.trailMaterials === 2, `trail materials across replays (one per die on Balanced): ${dice.trailMaterials}`);
    expect(house.puffMaterials === 1 && hotel.puffMaterials <= 1, `puff materials across replays: ${house.puffMaterials}/${hotel.puffMaterials}`);
    const trailPerTier = { low: 0, balanced: 2, high: 4 };
    for (const step of report.tierSwitch) {
      expect(step.trailMaterials <= trailPerTier[step.tier], `${step.tier}: trail materials ${step.trailMaterials} exceed ${trailPerTier[step.tier]}`);
      expect(step.highlightMaterials === 1, `${step.tier}: highlight materials ${step.highlightMaterials}`);
    }
    const geometries = report.tierSwitch.map(step => step.resources.geometries);
    expect(geometries[4] <= geometries[0] + 2, `geometries grew over the tier cycle: ${geometries.join(', ')}`);
  }
  console.log(JSON.stringify({ scenarios: report.scenarios, tierSwitch: report.tierSwitch.map(step => ({ tier: step.tier, trail: step.trailMaterials, highlight: step.highlightMaterials, preview: `${step.previewSurfaceMaterials}/${step.previewEdgeMaterials}`, geometries: step.resources.geometries, programs: step.resources.programs })), contextLoss: report.contextLoss, pageErrors: report.pageErrors.length, consoleMessages: report.consoleWarningsAndErrors.length }, null, 1));
  if (failures.length > 0) {
    console.error(`\nFAILED CHECKS:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nALL CHECKS PASSED');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
