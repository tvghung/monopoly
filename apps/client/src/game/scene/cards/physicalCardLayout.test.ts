import { describe, expect, it } from 'vitest';
import {
  CARD_PRESENTATION_SCALE,
  CARD_REVEAL_ROTATIONS,
  CARD_FOCUS_VIEWPORT_WIDTH_RATIO,
  CARD_FOCUS_VIEWPORT_HEIGHT_RATIO,
  DECK_ANCHORS,
  DECK_ROTATION_Y,
  getCardLayerTransform,
  getIdleDeckCardCount,
  isCenterAssetLayoutClear,
  DECK_AXIS_OFFSET,
  PHYSICAL_CARD_DEPTH,
  PHYSICAL_CARD_LAYER_STEP,
  PHYSICAL_CARD_THICKNESS,
  PHYSICAL_CARD_WIDTH,
} from './physicalCardLayout';
import { getBoardTileLayout } from '../board/boardLayout';

describe('physical card deck layout', () => {
  it('uses substantial card dimensions, scale, and multiple reveal rotations', () => {
    expect(PHYSICAL_CARD_WIDTH).toBeGreaterThanOrEqual(2.1);
    expect(PHYSICAL_CARD_WIDTH).toBeLessThanOrEqual(2.3);
    expect(PHYSICAL_CARD_DEPTH).toBeGreaterThanOrEqual(1.3);
    expect(PHYSICAL_CARD_DEPTH).toBeLessThanOrEqual(1.45);
    expect(PHYSICAL_CARD_THICKNESS).toBeGreaterThan(0.04);
    expect(CARD_PRESENTATION_SCALE).toBeGreaterThanOrEqual(2.5);
    expect(CARD_REVEAL_ROTATIONS).toBeGreaterThanOrEqual(2);
    expect(CARD_FOCUS_VIEWPORT_WIDTH_RATIO).toBeGreaterThanOrEqual(0.36);
    expect(CARD_FOCUS_VIEWPORT_WIDTH_RATIO).toBeLessThanOrEqual(0.44);
    expect(CARD_FOCUS_VIEWPORT_HEIGHT_RATIO).toBeGreaterThan(0.6);
  });

  it('places enlarged decks symmetrically on the Parking to Start diagonal with perpendicular long axes', () => {
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

  it('detaches exactly one face-down card before the authoritative draw and no extra card after reveal', () => {
    const counts = { chance: 16, chest: 12 };
    const awaiting = {
      operationId: 'operation', playerId: 'player-a', deck: 'chance' as const, sourceTile: 7,
      stage: 'AWAITING_DRAW' as const, durationMs: 0,
    };
    const revealed = {
      ...awaiting, stage: 'REVEALED' as const, revealedCardId: 'chance-dividend' as const,
    };
    expect(getIdleDeckCardCount('chance', counts, awaiting)).toBe(15);
    expect(getIdleDeckCardCount('chance', { ...counts, chance: 15 }, revealed)).toBe(15);
    expect(getIdleDeckCardCount('chest', counts, awaiting)).toBe(12);
  });

  it('keeps decks and bank clear of dice, paths, and one another', () => {
    expect(isCenterAssetLayoutClear()).toBe(true);
  });
});
