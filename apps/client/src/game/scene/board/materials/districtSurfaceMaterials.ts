import * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import {
  DISTRICT_SURFACE_KEYS,
  getDistrictSurfaceDescriptorByKey,
  type DistrictSurfaceDescriptor,
  type DistrictSurfaceEmblem,
  type DistrictSurfaceKey,
} from '../architecture/tileVisualRegistry';
import { boardMaterialSpecs } from './boardMaterialSpecs';

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
  colorRole: 'base' | 'secondary' | 'grout';
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
  const scale = descriptor.patternScale;
  const pixelNoise = noise2d(x, y, seed);

  switch (descriptor.pattern) {
    case 'cobble': {
      const cell = cellSample(u, v, scale, scale * 0.72, true, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      return edge < 0.055
        ? { blend: 0, bump: 64, colorRole: 'grout' }
        : { blend: 0.08 + cell.variation * 0.24, bump: 168 + cell.variation * 45, colorRole: 'base' };
    }
    case 'ceramic': {
      const cell = cellSample(u, v, scale, scale * 1.28, false, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      return edge < 0.035
        ? { blend: 0, bump: 78, colorRole: 'grout' }
        : { blend: 0.12 + Math.sin((u + v) * Math.PI * 3) * 0.04, bump: 190, colorRole: 'base' };
    }
    case 'granite': {
      const vein = Math.abs(Math.sin((u * 0.8 + v * 1.6) * Math.PI * scale)) > 0.992;
      if (vein) return { blend: 0, bump: 112, colorRole: 'grout' };
      if (pixelNoise > 0.968) return { blend: pixelNoise, bump: 215, colorRole: 'secondary' };
      return { blend: 0.08 + pixelNoise * 0.13, bump: 166 + pixelNoise * 24, colorRole: 'base' };
    }
    case 'brick': {
      const cell = cellSample(u, v, scale, scale * 1.55, true, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      return edge < 0.045
        ? { blend: 0, bump: 62, colorRole: 'grout' }
        : { blend: 0.07 + cell.variation * 0.22, bump: 171 + cell.variation * 38, colorRole: 'base' };
    }
    case 'concrete': {
      const expansionJoint = Math.abs(u - 0.5) < 0.007 || Math.abs(v - 0.5) < 0.007;
      if (expansionJoint) return { blend: 0, bump: 76, colorRole: 'grout' };
      if (pixelNoise > 0.982) return { blend: 0.35, bump: 125, colorRole: 'grout' };
      return { blend: 0.06 + pixelNoise * 0.16, bump: 160 + pixelNoise * 34, colorRole: 'base' };
    }
    case 'terrazzo': {
      const seam = Math.abs(u - 0.5) < 0.004 || Math.abs(v - 0.5) < 0.004;
      if (seam) return { blend: 0, bump: 96, colorRole: 'grout' };
      const fleckNoise = noise2d(Math.floor(x / 3), Math.floor(y / 3), seed);
      if (fleckNoise > 0.91) return { blend: fleckNoise, bump: 206, colorRole: 'secondary' };
      if (fleckNoise < 0.035) return { blend: 0, bump: 132, colorRole: 'grout' };
      return { blend: 0.08 + pixelNoise * 0.08, bump: 176, colorRole: 'base' };
    }
    case 'slate': {
      const cell = cellSample(u, v, scale * 0.72, scale * 1.4, true, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      if (edge < 0.038) return { blend: 0, bump: 69, colorRole: 'grout' };
      const striation = (Math.sin(v * Math.PI * scale * 8) + 1) * 0.035;
      return { blend: 0.08 + cell.variation * 0.18 + striation, bump: 164 + striation * 300, colorRole: 'base' };
    }
    case 'slab': {
      const cell = cellSample(u, v, Math.max(2, scale * 0.55), scale, true, seed);
      const edge = Math.min(cell.fx, 1 - cell.fx, cell.fy, 1 - cell.fy);
      if (edge < 0.03) return { blend: 0, bump: 82, colorRole: 'grout' };
      const vein = (Math.sin((u * 3.2 + v * 0.7) * Math.PI * scale) + 1) * 0.045;
      return { blend: 0.08 + cell.variation * 0.16 + vein, bump: 182 + vein * 260, colorRole: 'base' };
    }
  }
}

function isEmblemPixel(emblem: DistrictSurfaceEmblem, u: number, v: number): boolean {
  const x = (u - 0.17) / 0.065;
  const y = (v - 0.15) / 0.065;
  if (Math.abs(x) > 1.2 || Math.abs(y) > 1.2) return false;

  switch (emblem) {
    case 'heritage':
      return (Math.abs(x) > 0.58 && Math.abs(x) < 0.82 && y > -0.35)
        || (y < -0.2 && Math.abs(Math.hypot(x, y + 0.2) - 0.72) < 0.16);
    case 'harbor':
      return [-0.42, 0.12, 0.66].some(offset => (
        Math.abs(y - offset - Math.sin(x * Math.PI * 1.4) * 0.13) < 0.11
      ));
    case 'boutique':
      return Math.abs(Math.abs(x) + Math.abs(y) - 0.78) < 0.16;
    case 'market':
      return (y < -0.3 && y > -0.72 && Math.abs(x) < 0.9)
        || (y > -0.22 && Math.abs(x) < 0.72 && Math.abs(x * 3) % 1.5 < 0.28);
    case 'skyline':
      return (Math.abs(x) < 0.22 && y > -0.78 && y < 0.8)
        || (x > 0.28 && x < 0.62 && y > -0.25 && y < 0.8)
        || (x < -0.3 && x > -0.72 && y > 0.05 && y < 0.8);
    case 'marquee': {
      const radius = Math.hypot(x, y);
      const angle = Math.atan2(y, x);
      return radius < 0.32 || (radius < 0.95 && Math.abs(Math.sin(angle * 5)) > 0.82);
    }
    case 'leaf':
      return (x * x) / 0.55 + (y * y) / 1.05 < 1
        && (x > -0.12 || Math.abs(y + x * 0.85) < 0.16);
    case 'landmark':
      return (Math.abs(x) < 0.22 && y > -0.8 && y < 0.78)
        || (y < -0.3 && Math.abs(x) + Math.abs(y + 0.3) < 0.7);
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
  const accentColor = parseHexColor(descriptor.accentColor);
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
      let color = sample.colorRole === 'grout'
        ? groutColor
        : sample.colorRole === 'secondary'
          ? secondaryColor
          : mixColor(baseColor, secondaryColor, sample.blend);
      let bumpValue = sample.bump;

      const isTextQuietZone = u > 0.08 && u < 0.92 && v > 0.28 && v < 0.72;
      if (isTextQuietZone) {
        color = mixColor(color, baseColor, 0.38);
        bumpValue = bumpValue * 0.45 + 96;
      }

      const isAccentInlay = u > 0.3 && u < 0.7 && v > 0.025 && v < 0.058;
      if (isAccentInlay || isEmblemPixel(descriptor.emblem, u, v)) {
        color = accentColor;
        bumpValue = 218;
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

export class DistrictSurfaceMaterialLibrary {
  readonly geometry = new THREE.PlaneGeometry(1, 1);
  readonly specialMaterial = new THREE.MeshStandardMaterial({
    name: 'SpecialTileSurfaceMaterial',
    color: boardVisualTokens.tileSurface,
    roughness: boardMaterialSpecs.tileTop.roughness,
    metalness: boardMaterialSpecs.tileTop.metalness,
    side: THREE.DoubleSide,
  });

  private readonly textureSets = new Map<DistrictSurfaceKey, DistrictSurfaceTextureSet>();
  private readonly materials = new Map<DistrictSurfaceKey, THREE.MeshStandardMaterial>();
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
    this.textureSets.forEach(textureSet => {
      textureSet.albedo.dispose();
      textureSet.bump.dispose();
    });
    this.specialMaterial.dispose();
    this.geometry.dispose();
    this.materials.clear();
    this.textureSets.clear();
  }
}
