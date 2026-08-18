import * as THREE from 'three';
import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import { characterSvgDataUri } from './characterSvg';
import { getCharacterDefinition } from './characterRegistry';

interface CacheEntry {
  texture?: THREE.Texture;
  refs: number;
  listeners: Set<(texture: THREE.Texture) => void>;
}

const textureCache = new Map<string, CacheEntry>();

export function acquireCharacterTexture(
  characterId: CharacterId | null,
  playerColor: PlayerColorId,
  onReady: (texture: THREE.Texture) => void,
): () => void {
  const key = `${characterId ?? 'legacy'}:${playerColor}`;
  const current = textureCache.get(key) ?? { refs: 0, listeners: new Set() };
  current.refs += 1;
  current.listeners.add(onReady);
  textureCache.set(key, current);

  if (current.texture) {
    onReady(current.texture);
  } else if (current.refs === 1) {
    const definition = getCharacterDefinition(characterId);
    const loader = new THREE.TextureLoader();
    loader.load(characterSvgDataUri(definition.svgSource, playerColor), texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      const entry = textureCache.get(key);
      if (!entry) {
        texture.dispose();
        return;
      }
      entry.texture = texture;
      entry.listeners.forEach(listener => listener(texture));
    });
  }

  return () => {
    const entry = textureCache.get(key);
    if (!entry) return;
    entry.listeners.delete(onReady);
    entry.refs -= 1;
    if (entry.refs > 0) return;
    entry.texture?.dispose();
    textureCache.delete(key);
  };
}

export function getCharacterTextureCacheSize(): number {
  return textureCache.size;
}
