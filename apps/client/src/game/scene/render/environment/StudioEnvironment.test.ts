import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { kitGlassMaterial } from '../../buildings/kit/kitMaterials';
import { COIN_FINISH_MATERIALS } from '../../stations/coinVisuals';
import { applyStudioEnvironment, setStudioEnvironmentTier } from './StudioEnvironment';

const scene = new THREE.Scene();

afterEach(() => {
  applyStudioEnvironment(scene, null, 1);
});

describe('studio environment tier policy', () => {
  it('keeps glossy glass and coins reflected on Balanced without lighting every matte board pixel', () => {
    const texture = new THREE.Texture();
    applyStudioEnvironment(scene, texture, 0.7, 'balanced');

    expect(scene.environment).toBeNull();
    expect(kitGlassMaterial.envMap).toBe(texture);
    expect(kitGlassMaterial.envMapIntensity).toBe(0.7);
    for (const material of Object.values(COIN_FINISH_MATERIALS)) expect(material.envMap).toBe(texture);

    applyStudioEnvironment(scene, texture, 0.8, 'high');
    expect(scene.environment).toBe(texture);

    setStudioEnvironmentTier(scene, texture, 'balanced', 0.6);
    expect(scene.environment).toBeNull();
    expect(kitGlassMaterial.envMapIntensity).toBe(0.6);
    expect(kitGlassMaterial.envMap).toBe(texture);
    setStudioEnvironmentTier(scene, texture, 'high', 0.8);
    expect(scene.environment).toBe(texture);
  });
});
