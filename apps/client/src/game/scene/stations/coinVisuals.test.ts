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
  coinTiltForIndex,
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
    expect(SHARED_COIN_GEOMETRY.type).toBe('LatheGeometry');
    expect(COIN_BEVEL_SIZE).toBeGreaterThan(0);
    expect(COIN_BEVEL_THICKNESS).toBeGreaterThan(0);
    Object.values(COIN_FINISH_MATERIALS).forEach(material => {
      expect(material.metalness).toBeGreaterThanOrEqual(0.7);
      expect(material.metalness).toBeLessThanOrEqual(0.8);
      expect(material.roughness).toBeGreaterThanOrEqual(0.12);
      expect(material.roughness).toBeLessThanOrEqual(0.18);
      expect(material.envMapIntensity).toBeGreaterThanOrEqual(1);
      expect(material.envMapIntensity).toBeLessThanOrEqual(1.3);
      expect(material.clearcoat).toBeGreaterThanOrEqual(0.3);
      expect(material).toHaveProperty('clearcoat');
      expect(material.emissiveIntensity).toBe(0);
    });
    expect(COIN_RADIUS).toBeGreaterThanOrEqual(0.2);
    expect(COIN_THICKNESS).toBeGreaterThanOrEqual(0.095);
    expect(COIN_THICKNESS).toBeLessThanOrEqual(0.105);
  });

  it('keeps featured coin tilts deterministic and leaves unfeatured coins flat', () => {
    expect(coinTiltForIndex(8, stableCoinSeed('station-a'))).toEqual(
      coinTiltForIndex(8, stableCoinSeed('station-a')),
    );
    expect(coinTiltForIndex(8, stableCoinSeed('station-a'))).not.toEqual(
      coinTiltForIndex(9, stableCoinSeed('station-a')),
    );
    expect(coinTiltForIndex(8, stableCoinSeed('station-a'), false)).toEqual([0, 0]);
  });

  it('keeps positive wealth piles symbolic but visually substantial', () => {
    expect(wealthCoinCount(1)).toBeGreaterThanOrEqual(9);
    expect(wealthCoinCount(1_500)).toBe(20);
    expect(wealthCoinCount(1_500_000)).toBe(20);
  });
});
