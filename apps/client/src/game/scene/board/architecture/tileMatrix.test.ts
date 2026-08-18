import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  getBoardTileLayout,
  getTileSurfaceGeometry,
  getTileSurfaceWorldCorners,
} from '../boardLayout';
import { composeTileSurfaceMatrix } from './tileMatrix';

const REPRESENTATIVE_EDGE_TILE_IDS = [1, 11, 21, 31] as const;
const PLANE_NORMAL = new THREE.Vector3(0, 0, 1);
const PLANE_CORNERS = [
  [-0.5, -0.5, 0],
  [0.5, -0.5, 0],
  [0.5, 0.5, 0],
  [-0.5, 0.5, 0],
] as const;

function sortCorners(corners: readonly THREE.Vector3[]): THREE.Vector3[] {
  const rounded = (value: number) => Math.round(value * 1e6);
  return [...corners].sort((left, right) => (
    rounded(left.x) - rounded(right.x)
      || rounded(left.z) - rounded(right.z)
      || rounded(left.y) - rounded(right.y)
  ));
}

describe('batched tile surface matrices', () => {
  it.each(REPRESENTATIVE_EDGE_TILE_IDS)(
    'keeps tile %i plane normal facing world-up',
    tileId => {
      const layout = getBoardTileLayout(tileId);
      expect(layout).toBeDefined();
      const surface = getTileSurfaceGeometry(layout!);
      const matrix = composeTileSurfaceMatrix(layout!, surface.size);
      const normal = PLANE_NORMAL.clone().applyNormalMatrix(
        new THREE.Matrix3().getNormalMatrix(matrix),
      );

      expect(normal.x).toBeCloseTo(0, 6);
      expect(normal.y).toBeCloseTo(1, 6);
      expect(normal.z).toBeCloseTo(0, 6);
    },
  );

  it.each(REPRESENTATIVE_EDGE_TILE_IDS)(
    'keeps tile %i plane corners inside its canonical footprint',
    tileId => {
      const layout = getBoardTileLayout(tileId);
      expect(layout).toBeDefined();
      const surface = getTileSurfaceGeometry(layout!);
      const matrix = composeTileSurfaceMatrix(layout!, surface.size);
      const actualCorners = sortCorners(PLANE_CORNERS.map(corner => (
        new THREE.Vector3(...corner).applyMatrix4(matrix)
      )));
      const canonicalCorners = sortCorners(getTileSurfaceWorldCorners(tileId)!.map(corner => (
        new THREE.Vector3(...corner)
      )));

      actualCorners.forEach((corner, index) => {
        expect(corner.x).toBeCloseTo(canonicalCorners[index].x, 6);
        expect(corner.y).toBeCloseTo(canonicalCorners[index].y, 6);
        expect(corner.z).toBeCloseTo(canonicalCorners[index].z, 6);
      });

      const worldWidth = Math.max(...actualCorners.map(corner => corner.x))
        - Math.min(...actualCorners.map(corner => corner.x));
      const worldDepth = Math.max(...actualCorners.map(corner => corner.z))
        - Math.min(...actualCorners.map(corner => corner.z));
      const canonicalWidth = Math.max(...canonicalCorners.map(corner => corner.x))
        - Math.min(...canonicalCorners.map(corner => corner.x));
      const canonicalDepth = Math.max(...canonicalCorners.map(corner => corner.z))
        - Math.min(...canonicalCorners.map(corner => corner.z));
      expect(worldWidth).toBeLessThanOrEqual(canonicalWidth + 1e-6);
      expect(worldDepth).toBeLessThanOrEqual(canonicalDepth + 1e-6);
    },
  );
});
