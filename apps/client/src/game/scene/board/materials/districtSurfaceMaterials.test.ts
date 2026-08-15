import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DISTRICT_SURFACE_KEYS,
  getDistrictSurfaceDescriptorByKey,
} from '../architecture/tileVisualRegistry';
import {
  DISTRICT_TEXTURE_SIZE,
  DistrictSurfaceMaterialLibrary,
  generateDistrictSurfaceTextureData,
} from './districtSurfaceMaterials';

function checksum(data: Uint8Array): number {
  let value = 2166136261;
  for (let index = 0; index < data.length; index += 1) {
    value ^= data[index];
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

describe('district surface material library', () => {
  it('generates a distinct textless procedural surface for all eight districts', () => {
    const checksums = DISTRICT_SURFACE_KEYS.map(surfaceKey => {
      const descriptor = getDistrictSurfaceDescriptorByKey(surfaceKey);
      const textureData = generateDistrictSurfaceTextureData(descriptor, 64);
      expect(textureData.albedo).toHaveLength(64 * 64 * 4);
      expect(textureData.bump).toHaveLength(64 * 64);
      return checksum(textureData.albedo) ^ checksum(textureData.bump);
    });

    expect(new Set(checksums).size).toBe(8);
  });

  it('shares one 512-square sRGB/bump pair per material key and disposes safely', async () => {
    const library = new DistrictSurfaceMaterialLibrary(4);
    const albedoTextures = new Set<THREE.Texture>();
    const bumpTextures = new Set<THREE.Texture>();

    DISTRICT_SURFACE_KEYS.forEach(surfaceKey => {
      const descriptor = getDistrictSurfaceDescriptorByKey(surfaceKey);
      const textureSet = library.getTextureSet(surfaceKey);
      const material = library.getMaterial(surfaceKey);
      expect(textureSet.albedo.image.width).toBe(DISTRICT_TEXTURE_SIZE);
      expect(textureSet.albedo.image.height).toBe(DISTRICT_TEXTURE_SIZE);
      expect(textureSet.bump.image.width).toBe(DISTRICT_TEXTURE_SIZE);
      expect(textureSet.bump.image.height).toBe(DISTRICT_TEXTURE_SIZE);
      expect(textureSet.albedo.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(textureSet.bump.colorSpace).toBe(THREE.NoColorSpace);
      expect(textureSet.albedo.anisotropy).toBe(4);
      expect(material.map).toBe(textureSet.albedo);
      expect(material.bumpMap).toBe(textureSet.bump);
      expect(material.bumpScale).toBe(descriptor.bumpScale);
      expect(library.getMaterial(surfaceKey)).toBe(material);
      albedoTextures.add(textureSet.albedo);
      bumpTextures.add(textureSet.bump);
    });

    expect(DISTRICT_SURFACE_KEYS).toHaveLength(8);
    expect(albedoTextures.size).toBe(8);
    expect(bumpTextures.size).toBe(8);

    library.retain();
    library.release();
    library.retain();
    await Promise.resolve();
    expect(library.isDisposed).toBe(false);
    library.release();
    await Promise.resolve();
    expect(library.isDisposed).toBe(true);
  });
});
