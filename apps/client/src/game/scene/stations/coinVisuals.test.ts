import { describe, expect, it } from 'vitest';
import {
  COIN_FINISH_MATERIALS,
  COIN_FINISH_SEQUENCE,
  coinFinishForIndex,
  stableCoinSeed,
} from './coinVisuals';

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

  it('uses shared high-metalness, low-roughness finishes', () => {
    Object.values(COIN_FINISH_MATERIALS).forEach(material => {
      expect(material.metalness).toBeGreaterThanOrEqual(0.75);
      expect(material.roughness).toBeGreaterThanOrEqual(0.18);
      expect(material.roughness).toBeLessThanOrEqual(0.28);
    });
  });
});
