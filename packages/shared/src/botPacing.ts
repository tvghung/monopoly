/**
 * How long clients take, at normal animation speed, to present a roll: the dice, the walk of `steps` tiles and the landing,
 * plus the GO moment when the walk passes Xuất Phát. A bot answers the landing only after this plus a thinking pause, so
 * its decision follows what players see. Presentation pacing only: nothing waits on a client, and a slower client still
 * shows the decision in order because its presentation queue holds it until the landing has played.
 *
 * Mirrors `apps/client/src/game/presentation/timings.ts`; a client test fails when the two drift apart.
 */
export const ROLL_PRESENTATION_BUDGET_MS = {
  /** Dice tumble plus the hold on the result. */
  dice: 780,
  /** Destination preview before the first hop. */
  moveLead: 220,
  perStep: 180,
  /** Landing plus the tile impact. */
  landing: 240,
  /** The GO moment that plays while the walk passes Xuất Phát. */
  passGo: 1_000,
} as const;

export const BOT_THINKING_PAUSE_MS = 900;

export function estimateRollPresentationMs(steps: number, passesGo: boolean): number {
  const budget = ROLL_PRESENTATION_BUDGET_MS;
  return budget.dice + budget.moveLead + budget.perStep * Math.max(0, steps) + budget.landing
    + (passesGo ? budget.passGo : 0);
}
