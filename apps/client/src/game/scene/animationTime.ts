export function getAnimationElapsedMs(startedAtMs: number, nowMs = performance.now()): number {
  return Math.max(0, nowMs - startedAtMs);
}
