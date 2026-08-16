import { describe, expect, it } from 'vitest';
import {
  WHITE_PEBBLE_COLORS,
  WHITE_PEBBLE_TEXTURE_SIZE,
  WHITE_PEBBLE_VARIANT_COUNT,
  createWhitePebbleDescriptors,
  generateWhitePebbleTextureData,
} from './whitePebbleSurface';

function checksum(data: Uint8Array): number {
  let value = 2166136261;
  for (let index = 0; index < data.length; index += 1) {
    value ^= data[index];
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

describe('white pebble surface generator', () => {
  it('keeps the base true white and coverage sparse', () => {
    const data = generateWhitePebbleTextureData(0, 128);
    expect(data.albedo).toHaveLength(128 * 128 * 4);
    expect(data.bump).toHaveLength(128 * 128);
    expect(data.albedo[0]).toBe(255);
    expect(data.albedo[1]).toBe(255);
    expect(data.albedo[2]).toBe(255);
    expect(data.coverage).toBeGreaterThanOrEqual(0.03);
    expect(data.coverage).toBeLessThanOrEqual(0.07);
  });

  it('uses varied shapes, aspect ratios, grayscale values, and deterministic variants', () => {
    const descriptors = createWhitePebbleDescriptors(0);
    expect(new Set(descriptors.map(pebble => pebble.shape)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(descriptors.map(pebble => pebble.aspectRatio.toFixed(2))).size).toBeGreaterThanOrEqual(3);
    expect(new Set(descriptors.map(pebble => pebble.color)).size).toBeGreaterThanOrEqual(4);
    expect(descriptors).toEqual(createWhitePebbleDescriptors(0));
    expect(checksum(generateWhitePebbleTextureData(0, 128).albedo))
      .toBe(checksum(generateWhitePebbleTextureData(0, 128).albedo));
    expect(checksum(generateWhitePebbleTextureData(0, 128).albedo))
      .not.toBe(checksum(generateWhitePebbleTextureData(1, 128).albedo));
  });

  it('keeps all pebble colors in the neutral gray range', () => {
    expect(WHITE_PEBBLE_VARIANT_COUNT).toBe(4);
    expect(WHITE_PEBBLE_TEXTURE_SIZE).toBe(512);
    WHITE_PEBBLE_COLORS.forEach(color => {
      const red = Number.parseInt(color.slice(1, 3), 16);
      const green = Number.parseInt(color.slice(3, 5), 16);
      const blue = Number.parseInt(color.slice(5, 7), 16);
      expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThanOrEqual(20);
      expect(red).toBeGreaterThanOrEqual(140);
    });
  });
});
