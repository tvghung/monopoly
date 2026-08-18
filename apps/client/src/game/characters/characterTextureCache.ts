import * as THREE from 'three';
import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import { characterSvgDataUri } from './characterSvg';
import { getCharacterDefinition } from './characterRegistry';
import {
  recordCharacterTextureDiagnostic,
  resetCharacterTextureDiagnosticsForTests,
} from './characterTextureDiagnostics';
import { probeCharacterTexturePipeline } from './characterTextureProbe';

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
const CHARACTER_TEXTURE_RASTER_SIZE = 256;

function configureTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
}

function getImageDimensions(image: unknown): { width: number; height: number } {
  if (!image || typeof image !== 'object') return { width: 0, height: 0 };
  const source = image as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
  };
  return {
    width: source.naturalWidth || source.width || 0,
    height: source.naturalHeight || source.height || 0,
  };
}

function createRasterizedCharacterTexture(image: HTMLImageElement): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CHARACTER_TEXTURE_RASTER_SIZE;
  canvas.height = CHARACTER_TEXTURE_RASTER_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Character texture rasterization requires a 2D canvas context');
  context.clearRect(0, 0, CHARACTER_TEXTURE_RASTER_SIZE, CHARACTER_TEXTURE_RASTER_SIZE);
  context.drawImage(
    image,
    0,
    0,
    CHARACTER_TEXTURE_RASTER_SIZE,
    CHARACTER_TEXTURE_RASTER_SIZE,
  );
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
  dataUriLength: number,
): void {
  const current = textureCache.get(key);
  if (current !== entry || current.id !== entryId) return;
  const error = { key, characterId, playerColor, cause } satisfies CharacterTextureError;
  entry.loading = false;
  recordCharacterTextureDiagnostic({
    key,
    characterId,
    playerColor,
    svgSourceExists: getCharacterDefinition(characterId).svgSource.length > 0,
    svgSourceLength: getCharacterDefinition(characterId).svgSource.length,
    dataUriLength,
    stage: 'image-onerror',
    loaded: false,
    error: cause instanceof Error ? cause.message : String(cause),
  });
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
  const context = {
    key,
    characterId,
    playerColor,
    svgSourceExists: rawSvg.length > 0,
    svgSourceLength: rawSvg.length,
    dataUriLength: dataUri.length,
  };
  recordCharacterTextureDiagnostic({ ...context, stage: 'image-load-start' });
  const image = new Image();
  image.onload = () => {
    const dimensions = getImageDimensions(image);
    recordCharacterTextureDiagnostic({
      ...context,
      stage: 'image-onload',
      loaded: true,
      imageWidth: dimensions.width,
      imageHeight: dimensions.height,
    });

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
        dataUri.length,
      );
      return;
    }
    recordCharacterTextureDiagnostic({
      ...context,
      stage: 'canvas-texture-created',
      loaded: true,
      imageWidth: CHARACTER_TEXTURE_RASTER_SIZE,
      imageHeight: CHARACTER_TEXTURE_RASTER_SIZE,
    });
    const current = textureCache.get(key);
    if (current !== entry || current.id !== entryId || entry.refs === 0) {
      recordCharacterTextureDiagnostic({ ...context, stage: 'canvas-texture-stale', loaded: true });
      texture.dispose();
      return;
    }
    entry.texture = texture;
    entry.loading = false;
    [...entry.listeners.keys()].forEach(listener => {
      if (textureCache.get(key) === entry && entry.refs > 0) {
        recordCharacterTextureDiagnostic({ ...context, stage: 'cache-listener', loaded: true });
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
    dataUri.length,
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
  const definition = getCharacterDefinition(characterId);
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
  recordCharacterTextureDiagnostic({
    key,
    characterId,
    playerColor,
    svgSourceExists: definition.svgSource.length > 0,
    svgSourceLength: definition.svgSource.length,
    dataUriLength: 0,
    stage: entry.texture ? 'cache-hit' : 'cache-acquire',
    loaded: Boolean(entry.texture),
  });
  if (entry.texture) {
    onReady(entry.texture);
  } else if (!entry.loading) {
    entry.loading = true;
    try {
      startTextureLoad(key, entry, characterId, playerColor);
    } catch (cause) {
      notifyTextureError(key, entry, entry.id, characterId, playerColor, cause, 0);
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
  resetCharacterTextureDiagnosticsForTests();
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const debugWindow = window as Window & {
    __probeOwnTheBlockCharacterTexture?: typeof probeCharacterTexturePipeline;
  };
  debugWindow.__probeOwnTheBlockCharacterTexture = probeCharacterTexturePipeline;
  if (new URLSearchParams(window.location.search).get('characterTextureDebug') === '1') {
    void probeCharacterTexturePipeline().then(result => {
      console.info('[character-texture-probe]', JSON.stringify(result));
    });
  }
}
