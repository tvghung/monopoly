import type { Ref } from 'react';
import * as THREE from 'three';
import type { CharacterDefinition } from '../../characters/characterRegistry';
import { CHARACTER_BILLBOARD_HEIGHT } from '../board/architecture/tileAnchors';
import { getCharacterSpriteMaterialProps } from './characterSpriteMaterial';

interface CharacterSpriteProps {
  texture: THREE.Texture | null;
  definition: CharacterDefinition;
  materialRef?: Ref<THREE.SpriteMaterial | null>;
}

export default function CharacterSprite({
  texture,
  definition,
  materialRef,
}: CharacterSpriteProps) {
  if (!texture) return null;

  return (
    <sprite
      position={[0, CHARACTER_BILLBOARD_HEIGHT / 2 + definition.verticalOffset, 0]}
      scale={[definition.scale * 0.96, definition.scale * CHARACTER_BILLBOARD_HEIGHT, 1]}
    >
      <spriteMaterial
        ref={materialRef}
        {...getCharacterSpriteMaterialProps(texture)}
      />
    </sprite>
  );
}
