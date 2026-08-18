import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_SPRITE_MATERIAL_COLOR,
  getCharacterSpriteMaterialProps,
} from './characterSpriteMaterial';

describe('character board sprite material', () => {
  it('keeps material tint neutral so only the colorized texture changes accents', () => {
    const texture = new THREE.Texture();
    const props = getCharacterSpriteMaterialProps(texture);

    expect(props.color).toBe(CHARACTER_SPRITE_MATERIAL_COLOR);
    expect(props.color).toBe('#ffffff');
    expect(props.map).toBe(texture);
  });
});
