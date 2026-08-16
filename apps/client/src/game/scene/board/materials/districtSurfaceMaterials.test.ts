import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DISTRICT_SURFACE_KEYS,
  getDistrictSurfaceDescriptorByKey,
} from '../architecture/tileVisualRegistry';
import { boardVisualTokens } from '../boardVisualTokens';
import {
  BEACH_PRIMARY_WAVE_AMPLITUDE,
  BEACH_SECONDARY_WAVE_AMPLITUDE,
  DISTRICT_TEXTURE_SIZE,
  DistrictSurfaceMaterialLibrary,
  getBeachShoreline,
  generateDistrictSurfaceTextureData,
} from './districtSurfaceMaterials';
import {
  WHITE_PEBBLE_TEXTURE_SIZE,
  WHITE_PEBBLE_VARIANTS,
} from './whitePebbleSurface';

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

  it('includes a light water region in the beach district surface', () => {
    const descriptor = getDistrictSurfaceDescriptorByKey('sandstoneTerrazzo');
    const textureData = generateDistrictSurfaceTextureData(descriptor, 64);
    let waterLikePixels = 0;
    for (let index = 0; index < textureData.albedo.length; index += 4) {
      const red = textureData.albedo[index];
      const green = textureData.albedo[index + 1];
      const blue = textureData.albedo[index + 2];
      if (blue > red + 8 && green > red - 4) waterLikePixels += 1;
    }
    expect(waterLikePixels).toBeGreaterThan(64);
  });

  it('uses the near-black divider token for the shared 60/40 separator', () => {
    const library = new DistrictSurfaceMaterialLibrary(1);
    expect(boardVisualTokens.tileDivider).toBe('#111318');
    expect(library.dividerMaterial.color.getHexString()).toBe('111318');
    expect(library.dividerMaterial.polygonOffset).toBe(true);
    expect(library.dividerMaterial.polygonOffsetFactor).toBe(-1);
    expect(library.dividerMaterial.polygonOffsetUnits).toBe(-1);
    library.dispose();
  });

  it('provides four shared true-white pebble material variants', () => {
    const library = new DistrictSurfaceMaterialLibrary(2);
    WHITE_PEBBLE_VARIANTS.forEach(variant => {
      const textureSet = library.getWhitePebbleTextureSet(variant);
      const material = library.getWhitePebbleMaterial(variant);
      expect(material.color.getHexString()).toBe('ffffff');
      expect(textureSet.albedo.image.width).toBe(WHITE_PEBBLE_TEXTURE_SIZE);
      expect(textureSet.albedo.image.height).toBe(WHITE_PEBBLE_TEXTURE_SIZE);
      expect(textureSet.bump.image.width).toBe(WHITE_PEBBLE_TEXTURE_SIZE);
      expect(textureSet.bump.image.height).toBe(WHITE_PEBBLE_TEXTURE_SIZE);
      expect(material.map).toBe(textureSet.albedo);
      expect(material.bumpMap).toBe(textureSet.bump);
      expect(material.bumpScale).toBeCloseTo(0.006);
    });
    library.dispose();
  });

  it('uses a visibly undulating shoreline with a secondary wave contour', () => {
    const shorelineSamples = Array.from({ length: 32 }, (_, index) => getBeachShoreline(index / 32));
    expect(Math.max(...shorelineSamples) - Math.min(...shorelineSamples)).toBeGreaterThan(0.09);
    expect(BEACH_PRIMARY_WAVE_AMPLITUDE).toBeGreaterThan(0.05);
    expect(BEACH_SECONDARY_WAVE_AMPLITUDE).toBeGreaterThan(0.015);
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
