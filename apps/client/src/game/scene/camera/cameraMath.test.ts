import { describe, expect, it } from 'vitest';
import {
  CAMERA_DIRECTION,
  calculateCameraDistance,
  getCameraPosition,
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

  it('keeps the full board inside the fixed frame across supported viewport sizes', () => {
    const viewports = [
      [1280, 720],
      [1366, 768],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
    ] as const;
    const previousPhaseTwoDistance = calculateCameraDistance(16 / 9, {
      fov: 34,
      framingMargin: 1.12,
    });

    viewports.forEach(([width, height]) => {
      const aspect = width / height;
      const distance = calculateCameraDistance(aspect);
      expect(Number.isFinite(distance)).toBe(true);
      expect(getCameraPosition(aspect)).toHaveLength(3);
    });
    expect(calculateCameraDistance(16 / 9)).toBeLessThan(previousPhaseTwoDistance);
  });
});
