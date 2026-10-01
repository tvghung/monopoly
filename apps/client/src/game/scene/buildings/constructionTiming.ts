import { presentationTiming } from '../../presentation/timings';

/** Length of the dust burst that goes with a build animation of `effectiveDurationMs` (the burst scales with the animation speed). */
export function getScaledConstructionBurstDuration(
  effectiveDurationMs: number,
  baseAnimationDurationMs: number,
): number {
  if (effectiveDurationMs <= 0 || baseAnimationDurationMs <= 0) return 0;
  return effectiveDurationMs / baseAnimationDurationMs * presentationTiming.buildPop;
}
