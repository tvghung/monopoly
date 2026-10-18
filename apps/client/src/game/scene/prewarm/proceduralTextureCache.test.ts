import { afterEach, describe, expect, it } from 'vitest';
import {
  districtTextureKey,
  hasProceduralTexture,
  pebbleTextureKey,
  proceduralTextureCacheSize,
  putProceduralTexture,
  releaseProceduralTextureCache,
  tableTextureKey,
  takeProceduralTexture,
} from './proceduralTextureCache';

afterEach(() => {
  releaseProceduralTextureCache();
});

describe('proceduralTextureCache', () => {
  it('hands an entry to exactly one taker', () => {
    const data = { albedo: new Uint8Array(4) };
    putProceduralTexture('k', data);
    expect(hasProceduralTexture('k')).toBe(true);
    expect(takeProceduralTexture('k')).toBe(data);
    expect(hasProceduralTexture('k')).toBe(false);
    expect(takeProceduralTexture('k')).toBeUndefined();
  });

  it('keeps the table, district and pebble entries apart, and separates sizes and roughness variation', () => {
    const keys = [
      tableTextureKey(1024, true),
      tableTextureKey(1024, false),
      tableTextureKey(512, true),
      districtTextureKey('oldTownStone'),
      districtTextureKey('ecoSlate'),
      pebbleTextureKey(0),
      pebbleTextureKey(1),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('release drops everything that was not taken', () => {
    putProceduralTexture('a', 1);
    putProceduralTexture('b', 2);
    expect(proceduralTextureCacheSize()).toBe(2);
    takeProceduralTexture('a');
    releaseProceduralTextureCache();
    expect(proceduralTextureCacheSize()).toBe(0);
    expect(takeProceduralTexture('b')).toBeUndefined();
  });
});
