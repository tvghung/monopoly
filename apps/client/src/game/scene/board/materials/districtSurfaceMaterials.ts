import * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import {
  DISTRICT_SURFACE_KEYS,
  getDistrictSurfaceDescriptorByKey,
  type DistrictSurfaceDescriptor,
  type DistrictSurfaceKey,
} from '../architecture/tileVisualRegistry';
import { boardMaterialSpecs } from './boardMaterialSpecs';
import {
  WHITE_PEBBLE_TEXTURE_SIZE,
  WHITE_PEBBLE_VARIANTS,
  generateWhitePebbleTextureData,
  type WhitePebbleVariant,
} from './whitePebbleSurface';

export const DISTRICT_TEXTURE_SIZE = 512;
const PROCEDURAL_SAMPLE_SIZE = 128;

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface PatternSample {
  blend: number;
  bump: number;
  colorRole: 'base' | 'secondary' | 'grout' | 'water' | 'foam';
}

export interface DistrictSurfaceTextureData {
  albedo: Uint8Array;
  bump: Uint8Array;
}

export interface DistrictSurfaceTextureSet {
  albedo: THREE.DataTexture;
  bump: THREE.DataTexture;
}

function parseHexColor(value: string): RgbColor {
  const hex = value.replace('#', '');
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function mixColor(left: RgbColor, right: RgbColor, amount: number): RgbColor {
  const clampedAmount = Math.max(0, Math.min(1, amount));
  return {
    r: Math.round(left.r + (right.r - left.r) * clampedAmount),
    g: Math.round(left.g + (right.g - left.g) * clampedAmount),
    b: Math.round(left.b + (right.b - left.b) * clampedAmount),
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const BEACH_PRIMARY_WAVE_AMPLITUDE = 0.055;
export const BEACH_SECONDARY_WAVE_AMPLITUDE = 0.018;

export function getBeachShoreline(u: number): number {
  return 0.22
    + Math.sin(u * Math.PI * 2.4 - 0.35) * BEACH_PRIMARY_WAVE_AMPLITUDE
    + Math.sin(u * Math.PI * 7.4 + 0.8) * BEACH_SECONDARY_WAVE_AMPLITUDE;
}

function noise2d(x: number, y: number, seed: number): number {
  let value = Math.imul(x + seed, 374761393) ^ Math.imul(y - seed, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function cellSample(
  u: number,
  v: number,
  columns: number,
  rows: number,
  stagger: boolean,
  seed: number,
): { fx: number; fy: number; variation: number } {
  const row = Math.floor(v * rows);
  const shiftedU = u * columns + (stagger && row % 2 !== 0 ? 0.5 : 0);
  const column = Math.floor(shiftedU);
  return {
    fx: shiftedU - column,
    fy: v * rows - row,
    variation: noise2d(column, row, seed),
  };
}

function samplePattern(
  descriptor: DistrictSurfaceDescriptor,
  u: number,
  v: number,
  x: number,
  y: number,
  seed: number,
): PatternSample {
  const tuning = descriptor.patternTuning;
  const scale = Math.max(2, descriptor.patternScale / tuning.spacing);
  const seamWidth = tuning.seamWidth;
  const density = tuning.patternDensity;
  const pixelNoise = noise2d(x, y, seed);

  switch (descriptor.pattern) {
    case 'cobble': {
      const cell = cellSample(u, v, scale, scale * 0.72, true, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      return edge < seamWidth * 2
        ? { blend: 0, bump: 64, colorRole: 'grout' }
        : { blend: 0.18 + cell.variation * 0.18 * density, bump: 150 + cell.variation * 32, colorRole: 'base' };
    }
    case 'ceramic': {
      const cell = cellSample(u, v, scale, scale * 1.28, false, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      return edge < seamWidth * 1.25
        ? { blend: 0, bump: 78, colorRole: 'grout' }
        : { blend: 0.2 + Math.sin((u + v) * Math.PI * 2) * 0.025, bump: 175, colorRole: 'base' };
    }
    case 'granite': {
      const vein = Math.abs(Math.sin((u * 0.8 + v * 1.6) * Math.PI * scale)) > 0.996 - density * 0.008;
      if (vein) return { blend: 0, bump: 112, colorRole: 'grout' };
      if (pixelNoise > 0.985 - density * 0.02) return { blend: 0.72, bump: 195, colorRole: 'secondary' };
      return { blend: 0.2 + pixelNoise * 0.1 * density, bump: 150 + pixelNoise * 18, colorRole: 'base' };
    }
    case 'brick': {
      const cell = cellSample(u, v, scale, scale * 1.55, true, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      return edge < seamWidth * 1.6
        ? { blend: 0, bump: 62, colorRole: 'grout' }
        : { blend: 0.16 + cell.variation * 0.16 * density, bump: 152 + cell.variation * 28, colorRole: 'base' };
    }
    case 'concrete': {
      const expansionJoint = Math.abs(u - 0.5) < seamWidth * 0.8 || Math.abs(v - 0.5) < seamWidth * 0.8;
      if (expansionJoint) return { blend: 0, bump: 76, colorRole: 'grout' };
      if (pixelNoise > 0.99 - density * 0.018) return { blend: 0.34, bump: 125, colorRole: 'grout' };
      return { blend: 0.2 + pixelNoise * 0.1 * density, bump: 146 + pixelNoise * 22, colorRole: 'base' };
    }
    case 'terrazzo': {
      const seam = Math.abs(u - 0.5) < seamWidth * 0.55 || Math.abs(v - 0.5) < seamWidth * 0.55;
      if (seam) return { blend: 0, bump: 96, colorRole: 'grout' };
      const fleckNoise = noise2d(Math.floor(x / 3), Math.floor(y / 3), seed);
      if (fleckNoise > 0.98 - density * 0.08) return { blend: 0.68, bump: 188, colorRole: 'secondary' };
      if (fleckNoise < 0.025) return { blend: 0, bump: 132, colorRole: 'grout' };
      return { blend: 0.2 + pixelNoise * 0.06 * density, bump: 158, colorRole: 'base' };
    }
    case 'beach': {
      const shoreline = getBeachShoreline(u);
      const foamWidth = Math.max(seamWidth * 2.4, 0.034);
      if (v < shoreline - foamWidth) return { blend: 0, bump: 136, colorRole: 'water' };
      if (Math.abs(v - shoreline) < foamWidth) {
        return { blend: 0.8, bump: 188, colorRole: 'foam' };
      }
      const outerWave = shoreline + 0.075 + Math.sin(u * Math.PI * 5.2) * 0.012;
      if (Math.abs(v - outerWave) < seamWidth * 0.82) {
        return { blend: 0, bump: 172, colorRole: 'water' };
      }
      return { blend: 0.16 + pixelNoise * 0.08 * density, bump: 138, colorRole: 'base' };
    }
    case 'slate': {
      const cell = cellSample(u, v, scale * 0.72, scale * 1.4, true, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      if (edge < seamWidth * 1.35) return { blend: 0, bump: 69, colorRole: 'grout' };
      const striation = (Math.sin(v * Math.PI * scale * 5) + 1) * 0.025;
      return { blend: 0.18 + cell.variation * 0.12 * density + striation, bump: 150 + striation * 180, colorRole: 'base' };
    }
    case 'slab': {
      const cell = cellSample(u, v, Math.max(2, scale * 0.55), scale, true, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      if (edge < seamWidth * 1.1) return { blend: 0, bump: 82, colorRole: 'grout' };
      const vein = (Math.sin((u * 2.4 + v * 0.55) * Math.PI * scale) + 1) * 0.025;
      return { blend: 0.2 + cell.variation * 0.1 * density + vein, bump: 155 + vein * 170, colorRole: 'base' };
    }
    case 'paver': {
      const cell = cellSample(u, v, Math.max(2, scale * 0.72), scale * 1.1, true, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      if (edge < seamWidth * 1.15) return { blend: 0, bump: 88, colorRole: 'grout' };
      return { blend: 0.22 + cell.variation * 0.08 * density, bump: 148 + cell.variation * 20, colorRole: 'base' };
    }
  }
}

export function generateDistrictSurfaceTextureData(
  descriptor: DistrictSurfaceDescriptor,
  size = DISTRICT_TEXTURE_SIZE,
): DistrictSurfaceTextureData {
  const albedo = new Uint8Array(size * size * 4);
  const bump = new Uint8Array(size * size);
  const baseColor = parseHexColor(descriptor.baseColor);
  const secondaryColor = parseHexColor(descriptor.secondaryColor);
  const groutColor = parseHexColor(descriptor.groutColor);
  const waterColor = parseHexColor(descriptor.waterColor ?? descriptor.secondaryColor);
  const foamColor = mixColor(secondaryColor, { r: 255, g: 255, b: 248 }, 0.42);
  const seed = hashString(`${descriptor.surfaceKey}:${descriptor.pattern}:${descriptor.emblem}`);
  const sampleSize = Math.min(size, PROCEDURAL_SAMPLE_SIZE);

  for (let sampleY = 0; sampleY < sampleSize; sampleY += 1) {
    const v = (sampleY + 0.5) / sampleSize;
    const pixelYStart = Math.floor(sampleY * size / sampleSize);
    const pixelYEnd = Math.floor((sampleY + 1) * size / sampleSize);
    for (let sampleX = 0; sampleX < sampleSize; sampleX += 1) {
      const u = (sampleX + 0.5) / sampleSize;
      const pixelXStart = Math.floor(sampleX * size / sampleSize);
      const pixelXEnd = Math.floor((sampleX + 1) * size / sampleSize);
      const sample = samplePattern(descriptor, u, v, sampleX, sampleY, seed);
      let color = sample.colorRole === 'water'
        ? waterColor
        : sample.colorRole === 'foam'
          ? foamColor
        : sample.colorRole === 'grout'
          ? mixColor(baseColor, groutColor, descriptor.patternTuning.contrast)
          : sample.colorRole === 'secondary'
            ? mixColor(baseColor, secondaryColor, descriptor.patternTuning.contrast)
            : mixColor(
              baseColor,
              secondaryColor,
              0.5 + (sample.blend - 0.5) * descriptor.patternTuning.contrast,
            );
      let bumpValue = sample.bump;

      const isTextQuietZone = u > 0.08 && u < 0.92 && v > 0.28 && v < 0.72;
      if (isTextQuietZone) {
        color = mixColor(color, baseColor, 0.38);
        bumpValue = bumpValue * 0.45 + 96;
      }

      const clampedBump = Math.max(0, Math.min(255, Math.round(bumpValue)));
      for (let pixelY = pixelYStart; pixelY < pixelYEnd; pixelY += 1) {
        for (let pixelX = pixelXStart; pixelX < pixelXEnd; pixelX += 1) {
          const pixelIndex = pixelY * size + pixelX;
          const colorIndex = pixelIndex * 4;
          albedo[colorIndex] = color.r;
          albedo[colorIndex + 1] = color.g;
          albedo[colorIndex + 2] = color.b;
          albedo[colorIndex + 3] = 255;
          bump[pixelIndex] = clampedBump;
        }
      }
    }
  }

  return { albedo, bump };
}

function createTextureSet(
  descriptor: DistrictSurfaceDescriptor,
  anisotropy: number,
): DistrictSurfaceTextureSet {
  const data = generateDistrictSurfaceTextureData(descriptor);
  const albedo = new THREE.DataTexture(
    data.albedo,
    DISTRICT_TEXTURE_SIZE,
    DISTRICT_TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  albedo.name = `DistrictAlbedo:${descriptor.surfaceKey}`;
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.ClampToEdgeWrapping;
  albedo.wrapT = THREE.ClampToEdgeWrapping;
  albedo.magFilter = THREE.LinearFilter;
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.generateMipmaps = true;
  albedo.anisotropy = anisotropy;
  albedo.needsUpdate = true;

  const bump = new THREE.DataTexture(
    data.bump,
    DISTRICT_TEXTURE_SIZE,
    DISTRICT_TEXTURE_SIZE,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  bump.name = `DistrictBump:${descriptor.surfaceKey}`;
  bump.colorSpace = THREE.NoColorSpace;
  bump.wrapS = THREE.ClampToEdgeWrapping;
  bump.wrapT = THREE.ClampToEdgeWrapping;
  bump.magFilter = THREE.LinearFilter;
  bump.minFilter = THREE.LinearMipmapLinearFilter;
  bump.generateMipmaps = true;
  bump.anisotropy = anisotropy;
  bump.needsUpdate = true;

  return { albedo, bump };
}

function createWhitePebbleTextureSet(
  variant: WhitePebbleVariant,
  anisotropy: number,
): DistrictSurfaceTextureSet {
  const data = generateWhitePebbleTextureData(variant);
  const albedo = new THREE.DataTexture(
    data.albedo,
    WHITE_PEBBLE_TEXTURE_SIZE,
    WHITE_PEBBLE_TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  albedo.name = `WhitePebbleAlbedo:${variant}`;
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.magFilter = THREE.LinearFilter;
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.generateMipmaps = true;
  albedo.anisotropy = anisotropy;
  albedo.needsUpdate = true;

  const bump = new THREE.DataTexture(
    data.bump,
    WHITE_PEBBLE_TEXTURE_SIZE,
    WHITE_PEBBLE_TEXTURE_SIZE,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  bump.name = `WhitePebbleBump:${variant}`;
  bump.colorSpace = THREE.NoColorSpace;
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.magFilter = THREE.LinearFilter;
  bump.minFilter = THREE.LinearMipmapLinearFilter;
  bump.generateMipmaps = true;
  bump.anisotropy = anisotropy;
  bump.needsUpdate = true;

  return { albedo, bump };
}

export class DistrictSurfaceMaterialLibrary {
  readonly geometry = new THREE.PlaneGeometry(1, 1);
  readonly dividerMaterial = new THREE.MeshStandardMaterial({
    name: 'TileDividerMaterial',
    color: boardVisualTokens.tileDivider,
    roughness: boardMaterialSpecs.tileTop.roughness,
    metalness: boardMaterialSpecs.tileTop.metalness,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  private readonly textureSets = new Map<DistrictSurfaceKey, DistrictSurfaceTextureSet>();
  private readonly materials = new Map<DistrictSurfaceKey, THREE.MeshStandardMaterial>();
  private readonly whitePebbleTextureSets = new Map<WhitePebbleVariant, DistrictSurfaceTextureSet>();
  private readonly whitePebbleMaterials = new Map<WhitePebbleVariant, THREE.MeshStandardMaterial>();
  private retainCount = 0;
  private disposalGeneration = 0;
  private disposed = false;

  constructor(anisotropy: number) {
    DISTRICT_SURFACE_KEYS.forEach(surfaceKey => {
      const descriptor = getDistrictSurfaceDescriptorByKey(surfaceKey);
      const textureSet = createTextureSet(descriptor, anisotropy);
      const materialSpec = boardMaterialSpecs[descriptor.materialProfile];
      this.textureSets.set(surfaceKey, textureSet);
      this.materials.set(surfaceKey, new THREE.MeshStandardMaterial({
        name: `DistrictSurfaceMaterial:${surfaceKey}`,
        color: '#ffffff',
        map: textureSet.albedo,
        bumpMap: textureSet.bump,
        bumpScale: descriptor.bumpScale,
        roughness: materialSpec.roughness,
        metalness: materialSpec.metalness,
        side: THREE.DoubleSide,
      }));
    });
    WHITE_PEBBLE_VARIANTS.forEach(variant => {
      const textureSet = createWhitePebbleTextureSet(variant, anisotropy);
      this.whitePebbleTextureSets.set(variant, textureSet);
      this.whitePebbleMaterials.set(variant, new THREE.MeshStandardMaterial({
        name: `WhitePebbleSurfaceMaterial:${variant}`,
        color: '#ffffff',
        map: textureSet.albedo,
        bumpMap: textureSet.bump,
        bumpScale: 0.006,
        roughness: 0.76,
        metalness: 0,
        side: THREE.DoubleSide,
      }));
    });
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  getMaterial(surfaceKey: DistrictSurfaceKey): THREE.MeshStandardMaterial {
    const material = this.materials.get(surfaceKey);
    if (!material || this.disposed) throw new Error(`District material is unavailable: ${surfaceKey}`);
    return material;
  }

  getTextureSet(surfaceKey: DistrictSurfaceKey): DistrictSurfaceTextureSet {
    const textureSet = this.textureSets.get(surfaceKey);
    if (!textureSet || this.disposed) throw new Error(`District textures are unavailable: ${surfaceKey}`);
    return textureSet;
  }

  getWhitePebbleMaterial(variant: WhitePebbleVariant): THREE.MeshStandardMaterial {
    const material = this.whitePebbleMaterials.get(variant);
    if (!material || this.disposed) throw new Error(`White pebble material is unavailable: ${variant}`);
    return material;
  }

  getWhitePebbleTextureSet(variant: WhitePebbleVariant): DistrictSurfaceTextureSet {
    const textureSet = this.whitePebbleTextureSets.get(variant);
    if (!textureSet || this.disposed) throw new Error(`White pebble textures are unavailable: ${variant}`);
    return textureSet;
  }

  retain(): void {
    if (this.disposed) throw new Error('Cannot retain a disposed district material library.');
    this.retainCount += 1;
    this.disposalGeneration += 1;
  }

  release(): void {
    if (this.retainCount === 0) return;
    this.retainCount -= 1;
    const releaseGeneration = ++this.disposalGeneration;
    queueMicrotask(() => {
      if (this.retainCount === 0
        && releaseGeneration === this.disposalGeneration
        && !this.disposed) {
        this.dispose();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposalGeneration += 1;
    this.materials.forEach(material => material.dispose());
    this.whitePebbleMaterials.forEach(material => material.dispose());
    this.textureSets.forEach(textureSet => {
      textureSet.albedo.dispose();
      textureSet.bump.dispose();
    });
    this.whitePebbleTextureSets.forEach(textureSet => {
      textureSet.albedo.dispose();
      textureSet.bump.dispose();
    });
    this.dividerMaterial.dispose();
    this.geometry.dispose();
    this.materials.clear();
    this.textureSets.clear();
    this.whitePebbleMaterials.clear();
    this.whitePebbleTextureSets.clear();
  }
}
