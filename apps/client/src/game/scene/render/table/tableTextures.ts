import * as THREE from 'three';
import { OTB_PALETTE } from '../../../../design-system/tokens/palette';

/**
 * Deterministic procedural light oak (plan 02 §8.5, decision OD-02-2: no play mat). One texture tile
 * covers four planks of 1.6 world units; grain and seams use the two table colors of the palette and stay
 * low in contrast so the table remains calm behind the board and the HUD.
 */
export const TABLE_PLANK_WIDTH = 1.6;
export const TABLE_PLANKS_PER_TILE = 4;
export const TABLE_TEXTURE_WORLD_SIZE = TABLE_PLANK_WIDTH * TABLE_PLANKS_PER_TILE;
export const TABLE_TEXTURE_DEFAULT_SEED = 20_260_930;

export interface TableTextureData {
  size: number;
  /** RGBA, sRGB encoded. */
  albedo: Uint8Array;
  /** RGBA whose green channel multiplies the material roughness; null without roughness variation. */
  roughness: Uint8Array | null;
}

export interface TableTextureOptions {
  seed?: number;
  roughnessVariation?: boolean;
}

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Integer lattice hash in [0, 1). */
function lattice(ix: number, iy: number, seed: number): number {
  let hash = Math.imul(ix, 374_761_393) ^ Math.imul(iy, 668_265_263) ^ Math.imul(seed, 2_147_483_647);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (value: number, period: number) => ((value % period) + period) % period;

/** Value noise in [0, 1) that repeats every `periodX` x `periodY` lattice cells, so the texture tiles. */
function periodicNoise(x: number, y: number, periodX: number, periodY: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const at = (ix: number, iy: number) => lattice(wrap(ix, periodX), wrap(iy, periodY), seed);
  const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
  const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mixChannel = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function generateTableTextureData(size: number, options: TableTextureOptions = {}): TableTextureData {
  const seed = options.seed ?? TABLE_TEXTURE_DEFAULT_SEED;
  const random = mulberry32(seed);
  const oak = hexToRgb(OTB_PALETTE['table-oak']);
  const dark = hexToRgb(OTB_PALETTE['table-oak-dark']);
  const plankPixels = size / TABLE_PLANKS_PER_TILE;
  const plankTone = Array.from({ length: TABLE_PLANKS_PER_TILE }, () => (random() - 0.5) * 0.12);
  const jointAt = Array.from({ length: TABLE_PLANKS_PER_TILE }, () => 0.15 + random() * 0.7);
  const seamHalfWidth = Math.max(1, size / 512);
  const albedo = new Uint8Array(size * size * 4);
  const roughness = options.roughnessVariation ? new Uint8Array(size * size * 4) : null;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const plank = Math.min(TABLE_PLANKS_PER_TILE - 1, Math.floor(x / plankPixels));
      const across = x - plank * plankPixels;
      // Grain runs along the plank (v): high frequency across it, very low along it.
      const grain = periodicNoise(u * 64, v * 4, 64, 4, seed + 1);
      const fine = periodicNoise(u * 160, v * 10, 160, 10, seed + 2);
      const broad = periodicNoise(u * 3, v * 3, 3, 3, seed + 3);
      let towardDark = clamp01(0.06 + grain * 0.16 + fine * 0.05 + (broad - 0.5) * 0.06 + plankTone[plank]);
      const nearSeam = Math.min(across, plankPixels - 1 - across) < seamHalfWidth
        || Math.abs(v - jointAt[plank]) * size < seamHalfWidth;
      if (nearSeam) towardDark = 0.72;
      const offset = (y * size + x) * 4;
      albedo[offset] = Math.round(mixChannel(oak[0], dark[0], towardDark));
      albedo[offset + 1] = Math.round(mixChannel(oak[1], dark[1], towardDark));
      albedo[offset + 2] = Math.round(mixChannel(oak[2], dark[2], towardDark));
      albedo[offset + 3] = 255;
      if (roughness) {
        // Slightly glossier along dense grain lines, never below 0.85 of the material roughness.
        const value = Math.round(255 * (1 - 0.15 * clamp01(grain * 0.7 + fine * 0.3)));
        roughness[offset] = value;
        roughness[offset + 1] = value;
        roughness[offset + 2] = value;
        roughness[offset + 3] = 255;
      }
    }
  }
  return { size, albedo, roughness };
}

export interface TableTextures {
  albedo: THREE.DataTexture;
  roughness: THREE.DataTexture | null;
  dispose: () => void;
}

function configure(texture: THREE.DataTexture, colorSpace: THREE.ColorSpace, repeat: number, anisotropy: number): void {
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
}

/** Builds the GPU textures for a table of `worldSize` units; the caller owns disposal. */
export function createTableTextures(
  size: number,
  worldSize: number,
  options: TableTextureOptions & { anisotropy?: number } = {},
): TableTextures {
  const data = generateTableTextureData(size, options);
  const repeat = worldSize / TABLE_TEXTURE_WORLD_SIZE;
  const anisotropy = options.anisotropy ?? 1;
  const albedo = new THREE.DataTexture(data.albedo, size, size, THREE.RGBAFormat);
  configure(albedo, THREE.SRGBColorSpace, repeat, anisotropy);
  let roughness: THREE.DataTexture | null = null;
  if (data.roughness) {
    roughness = new THREE.DataTexture(data.roughness, size, size, THREE.RGBAFormat);
    configure(roughness, THREE.NoColorSpace, repeat, anisotropy);
  }
  return {
    albedo,
    roughness,
    dispose: () => {
      albedo.dispose();
      roughness?.dispose();
    },
  };
}
