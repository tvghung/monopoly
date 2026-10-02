import * as THREE from 'three';
import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import { characterSvgDataUri } from './characterSvg';
import { getCharacterDefinition } from './characterRegistry';

type TextureReadyListener = (texture: THREE.Texture) => void;

export interface CharacterTextureError {
  key: string;
  characterId: CharacterId | null;
  playerColor: PlayerColorId;
  cause: unknown;
}

type TextureErrorListener = (error: CharacterTextureError) => void;

interface CacheEntry {
  id: number;
  texture?: THREE.Texture;
  refs: number;
  loading: boolean;
  listeners: Map<TextureReadyListener, number>;
  errorListeners: Map<TextureErrorListener, number>;
}

const textureCache = new Map<string, CacheEntry>();
let nextEntryId = 0;
/** The mascot art keeps its 256 px; the canvas is larger so the white die-cut border of the standee fits around it (plan 05 §8.4). */
const CHARACTER_ART_SIZE = 256;
const CHARACTER_TEXTURE_RASTER_SIZE = 320;
const CHARACTER_BORDER_PX = 6;
const BORDER_DIRECTIONS = 16;

function configureTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
}

/**
 * Bakes the die-cut standee texture: the silhouette of the art grown by `CHARACTER_BORDER_PX` and filled white, with the art
 * itself on top. The grown silhouette is the art drawn at offsets on a circle, then turned white with `source-in`.
 */
function createRasterizedCharacterTexture(image: HTMLImageElement): THREE.CanvasTexture {
  const size = CHARACTER_TEXTURE_RASTER_SIZE;
  const margin = (size - CHARACTER_ART_SIZE) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Character texture rasterization requires a 2D canvas context');
  context.clearRect(0, 0, size, size);

  for (let step = 0; step < BORDER_DIRECTIONS; step += 1) {
    const angle = step / BORDER_DIRECTIONS * Math.PI * 2;
    context.drawImage(
      image,
      margin + Math.cos(angle) * CHARACTER_BORDER_PX,
      margin + Math.sin(angle) * CHARACTER_BORDER_PX,
      CHARACTER_ART_SIZE,
      CHARACTER_ART_SIZE,
    );
  }
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = 'source-over';

  context.drawImage(image, margin, margin, CHARACTER_ART_SIZE, CHARACTER_ART_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  configureTexture(texture);
  return texture;
}

function notifyTextureError(
  key: string,
  entry: CacheEntry,
  entryId: number,
  characterId: CharacterId | null,
  playerColor: PlayerColorId,
  cause: unknown,
): void {
  const current = textureCache.get(key);
  if (current !== entry || current.id !== entryId) return;
  const error = { key, characterId, playerColor, cause } satisfies CharacterTextureError;
  entry.loading = false;
  [...entry.errorListeners.keys()].forEach(listener => {
    if (textureCache.get(key) === entry && entry.refs > 0) listener(error);
  });
  if (entry.refs === 0) textureCache.delete(key);
}

function startTextureLoad(
  key: string,
  entry: CacheEntry,
  characterId: CharacterId | null,
  playerColor: PlayerColorId,
): void {
  const entryId = entry.id;
  const definition = getCharacterDefinition(characterId);
  const rawSvg = definition.svgSource;
  const dataUri = characterSvgDataUri(rawSvg, playerColor);
  const image = new Image();
  image.onload = () => {
    let texture: THREE.CanvasTexture;
    try {
      texture = createRasterizedCharacterTexture(image);
    } catch (cause) {
      notifyTextureError(
        key,
        entry,
        entryId,
        characterId,
        playerColor,
        cause,
      );
      return;
    }
    const current = textureCache.get(key);
    if (current !== entry || current.id !== entryId || entry.refs === 0) {
      texture.dispose();
      return;
    }
    entry.texture = texture;
    entry.loading = false;
    [...entry.listeners.keys()].forEach(listener => {
      if (textureCache.get(key) === entry && entry.refs > 0) {
        listener(texture);
      }
    });
  };
  image.onerror = cause => notifyTextureError(
    key,
    entry,
    entryId,
    characterId,
    playerColor,
    cause,
  );
  image.src = dataUri;
}

export function acquireCharacterTexture(
  characterId: CharacterId | null,
  playerColor: PlayerColorId,
  onReady: TextureReadyListener,
  onError?: TextureErrorListener,
): () => void {
  const key = `${characterId ?? 'legacy'}:${playerColor}`;
  let entry = textureCache.get(key);
  if (!entry) {
    entry = {
      id: ++nextEntryId,
      refs: 0,
      loading: false,
      listeners: new Map(),
      errorListeners: new Map(),
    };
    textureCache.set(key, entry);
  }

  entry.refs += 1;
  entry.listeners.set(onReady, (entry.listeners.get(onReady) ?? 0) + 1);
  if (onError) {
    entry.errorListeners.set(onError, (entry.errorListeners.get(onError) ?? 0) + 1);
  }
  if (entry.texture) {
    onReady(entry.texture);
  } else if (!entry.loading) {
    entry.loading = true;
    try {
      startTextureLoad(key, entry, characterId, playerColor);
    } catch (cause) {
      notifyTextureError(key, entry, entry.id, characterId, playerColor, cause);
    }
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
    if (onError) {
      const errorListenerRefs = entry.errorListeners.get(onError) ?? 0;
      if (errorListenerRefs <= 1) entry.errorListeners.delete(onError);
      else entry.errorListeners.set(onError, errorListenerRefs - 1);
    }
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
