import { describe, expect, it } from 'vitest';
import { GROUND_SHADOW_SCALE, generateGroundShadowData } from './groundShadowTexture';

describe('ground shadow decal', () => {
  const size = 128;
  const data = generateGroundShadowData(size);
  const alphaAt = (x: number, y: number) => data[(y * size + x) * 4 + 3];

  it('is black RGBA with alpha only', () => {
    expect(data).toHaveLength(size * size * 4);
    for (let index = 0; index < data.length; index += 4) {
      expect(data[index]).toBe(0);
      expect(data[index + 1]).toBe(0);
      expect(data[index + 2]).toBe(0);
    }
  });

  it('is opaque under the board and fades to nothing at the border', () => {
    expect(alphaAt(size / 2, size / 2)).toBe(255);
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(size - 1, size / 2)).toBe(0);
    expect(alphaAt(size / 2, 0)).toBe(0);
  });

  it('falls off monotonically from the board edge outward and is symmetric', () => {
    const middle = size / 2;
    const boardEdge = Math.round(middle * (1 + 1 / GROUND_SHADOW_SCALE));
    let previous = 256;
    for (let x = boardEdge; x < size; x += 1) {
      expect(alphaAt(x, middle)).toBeLessThanOrEqual(previous);
      previous = alphaAt(x, middle);
    }
    expect(alphaAt(middle, boardEdge + 3)).toBe(alphaAt(boardEdge + 3, middle));
    expect(alphaAt(size - 1 - (boardEdge + 3), middle)).toBeGreaterThan(0);
  });
});
