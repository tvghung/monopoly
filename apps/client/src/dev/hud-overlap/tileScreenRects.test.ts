import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getOrthographicCameraPosition, ORTHOGRAPHIC_READABILITY_ZOOM, calculateOrthographicHalfHeight } from '../../game/scene/camera/cameraMath';
import { polygonArea } from './polygonOverlap';
import { projectTileScreenRects } from './tileScreenRects';

function fixedCamera(width: number, height: number): THREE.OrthographicCamera {
  const aspect = width / height;
  const halfHeight = calculateOrthographicHalfHeight(aspect);
  const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 0.1, 100);
  camera.zoom = ORTHOGRAPHIC_READABILITY_ZOOM;
  camera.position.set(...getOrthographicCameraPosition());
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

describe('projectTileScreenRects', () => {
  const canvas = { left: 0, top: 0, width: 1440, height: 900 };

  it('projects all 40 tiles inside the canvas as non-degenerate quads', () => {
    const rects = projectTileScreenRects(fixedCamera(1440, 900), canvas);
    expect(rects).toHaveLength(40);
    expect(new Set(rects.map(rect => rect.tileId)).size).toBe(40);
    rects.forEach(rect => {
      expect(polygonArea(rect.corners)).toBeGreaterThan(50);
      rect.corners.forEach(point => {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(canvas.width);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(canvas.height);
      });
    });
  });

  it('shifts every point by the canvas offset', () => {
    const camera = fixedCamera(1440, 900);
    const base = projectTileScreenRects(camera, canvas);
    const moved = projectTileScreenRects(camera, { ...canvas, left: 100, top: 40 });
    expect(moved[7].corners[2].x - base[7].corners[2].x).toBeCloseTo(100);
    expect(moved[7].corners[2].y - base[7].corners[2].y).toBeCloseTo(40);
  });

  it('places the board diamond around the screen center with the Parking corner on top', () => {
    const rects = projectTileScreenRects(fixedCamera(1440, 900), canvas);
    const centerOf = (tileId: number) => {
      const points = rects[tileId].corners;
      return { x: points.reduce((sum, p) => sum + p.x, 0) / 4, y: points.reduce((sum, p) => sum + p.y, 0) / 4 };
    };
    expect(centerOf(20).y).toBeLessThan(centerOf(0).y);
    expect(Math.abs(centerOf(20).x - 720)).toBeLessThan(40);
    expect(Math.abs(centerOf(0).x - 720)).toBeLessThan(40);
  });
});
