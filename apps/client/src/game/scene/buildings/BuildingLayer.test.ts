import { describe, expect, it } from 'vitest';
import { getBuildingPulseScale } from './BuildingLayer';

describe('BuildingLayer feedback pulse', () => {
  it('pops an authoritative building group upward for development increases', () => {
    expect(getBuildingPulseScale(0, 'UP')).toBeCloseTo(1);
    expect(getBuildingPulseScale(0.5, 'UP')).toBeGreaterThan(1);
    expect(getBuildingPulseScale(1, 'UP')).toBeCloseTo(1);
  });

  it('uses a restrained reverse/down pulse for development decreases', () => {
    expect(getBuildingPulseScale(0, 'DOWN')).toBeCloseTo(1);
    expect(getBuildingPulseScale(0.5, 'DOWN')).toBeLessThan(1);
    expect(getBuildingPulseScale(1, 'DOWN')).toBeCloseTo(1);
  });
});
