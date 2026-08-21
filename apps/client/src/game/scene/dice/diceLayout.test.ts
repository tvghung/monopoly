import { describe, expect, it } from 'vitest';
import { CENTER_AIRPORT_FIELD_TOP_Y } from '../board/architecture/boardArtSpec';
import {
  DICE_ARENA_SIZE,
  DICE_SIZE,
  getDiceArenaBounds,
  getDicePosition,
  getDiceResultPosition,
  isDiceArenaClearOfCenterPaths,
  isDiceArenaInsideCenterField,
} from './diceLayout';

describe('board-space dice arena layout', () => {
  it('stays inside the center field and clear of the authored center paths', () => {
    expect(isDiceArenaInsideCenterField()).toBe(true);
    expect(isDiceArenaClearOfCenterPaths()).toBe(true);
    expect(DICE_ARENA_SIZE.width).toBeGreaterThan(DICE_SIZE * 2);
  });

  it('keeps both dice and the result label inside the logical arena', () => {
    const bounds = getDiceArenaBounds();
    [0, 1].forEach(index => {
      const [x, y, z] = getDicePosition(index as 0 | 1);
      expect(x - DICE_SIZE / 2).toBeGreaterThanOrEqual(bounds.minX);
      expect(x + DICE_SIZE / 2).toBeLessThanOrEqual(bounds.maxX);
      expect(z - DICE_SIZE / 2).toBeGreaterThanOrEqual(bounds.minZ);
      expect(z + DICE_SIZE / 2).toBeLessThanOrEqual(bounds.maxZ);
      expect(y).toBeCloseTo(CENTER_AIRPORT_FIELD_TOP_Y + DICE_SIZE / 2);
    });
    const result = getDiceResultPosition();
    expect(result[0]).toBeGreaterThanOrEqual(bounds.minX);
    expect(result[0]).toBeLessThanOrEqual(bounds.maxX);
    expect(result[2]).toBeLessThanOrEqual(bounds.maxZ);
    expect(result[1]).toBeCloseTo(CENTER_AIRPORT_FIELD_TOP_Y + 0.014);
  });
});
