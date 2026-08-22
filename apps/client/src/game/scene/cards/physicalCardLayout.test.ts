import { describe, expect, it } from 'vitest';
import {
  CARD_PRESENTATION_SCALE,
  CARD_REVEAL_ROTATIONS,
  getCardLayerTransform,
  getIdleDeckCardCount,
  isCenterAssetLayoutClear,
  PHYSICAL_CARD_DEPTH,
  PHYSICAL_CARD_LAYER_STEP,
  PHYSICAL_CARD_THICKNESS,
  PHYSICAL_CARD_WIDTH,
} from './physicalCardLayout';

describe('physical card deck layout', () => {
  it('uses substantial card dimensions, scale, and multiple reveal rotations', () => {
    expect(PHYSICAL_CARD_WIDTH).toBeGreaterThanOrEqual(1.7);
    expect(PHYSICAL_CARD_DEPTH).toBeGreaterThanOrEqual(1);
    expect(PHYSICAL_CARD_THICKNESS).toBeGreaterThan(0.04);
    expect(CARD_PRESENTATION_SCALE).toBeGreaterThanOrEqual(2.5);
    expect(CARD_REVEAL_ROTATIONS).toBeGreaterThanOrEqual(2);
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
