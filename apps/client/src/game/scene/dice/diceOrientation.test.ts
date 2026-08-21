import { describe, expect, it } from 'vitest';
import { DICE_DROP_HEIGHT } from './diceLayout';
import {
  DICE_REROLL_LIFT_RATIO,
  getDiceAnimationHeight,
  getDiceAnimationRotation,
  getDiceTumbleTurns,
  getSettledDiceRotation,
  isValidDiceFace,
} from './diceOrientation';

describe('procedural dice orientation', () => {
  it('accepts only authoritative six-sided faces', () => {
    expect(isValidDiceFace(1)).toBe(true);
    expect(isValidDiceFace(6)).toBe(true);
    expect(isValidDiceFace(0)).toBe(false);
    expect(isValidDiceFace(6.5)).toBe(false);
  });

  it('settles exactly on the requested face rotation', () => {
    [1, 2, 3, 4, 5, 6].forEach(value => {
      expect(getDiceAnimationRotation(value, 4, 0, 1)).toEqual(getSettledDiceRotation(value));
    });
  });

  it('uses deterministic but distinct tumble paths for each die and sequence', () => {
    expect(getDiceTumbleTurns(1, 0)).not.toBe(getDiceTumbleTurns(2, 0));
    expect(getDiceAnimationRotation(2, 3, 0, 0)).not.toEqual(
      getDiceAnimationRotation(2, 3, 1, 0),
    );
  });

  it('starts a reroll at the previous settled rotation and preserves that face during lift', () => {
    const previous = getSettledDiceRotation(4);
    expect(getDiceAnimationRotation(6, 2, 0, 0, 4)).toEqual(previous);
    expect(getDiceAnimationRotation(6, 2, 0, DICE_REROLL_LIFT_RATIO, 4)).toEqual(previous);
    expect(getDiceAnimationHeight(0, true)).toBe(0);
    expect(getDiceAnimationHeight(DICE_REROLL_LIFT_RATIO, true)).toBeCloseTo(DICE_DROP_HEIGHT);
  });

  it('lifts and drops a subsequent roll while ending at rest', () => {
    expect(DICE_DROP_HEIGHT).toBe(1.35);
    expect(getDiceAnimationHeight(DICE_REROLL_LIFT_RATIO / 2, true)).toBeGreaterThan(0);
    expect(getDiceAnimationHeight(0.8, true)).toBeLessThan(DICE_DROP_HEIGHT);
    expect(getDiceAnimationHeight(1, true)).toBe(0);
    expect(getDiceAnimationRotation(6, 2, 0, 1, 4)).toEqual(getSettledDiceRotation(6));
  });

  it('keeps identical consecutive faces animated by roll sequence', () => {
    const previous = getSettledDiceRotation(3);
    const atLift = getDiceAnimationRotation(3, 7, 0, DICE_REROLL_LIFT_RATIO, 3);
    const afterLift = getDiceAnimationRotation(3, 7, 0, DICE_REROLL_LIFT_RATIO + 0.1, 3);
    expect(atLift).toEqual(previous);
    expect(afterLift).not.toEqual(previous);
    expect(getDiceAnimationRotation(3, 7, 0, 1, 3)).toEqual(previous);
  });
});
