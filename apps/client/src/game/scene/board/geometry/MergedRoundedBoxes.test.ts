import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { describe, expect, it } from 'vitest';
import { createMergedBoxGeometry, type MergedBoxSpec } from './MergedRoundedBoxes';

const box = (overrides: Partial<MergedBoxSpec> = {}): MergedBoxSpec => ({
  width: 1, height: 0.5, depth: 0.25, radius: 0.05, color: '#ff0000', position: [0, 0, 0], ...overrides,
});

describe('createMergedBoxGeometry', () => {
  it('merges several boxes into one geometry with the summed vertex count', () => {
    const single = new RoundedBoxGeometry(1, 0.5, 0.25, 2, 0.05);
    const merged = createMergedBoxGeometry([box(), box({ position: [2, 0, 0] }), box({ position: [4, 0, 0] })]);

    expect(merged.getAttribute('position').count).toBe(single.getAttribute('position').count * 3);
    expect(merged.index).toBe(single.index);
    for (const attribute of ['position', 'normal', 'uv', 'color']) {
      expect(merged.getAttribute(attribute)).toBeDefined();
    }
  });

  it('bakes position and rotation into the vertices', () => {
    const merged = createMergedBoxGeometry([
      box({ position: [10, 0, 0] }),
      box({ position: [0, 0, 0], rotation: [0, Math.PI / 2, 0] }),
    ]);
    merged.computeBoundingBox();

    expect(merged.boundingBox?.max.x).toBeCloseTo(10.5, 3);
    // A quarter turn about Y swaps the footprint: the rotated box is 0.25 wide in x and 1 deep in z.
    const rotatedOnly = createMergedBoxGeometry([box({ rotation: [0, Math.PI / 2, 0] })]);
    rotatedOnly.computeBoundingBox();
    expect(rotatedOnly.boundingBox?.max.x).toBeCloseTo(0.125, 3);
    expect(rotatedOnly.boundingBox?.max.z).toBeCloseTo(0.5, 3);
  });

  it('gives every box its own vertex color, in linear working space', () => {
    const merged = createMergedBoxGeometry([
      box({ color: '#ff0000' }),
      box({ color: '#0000ff', position: [2, 0, 0] }),
    ]);
    const colors = merged.getAttribute('color');
    const perBox = colors.count / 2;
    const red = new THREE.Color('#ff0000');
    const blue = new THREE.Color('#0000ff');

    expect(colors.getX(0)).toBeCloseTo(red.r, 5);
    expect(colors.getZ(0)).toBeCloseTo(red.b, 5);
    expect(colors.getX(perBox)).toBeCloseTo(blue.r, 5);
    expect(colors.getZ(perBox)).toBeCloseTo(blue.b, 5);
  });

  it('rejects an empty list', () => {
    expect(() => createMergedBoxGeometry([])).toThrow();
  });
});
