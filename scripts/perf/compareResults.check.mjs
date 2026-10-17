import assert from 'node:assert/strict';
import test from 'node:test';
import { compareReports, comparisonRows, incompatibilities, toMarkdown } from './compareResults.mjs';

const summary = ({ links, repeat, p95, max, gpu, fps }) => ({
  frames: {
    intervalMs: { p95, p99: p95 + 10, max }, cpuMs: { p95: 8 }, gpuMs: { median: gpu, p95: gpu + 4 }, effectiveFps: fps, intervalsOver50Ms: 2,
  },
  programLinks: { total: links, repeat },
  react: { tasks: { p95: 20 }, r3fCommits: 57, domCommits: 40 },
});

const report = (overrides = {}) => ({
  environment: { cpu: 'cpu', options: { cap: 60, diagnostics: 'on' } },
  page: {
    glRenderer: 'gpu', devicePixelRatio: 1, viewport: { width: 1520, height: 769 }, drawingBuffer: { width: 1867, height: 928 },
    userAgent: 'Chrome/155.0.0.0', refreshHz: 144.9,
  },
  runs: [
    { tier: 'balanced', scenario: 'walk', replays: 5, warm: summary({ links: 85, repeat: 85, p95: 40, max: 90, gpu: 12, fps: 38 }) },
    { tier: 'balanced', scenario: 'hover', sweeps: 3, warm: summary({ links: 57, repeat: 57, p95: 30, max: 50, gpu: 20, fps: 0 }) },
    { tier: 'balanced', scenario: 'idle', idle: { sceneSubmissions: 0 } },
    {
      tier: 'balanced', scenario: 'soak',
      trend: { geometries: { growth: 30 }, heapBytes: { growth: 6_700_000 } },
      warm: summary({ links: 500, repeat: 500, p95: 40, max: 90, gpu: 12, fps: 38 }),
    },
  ],
  ...overrides,
});

test('compares like with like and computes direction-aware improvements', () => {
  const after = report();
  after.runs[0].warm = summary({ links: 0, repeat: 0, p95: 30, max: 60, gpu: 12, fps: 45 });
  const rows = compareReports(report(), after, 'balanced');
  const links = rows.find(row => row.label.startsWith('Warm walk replay: program re-links'));
  assert.equal(links.before, 17);
  assert.equal(links.after, 0);
  assert.equal(links.improvementPercent, 100);
  const fps = rows.find(row => row.label.startsWith('Effective FPS'));
  assert.equal(fps.improvementPercent, ((45 - 38) / 38) * 100);
  const idle = rows.find(row => row.label.startsWith('Idle scene'));
  assert.equal(idle.improvementPercent, 0);
});

test('a scenario one side did not run is NOT RUN, never zero', () => {
  const partial = report();
  partial.runs = partial.runs.filter(run => run.scenario !== 'soak');
  const rows = compareReports(report(), partial, 'balanced');
  const geometry = rows.find(row => row.label.startsWith('Geometry growth'));
  assert.equal(geometry.ranBefore, true);
  assert.equal(geometry.ranAfter, false);
  assert.equal(geometry.improvementPercent, null);
  const markdown = toMarkdown(rows, 'balanced', []);
  assert.match(markdown, /Geometry growth after 30 replays \| 30 geometries \| NOT RUN \| n\/a/);
});

test('reports from different machines or conditions are flagged as not comparable', () => {
  assert.deepEqual(incompatibilities(report(), report()), []);
  const other = report();
  other.page.glRenderer = 'another gpu';
  other.page.refreshHz = 60;
  other.environment.options.cap = 120;
  const problems = incompatibilities(report(), other);
  assert.ok(problems.some(problem => problem.startsWith('GPU renderer')));
  assert.ok(problems.some(problem => problem.startsWith('FPS cap')));
  assert.ok(problems.some(problem => problem.startsWith('refresh rate')));
  assert.match(toMarkdown(compareReports(report(), other, 'balanced'), 'balanced', problems), /Not comparable/);
});

test('the volume rows are per sweep and the table takes its column labels from the caller', () => {
  const idleFrames = { renderedFrames: 0 };
  const volumeRun = (r3f, dom, rendered) => ({
    tier: 'balanced',
    scenario: 'volume',
    sweeps: 5,
    warm: { frames: { renderedFrames: rendered }, programLinks: { total: 0, repeat: 0 }, react: { tasks: { p95: 0 }, r3fCommits: r3f, domCommits: dom } },
  });
  const before = report();
  before.runs.push(volumeRun(100, 100, 40));
  const after = report();
  after.runs.push({ ...volumeRun(0, 5, 0), idleFrames });
  const rows = compareReports(before, after, 'balanced');
  const volume = rows.find(row => row.label === 'Volume slider (20 changes): R3F commits');
  assert.equal(volume.before, 20);
  assert.equal(volume.after, 0);
  assert.equal(volume.improvementPercent, 100);
  assert.match(toMarkdown(rows, 'balanced', [], { before: 'B1', after: 'B2' }), /\| Metric \| B1 \| B2 \| Change \|/);
});

test('every comparison row names a scenario the benchmark can run', () => {
  const runnable = new Set(['idle', 'dice', 'walk', 'hover', 'volume', 'socket', 'purchase', 'rent', 'build', 'soak']);
  for (const row of comparisonRows()) assert.ok(runnable.has(row.scenario), row.label);
});
