#!/usr/bin/env node
/**
 * Bounded controlled soak series (Phase B3 gate, 08D step 3). Runs `runBenchmark.mjs --scenarios soak` a fixed number of times
 * against one prebuilt bundle with identical settings, each in its own fresh Chrome profile, then summarises every run by
 * signature class. The run count is fixed before the series starts and is a hard cap: nothing here retries until an anomaly shows.
 *
 *   node scripts/perf/soakSeries.mjs run --dist <uat-dist> --runs 20 --out <dir>
 *   node scripts/perf/soakSeries.mjs aggregate --out <dir>       # (re)builds series.json and series.md from <dir>/run-NN/results.json
 *
 * Anomaly (fixed in advance, 08E): a run "reproduces the B2 burst" when one replay interval contains at least 10 first-use
 * programs; a run has "any first-use program" when at least one replay-phase link has a new signature.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe } from './metrics.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BURST_THRESHOLD = 10;

/** One run's row. Replay-phase = links labelled `soak:n` or `warmup:n`; load links (no label) are the initial set. */
export function summarizeRun(result, runNumber) {
  const signatures = result.signatures;
  const replayLinks = signatures.links.filter(link => !link.initial);
  const soakLinks = replayLinks.filter(link => String(link.replay).startsWith('soak:'));
  const warmupLinks = replayLinks.filter(link => String(link.replay).startsWith('warmup:'));
  const byReplay = {};
  for (const link of soakLinks.filter(entry => entry.kind === 'new-variant')) byReplay[link.replay] = (byReplay[link.replay] ?? 0) + 1;
  const biggestBurst = Math.max(0, ...Object.values(byReplay));
  const loadEnd = Math.max(0, ...signatures.links.filter(link => link.initial).map(link => link.t));
  const afterLoadStalls = signatures.stalls.filter(entry => entry.start > loadEnd + 1000);
  const intervals = result.warm.frames.intervalMs;
  return {
    run: runNumber,
    heapGrowthMB: result.trend.heapBytes.growth / 1e6,
    geometryGrowth: result.trend.geometries.growth,
    programGrowth: result.trend.programs.growth,
    textureGrowth: result.trend.textures.growth,
    loadLinks: signatures.links.filter(link => link.initial).length,
    loadSignatures: new Set(signatures.links.filter(link => link.initial).map(link => link.sig)).size,
    warmupFirstUse: warmupLinks.filter(link => link.kind === 'new-variant').length,
    soakFirstUse: soakLinks.filter(link => link.kind === 'new-variant').length,
    soakRepeat: soakLinks.filter(link => link.kind === 'repeat-link').length,
    soakContextReset: soakLinks.filter(link => link.kind === 'context-reset').length,
    soakRendererRecreation: soakLinks.filter(link => link.kind === 'renderer-recreation').length,
    biggestBurst,
    burstReplays: Object.entries(byReplay).filter(([, count]) => count >= BURST_THRESHOLD).map(([replay]) => replay),
    reproducedBurst: biggestBurst >= BURST_THRESHOLD,
    anyFirstUse: soakLinks.some(link => link.kind === 'new-variant'),
    intervalP95: intervals.p95,
    intervalMax: intervals.max,
    // Runs 1-20 were collected before stall/throttle detection required a running animation (every idle gap inside a replay was
    // counted), so their stall figure is taken from the contiguous interval maximum instead, which already excludes idle gaps.
    stallsOver1000AfterLoad: (intervals.max ?? 0) >= 1000 || afterLoadStalls.some(entry => entry.cpuMs >= 1000) ? 1 : 0,
    throttledIntervals: (intervals.max ?? 0) >= 500 ? 1 : 0,
    contextLostEvents: signatures.events.filter(event => event.kind === 'context-lost').length,
    contextRestoredEvents: signatures.events.filter(event => event.kind === 'context-restored').length,
    rendererChangedEvents: signatures.events.filter(event => event.kind === 'renderer-changed' || event.kind === 'canvas-changed').length,
    visibilityEvents: signatures.events.filter(event => event.kind === 'visibility' || event.kind === 'blur').length,
    signatureSet: [...new Set(signatures.links.map(link => link.sig))].sort(),
    errors: result.errors?.length ?? 0,
  };
}

export function aggregate(rows) {
  const count = predicate => rows.filter(predicate).length;
  const union = new Set(rows.flatMap(row => row.signatureSet));
  const common = [...union].filter(sig => rows.every(row => row.signatureSet.includes(sig)));
  return {
    runs: rows.length,
    reproducedBurst: count(row => row.reproducedBurst),
    anyFirstUse: count(row => row.anyFirstUse),
    withContextLoss: count(row => row.contextLostEvents > 0 || row.contextRestoredEvents > 0),
    withRendererChange: count(row => row.rendererChangedEvents > 0),
    withStallOver1000: count(row => row.stallsOver1000AfterLoad > 0),
    withThrottledIntervals: count(row => row.throttledIntervals > 0),
    heapGrowthMB: describe(rows.map(row => row.heapGrowthMB)),
    intervalP95: describe(rows.map(row => row.intervalP95)),
    intervalMax: describe(rows.map(row => row.intervalMax)),
    loadLinks: describe(rows.map(row => row.loadLinks)),
    loadSignatures: describe(rows.map(row => row.loadSignatures)),
    signatureUnion: union.size,
    signatureInEveryRun: common.length,
    signaturesNotInEveryRun: [...union].filter(sig => !common.includes(sig)).sort().map(sig => ({ sig, runs: count(row => row.signatureSet.includes(sig)) })),
  };
}

function markdown(rows, summary) {
  const head = '| Run | Heap MB | Geo | Prog | Load links/sigs | Warm-up first-use | Soak first-use | Soak repeat | Ctx reset | Renderer recr. | Max burst | Interval p95 / max ms | Stalls ≥1 s | Throttled | Ctx lost/restored |';
  const lines = rows.map(row => `| ${row.run} | ${row.heapGrowthMB.toFixed(2)} | ${row.geometryGrowth} | ${row.programGrowth} | ${row.loadLinks}/${row.loadSignatures} | ${row.warmupFirstUse} | ${row.soakFirstUse} | ${row.soakRepeat} | ${row.soakContextReset} | ${row.soakRendererRecreation} | ${row.biggestBurst} | ${row.intervalP95?.toFixed(1)} / ${row.intervalMax?.toFixed(0)} | ${row.stallsOver1000AfterLoad} | ${row.throttledIntervals} | ${row.contextLostEvents}/${row.contextRestoredEvents} |`);
  return [head, `|${' --- |'.repeat(15)}`, ...lines, '', '```json', JSON.stringify(summary, null, 2), '```', ''].join('\n');
}

function collect(out) {
  const rows = [];
  for (const name of readdirSync(out).filter(entry => /^run-\d+$/.test(entry)).sort()) {
    const file = path.join(out, name, 'results.json');
    if (!existsSync(file)) continue;
    const report = JSON.parse(readFileSync(file, 'utf8'));
    const soak = report.runs.find(run => run.scenario === 'soak');
    if (soak?.signatures) rows.push(summarizeRun(soak, Number(name.slice(4))));
  }
  return rows;
}

function writeSeries(out) {
  const rows = collect(out);
  const summary = aggregate(rows);
  writeFileSync(path.join(out, 'series.json'), `${JSON.stringify({ rows, summary }, null, 2)}\n`);
  writeFileSync(path.join(out, 'series.md'), markdown(rows, summary));
  return { rows, summary };
}

function parse(argv) {
  const options = { runs: 20, dist: null, out: null, extra: [] };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--runs') options.runs = Number(argv[++index]);
    else if (flag === '--dist') options.dist = path.resolve(argv[++index]);
    else if (flag === '--out') options.out = path.resolve(argv[++index]);
    else if (flag === '--start') options.start = Number(argv[++index]);
    else options.extra.push(flag);
  }
  return options;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const command = process.argv[2];
  const options = parse(process.argv.slice(2));
  if (!options.out) throw new Error('--out is required');
  mkdirSync(options.out, { recursive: true });
  if (command === 'run') {
    if (!options.dist) throw new Error('--dist is required');
    // Fixed configuration: every flag below is part of the pre-registered protocol and is identical for every run.
    const fixed = ['--tiers', 'balanced', '--scenarios', 'soak', '--soak-replays', '30', '--soak-warmup', '3', '--cap', '60',
      '--window', '1536x864', '--gpu', 'default', '--diagnostics', 'on'];
    const first = options.start ?? 1;
    for (let run = first; run < first + options.runs; run += 1) {
      const runDir = path.join(options.out, `run-${String(run).padStart(2, '0')}`);
      const started = Date.now();
      console.log(`[series] run ${run} start ${new Date(started).toISOString()}`);
      const result = spawnSync(process.execPath, [path.join(here, 'runBenchmark.mjs'), '--dist', options.dist, '--label', `series-${run}`, '--out', runDir, ...fixed],
        { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
      writeFileSync(path.join(options.out, `run-${String(run).padStart(2, '0')}.log`), `${result.stdout}\n${result.stderr}`);
      console.log(`[series] run ${run} exit ${result.status} in ${Math.round((Date.now() - started) / 1000)} s`);
      writeSeries(options.out);
    }
    console.log('[series] done');
  } else if (command === 'aggregate') {
    const { rows, summary } = writeSeries(options.out);
    console.log(markdown(rows, summary));
  } else {
    throw new Error('usage: soakSeries.mjs run|aggregate --out <dir> [--dist <dist> --runs N]');
  }
}
