import { BASE_DICE_SIZE, DICE_DROP_HEIGHT } from './diceLayout';
import { presentationTiming } from '../../presentation/timings';

export type DiceEuler = readonly [number, number, number];

const TWO_PI = Math.PI * 2;
export const DICE_REROLL_LIFT_RATIO = 0.18;
export const DICE_BOUNCE_HEIGHT = BASE_DICE_SIZE * 0.13;

const SETTLED_FACE_ROTATIONS: Record<number, DiceEuler> = {
  // The procedural die labels its top face as 1. These rotations put the
  // authoritative requested face on top without changing the camera.
  1: [0, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
};

export function isValidDiceFace(value: number): value is 1 | 2 | 3 | 4 | 5 | 6 {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

export function getSettledDiceRotation(value: number): DiceEuler {
  return SETTLED_FACE_ROTATIONS[value] ?? [0, 0, 0];
}

export function easeOutCubic(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return 1 - ((1 - clamped) ** 3);
}

export function getDiceTumbleTurns(rollSequence: number, dieIndex: 0 | 1): number {
  return 2 + ((Math.max(0, rollSequence) + dieIndex) % 3);
}

function getTumbleStartRotation(
  settled: DiceEuler,
  rollSequence: number,
  dieIndex: 0 | 1,
): DiceEuler {
  const direction = dieIndex === 0 ? 1 : -1;
  const turns = getDiceTumbleTurns(rollSequence, dieIndex);
  return [
    settled[0] + direction * turns * TWO_PI + 0.55 * direction,
    settled[1] + (turns + 1) * TWO_PI,
    settled[2] - direction * (turns * TWO_PI + 0.35),
  ];
}

export function getDiceAnimationHeight(progress: number, hasPreviousDice: boolean): number {
  const clamped = Math.min(1, Math.max(0, progress));
  if (!hasPreviousDice) return (1 - easeOutCubic(clamped)) * DICE_DROP_HEIGHT;
  if (clamped <= DICE_REROLL_LIFT_RATIO) {
    return easeOutCubic(clamped / DICE_REROLL_LIFT_RATIO) * DICE_DROP_HEIGHT;
  }
  const dropProgress = (clamped - DICE_REROLL_LIFT_RATIO) / (1 - DICE_REROLL_LIFT_RATIO);
  return (1 - easeOutCubic(dropProgress)) * DICE_DROP_HEIGHT;
}

export function getDiceBounceOffset(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const contactProgress = presentationTiming.diceContactProgress;
  const bounceProgress = clamped <= contactProgress
    ? 0
    : (clamped - contactProgress) / (1 - contactProgress);
  return Math.sin(bounceProgress * Math.PI * 2.5)
    * DICE_BOUNCE_HEIGHT
    * (1 - Math.min(1, bounceProgress));
}

/** Shared vertical offset for the die mesh and its ground shadow. */
export function getDiceAnimationVerticalOffset(
  progress: number,
  hasPreviousDice: boolean,
): number {
  return getDiceAnimationHeight(progress, hasPreviousDice) + getDiceBounceOffset(progress);
}

export function getDiceAnimationRotation(
  value: number,
  rollSequence: number,
  dieIndex: 0 | 1,
  progress: number,
  fromValue?: number,
): DiceEuler {
  const settled = getSettledDiceRotation(value);
  if (progress >= 1) return settled;
  const hasPreviousDice = isValidDiceFace(fromValue ?? 0);
  const previous = hasPreviousDice ? getSettledDiceRotation(fromValue as number) : settled;
  if (hasPreviousDice && progress <= DICE_REROLL_LIFT_RATIO) return previous;
  const start = getTumbleStartRotation(previous, rollSequence, dieIndex);
  const tumbleProgress = hasPreviousDice
    ? (progress - DICE_REROLL_LIFT_RATIO) / (1 - DICE_REROLL_LIFT_RATIO)
    : progress;
  const eased = easeOutCubic(tumbleProgress);
  return [
    start[0] + (settled[0] - start[0]) * eased,
    start[1] + (settled[1] - start[1]) * eased,
    start[2] + (settled[2] - start[2]) * eased,
  ];
}
