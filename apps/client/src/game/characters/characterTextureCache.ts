import * as THREE from 'three';
import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import { characterSvgDataUri } from './characterSvg';
import { getCharacterDefinition } from './characterRegistry';

type TextureReadyListener = (texture: THREE.Texture) => void;

interface CacheEntry {
  id: number;
  texture?: THREE.Texture;
  refs: number;
  loading: boolean;
  listeners: Map<TextureReadyListener, number>;
}

const textureCache = new Map<string, CacheEntry>();
let nextEntryId = 0;

function configureTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
}

function startTextureLoad(
  key: string,
  entry: CacheEntry,
  characterId: CharacterId | null,
  playerColor: PlayerColorId,
): void {
  const entryId = entry.id;
  const definition = getCharacterDefinition(characterId);
  const loader = new THREE.TextureLoader();
  loader.load(
    characterSvgDataUri(definition.svgSource, playerColor),
    texture => {
      configureTexture(texture);
      const current = textureCache.get(key);
      if (current !== entry || current.id !== entryId || entry.refs === 0) {
        texture.dispose();
        return;
      }
      entry.texture = texture;
      entry.loading = false;
      [...entry.listeners.keys()].forEach(listener => {
        if (textureCache.get(key) === entry && entry.refs > 0) listener(texture);
      });
    },
    undefined,
    () => {
      const current = textureCache.get(key);
      if (current !== entry || current.id !== entryId) return;
      entry.loading = false;
      if (entry.refs === 0) textureCache.delete(key);
    },
  );
}

export function acquireCharacterTexture(
  characterId: CharacterId | null,
  playerColor: PlayerColorId,
  onReady: TextureReadyListener,
): () => void {
  const key = `${characterId ?? 'legacy'}:${playerColor}`;
  let entry = textureCache.get(key);
  if (!entry) {
    entry = {
      id: ++nextEntryId,
      refs: 0,
      loading: false,
      listeners: new Map(),
    };
    textureCache.set(key, entry);
  }

  entry.refs += 1;
  entry.listeners.set(onReady, (entry.listeners.get(onReady) ?? 0) + 1);
  if (entry.texture) {
    onReady(entry.texture);
  } else if (!entry.loading) {
    entry.loading = true;
    startTextureLoad(key, entry, characterId, playerColor);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = textureCache.get(key);
    if (current !== entry) return;

    const listenerRefs = entry.listeners.get(onReady) ?? 0;
    if (listenerRefs <= 1) entry.listeners.delete(onReady);
    else entry.listeners.set(onReady, listenerRefs - 1);
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs > 0) return;

    entry.texture?.dispose();
    textureCache.delete(key);
  };
}

export function getCharacterTextureCacheSize(): number {
  return textureCache.size;
}

export function resetCharacterTextureCacheForTests(): void {
  textureCache.forEach(entry => entry.texture?.dispose());
  textureCache.clear();
  nextEntryId = 0;
}
