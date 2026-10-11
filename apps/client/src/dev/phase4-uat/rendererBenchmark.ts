/** Dev-only frame-time benchmark for the UAT harness (visual-overhaul-v2 plan 02, T02.2). */

export interface BenchmarkSummary {
  frames: number;
  averageFrameMs: number;
  medianFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  averageFps: number;
  medianFps: number;
  /** Frames that took longer than 20 ms (the p95 budget of plan 02 §5.3). */
  slowFrames: number;
}

export interface BenchmarkResult extends BenchmarkSummary {
  scenario: string;
  seconds: number;
  fpsLimit: number;
  renderer: RendererBenchmarkSummary;
  longTasks: { supported: boolean; count: number; totalMs: number; maxMs: number };
  /** Renderer diagnostics at the end of the run (tier, dpr, draw calls, triangles). */
  diagnostics: Record<string, unknown> | null;
}

export interface RendererFrameSample {
  timestampMs: number;
  intervalMs: number;
  cpuMs: number;
  drawCalls: number;
  triangles: number;
}

export interface RendererBenchmarkSummary {
  frames: number;
  averageFps: number;
  averageFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  averageCpuMs: number;
  p95CpuMs: number;
  maxCpuMs: number;
  averageDrawCalls: number;
  averageTriangles: number;
}

/** Nearest-rank percentile of an ascending array (p in 0..100). */
export function percentile(sortedAscending: readonly number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAscending.length);
  return sortedAscending[Math.min(sortedAscending.length, Math.max(1, rank)) - 1];
}

/**
 * Summarizes requestAnimationFrame intervals. The first `warmupFrames` are dropped because the
 * scenario is still mounting and shaders are still compiling.
 */
export function summarizeFrameIntervals(intervalsMs: readonly number[], warmupFrames = 5): BenchmarkSummary {
  const measured = intervalsMs.slice(warmupFrames).filter(value => Number.isFinite(value) && value > 0);
  if (measured.length === 0) {
    return {
      frames: 0, averageFrameMs: 0, medianFrameMs: 0, p95FrameMs: 0, maxFrameMs: 0,
      averageFps: 0, medianFps: 0, slowFrames: 0,
    };
  }
  const sorted = [...measured].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  const average = measured.reduce((sum, value) => sum + value, 0) / measured.length;
  return {
    frames: sorted.length,
    averageFrameMs: average,
    medianFrameMs: median,
    p95FrameMs: percentile(sorted, 95),
    maxFrameMs: sorted[sorted.length - 1],
    averageFps: average > 0 ? 1000 / average : 0,
    medianFps: median > 0 ? 1000 / median : 0,
    slowFrames: sorted.filter(value => value > 20).length,
  };
}

export function summarizeRendererFrames(samples: readonly RendererFrameSample[], warmupFrames = 5): RendererBenchmarkSummary {
  const measured = samples.slice(warmupFrames).filter(sample => (
    Number.isFinite(sample.intervalMs) && sample.intervalMs > 0
    && Number.isFinite(sample.cpuMs) && sample.cpuMs >= 0
  ));
  const frameTimes = measured.map(sample => sample.intervalMs).sort((a, b) => a - b);
  const cpuTimes = measured.map(sample => sample.cpuMs).sort((a, b) => a - b);
  const average = frameTimes.length > 0
    ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
    : 0;
  const averageOf = (values: readonly number[]) => {
    const finite = values.filter(Number.isFinite);
    return finite.length > 0
      ? finite.reduce((sum, value) => sum + value, 0) / finite.length
      : 0;
  };
  return {
    frames: frameTimes.length,
    averageFps: average > 0 ? 1000 / average : 0,
    averageFrameMs: average,
    p95FrameMs: percentile(frameTimes, 95),
    maxFrameMs: frameTimes.at(-1) ?? 0,
    averageCpuMs: averageOf(cpuTimes),
    p95CpuMs: percentile(cpuTimes, 95),
    maxCpuMs: cpuTimes.at(-1) ?? 0,
    averageDrawCalls: averageOf(measured.map(sample => sample.drawCalls)),
    averageTriangles: averageOf(measured.map(sample => sample.triangles)),
  };
}

const MAX_BENCHMARK_SECONDS = 120;

/** Parses `benchmark=<seconds>`; anything that is not a positive number (capped at 120) disables it. */
export function parseBenchmarkSeconds(raw: string | null): number | null {
  if (raw === null) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(MAX_BENCHMARK_SECONDS, seconds);
}
