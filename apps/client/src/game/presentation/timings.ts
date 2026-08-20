export const presentationTiming = {
  diceRoll: 210,
  tileHop: 210,
  slotReflow: 125,
  landing: 140,
  balanceChange: 140,
  propertyPurchase: 210,
  buildPop: 160,
  turnChange: 95,
  finish: 210,
  tileImpact: {
    stepDepress: 52,
    stepRebound: 126,
    landDepress: 70,
    landRebound: 70,
  },
  characterReaction: {
    happy: 140,
    sad: 210,
    jail: 140,
    bankrupt: 210,
    emote: 185,
  },
} as const;

export const PRESENTATION_MIN_SPEED = 0.75;
export const PRESENTATION_MAX_SPEED = 2;

export function resolvePresentationDuration(
  baseDurationMs: number,
  speedMultiplier: number,
): number {
  if (!Number.isFinite(baseDurationMs) || baseDurationMs <= 0) return 0;
  const safeMultiplier = Number.isFinite(speedMultiplier)
    ? Math.min(PRESENTATION_MAX_SPEED, Math.max(PRESENTATION_MIN_SPEED, speedMultiplier))
    : 1;
  return baseDurationMs / safeMultiplier;
}

