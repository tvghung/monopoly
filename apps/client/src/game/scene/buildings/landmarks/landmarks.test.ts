import { colorGroups, tileState } from '@monopoly/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { measureGeometry, triangleCount } from '../kit/lowPolyKit';
import { recolorRim } from './assemble';
import { LANDMARK_LIMITS, PLINTH } from './limits';
import { LANDMARKS, LANDMARK_PLAN, getLandmarkDefinition, getLandmarkGeometry, resetLandmarkCacheForTests } from './registry';

const STREETS = Object.values(colorGroups).flat();

afterEach(resetLandmarkCacheForTests);

describe('landmark plan', () => {
  it('names exactly the 22 streets once each, in tile order', () => {
    expect(LANDMARK_PLAN.map(entry => entry.tileId)).toEqual([...STREETS].sort((a, b) => a - b));
    expect(new Set(LANDMARK_PLAN.map(entry => entry.slug)).size).toBe(22);
    expect(new Set(LANDMARK_PLAN.map(entry => entry.name)).size).toBe(22);
  });

  it('puts a landmark on a street tile of the canonical board', () => {
    for (const entry of LANDMARK_PLAN) {
      const tile = tileState[entry.tileId];
      expect(tile.tileType, entry.name).toBe('normal');
      expect(tile.price, entry.name).toBeGreaterThan(0);
    }
  });

  it('keeps every height class and limit inside the program limits', () => {
    for (const entry of LANDMARK_PLAN) {
      const limit = entry.heightClass === 'slim' ? LANDMARK_LIMITS.maxSlimHeight : LANDMARK_LIMITS.maxStandardHeight;
      expect(entry.maxHeight, entry.name).toBeLessThanOrEqual(limit);
    }
  });
});

describe('built landmarks', () => {
  it('lists only planned landmarks, once each', () => {
    const ids = LANDMARKS.map(landmark => landmark.tileId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const landmark of LANDMARKS) {
      const planned = LANDMARK_PLAN.find(entry => entry.tileId === landmark.tileId);
      expect(planned, landmark.slug).toBeDefined();
      expect(landmark.name).toBe(planned?.name);
    }
  });

  it.each(LANDMARKS.map(landmark => [landmark.slug, landmark.tileId] as const))('%s stays inside its budgets', (_slug, tileId) => {
    const definition = getLandmarkDefinition(tileId);
    const geometry = getLandmarkGeometry(tileId);
    if (!definition || !geometry) throw new Error('missing landmark');
    expect(geometry.triangles).toBeLessThanOrEqual(LANDMARK_LIMITS.maxTriangles);
    const draws = 1 + (geometry.glass ? 1 : 0) + (geometry.emissive ? 1 : 0);
    expect(draws).toBeLessThanOrEqual(LANDMARK_LIMITS.maxDraws);
    expect(geometry.footprint[0]).toBeLessThanOrEqual(LANDMARK_LIMITS.maxFootprint);
    expect(geometry.footprint[1]).toBeLessThanOrEqual(LANDMARK_LIMITS.maxFootprint);
    const heightLimit = Math.min(
      definition.maxHeight,
      definition.heightClass === 'slim' ? LANDMARK_LIMITS.maxSlimHeight : LANDMARK_LIMITS.maxStandardHeight,
    );
    expect(geometry.height).toBeLessThanOrEqual(heightLimit);
    expect(geometry.height).toBeGreaterThan(0.3);
  });

  it.each(LANDMARKS.map(landmark => [landmark.slug, landmark.tileId] as const))('%s is a vertex-colored, faceted, deterministic part', (_slug, tileId) => {
    const definition = getLandmarkDefinition(tileId);
    if (!definition) throw new Error('missing landmark');
    const first = definition.build();
    const second = definition.build();
    for (const key of ['opaque', 'glass', 'emissive'] as const) {
      const one = first[key];
      const two = second[key];
      expect(Boolean(one), key).toBe(Boolean(two));
      if (!one || !two) continue;
      expect(Object.keys(one.attributes).sort()).toEqual(['color', 'normal', 'position']);
      expect(one.getIndex()).toBeNull();
      expect(Array.from(one.getAttribute('position').array)).toEqual(Array.from(two.getAttribute('position').array));
    }
    expect(first.triangles).toBe(second.triangles);
  });

  it('is built once and cached', () => {
    expect(getLandmarkGeometry(13)).toBe(getLandmarkGeometry(13));
    expect(getLandmarkGeometry(1)).toBeUndefined();
  });

  it('puts the plinth below the landmark, wider than it, with the rim first', () => {
    const geometry = getLandmarkGeometry(13);
    if (!geometry) throw new Error('missing landmark');
    const { min, size } = measureGeometry(geometry.opaque);
    expect(min[1]).toBeCloseTo(-PLINTH.height);
    expect(Math.max(size[0], size[2])).toBeCloseTo(PLINTH.size);
    expect(geometry.rimVertexCount).toBeGreaterThan(0);
    expect(geometry.rimVertexCount).toBeLessThan(geometry.opaque.getAttribute('position').count);
    expect(triangleCount(geometry.opaque)).toBeGreaterThan(0);
  });

  it('recolors only the rim vertices when the owner changes', () => {
    const geometry = getLandmarkGeometry(24);
    if (!geometry) throw new Error('missing landmark');
    const copy = geometry.opaque.clone();
    const before = Array.from(copy.getAttribute('color').array);
    recolorRim(copy, geometry.rimVertexCount, '#ff0000');
    const after = Array.from(copy.getAttribute('color').array);
    const rimValues = geometry.rimVertexCount * 3;
    expect(after.slice(0, rimValues).every((value, index) => value === (index % 3 === 0 ? 1 : 0))).toBe(true);
    expect(after.slice(rimValues)).toEqual(before.slice(rimValues));
  });
});
