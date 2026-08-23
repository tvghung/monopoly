import { describe, expect, it } from 'vitest';
import {
  COIN_FINISH_MATERIALS,
  COIN_FINISH_SEQUENCE,
  COIN_BEVEL_SIZE,
  COIN_BEVEL_THICKNESS,
  COIN_RADIUS,
  SHARED_COIN_GEOMETRY,
  COIN_THICKNESS,
  coinFinishForIndex,
  stableCoinSeed,
} from './coinVisuals';
import { wealthCoinCount } from './PlayerStationLayer';

describe('shared metallic coin system', () => {
  it('uses one deterministic copper/silver/gold composition at the requested relative weights', () => {
    const finishes = Array.from({ length: COIN_FINISH_SEQUENCE.length }, (_, index) => (
      coinFinishForIndex(index, stableCoinSeed('player-a'))
    ));
    expect(finishes.filter(finish => finish === 'COPPER')).toHaveLength(6);
    expect(finishes.filter(finish => finish === 'SILVER')).toHaveLength(2);
    expect(finishes.filter(finish => finish === 'GOLD')).toHaveLength(1);
    expect(finishes).toEqual(Array.from({ length: 9 }, (_, index) => (
      coinFinishForIndex(index, stableCoinSeed('player-a'))
    )));
  });

  it('uses a shared beveled coin geometry and readable metallic finishes', () => {
    expect(SHARED_COIN_GEOMETRY.type).toBe('ExtrudeGeometry');
    expect(COIN_BEVEL_SIZE).toBeGreaterThan(0);
    expect(COIN_BEVEL_THICKNESS).toBeGreaterThan(0);
    Object.values(COIN_FINISH_MATERIALS).forEach(material => {
      expect(material.metalness).toBeGreaterThanOrEqual(0.5);
      expect(material.metalness).toBeLessThanOrEqual(0.65);
      expect(material.roughness).toBeGreaterThanOrEqual(0.14);
      expect(material.roughness).toBeLessThanOrEqual(0.28);
      expect(material.clearcoat).toBeGreaterThanOrEqual(0.6);
      expect(material).toHaveProperty('clearcoat');
    });
    expect(COIN_RADIUS).toBeGreaterThanOrEqual(0.2);
    expect(COIN_THICKNESS).toBeGreaterThanOrEqual(0.075);
  });

  it('keeps positive wealth piles symbolic but visually substantial', () => {
    expect(wealthCoinCount(1)).toBeGreaterThanOrEqual(9);
    expect(wealthCoinCount(1_500)).toBe(20);
    expect(wealthCoinCount(1_500_000)).toBe(20);
  });
});
