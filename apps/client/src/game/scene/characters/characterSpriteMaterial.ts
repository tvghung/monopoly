import * as THREE from 'three';

export const CHARACTER_SPRITE_MATERIAL_COLOR = '#ffffff';

export function getCharacterSpriteMaterialProps(texture: THREE.Texture): {
  map: THREE.Texture;
  color: string;
  transparent: true;
  opacity: number;
  alphaTest: number;
  depthWrite: false;
  toneMapped: false;
} {
  return {
    map: texture,
    color: CHARACTER_SPRITE_MATERIAL_COLOR,
    transparent: true,
    opacity: 1,
    alphaTest: 0.04,
    depthWrite: false,
    toneMapped: false,
  };
}
