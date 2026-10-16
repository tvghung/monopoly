/**
 * Pure analysis of the raw observations collected by `probe-init.js`. Node built-ins only, no browser needed, so the
 * definitions below are unit-tested (`metrics.check.mjs`). Every number the benchmark reports comes from here; the
 * definitions are written in `scripts/perf/README.md`.
 */

/** Nearest-rank percentile of an ascending array (p in 0..100). */
export function percentile(sortedAscending, p) {
  if (sortedAscending.length === 0) return null;
  const rank = Math.ceil((p / 100) * sortedAscending.length);
  return sortedAscending[Math.min(sortedAscending.length, Math.max(1, rank)) - 1];
}

const sum = values => values.reduce((total, value) => total + value, 0);
const finite = values => values.filter(value => typeof value === 'number' && Number.isFinite(value));

/** Count, min, mean, median, p95, p99, max of a list of numbers; every field is null for an empty list. */
export function describe(values) {
  const sorted = finite(values).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, min: null, mean: null, median: null, p95: null, p99: null, max: null };
  }
  return {
    count: sorted.length,
    min: sorted[0],
    mean: sum(sorted) / sorted.length,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

/** A window is `{ start, end }` in performance.now() milliseconds; every function below also takes a list of windows. */
const toWindows = window => (Array.isArray(window) ? window : [window]);
const inWindows = (time, window) => toWindows(window).some(entry => time >= entry.start && time <= entry.end);

/**
 * Scheduler callbacks inside the time window(s), in order. `frames` are the probe's per-callback records
 * `{ ts, start, cpu, lag, continued, rendered, gpu, draws, tris }` where `ts` is the rAF timestamp.
 */
export function framesInWindow(frames, window) {
  return frames.filter(frame => inWindows(frame.start, window));
}

/**
 * Presentation cadence: the rAF-timestamp gap between two consecutive rendered frames where the earlier frame asked for a
 * continuation, i.e. an animation was running. Idle gaps of a demand-rendered scene are excluded by construction. This is
 * what a player sees; it is not the FPS cap and not the browser's raw rAF rate.
 */
export function contiguousIntervals(frames) {
  const rendered = frames.filter(frame => frame.rendered);
  const intervals = [];
  for (let index = 0; index + 1 < rendered.length; index += 1) {
    if (rendered[index].continued) intervals.push(rendered[index + 1].ts - rendered[index].ts);
  }
  return intervals;
}

/** Mean of the worst 1 % of the intervals, as FPS; only meaningful (and only reported) with at least 100 intervals. */
export function onePercentLowFps(intervals) {
  if (intervals.length < 100) return null;
  const worst = [...intervals].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(intervals.length / 100)));
  return 1000 / (sum(worst) / worst.length);
}

/**
 * Frame-pacing, CPU and GPU summary of one window of scheduler callbacks.
 * - `expectedIntervalMs` = max(1000 / fpsCap, 1000 / refreshHz): the fastest cadence the cap and the display allow.
 * - `lateFrames` = intervals longer than 1.5 x expectedIntervalMs. `intervalsOver50Ms` is the absolute counterpart.
 * - `cpuMs` is the duration of the scheduler callback (all useFrame work + renderer submission); `gpuMs` the GPU elapsed
 *   time of the callback's WebGL commands (timer query, null where unsupported or disjoint); `callbackLagMs` is how long
 *   after the rAF timestamp the callback started (main-thread contention).
 */
export function analyzeFrames(frames, { fpsCap, refreshHz }) {
  const rendered = frames.filter(frame => frame.rendered);
  const intervals = contiguousIntervals(frames);
  const expectedIntervalMs = Math.max(1000 / fpsCap, 1000 / (refreshHz || 60));
  const mean = intervals.length > 0 ? sum(intervals) / intervals.length : null;
  return {
    renderedFrames: rendered.length,
    contiguousIntervals: intervals.length,
    expectedIntervalMs,
    effectiveFps: mean ? 1000 / mean : null,
    onePercentLowFps: onePercentLowFps(intervals),
    intervalMs: describe(intervals),
    lateFrames: intervals.filter(value => value > expectedIntervalMs * 1.5).length,
    lateFrameRatio: intervals.length > 0
      ? intervals.filter(value => value > expectedIntervalMs * 1.5).length / intervals.length
      : null,
    intervalsOver50Ms: intervals.filter(value => value > 50).length,
    cpuMs: describe(rendered.map(frame => frame.cpu)),
    gpuMs: describe(rendered.map(frame => frame.gpu)),
    gpuSamples: finite(rendered.map(frame => frame.gpu)).length,
    callbackLagMs: describe(rendered.map(frame => frame.lag)),
    drawCallsPerFrame: describe(rendered.map(frame => frame.draws)),
    trianglesPerFrame: describe(rendered.map(frame => frame.tris)),
  };
}

/**
 * Shader program links inside a window. A link is `firstUse` when no earlier link of the same context had the same
 * source hash, otherwise `repeat`: the identical program was released and linked again, which is the avoidable cost
 * (a first-use link is the price of the first draw with that material variant and is not counted against the target).
 * `links` is the whole page history so first-use is decided against everything linked before the window.
 */
export function programLinkStats(links, window) {
  const seen = new Set();
  const stats = { total: 0, firstUse: 0, repeat: 0, repeatByName: {}, linkMs: 0 };
  for (const link of [...links].sort((a, b) => a.t - b.t)) {
    const key = `${link.ctx}:${link.hash}`;
    const known = seen.has(key);
    seen.add(key);
    if (!inWindows(link.t, window)) continue;
    stats.total += 1;
    stats.linkMs += link.dur;
    if (known) {
      stats.repeat += 1;
      const label = link.name || `#${(link.hash >>> 0).toString(16)}`;
      stats.repeatByName[label] = (stats.repeatByName[label] ?? 0) + 1;
    } else {
      stats.firstUse += 1;
    }
  }
  return stats;
}

/** Time the main thread spent blocked in synchronous WebGL calls (program/shader queries, finish, readPixels) > 0.3 ms. */
export function syncWaitStats(syncWaits, window) {
  const inside = syncWaits.filter(wait => inWindows(wait.t, window));
  return { count: inside.length, totalMs: sum(inside.map(wait => wait.dur)), maxMs: Math.max(0, ...inside.map(wait => wait.dur)) };
}

/**
 * React work. A "React task" is one scheduler macrotask (a MessageChannel message handler) in which at least one React
 * commit happened; its duration is the wall time of that handler. Commits are counted per renderer ('dom' = React DOM,
 * 'r3f' = the @react-three/fiber reconciler). This is a different method from the Phase A CPU-profile attribution, so
 * absolute values are comparable only with other runs of this tool.
 */
export function reactStats(tasks, commits, window) {
  const insideTasks = tasks.filter(task => inWindows(task.start, window) && task.commits > 0);
  const insideCommits = commits.filter(commit => inWindows(commit.t, window));
  return {
    tasks: describe(insideTasks.map(task => task.dur)),
    tasksOverFrame: insideTasks.filter(task => task.dur > 16.7).length,
    domCommits: insideCommits.filter(commit => commit.kind === 'dom').length,
    r3fCommits: insideCommits.filter(commit => commit.kind === 'r3f').length,
  };
}

/** Browser long animation frames (> 50 ms) inside a window. */
export function longAnimationFrameStats(loaf, window) {
  const inside = loaf.filter(entry => inWindows(entry.start, window));
  return { count: inside.length, totalMs: sum(inside.map(entry => entry.dur)), maxMs: Math.max(0, ...inside.map(entry => entry.dur)) };
}

/**
 * Scene submissions in an idle window: scheduler callbacks that issued a draw call. A demand-rendered scene at rest must
 * report 0; `rafRequests` counts every scheduler rAF callback (even ones that rendered nothing) and `domCommits` any
 * React DOM commit, which would be the first suspect if the scene ever wakes up.
 */
export function idleStats(frames, commits, window) {
  const inside = framesInWindow(frames, window);
  const insideCommits = commits.filter(commit => inWindows(commit.t, window));
  return {
    seconds: toWindows(window).reduce((total, entry) => total + (entry.end - entry.start), 0) / 1000,
    sceneSubmissions: inside.filter(frame => frame.rendered).length,
    schedulerCallbacks: inside.length,
    domCommits: insideCommits.filter(commit => commit.kind === 'dom').length,
    r3fCommits: insideCommits.filter(commit => commit.kind === 'r3f').length,
  };
}

/** Least-squares slope of y over x (units of y per unit of x), 0 for fewer than two points. */
export function slope(points) {
  if (points.length < 2) return 0;
  const meanX = sum(points.map(point => point.x)) / points.length;
  const meanY = sum(points.map(point => point.y)) / points.length;
  const denominator = sum(points.map(point => (point.x - meanX) ** 2));
  return denominator === 0 ? 0 : sum(points.map(point => (point.x - meanX) * (point.y - meanY))) / denominator;
}

/**
 * Resource trend over repeated replays. `samples` = [{ replay, heapBytes, geometries, textures, programs }] taken after a
 * forced GC; growth = last - first, slopePerReplay = least-squares slope.
 */
export function resourceTrend(samples) {
  if (samples.length === 0) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const field = key => ({
    first: first[key],
    last: last[key],
    growth: last[key] - first[key],
    slopePerReplay: slope(samples.map(sample => ({ x: sample.replay, y: sample[key] }))),
  });
  return {
    replays: last.replay - first.replay,
    heapBytes: field('heapBytes'),
    geometries: field('geometries'),
    textures: field('textures'),
    programs: field('programs'),
  };
}

/**
 * Relative change from `before` to `after`. Returns null when either side is missing or `before` is 0 and `after` is not
 * comparable. `improvementPercent` is positive when the metric got better (`lowerIsBetter` decides the direction).
 */
export function compareValues(before, after, { lowerIsBetter = true } = {}) {
  if (typeof before !== 'number' || typeof after !== 'number' || !Number.isFinite(before) || !Number.isFinite(after)) {
    return { before: before ?? null, after: after ?? null, delta: null, improvementPercent: null };
  }
  const delta = after - before;
  if (before === 0) {
    return { before, after, delta, improvementPercent: after === 0 ? 0 : null };
  }
  const change = (delta / Math.abs(before)) * 100;
  return { before, after, delta, improvementPercent: lowerIsBetter ? -change : change };
}
