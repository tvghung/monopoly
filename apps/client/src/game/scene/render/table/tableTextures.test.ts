import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OTB_PALETTE } from '../../../../design-system/tokens/palette';
import {
  TABLE_PLANK_WIDTH,
  TABLE_TEXTURE_WORLD_SIZE,
  createTableTextures,
  generateTableTextureData,
} from './tableTextures';
import {
  TABLETOP_COVERED_ASPECTS,
  TABLETOP_SIZE,
  getTabletopRequiredHalfSize,
} from './tabletopCoverage';

function averageRgb(data: Uint8Array): [number, number, number] {
  const sum = [0, 0, 0];
  const pixels = data.length / 4;
  for (let index = 0; index < data.length; index += 4) {
    sum[0] += data[index];
    sum[1] += data[index + 1];
    sum[2] += data[index + 2];
  }
  return [sum[0] / pixels, sum[1] / pixels, sum[2] / pixels];
}

const channel = (hex: string, index: 0 | 1 | 2) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);

describe('table texture data', () => {
  it('is deterministic for a seed and different for another', () => {
    const first = generateTableTextureData(128, { seed: 7 });
    const again = generateTableTextureData(128, { seed: 7 });
    const other = generateTableTextureData(128, { seed: 8 });

    expect(Buffer.from(first.albedo).equals(Buffer.from(again.albedo))).toBe(true);
    expect(Buffer.from(first.albedo).equals(Buffer.from(other.albedo))).toBe(false);
  });

  it('has the requested size and fully opaque RGBA pixels', () => {
    for (const size of [64, 128]) {
      const data = generateTableTextureData(size);
      expect(data.size).toBe(size);
      expect(data.albedo).toHaveLength(size * size * 4);
      for (let index = 3; index < data.albedo.length; index += 4) expect(data.albedo[index]).toBe(255);
    }
  });

  it('stays close to the light oak palette so the table remains calm', () => {
    const [red, green, blue] = averageRgb(generateTableTextureData(256).albedo);

    // Between the oak base and a little toward the grain color; never as dark as the seams.
    expect(red).toBeLessThanOrEqual(channel(OTB_PALETTE['table-oak'], 0));
    expect(red).toBeGreaterThan(channel(OTB_PALETTE['table-oak-dark'], 0) + 8);
    expect(green).toBeGreaterThan(channel(OTB_PALETTE['table-oak-dark'], 1) + 8);
    expect(blue).toBeGreaterThan(channel(OTB_PALETTE['table-oak-dark'], 2) + 8);
    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue);
  });

  it('keeps the grain contrast low but draws plank seams darker than the surface', () => {
    const size = 256;
    const { albedo } = generateTableTextureData(size);
    const luma = (x: number, y: number) => {
      const offset = (y * size + x) * 4;
      return albedo[offset] * 0.3 + albedo[offset + 1] * 0.59 + albedo[offset + 2] * 0.11;
    };
    const plankPixels = size / 4;
    const seamRow = Array.from({ length: size }, (_, x) => luma(x, 20));
    const seamColumns = [0, 1, 2, 3].map(plank => luma(plank * plankPixels, 20));
    const interior = [0, 1, 2, 3].map(plank => luma(plank * plankPixels + plankPixels / 2, 20));

    seamColumns.forEach((seam, index) => expect(seam).toBeLessThan(interior[index] - 15));
    const surface = seamRow.filter((_, x) => x % plankPixels > 3 && x % plankPixels < plankPixels - 4);
    expect(Math.max(...surface) - Math.min(...surface)).toBeLessThan(60);
  });

  it('tiles: opposite edges are as similar as neighboring pixels', () => {
    const size = 128;
    const { albedo } = generateTableTextureData(size);
    const at = (x: number, y: number) => albedo[(y * size + x) * 4];
    let edgeDelta = 0;
    let neighborDelta = 0;
    for (let y = 0; y < size; y += 1) {
      edgeDelta += Math.abs(at(0, y) - at(size - 1, y));
      neighborDelta += Math.abs(at(64, y) - at(65, y));
    }
    // The wrap between the last and first columns is a plank seam boundary; keep it under a loose bound.
    expect(edgeDelta / size).toBeLessThan(40);
    expect(neighborDelta / size).toBeLessThan(40);
  });

  it('adds a roughness map only with roughness variation, never rougher than the material', () => {
    expect(generateTableTextureData(64).roughness).toBeNull();
    const varied = generateTableTextureData(64, { roughnessVariation: true }).roughness;
    expect(varied).not.toBeNull();
    for (let index = 0; index < (varied?.length ?? 0); index += 4) {
      expect(varied?.[index]).toBeGreaterThanOrEqual(Math.floor(255 * 0.85));
      expect(varied?.[index]).toBeLessThanOrEqual(255);
    }
  });
});

describe('table textures on the GPU side', () => {
  it('tiles across the tabletop with the right color spaces', () => {
    const textures = createTableTextures(64, TABLETOP_SIZE, { roughnessVariation: true, anisotropy: 4 });

    expect(textures.albedo.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.roughness?.colorSpace).toBe(THREE.NoColorSpace);
    expect(textures.albedo.wrapS).toBe(THREE.RepeatWrapping);
    expect(textures.albedo.repeat.x).toBeCloseTo(TABLETOP_SIZE / TABLE_TEXTURE_WORLD_SIZE);
    expect(textures.albedo.anisotropy).toBe(4);
    expect(TABLE_TEXTURE_WORLD_SIZE / TABLE_PLANK_WIDTH).toBe(4);
    textures.dispose();
  });
});

describe('tabletop coverage', () => {
  it.each(TABLETOP_COVERED_ASPECTS)('covers everything the camera sees at aspect %s', aspect => {
    expect(getTabletopRequiredHalfSize(aspect)).toBeLessThan(TABLETOP_SIZE / 2);
    // And with a comfortable margin for resize overshoot.
    expect(getTabletopRequiredHalfSize(aspect) * 1.25).toBeLessThan(TABLETOP_SIZE / 2);
  });

  it('grows with the aspect ratio', () => {
    expect(getTabletopRequiredHalfSize(2.4)).toBeGreaterThan(getTabletopRequiredHalfSize(1));
  });
});
