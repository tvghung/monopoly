import { afterEach, describe, expect, it } from 'vitest';
import type { BoardTileRenderModel } from '../board/boardRenderModel';
import { getLandmarkLocalOrigin } from './LandmarkMesh';
import * as THREE from 'three';
import { SHADOW_ONLY_LAYER } from '../render/shadowLayers';
import { buildLandmarkShadowGeometry, createLandmarkShadowMesh, getVisibleLandmarkTiles } from './LandmarkShadowProxy';
import { measureGeometry, triangleCount } from './kit/lowPolyKit';
import { getLandmarkGeometry, resetLandmarkCacheForTests } from './landmarks/registry';
import { PLINTH } from './landmarks/limits';
import { TUBE_HOUSE_BASE_Y } from './tubeHouseLayout';
import { getBoardTileLayout } from '../board/boardLayout';

afterEach(resetLandmarkCacheForTests);

function tile(tileId: number, houses: number): BoardTileRenderModel {
  return { tileId, name: `Tile ${tileId}`, tileType: 'normal', price: 100, propertyColor: 'brown', houses };
}

describe('landmark shadow proxy', () => {
  it('lists the tiles that show a landmark: hotel tier and a built landmark, in tile order', () => {
    const tiles = [tile(39, 5), tile(13, 5), tile(24, 4), tile(1, 5), tile(6, 0)];
    // 24 has only four houses; 1 is at the hotel tier but has no landmark yet.
    expect(getVisibleLandmarkTiles(tiles)).toEqual([13, 39]);
    expect(getVisibleLandmarkTiles([])).toEqual([]);
  });

  it('leaves out a landmark that is still popping in, until its transition is over', () => {
    const tiles = [tile(13, 5), tile(39, 5)];
    expect(getVisibleLandmarkTiles(tiles, new Set([13]))).toEqual([39]);
    expect(getVisibleLandmarkTiles(tiles, new Set([13, 39]))).toEqual([]);
  });

  it('puts the proxy on the shadow-only layer: the key light sees it and the main camera never does', () => {
    const geometry = buildLandmarkShadowGeometry([13]);
    if (!geometry) throw new Error('expected a proxy');
    const mesh = createLandmarkShadowMesh(geometry);
    expect(mesh.castShadow).toBe(true);
    const main = new THREE.OrthographicCamera();
    expect(mesh.layers.test(main.layers)).toBe(false);
    const shadowCamera = new THREE.OrthographicCamera();
    shadowCamera.layers.enable(SHADOW_ONLY_LAYER);
    expect(mesh.layers.test(shadowCamera.layers)).toBe(true);
  });

  it('builds nothing when no landmark is visible', () => {
    expect(buildLandmarkShadowGeometry([])).toBeNull();
    expect(buildLandmarkShadowGeometry([1, 999])).toBeNull();
  });

  it('merges the opaque and glass shapes of every visible landmark in world space', () => {
    const geometry = buildLandmarkShadowGeometry([13, 39]);
    if (!geometry) throw new Error('expected a proxy');
    const expected = [13, 39].reduce((sum, tileId) => {
      const landmark = getLandmarkGeometry(tileId);
      if (!landmark) throw new Error('missing landmark');
      return sum + triangleCount(landmark.opaque) + (landmark.glass ? triangleCount(landmark.glass) : 0);
    }, 0);
    expect(triangleCount(geometry)).toBe(expected);

    // Each landmark lands on its own tile: the proxy spans both tiles.
    const { min, max } = measureGeometry(geometry);
    for (const tileId of [13, 39]) {
      const layout = getBoardTileLayout(tileId);
      const origin = getLandmarkLocalOrigin(tileId);
      if (!layout || !origin) throw new Error('missing layout');
      expect(layout.position[0]).toBeGreaterThanOrEqual(min[0] - 2);
      expect(layout.position[0]).toBeLessThanOrEqual(max[0] + 2);
      expect(layout.position[2]).toBeGreaterThanOrEqual(min[2] - 2);
      expect(layout.position[2]).toBeLessThanOrEqual(max[2] + 2);
    }
    // The plinth bottom sits on the tile surface: nothing is below it, and the landmark rises above the plinth top.
    expect(min[1]).toBeCloseTo(TUBE_HOUSE_BASE_Y, 3);
    expect(max[1]).toBeGreaterThan(TUBE_HOUSE_BASE_Y + PLINTH.height + 1);
  });

  it('leaves the cached landmark geometry untouched when it merges clones', () => {
    const before = Array.from(getLandmarkGeometry(13)?.opaque.getAttribute('position').array ?? []);
    buildLandmarkShadowGeometry([13]);
    expect(Array.from(getLandmarkGeometry(13)?.opaque.getAttribute('position').array ?? [])).toEqual(before);
  });
});
