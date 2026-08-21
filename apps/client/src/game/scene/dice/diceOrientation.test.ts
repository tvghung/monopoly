import { describe, expect, it } from 'vitest';
import {
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
});
