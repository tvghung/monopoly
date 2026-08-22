export const presentationTiming = {
  diceRoll: 640,
  diceResultHold: 140,
  tileHop: 180,
  slotReflow: 110,
  landing: 120,
  balanceChange: 120,
  propertyPurchase: 180,
  buildPop: 140,
  feedbackPulse: 180,
  feedbackDwell: 900,
  turnChange: 80,
  finish: 180,
  tileImpact: {
    stepDepress: 36,
    stepRebound: 78,
    landDepress: 52,
    landRebound: 68,
  },
  characterReaction: {
    happy: 120,
    sad: 180,
    jail: 120,
    bankrupt: 180,
    emote: 160,
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

