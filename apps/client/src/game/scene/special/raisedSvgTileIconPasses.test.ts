import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RAISED_SVG_MATERIAL_SIDE } from './RaisedSvgTileIcon';

describe('raised SVG tile icon draw cost (budget recovery BR-1)', () => {
  it('uses FrontSide so each transparent icon plane costs one draw call instead of two', () => {
    // The planes lie flat and face up toward the fixed camera; DoubleSide + transparent doubles the passes.
    expect(RAISED_SVG_MATERIAL_SIDE).toBe(THREE.FrontSide);
  });
});
