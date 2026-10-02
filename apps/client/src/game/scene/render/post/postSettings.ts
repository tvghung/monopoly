/**
 * The high-tier post chain (plan 02 §8.7): ambient occlusion, a subtle bloom for truly bright highlights,
 * a vignette and the Neutral tone mapper as the final step. No temporal effects: demand rendering stops
 * after the last invalidate, so anything that accumulates over frames would never converge.
 */
export const POST_AMBIENT_OCCLUSION = {
  /** World units: contact darkening around buildings, coins and deck stacks. */
  aoRadius: 0.8,
  distanceFalloff: 0.6,
  intensity: 1.6,
  /** Warm dark occlusion color instead of neutral black. */
  color: '#3a2418',
  halfRes: true,
  quality: 'low',
} as const;

/**
 * The bloom threshold is measured on the HDR scene buffer, before the tone mapper: a sunlit white tile
 * already sits around 1.0 there, so the plan's 0.9 would make every tile glow and wash out its text.
 * 1.5 leaves only specular glints (coins, gold, lacquer) above it.
 */
export const POST_BLOOM = {
  mipmapBlur: true,
  luminanceThreshold: 1.5,
  luminanceSmoothing: 0.2,
  intensity: 0.22,
  levels: 5,
} as const;

export const POST_VIGNETTE = {
  offset: 0.3,
  darkness: 0.3,
} as const;

export const POST_MULTISAMPLING = 4;
