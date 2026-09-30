/**
 * TypeScript mirror of `tokens/motion.css` for framer-motion (durations in seconds).
 * `motionTokens.test.ts` keeps the two in sync. Chrome motion (hover, press, modal enter, drawers)
 * is not scaled by the gameplay animation speed; presentation-linked HUD motion takes its timing
 * from the presentation timing config instead.
 */
export const motionDuration = {
  micro: 0.12,
  ui: 0.2,
  panel: 0.28,
  emphasis: 0.48,
  celebration: 0.9,
} as const;

export const motionEase = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const motionSpring = { stiffness: 520, damping: 32 } as const;

export const motionTokens = {
  hover: motionDuration.micro,
  press: 0.08,
  panelEnter: motionDuration.panel,
  modalEnter: motionDuration.panel,
  toastEnter: motionDuration.ui,
} as const;
