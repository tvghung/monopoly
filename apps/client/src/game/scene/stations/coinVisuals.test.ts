import { describe, expect, it } from 'vitest';
import {
  COIN_RADIUS,
  COIN_THICKNESS,
  SHARED_COIN_GEOMETRY,
  SHARED_COIN_MATERIAL,
} from './coinVisuals';

describe('shared physical coin asset', () => {
  it('uses the substantial low-poly coin proportions without geometry vertex colors', () => {
    expect(COIN_RADIUS).toBeGreaterThanOrEqual(0.13);
    expect(COIN_RADIUS).toBeLessThanOrEqual(0.15);
    expect(COIN_THICKNESS).toBeGreaterThanOrEqual(0.055);
    expect(COIN_THICKNESS).toBeLessThanOrEqual(0.07);
    expect(SHARED_COIN_GEOMETRY.type).toBe('CylinderGeometry');
    expect(SHARED_COIN_MATERIAL.vertexColors).toBe(false);
  });
});
