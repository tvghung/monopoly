import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeFrames,
  compareValues,
  contiguousIntervals,
  describe,
  idleStats,
  onePercentLowFps,
  percentile,
  programLinkStats,
  reactStats,
  resourceTrend,
  slope,
  syncWaitStats,
} from './metrics.mjs';

const frame = (ts, extra = {}) => ({
  ts, start: ts + 1, cpu: 2, lag: 1, continued: true, rendered: true, gpu: 10, draws: 140, tris: 80_000, ...extra,
});

test('percentile uses nearest rank and tolerates empty input', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 99), 5);
  const sorted = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.equal(percentile(sorted, 50), 50);
  assert.equal(percentile(sorted, 95), 95);
  assert.equal(percentile(sorted, 99), 99);
  assert.equal(percentile(sorted, 100), 100);
});

test('describe ignores non-finite values and reports nulls when empty', () => {
  assert.deepEqual(describe([]), { count: 0, min: null, mean: null, median: null, p95: null, p99: null, max: null });
  const summary = describe([3, null, 1, Number.NaN, 2, undefined]);
  assert.equal(summary.count, 3);
  assert.equal(summary.median, 2);
  assert.equal(summary.max, 3);
  assert.equal(summary.mean, 2);
});

test('contiguous intervals only join consecutive rendered frames of a running animation', () => {
  const frames = [
    frame(0),
    frame(16.7),
    // The animation ended here: this frame asked for no continuation, so the idle gap after it is not an interval.
    frame(33.4, { continued: false }),
    frame(5_000),
    frame(5_016.7, { continued: false }),
    frame(5_020, { rendered: false, continued: true }),
  ];
  const intervals = contiguousIntervals(frames);
  // 0 -> 16.7 and 16.7 -> 33.4 (first animation), 5000 -> 5016.7 (second); 33.4 -> 5000 is an idle gap.
  assert.equal(intervals.length, 3);
  intervals.forEach(interval => assert.ok(Math.abs(interval - 16.7) < 1e-9));
});

test('a scheduler callback that rendered nothing is not a scene submission', () => {
  const frames = [frame(0), frame(16, { rendered: false }), frame(32)];
  assert.equal(analyzeFrames(frames, { fpsCap: 60, refreshHz: 60 }).renderedFrames, 2);
});

test('analyzeFrames separates cadence, CPU, GPU and lag, and flags late frames against cap and refresh', () => {
  // 60 Hz display, cap 60: 16.7 ms is on time, 33.3 and 50 ms are late (> 25 ms).
  const timestamps = [0, 16.7, 33.4, 66.7, 116.7, 133.4];
  const frames = timestamps.map((ts, index) => frame(ts, {
    cpu: index + 1, gpu: index === 0 ? null : 10 + index, lag: index * 0.5,
  }));
  const result = analyzeFrames(frames, { fpsCap: 60, refreshHz: 60 });
  assert.equal(result.contiguousIntervals, 5);
  assert.ok(Math.abs(result.expectedIntervalMs - 1000 / 60) < 1e-9);
  assert.equal(result.lateFrames, 2);
  assert.equal(result.intervalsOver50Ms, 0);
  assert.equal(result.cpuMs.max, 6);
  assert.equal(result.gpuSamples, 5);
  assert.equal(result.gpuMs.min, 11);
  assert.equal(result.callbackLagMs.max, 2.5);
  assert.ok(Math.abs(result.effectiveFps - 1000 / ((133.4 - 0) / 5)) < 1e-6);
});

test('the expected interval honours a display slower than the cap and a cap slower than the display', () => {
  assert.ok(Math.abs(analyzeFrames([], { fpsCap: 240, refreshHz: 60 }).expectedIntervalMs - 1000 / 60) < 1e-9);
  assert.ok(Math.abs(analyzeFrames([], { fpsCap: 30, refreshHz: 144 }).expectedIntervalMs - 1000 / 30) < 1e-9);
  assert.ok(Math.abs(analyzeFrames([], { fpsCap: 240, refreshHz: 144 }).expectedIntervalMs - 1000 / 144) < 1e-9);
});

test('1 % low needs at least 100 intervals', () => {
  assert.equal(onePercentLowFps(Array.from({ length: 99 }, () => 16.7)), null);
  const intervals = [...Array.from({ length: 99 }, () => 16.7), 100];
  assert.ok(Math.abs(onePercentLowFps(intervals) - 10) < 1e-9);
});

test('program links: first use is separated from a repeat of the identical program', () => {
  const link = (t, hash, ctx = 0, name = 'M') => ({ ctx, t, dur: 2, hash, name });
  const links = [
    link(10, 111), link(20, 222), // load: first use, before the window
    link(110, 111), link(120, 111), link(130, 333), // inside the window: two repeats of 111, one first use of 333
    link(140, 111, 1), // another context: first use there
    link(300, 111), // after the window
  ];
  const stats = programLinkStats(links, { start: 100, end: 200 });
  assert.equal(stats.total, 4);
  assert.equal(stats.repeat, 2);
  assert.equal(stats.firstUse, 2);
  assert.deepEqual(stats.repeatByName, { 'M#6f': 2 });
  assert.equal(stats.linkMs, 8);
});

test('sync waits are summed inside the window only', () => {
  const waits = [{ t: 5, dur: 1 }, { t: 150, dur: 4 }, { t: 160, dur: 6 }, { t: 900, dur: 50 }];
  assert.deepEqual(syncWaitStats(waits, { start: 100, end: 200 }), { count: 2, totalMs: 10, maxMs: 6 });
});

test('react tasks count only tasks that committed, and commits are split by renderer', () => {
  const tasks = [
    { start: 105, dur: 9, commits: 1 },
    { start: 120, dur: 30, commits: 2 },
    { start: 130, dur: 40, commits: 0 }, // a message handler that did no React commit
    { start: 500, dur: 90, commits: 1 }, // outside the window
  ];
  const commits = [
    { t: 106, kind: 'dom' }, { t: 121, kind: 'dom' }, { t: 122, kind: 'r3f' }, { t: 510, kind: 'r3f' },
  ];
  const stats = reactStats(tasks, commits, { start: 100, end: 200 });
  assert.equal(stats.tasks.count, 2);
  assert.equal(stats.tasks.max, 30);
  assert.equal(stats.tasksOverFrame, 1);
  assert.equal(stats.domCommits, 2);
  assert.equal(stats.r3fCommits, 1);
});

test('idle stats report scene submissions separately from scheduler wakeups and commits', () => {
  // frame(ts).start = ts + 1: the first and last callbacks fall outside the 1 s .. 11 s window.
  const frames = [frame(10), frame(2_000), frame(5_000, { rendered: false }), frame(11_000)];
  const commits = [{ t: 3_000, kind: 'dom' }];
  const stats = idleStats(frames, commits, { start: 1_000, end: 11_000 });
  assert.equal(stats.seconds, 10);
  assert.equal(stats.sceneSubmissions, 1);
  assert.equal(stats.schedulerCallbacks, 2);
  assert.equal(stats.domCommits, 1);
});

test('slope and resource trend measure growth over repeated replays', () => {
  assert.equal(slope([{ x: 0, y: 1 }]), 0);
  assert.ok(Math.abs(slope([{ x: 0, y: 1 }, { x: 10, y: 3 }, { x: 20, y: 5 }]) - 0.2) < 1e-12);
  assert.equal(resourceTrend([]), null);
  const trend = resourceTrend([
    { replay: 0, heapBytes: 20e6, geometries: 121, textures: 52, programs: 99 },
    { replay: 10, heapBytes: 22e6, geometries: 131, textures: 52, programs: 99 },
    { replay: 30, heapBytes: 26e6, geometries: 151, textures: 52, programs: 97 },
  ]);
  assert.equal(trend.replays, 30);
  assert.equal(trend.geometries.growth, 30);
  assert.equal(trend.heapBytes.growth, 6e6);
  assert.equal(trend.textures.growth, 0);
  assert.equal(trend.programs.growth, -2);
  assert.ok(trend.geometries.slopePerReplay > 0.9 && trend.geometries.slopePerReplay < 1.1);
});

test('compareValues reports direction-aware improvement and never invents a number', () => {
  assert.equal(compareValues(10, 5).improvementPercent, 50);
  assert.equal(compareValues(10, 15).improvementPercent, -50);
  assert.equal(compareValues(40, 60, { lowerIsBetter: false }).improvementPercent, 50);
  assert.equal(compareValues(0, 0).improvementPercent, 0);
  assert.equal(compareValues(0, 3).improvementPercent, null);
  assert.equal(compareValues(null, 3).improvementPercent, null);
  assert.equal(compareValues(3, undefined).delta, null);
});

test('every analysis accepts several windows, so replays aggregate exactly', () => {
  const windows = [{ start: 0, end: 100 }, { start: 1_000, end: 1_100 }];
  const frames = [frame(10), frame(26.7), frame(500), frame(1_010), frame(1_026.7)];
  assert.equal(analyzeFrames(frames.filter(entry => entry.start <= 100 || entry.start >= 1_000), { fpsCap: 60, refreshHz: 60 }).renderedFrames, 4);
  const links = [
    { ctx: 0, t: 5, dur: 1, hash: 1 }, { ctx: 0, t: 50, dur: 1, hash: 1 },
    { ctx: 0, t: 500, dur: 1, hash: 1 }, { ctx: 0, t: 1_050, dur: 1, hash: 1 },
  ];
  const stats = programLinkStats(links, windows);
  assert.equal(stats.total, 3);
  assert.equal(stats.firstUse, 1);
  assert.equal(stats.repeat, 2);
  const idle = idleStats(frames, [{ t: 20, kind: 'dom' }, { t: 600, kind: 'dom' }, { t: 1_020, kind: 'r3f' }], windows);
  assert.equal(idle.sceneSubmissions, 4);
  assert.equal(idle.domCommits, 1);
  assert.equal(idle.r3fCommits, 1);
  assert.ok(Math.abs(idle.seconds - 0.2) < 1e-9);
});
