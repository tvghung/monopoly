import * as THREE from 'three';

export const CHARACTER_SPRITE_MATERIAL_COLOR = '#ffffff';

export function getCharacterSpriteMaterialProps(texture: THREE.Texture | null): {
  map: THREE.Texture | undefined;
  color: string;
  transparent: true;
  opacity: number;
  alphaTest: number;
  depthWrite: false;
  toneMapped: false;
} {
  return {
    map: texture ?? undefined,
    color: CHARACTER_SPRITE_MATERIAL_COLOR,
    transparent: true,
    opacity: texture ? 1 : 0,
    alphaTest: 0.04,
    depthWrite: false,
    toneMapped: false,
  };
}
