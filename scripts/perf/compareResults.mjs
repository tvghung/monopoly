#!/usr/bin/env node
/**
 * Before/after comparison of two `runBenchmark.mjs` reports.
 *
 *   node scripts/perf/compareResults.mjs <before results.json> <after results.json> [--tier balanced] [--out table.md]
 *
 * Only measurements the two reports both have are compared; a missing side prints `NOT RUN`, never a made-up number.
 * Reports taken on different machines, builds of Chrome, caps, windows or refresh rates are flagged as not comparable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { compareValues } from './metrics.mjs';

const find = (report, tier, scenario) => report.runs.find(run => run.tier === tier && run.scenario === scenario);

/** Rows of the comparison: label, where the value lives in a run, unit, direction and whether it needs a scenario run. */
export function comparisonRows() {
  const walk = ['walk', 'warm'];
  return [
    { label: 'Warm walk replay: program links (all)', scenario: 'walk', pick: run => run.warm.programLinks.total / run.replays, unit: 'per replay', digits: 1 },
    { label: 'Warm walk replay: program re-links of an identical program', scenario: 'walk', pick: run => run.warm.programLinks.repeat / run.replays, unit: 'per replay', digits: 1 },
    { label: 'Hover sweep (18 tiles): program links', scenario: 'hover', pick: run => run.warm.programLinks.total / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Hover sweep (18 tiles): R3F commits', scenario: 'hover', pick: run => run.warm.react.r3fCommits / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Hover sweep (18 tiles): React task P95', scenario: 'hover', pick: run => run.warm.react.tasks.p95, unit: 'ms', digits: 1 },
    { label: 'Hover sweep (18 tiles): DOM commits', scenario: 'hover', pick: run => run.warm.react.domCommits / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Hover sweep (18 tiles): scene submissions', scenario: 'hover', pick: run => run.warm.frames.renderedFrames / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Volume slider (20 changes): R3F commits', scenario: 'volume', pick: run => run.warm.react.r3fCommits / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Volume slider (20 changes): DOM commits', scenario: 'volume', pick: run => run.warm.react.domCommits / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Volume slider (20 changes): scene submissions', scenario: 'volume', pick: run => run.warm.frames.renderedFrames / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Non-visual room update (20): R3F commits', scenario: 'socket', pick: run => run.warm.react.r3fCommits / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Non-visual room update (20): DOM commits', scenario: 'socket', pick: run => run.warm.react.domCommits / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Non-visual room update (20): scene submissions', scenario: 'socket', pick: run => run.warm.frames.renderedFrames / run.sweeps, unit: 'per sweep', digits: 1 },
    { label: 'Walk replay: R3F commits', scenario: 'walk', pick: run => run.warm.react.r3fCommits / run.replays, unit: 'per replay', digits: 1 },
    { label: 'Walk replay: DOM commits', scenario: 'walk', pick: run => run.warm.react.domCommits / run.replays, unit: 'per replay', digits: 1 },
    { label: 'Dice replay: R3F commits', scenario: 'dice', pick: run => run.warm.react.r3fCommits / run.replays, unit: 'per replay', digits: 1 },
    { label: 'React task P95 (walk)', scenario: walk[0], pick: run => run.warm.react.tasks.p95, unit: 'ms', digits: 1 },
    { label: 'React task P95 (dice)', scenario: 'dice', pick: run => run.warm.react.tasks.p95, unit: 'ms', digits: 1 },
    { label: 'React task P95 (purchase)', scenario: 'purchase', pick: run => run.warm.react.tasks.p95, unit: 'ms', digits: 1 },
    { label: 'React task P95 (rent)', scenario: 'rent', pick: run => run.warm.react.tasks.p95, unit: 'ms', digits: 1 },
    { label: 'React task P95 (build)', scenario: 'build', pick: run => run.warm.react.tasks.p95, unit: 'ms', digits: 1 },
    { label: 'React task P95 (soak: 30 walk replays)', scenario: 'soak', pick: run => run.warm.react.tasks.p95, unit: 'ms', digits: 1 },
    { label: 'Warm walk frame interval P95', scenario: 'walk', pick: run => run.warm.frames.intervalMs.p95, unit: 'ms', digits: 1 },
    { label: 'Warm walk frame interval P99', scenario: 'walk', pick: run => run.warm.frames.intervalMs.p99, unit: 'ms', digits: 1 },
    { label: 'Maximum frame interval (walk)', scenario: 'walk', pick: run => run.warm.frames.intervalMs.max, unit: 'ms', digits: 1 },
    { label: 'Walk intervals over 50 ms', scenario: 'walk', pick: run => run.warm.frames.intervalsOver50Ms, unit: 'count', digits: 0 },
    { label: 'Geometry growth after 30 replays', scenario: 'soak', pick: run => run.trend?.geometries.growth, unit: 'geometries', digits: 0 },
    { label: 'Heap growth after 30 replays (after GC)', scenario: 'soak', pick: run => (run.trend ? run.trend.heapBytes.growth / 1e6 : undefined), unit: 'MB', digits: 2 },
    { label: 'GPU frame time, median (walk)', scenario: 'walk', pick: run => run.warm.frames.gpuMs.median, unit: 'ms', digits: 1 },
    { label: 'GPU frame time, P95 (walk)', scenario: 'walk', pick: run => run.warm.frames.gpuMs.p95, unit: 'ms', digits: 1 },
    { label: 'CPU frame time, P95 (walk)', scenario: 'walk', pick: run => run.warm.frames.cpuMs.p95, unit: 'ms', digits: 1 },
    { label: 'Effective FPS during animation (walk)', scenario: 'walk', pick: run => run.warm.frames.effectiveFps, unit: 'fps', digits: 1, lowerIsBetter: false },
    { label: 'Idle scene submissions in the idle window', scenario: 'idle', pick: run => run.idle.sceneSubmissions, unit: 'count', digits: 0 },
  ];
}

/** Why two reports must not be compared, or an empty list when they are compatible. */
export function incompatibilities(before, after) {
  const problems = [];
  const same = (label, left, right) => { if (JSON.stringify(left) !== JSON.stringify(right)) problems.push(`${label}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`); };
  same('CPU', before.environment.cpu, after.environment.cpu);
  same('GPU renderer', before.page.glRenderer, after.page.glRenderer);
  same('devicePixelRatio', before.page.devicePixelRatio, after.page.devicePixelRatio);
  same('viewport', before.page.viewport, after.page.viewport);
  same('drawing buffer', before.page.drawingBuffer, after.page.drawingBuffer);
  same('FPS cap', before.environment.options.cap, after.environment.options.cap);
  same('diagnostics mode', before.environment.options.diagnostics, after.environment.options.diagnostics);
  const major = report => /Chrome\/(\d+)/.exec(report.page.userAgent)?.[1];
  same('Chrome major version', major(before), major(after));
  if (Math.abs(before.page.refreshHz - after.page.refreshHz) > 3) problems.push(`refresh rate: ${before.page.refreshHz.toFixed(1)} vs ${after.page.refreshHz.toFixed(1)} Hz`);
  return problems;
}

function format(value, digits) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : null;
}

export function compareReports(before, after, tier) {
  return comparisonRows().map(row => {
    const left = find(before, tier, row.scenario);
    const right = find(after, tier, row.scenario);
    const read = run => {
      if (!run) return undefined;
      try { return row.pick(run); } catch { return undefined; }
    };
    const comparison = compareValues(read(left), read(right), { lowerIsBetter: row.lowerIsBetter ?? true });
    return { ...row, ...comparison, ranBefore: Boolean(left), ranAfter: Boolean(right) };
  });
}

export function toMarkdown(rows, tier, problems, labels = {}) {
  const beforeLabel = labels.before ?? 'Before';
  const afterLabel = labels.after ?? 'After';
  const lines = [`Tier: \`${tier}\``, ''];
  if (problems.length > 0) {
    lines.push('**Not comparable** (the conditions differ):', '', ...problems.map(problem => `- ${problem}`), '');
  }
  lines.push(`| Metric | ${beforeLabel} | ${afterLabel} | Change |`, '| --- | --- | --- | --- |');
  for (const row of rows) {
    const cell = (value, ran) => {
      const text = format(value, row.digits);
      return text === null ? (ran ? 'n/a' : 'NOT RUN') : `${text} ${row.unit}`;
    };
    let change = 'n/a';
    if (row.improvementPercent !== null) {
      const sign = row.delta > 0 ? '+' : row.delta < 0 ? '−' : '';
      change = `${sign}${format(Math.abs(row.delta), row.digits)} ${row.unit} (${row.improvementPercent >= 0 ? '' : '−'}${Math.abs(row.improvementPercent).toFixed(0)} % ${row.improvementPercent >= 0 ? 'better' : 'worse'})`;
    } else if (row.delta !== null) {
      change = `${row.delta > 0 ? '+' : '−'}${format(Math.abs(row.delta), row.digits)} ${row.unit}`;
    }
    lines.push(`| ${row.label} | ${cell(row.before, row.ranBefore)} | ${cell(row.after, row.ranAfter)} | ${change} |`);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const valueFlags = new Set(['--tier', '--out', '--before-label', '--after-label']);
  const files = args.filter((arg, index) => !arg.startsWith('--') && !valueFlags.has(args[index - 1]));
  const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
  if (files.length < 2) {
    console.error('Usage: compareResults.mjs <before results.json> <after results.json> [--tier balanced] [--out table.md]');
    process.exit(2);
  }
  const tier = option('--tier') ?? 'balanced';
  const [before, after] = files.slice(0, 2).map(file => JSON.parse(readFileSync(file, 'utf8')));
  const markdown = toMarkdown(compareReports(before, after, tier), tier, incompatibilities(before, after), {
    before: option('--before-label') ?? undefined,
    after: option('--after-label') ?? undefined,
  });
  const out = option('--out');
  if (out) writeFileSync(out, markdown);
  process.stdout.write(markdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
