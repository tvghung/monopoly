import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import {
  afterEach, describe, expect, it,
} from 'vitest';
import { CHARACTER_REGISTRY } from '../../characters/characterRegistry';
import { getCharacterSpriteMaterialProps } from './characterSpriteMaterial';
import CharacterSprite from './CharacterSprite';

afterEach(cleanup);

describe('character sprite lifecycle', () => {
  it('mounts no placeholder before load, uses the exact loaded texture, and clears on identity changes', () => {
    const oldTexture = new THREE.Texture();
    const newTexture = new THREE.Texture();
    const definition = CHARACTER_REGISTRY.shiba;
    const { container, rerender } = render(
      <CharacterSprite texture={null} definition={definition} />,
    );

    expect(container.querySelector('sprite')).toBeNull();
    expect(container.querySelector('spriteMaterial')).toBeNull();

    rerender(<CharacterSprite texture={oldTexture} definition={definition} />);
    expect(container.querySelector('sprite')).toBeTruthy();
    expect(container.querySelector('spriteMaterial')).toBeTruthy();
    const spriteElement = CharacterSprite({ texture: oldTexture, definition, materialRef: null });
    const materialElement = (spriteElement as { props: { children: { props: Record<string, unknown> } } })
      .props.children;
    expect(materialElement.props.map).toBe(oldTexture);
    expect(materialElement.props).toMatchObject({
      color: '#ffffff',
      transparent: true,
      opacity: 1,
      alphaTest: 0.04,
      depthWrite: false,
      toneMapped: false,
    });
    expect(getCharacterSpriteMaterialProps(oldTexture).map).toBe(oldTexture);

    rerender(<CharacterSprite texture={null} definition={definition} />);
    expect(container.querySelector('sprite')).toBeNull();
    expect(container.querySelector('spriteMaterial')).toBeNull();

    rerender(<CharacterSprite texture={newTexture} definition={definition} />);
    expect(container.querySelector('sprite')).toBeTruthy();
    const newSpriteElement = CharacterSprite({ texture: newTexture, definition, materialRef: null });
    const newMaterialElement = (newSpriteElement as { props: { children: { props: Record<string, unknown> } } })
      .props.children;
    expect(newMaterialElement.props.map).toBe(newTexture);
  });
});
