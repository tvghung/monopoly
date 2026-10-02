/** Dev-only frame-time benchmark for the UAT harness (visual-overhaul-v2 plan 02, T02.2). */

export interface BenchmarkSummary {
  frames: number;
  medianFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  medianFps: number;
  /** Frames that took longer than 20 ms (the p95 budget of plan 02 §5.3). */
  slowFrames: number;
}

export interface BenchmarkResult extends BenchmarkSummary {
  scenario: string;
  seconds: number;
  /** Renderer diagnostics at the end of the run (tier, dpr, draw calls, triangles). */
  diagnostics: Record<string, unknown> | null;
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
      frames: 0, medianFrameMs: 0, p95FrameMs: 0, maxFrameMs: 0, medianFps: 0, slowFrames: 0,
    };
  }
  const sorted = [...measured].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  return {
    frames: sorted.length,
    medianFrameMs: median,
    p95FrameMs: percentile(sorted, 95),
    maxFrameMs: sorted[sorted.length - 1],
    medianFps: median > 0 ? 1000 / median : 0,
    slowFrames: sorted.filter(value => value > 20).length,
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
