import { describe, expect, it } from 'vitest';
import { getOrthographicCameraPosition } from '../../camera/cameraMath';
import { OTB_PALETTE } from '../../../../design-system/tokens/palette';
import { LIGHT_RIG, directionTo, type Vec3 } from './lightRigSpec';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Camera basis derived from a lookAt toward the origin with world up +Y.
const cameraPosition = getOrthographicCameraPosition();
const toCamera = directionTo([cameraPosition[0], cameraPosition[1], cameraPosition[2]]);
const SCREEN_RIGHT: Vec3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
const SCREEN_UP_ON_GROUND: Vec3 = [-Math.SQRT1_2, 0, -Math.SQRT1_2];

describe('light rig spec', () => {
  it('puts the key light on the screen left, slightly above, so form is revealed', () => {
    const key = directionTo(LIGHT_RIG.key.position);
    expect(dot(key, SCREEN_RIGHT)).toBeLessThan(-0.3);
    expect(key[1]).toBeGreaterThan(0.6);
    // Lights the +Z face (screen lower-left) and leaves the +X face (screen lower-right) shaded.
    expect(key[2]).toBeGreaterThan(0);
    expect(key[0]).toBeLessThan(0);
  });

  it('is not a camera-side light (that flattens every visible face)', () => {
    const key = directionTo(LIGHT_RIG.key.position);
    expect(dot(key, toCamera)).toBeLessThan(0.5);
  });

  it('puts the rim light behind the board, upper right, for edge separation', () => {
    const rim = directionTo(LIGHT_RIG.rim.position);
    // Away from the camera axis, on the far (screen-up) side and to the screen right.
    expect(dot(rim, toCamera)).toBeLessThan(0.35);
    expect(dot(rim, SCREEN_UP_ON_GROUND)).toBeGreaterThan(0.1);
    expect(dot(rim, SCREEN_RIGHT)).toBeGreaterThan(0);
  });

  it('uses positive intensities, a warm key and a cool rim', () => {
    expect(LIGHT_RIG.key.intensity).toBeGreaterThan(0);
    expect(LIGHT_RIG.fill.intensity).toBeGreaterThan(0);
    expect(LIGHT_RIG.rim.intensity).toBeGreaterThan(0);
    expect(LIGHT_RIG.key.intensity).toBeGreaterThan(LIGHT_RIG.fill.intensity);
    expect(LIGHT_RIG.key.intensity).toBeGreaterThan(LIGHT_RIG.rim.intensity);
    const channel = (hex: string, index: 0 | 1 | 2) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
    expect(channel(LIGHT_RIG.key.color, 0)).toBeGreaterThan(channel(LIGHT_RIG.key.color, 2));
    expect(channel(LIGHT_RIG.rim.color, 2)).toBeGreaterThan(channel(LIGHT_RIG.rim.color, 0));
  });

  it('bounces the light oak table color as the fill ground color', () => {
    expect(LIGHT_RIG.fill.groundColor).toBe(OTB_PALETTE['table-oak']);
  });

  it('keeps the shadow camera large enough for the board and the stations', () => {
    expect(LIGHT_RIG.key.shadow.halfExtent).toBeGreaterThanOrEqual(14);
    expect(LIGHT_RIG.key.shadow.far).toBeGreaterThan(Math.hypot(...LIGHT_RIG.key.position));
    expect(LIGHT_RIG.key.shadow.bias).toBeLessThan(0);
  });
});
