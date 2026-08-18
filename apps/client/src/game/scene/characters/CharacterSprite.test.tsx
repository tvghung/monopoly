import * as THREE from 'three';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { CHARACTER_REGISTRY } from '../../characters/characterRegistry';
import CharacterSprite from './CharacterSprite';

describe('character sprite composition', () => {
  it('keeps the loading state empty and passes the exact ready texture to a neutral material', () => {
    const definition = CHARACTER_REGISTRY.shiba;
    const texture = new THREE.Texture();

    expect(CharacterSprite({ texture: null, definition })).toBeNull();

    const spriteElement = CharacterSprite({ texture, definition }) as ReactElement<{
      children: ReactElement;
    }>;
    const materialElement = spriteElement.props.children;

    expect(spriteElement.type).toBe('sprite');
    expect(materialElement.type).toBe('spriteMaterial');
    expect(materialElement.props).toMatchObject({
      map: texture,
      color: '#ffffff',
      transparent: true,
      opacity: 1,
      alphaTest: 0.04,
      depthWrite: false,
      toneMapped: false,
    });
  });
});
