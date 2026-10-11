import * as THREE from 'three';
import { tileState } from '@monopoly/shared';
import { composeTileSurfaceMatrix } from '../architecture/tileMatrix';
import { getBoardTileLayout } from '../boardLayout';
import { TileMotionController } from '../motion/TileMotionController';
import { describe, expect, it } from 'vitest';
import {
  createTileImpactHighlightMeshBundle,
  getTileImpactHighlightEntries,
  createTileImpactHighlightMaterial,
  getTileImpactHighlightIntensity,
  TILE_LAND_HIGHLIGHT_STRENGTH,
  TILE_STEP_HIGHLIGHT_STRENGTH,
} from './TileImpactHighlightBatch';

describe('tile impact highlight FX', () => {
  it('is exactly neutral at idle and returns to neutral after a completed press', () => {
    expect(getTileImpactHighlightIntensity(0, 'STEP')).toBe(0);
    expect(getTileImpactHighlightIntensity(0, 'LAND')).toBe(0);
    expect(getTileImpactHighlightIntensity(1, 'STEP')).toBe(TILE_STEP_HIGHLIGHT_STRENGTH);
    expect(getTileImpactHighlightIntensity(1, 'LAND')).toBe(TILE_LAND_HIGHLIGHT_STRENGTH);
  });

  it('uses a separate additive, depth-safe material instead of mutating district materials', () => {
    const material = createTileImpactHighlightMaterial();
    expect(material.vertexColors).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
    material.dispose();
  });

  it('renders its transparent DoubleSide plane in a single pass (budget recovery BR-5)', () => {
    const material = createTileImpactHighlightMaterial();
    expect(material.transparent).toBe(true);
    expect(material.forceSinglePass).toBe(true);
    material.dispose();
  });

  it('rebuilds the batch at the current tile press offset and intensity', () => {
    let now = 0;
    const controller = new TileMotionController({ now: () => now });
    controller.press(1, 'LAND', { delayMs: 0, depressDurationMs: 100, reboundDurationMs: 200 });
    now = 15;
    controller.advance();
    const tiles = tileState.map((tile, tileId) => ({ tileId, name: '', tileType: tile.tileType, houses: 0 }));
    const entries = getTileImpactHighlightEntries(tiles);
    const index = entries.findIndex(entry => entry.tileId === 1);
    const entry = entries[index];
    const geometry = new THREE.PlaneGeometry(1, 1);
    const { mesh, material } = createTileImpactHighlightMeshBundle(geometry, entries, controller);
    const actual = new THREE.Matrix4();
    const expected = new THREE.Matrix4();
    const layout = getBoardTileLayout(1)!;
    const color = new THREE.Color();
    mesh.getMatrixAt(index, actual);
    mesh.getColorAt(index, color);
    composeTileSurfaceMatrix(
      layout,
      entry.surfaceSize,
      controller.getTileOffsetY(1),
      expected,
      (entry.surfacePlaneOffset ?? 0) + 0.002,
    );
    expect(actual.elements[13]).toBeCloseTo(expected.elements[13], 6);
    expect(color.r).toBeCloseTo(
      getTileImpactHighlightIntensity(controller.getTilePressIntensity(1), 'LAND'),
      6,
    );
    material.dispose();
    geometry.dispose();
  });
});
