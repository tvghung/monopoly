/** The per-landmark budgets of plan 05 §5.3 and §8.3. A test checks every built landmark against them. */
export const LANDMARK_LIMITS = {
  maxTriangles: 900,
  /** Opaque, plus optional glass and optional emissive. */
  maxDraws: 3,
  maxFootprint: 1.3,
  maxStandardHeight: 1.2,
  maxSlimHeight: 2.0,
} as const;

/** Plinth: a lacquer slab with a rim in the owner's color (plan 05 §8.3). */
export const PLINTH = {
  size: 1.36,
  height: 0.08,
  rim: 0.04,
} as const;
