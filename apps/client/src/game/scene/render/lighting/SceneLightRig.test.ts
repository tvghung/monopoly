import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { dropShadowMap } from './SceneLightRig';

describe('dropShadowMap', () => {
  it('disposes the allocated shadow map and clears it, so the renderer allocates a new one at the new size', () => {
    const light = new THREE.DirectionalLight();
    const dispose = vi.fn();
    light.shadow.map = { dispose } as unknown as THREE.WebGLRenderTarget;

    expect(dropShadowMap(light)).toBe(true);

    expect(dispose).toHaveBeenCalledOnce();
    expect(light.shadow.map).toBeNull();
  });

  it('does nothing before the first frame allocated a map, and without a light', () => {
    expect(dropShadowMap(new THREE.DirectionalLight())).toBe(false);
    expect(dropShadowMap(null)).toBe(false);
  });
});
