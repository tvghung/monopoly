import { describe, expect, it } from 'vitest';
import { AIRPORT_RUNWAY_INNER_HALF_SIZE } from './airportRunwayGeometry';
import {
  CENTER_ORTHOGONAL_PATH_COVERAGE_TARGET,
  CENTER_ORTHOGONAL_PATH_SEGMENTS,
  areCenterPathSegmentsConnected,
  estimateCenterPathCoverage,
  getCenterPathBounds,
  getCenterPathRotationY,
  isCenterPathSegmentInOpenField,
} from './centerFieldPathLayout';

describe('authored orthogonal center field path', () => {
  it('is one fixed connected route with only horizontal and vertical segments', () => {
    const first = CENTER_ORTHOGONAL_PATH_SEGMENTS;
    const second = CENTER_ORTHOGONAL_PATH_SEGMENTS;

    expect(first).toBe(second);
    expect(first).toHaveLength(5);
    expect(areCenterPathSegmentsConnected(first)).toBe(true);
    expect(first.every(segment => segment.axis === 'x' || segment.axis === 'z')).toBe(true);
    expect(first.every(segment => [0, Math.PI / 2].includes(getCenterPathRotationY(segment)))).toBe(true);
  });

  it('stays inside the open field and covers roughly five percent', () => {
    const coverage = estimateCenterPathCoverage(CENTER_ORTHOGONAL_PATH_SEGMENTS);

    expect(CENTER_ORTHOGONAL_PATH_SEGMENTS.every(segment => (
      isCenterPathSegmentInOpenField(segment)
    ))).toBe(true);
    expect(CENTER_ORTHOGONAL_PATH_SEGMENTS.every(segment => {
      const [minX, minZ, maxX, maxZ] = getCenterPathBounds(segment);
      return minX < maxX && minZ < maxZ;
    })).toBe(true);
    expect(coverage).toBeGreaterThanOrEqual(0.04);
    expect(coverage).toBeLessThanOrEqual(0.06);
    expect(coverage).toBeCloseTo(CENTER_ORTHOGONAL_PATH_COVERAGE_TARGET, 1);
    expect(AIRPORT_RUNWAY_INNER_HALF_SIZE).toBeGreaterThan(5);
  });
});
