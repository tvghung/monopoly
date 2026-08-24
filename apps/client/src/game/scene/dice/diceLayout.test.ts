import { describe, expect, it } from 'vitest';
import { CENTER_AIRPORT_FIELD_TOP_Y } from '../board/architecture/boardArtSpec';
import {
  BASE_DICE_CENTER_OFFSET_X,
  BASE_DICE_SIZE,
  DICE_ARENA_SIZE,
  DICE_ARENA_HORIZONTAL_MARGIN,
  DICE_ARENA_RESULT_OFFSET_Z,
  DICE_ARENA_VERTICAL_MARGIN,
  DICE_CENTER_OFFSET_X,
  DICE_RESULT_DIE_CENTER_GAP_Z,
  DICE_SCALE,
  DICE_SIZE,
  getDiceArenaBounds,
  getDicePosition,
  getDiceResultPosition,
  getDiceSettledFootprintBounds,
  isDiceArenaClearOfCenterPaths,
  isDiceFootprintClearOfCenterPaths,
  isDiceArenaInsideCenterField,
} from './diceLayout';
import { DICE_RESULT_FONT_SIZE } from './diceVisualConfig';

describe('board-space dice arena layout', () => {
  it('scales the settled pair without changing its conventional gap', () => {
    expect(DICE_SCALE).toBe(1.70);
    expect(DICE_SIZE).toBeCloseTo(BASE_DICE_SIZE * DICE_SCALE, 12);
    expect(DICE_CENTER_OFFSET_X).toBeCloseTo(BASE_DICE_CENTER_OFFSET_X * DICE_SCALE, 12);
    const first = getDicePosition(0);
    const second = getDicePosition(1);
    expect(first[0]).toBeCloseTo(-0.884, 12);
    expect(second[0]).toBeCloseTo(0.884, 12);
    expect(second[0] - first[0] - DICE_SIZE).toBeCloseTo(0.442, 12);
  });

  it('derives the logical envelope from the enlarged body footprint', () => {
    const bounds = getDiceArenaBounds();
    const footprint = getDiceSettledFootprintBounds();
    expect(DICE_ARENA_SIZE.width).toBeCloseTo(
      (footprint.maxX - footprint.minX) + DICE_ARENA_HORIZONTAL_MARGIN * 2,
      12,
    );
    expect(DICE_ARENA_SIZE.depth).toBeCloseTo(
      (Math.max(DICE_SIZE / 2, DICE_ARENA_RESULT_OFFSET_Z) + DICE_ARENA_VERTICAL_MARGIN) * 2,
      12,
    );
    expect(bounds.minX).toBeLessThanOrEqual(footprint.minX);
    expect(bounds.maxX).toBeGreaterThanOrEqual(footprint.maxX);
    expect(bounds.minZ).toBeLessThanOrEqual(footprint.minZ);
    expect(bounds.maxZ).toBeGreaterThanOrEqual(footprint.maxZ);
    expect(isDiceFootprintClearOfCenterPaths()).toBe(true);
  });

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
    const footprint = getDiceSettledFootprintBounds();
    expect(result[0]).toBeGreaterThanOrEqual(bounds.minX);
    expect(result[0]).toBeLessThanOrEqual(bounds.maxX);
    expect(result[2]).toBeLessThanOrEqual(bounds.maxZ);
    expect(result[2] - DICE_RESULT_FONT_SIZE / 2).toBeGreaterThan(footprint.maxZ);
    expect(result[2] + DICE_RESULT_FONT_SIZE / 2).toBeLessThanOrEqual(bounds.maxZ);
    expect(DICE_ARENA_RESULT_OFFSET_Z).toBeCloseTo(DICE_SIZE / 2 + DICE_RESULT_DIE_CENTER_GAP_Z, 12);
    expect(result[1]).toBeCloseTo(CENTER_AIRPORT_FIELD_TOP_Y + 0.014);
  });
});
