import { describe, expect, it } from 'vitest';
import {
  CENTER_PEBBLE_COVERAGE_TARGET,
  CENTER_PEBBLE_COUNT,
  CENTER_TRAIL_COVERAGE_TARGET,
  createCenterPebbleSpecs,
  createCenterTrailSpecs,
  estimateCenterPebbleCoverage,
  estimateCenterTrailCoverage,
  isCenterTrailSpecInOpenField,
} from './centerFieldDecorGenerator';

describe('deterministic center field dressing', () => {
  it('generates a stable sparse pebble layout near the 3% target', () => {
    const first = createCenterPebbleSpecs();
    const second = createCenterPebbleSpecs();
    const coverage = estimateCenterPebbleCoverage(first);

    expect(first).toEqual(second);
    expect(first).toHaveLength(CENTER_PEBBLE_COUNT);
    expect(coverage).toBeGreaterThanOrEqual(CENTER_PEBBLE_COVERAGE_TARGET * 0.7);
    expect(coverage).toBeLessThanOrEqual(CENTER_PEBBLE_COVERAGE_TARGET * 1.35);
  });

  it('generates deterministic multi-direction trails near the 5% target', () => {
    const first = createCenterTrailSpecs();
    const second = createCenterTrailSpecs();
    const coverage = estimateCenterTrailCoverage(first);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.length).toBeLessThanOrEqual(6);
    expect(first.every(spec => isCenterTrailSpecInOpenField(spec))).toBe(true);
    expect(coverage).toBeGreaterThanOrEqual(CENTER_TRAIL_COVERAGE_TARGET * 0.75);
    expect(coverage).toBeLessThanOrEqual(CENTER_TRAIL_COVERAGE_TARGET * 1.25);
    expect(new Set(first.map(spec => spec.rotation.toFixed(2))).size).toBeGreaterThan(2);
  });
});
