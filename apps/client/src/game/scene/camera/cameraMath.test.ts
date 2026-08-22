import { describe, expect, it } from 'vitest';
import {
  BOARD_FIT_CORNERS,
  CAMERA_FORWARD,
  CAMERA_RIGHT,
  CAMERA_UP,
  CAMERA_DIRECTION,
  calculateBoundingSphereCameraDistance,
  calculateCameraDistance,
  calculateOrthographicHalfHeight,
  DEFAULT_CAMERA_FOV,
  getCameraPosition,
  getOrthographicCameraPosition,
  ORTHOGRAPHIC_CAMERA_DISTANCE,
  SCENE_FIT_POINTS,
} from './cameraMath';

describe('fixed board camera math', () => {
  it('keeps the camera direction normalized and fixed', () => {
    expect(Math.hypot(...CAMERA_DIRECTION)).toBeCloseTo(1);
    expect(CAMERA_DIRECTION[0]).toBeGreaterThan(0);
    expect(CAMERA_DIRECTION[1]).toBeGreaterThan(CAMERA_DIRECTION[0]);
    expect(CAMERA_DIRECTION[2]).toBeGreaterThan(0);
  });

  it('frames a wide board farther on a narrow viewport', () => {
    const narrow = calculateCameraDistance(0.75);
    const wide = calculateCameraDistance(1.8);
    expect(narrow).toBeGreaterThan(wide);
    expect(calculateCameraDistance(0)).toBeCloseTo(calculateCameraDistance(1));
  });

  it('returns a position on the fixed direction vector', () => {
    const position = getCameraPosition(1.5);
    const distance = calculateCameraDistance(1.5);
    position.forEach((component, index) => {
      expect(component / distance).toBeCloseTo(CAMERA_DIRECTION[index], 10);
    });
  });

  it('uses projected board corners and stays closer than the old sphere fit', () => {
    const projected = calculateCameraDistance(16 / 9);
    const sphere = calculateBoundingSphereCameraDistance(16 / 9);
    expect(projected).toBeLessThan(sphere);
    expect(BOARD_FIT_CORNERS).toHaveLength(8);
  });

  it('keeps the full board inside the fixed frame across supported viewport sizes', () => {
    const viewports = [
      [1280, 720],
      [1366, 768],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
    ] as const;

    viewports.forEach(([width, height]) => {
      const aspect = (width - 24 - 288 - 12) / (height - 24);
      const distance = calculateCameraDistance(aspect);
      expect(Number.isFinite(distance)).toBe(true);
      expect(getCameraPosition(aspect)).toHaveLength(3);

      const verticalLimit = Math.tan((DEFAULT_CAMERA_FOV * Math.PI / 180) / 2);
      const horizontalFov = 2 * Math.atan(
        Math.tan((DEFAULT_CAMERA_FOV * Math.PI / 180) / 2) * aspect,
      );
      const horizontalLimit = Math.tan(horizontalFov / 2);
      SCENE_FIT_POINTS.forEach(corner => {
        const depth = distance + corner[0] * CAMERA_FORWARD[0]
          + corner[1] * CAMERA_FORWARD[1]
          + corner[2] * CAMERA_FORWARD[2];
        const horizontal = Math.abs(corner[0] * CAMERA_RIGHT[0]
          + corner[1] * CAMERA_RIGHT[1]
          + corner[2] * CAMERA_RIGHT[2]);
        const vertical = Math.abs(corner[0] * CAMERA_UP[0]
          + corner[1] * CAMERA_UP[1]
          + corner[2] * CAMERA_UP[2]);
        expect(depth).toBeGreaterThan(0);
        expect(horizontal / depth).toBeLessThan(horizontalLimit);
        expect(vertical / depth).toBeLessThan(verticalLimit);
      });
    });
  });

  it('fits every projected corner inside the fixed orthographic frame', () => {
    [0.75, 1, 16 / 9, 2].forEach(aspect => {
      const halfHeight = calculateOrthographicHalfHeight(aspect);
      const halfWidth = halfHeight * aspect;
      SCENE_FIT_POINTS.forEach(corner => {
        const horizontal = Math.abs(corner[0] * CAMERA_RIGHT[0]
          + corner[1] * CAMERA_RIGHT[1]
          + corner[2] * CAMERA_RIGHT[2]);
        const vertical = Math.abs(corner[0] * CAMERA_UP[0]
          + corner[1] * CAMERA_UP[1]
          + corner[2] * CAMERA_UP[2]);
        expect(horizontal).toBeLessThan(halfWidth);
        expect(vertical).toBeLessThan(halfHeight);
      });
    });
    expect(Math.hypot(...getOrthographicCameraPosition()))
      .toBeCloseTo(ORTHOGRAPHIC_CAMERA_DISTANCE);
  });
});
