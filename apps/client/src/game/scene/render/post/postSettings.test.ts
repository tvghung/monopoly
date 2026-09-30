import { describe, expect, it } from 'vitest';
import {
  POST_AMBIENT_OCCLUSION,
  POST_BLOOM,
  POST_MULTISAMPLING,
  POST_VIGNETTE,
} from './postSettings';

describe('high-tier post chain settings (plan 02 §8.7)', () => {
  it('keeps ambient occlusion inside the specified ranges and half resolution', () => {
    expect(POST_AMBIENT_OCCLUSION.aoRadius).toBeCloseTo(0.8);
    expect(POST_AMBIENT_OCCLUSION.distanceFalloff).toBeCloseTo(0.6);
    expect(POST_AMBIENT_OCCLUSION.intensity).toBeGreaterThanOrEqual(1.2);
    expect(POST_AMBIENT_OCCLUSION.intensity).toBeLessThanOrEqual(2);
    expect(POST_AMBIENT_OCCLUSION.halfRes).toBe(true);
    expect(POST_AMBIENT_OCCLUSION.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps bloom subtle and limited to truly bright highlights', () => {
    expect(POST_BLOOM.mipmapBlur).toBe(true);
    expect(POST_BLOOM.luminanceThreshold).toBeGreaterThanOrEqual(0.9);
    expect(POST_BLOOM.intensity).toBeGreaterThanOrEqual(0.15);
    expect(POST_BLOOM.intensity).toBeLessThanOrEqual(0.3);
  });

  it('keeps the vignette and multisampling at the planned values', () => {
    expect(POST_VIGNETTE).toEqual({ offset: 0.3, darkness: 0.3 });
    expect(POST_MULTISAMPLING).toBe(4);
  });
});
