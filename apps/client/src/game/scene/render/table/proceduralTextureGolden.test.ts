import { describe, expect, it } from 'vitest';
import { generateWhitePebbleTextureData } from '../../board/materials/whitePebbleSurface';
import { generateTableTextureData } from './tableTextures';

/**
 * Golden hashes of the procedural texture generators. They are CPU work on the cold-launch critical path (about 0.4 s of the first
 * 2 s on the reference machine), so they are written for speed (no per-pixel trigonometry, closures or color parsing); this test is
 * what keeps such an optimisation from changing a single byte of what the board draws. The hashes were taken from the generators
 * before they were optimised and must only change together with a deliberate change of the picture.
 */
function fnv1a(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const EXPECTED: Record<string, string> = {
  'pebble-0-albedo': 'b5d47105', 'pebble-0-bump': '375fa875', 'pebble-0-coverage': '0.05181884765625',
  'pebble-1-albedo': '76c37c05', 'pebble-1-bump': 'acb0ae45', 'pebble-1-coverage': '0.046875',
  'pebble-2-albedo': '82df8c85', 'pebble-2-bump': 'd77dbf65', 'pebble-2-coverage': '0.0552978515625',
  'pebble-3-albedo': '477cc9a5', 'pebble-3-bump': '0f5c74b5', 'pebble-3-coverage': '0.05474853515625',
  'table-albedo': '23a2801a', 'table-varied-albedo': '8d0baeaa', 'table-varied-roughness': 'cd5df8ae',
};

describe('procedural texture generators (golden hashes)', () => {
  it('white pebble variants are unchanged', () => {
    const actual: Record<string, string> = {};
    for (const variant of [0, 1, 2, 3] as const) {
      const data = generateWhitePebbleTextureData(variant);
      actual[`pebble-${variant}-albedo`] = fnv1a(data.albedo);
      actual[`pebble-${variant}-bump`] = fnv1a(data.bump);
      actual[`pebble-${variant}-coverage`] = String(data.coverage);
    }
    expect(actual).toEqual(Object.fromEntries(Object.entries(EXPECTED).filter(([key]) => key.startsWith('pebble'))));
  });

  it('the table texture is unchanged, with and without roughness variation', { timeout: 60_000 }, () => {
    const plain = generateTableTextureData(512);
    const varied = generateTableTextureData(512, { roughnessVariation: true, seed: 12345 });
    const actual = {
      'table-albedo': fnv1a(plain.albedo),
      'table-varied-albedo': fnv1a(varied.albedo),
      'table-varied-roughness': fnv1a(varied.roughness ?? new Uint8Array()),
    };
    expect(actual).toEqual(Object.fromEntries(Object.entries(EXPECTED).filter(([key]) => key.startsWith('table'))));
  });
});
