import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
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
});
