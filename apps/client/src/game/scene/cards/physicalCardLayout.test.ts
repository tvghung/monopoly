import { describe, expect, it } from 'vitest';
import {
  CARD_FRAME_BORDER,
  DECK_ANCHORS,
  DECK_AXIS_OFFSET,
  DECK_ROTATION_Y,
  getCardLayerTransform,
  getIdleDeckCardCount,
  isCenterAssetLayoutClear,
  PHYSICAL_CARD_DEPTH,
  PHYSICAL_CARD_LAYER_STEP,
  PHYSICAL_CARD_THICKNESS,
  PHYSICAL_CARD_WIDTH,
} from './physicalCardLayout';
import { getBoardTileLayout } from '../board/boardLayout';

describe('physical card deck layout', () => {
  it('keeps the idle deck geometry substantial and layered', () => {
    expect(PHYSICAL_CARD_WIDTH).toBeGreaterThanOrEqual(2.1);
    expect(PHYSICAL_CARD_WIDTH).toBeLessThanOrEqual(2.3);
    expect(PHYSICAL_CARD_DEPTH).toBeGreaterThanOrEqual(1.3);
    expect(PHYSICAL_CARD_DEPTH).toBeLessThanOrEqual(1.45);
    expect(PHYSICAL_CARD_THICKNESS).toBeGreaterThan(0.04);
    expect(CARD_FRAME_BORDER).toBeGreaterThanOrEqual(0.045);
    expect(CARD_FRAME_BORDER).toBeLessThanOrEqual(0.055);
  });

  it('places idle decks symmetrically on the Parking to Start diagonal', () => {
    const parking = getBoardTileLayout(20)?.position;
    const start = getBoardTileLayout(0)?.position;
    expect(parking).toBeDefined();
    expect(start).toBeDefined();
    const axis = [
      (start?.[0] ?? 0) - (parking?.[0] ?? 0),
      (start?.[2] ?? 0) - (parking?.[2] ?? 0),
    ];
    const length = Math.hypot(...axis);
    const normalizedAxis = axis.map(value => value / length);
    expect(Math.hypot(...DECK_ANCHORS.chance)).toBeCloseTo(DECK_AXIS_OFFSET);
    expect(Math.hypot(...DECK_ANCHORS.chest)).toBeCloseTo(DECK_AXIS_OFFSET);
    expect(DECK_ANCHORS.chance[0]).toBeCloseTo(-DECK_ANCHORS.chest[0]);
    expect(DECK_ANCHORS.chance[1]).toBeCloseTo(-DECK_ANCHORS.chest[1]);
    const longAxis = [Math.cos(DECK_ROTATION_Y), -Math.sin(DECK_ROTATION_Y)] as const;
    expect(Math.abs(longAxis[0] * normalizedAxis[0] + longAxis[1] * normalizedAxis[1]))
      .toBeLessThan(1e-8);
  });

  it('maps every authoritative idle card to one deterministic physical layer', () => {
    const transforms = Array.from({ length: 16 }, (_, index) => getCardLayerTransform('chance', index));
    expect(new Set(transforms.map(transform => transform.position[1])).size).toBe(16);
    expect(transforms[15].position[1] - transforms[0].position[1])
      .toBeCloseTo(PHYSICAL_CARD_LAYER_STEP * 15);
    expect(getCardLayerTransform('chance', 7)).toEqual(getCardLayerTransform('chance', 7));
  });

  it('renders exactly the authoritative pile count because the drawn card is already removed on LAND', () => {
    expect(getIdleDeckCardCount('chance', { chance: 16, chest: 12 })).toBe(16);
    expect(getIdleDeckCardCount('chance', { chance: 15, chest: 12 })).toBe(15);
    expect(getIdleDeckCardCount('chest', { chance: 16, chest: 12 })).toBe(12);
  });

  it('keeps decks and bank clear of dice, paths, and one another', () => {
    expect(isCenterAssetLayoutClear()).toBe(true);
  });
});
