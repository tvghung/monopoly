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
/**
 * The die-cut standee texture (plan 05 §8.4, reworked by the mascot polish pass): a power-of-two canvas so the GPU can build
 * mipmaps, the art in the middle, a white border around its silhouette and a thin cardboard rim outside the border.
 *
 * The first bake (320² canvas, 6 px border from 16 offset copies, no mipmaps) drew a border about one screen pixel wide at
 * board zoom. Sampled without mipmaps and cut by the alpha test, that border broke into dashes; the gaps between the 16
 * offsets also notched it at sharp corners. The border is now about 3.4% of the art, filled as a solid disc, and mipmapped.
 */
export const CHARACTER_TEXTURE_SIZE = 512;
export const CHARACTER_ART_SIZE = 416;
export const CHARACTER_BORDER_PX = 14;
export const CHARACTER_RIM_PX = 2;
export const CHARACTER_BORDER_COLOR = '#ffffff';
/** Opaque (the face is alpha-tested at 0.5): a light slate edge that keeps the white border readable on the cream tiles. */
export const CHARACTER_RIM_COLOR = '#c3cad5';
/** Largest gap between two neighbouring offsets on a dilation ring, in texture pixels. */
const DILATION_MAX_STEP_PX = 2;
/**
 * Largest gap between two dilation rings. The outer ring alone draws the border of a solid shape; the inner rings only keep
 * features thinner than the border (a whisker, a gap between two ears) from leaving holes, and the art strokes are 7 px.
 */
const DILATION_MAX_RING_GAP_PX = 5;
const CHARACTER_TEXTURE_ANISOTROPY = 4;

/**
 * Offsets that stamp a solid disc of `radius`: concentric rings at most `DILATION_MAX_RING_GAP_PX` apart, each with enough
 * directions that neighbouring copies are at most `DILATION_MAX_STEP_PX` apart. The union of the copies of a silhouette is the
 * silhouette grown by `radius` with round corners and no notches.
 */
export function getDilationOffsets(radius: number): ReadonlyArray<readonly [number, number]> {
  const offsets: Array<readonly [number, number]> = [];
  const rings = Math.max(1, Math.ceil(radius / DILATION_MAX_RING_GAP_PX));
  for (let ring = 1; ring <= rings; ring += 1) {
    const ringRadius = radius * ring / rings;
    const directions = Math.max(8, Math.ceil((2 * Math.PI * ringRadius) / DILATION_MAX_STEP_PX));
    for (let step = 0; step < directions; step += 1) {
      const angle = step / directions * Math.PI * 2;
      offsets.push([Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius]);
    }
  }
  return offsets;
}

function createCanvas(size: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Character texture rasterization requires a 2D canvas context');
  context.clearRect(0, 0, size, size);
  return { canvas, context };
}

/** A texture-sized layer holding the silhouette of `source` (drawn at `x`, `y`) grown by `radius`, in one flat `color`. */
function createDilatedSilhouette(
  source: CanvasImageSource,
  x: number,
  y: number,
  radius: number,
  color: string,
): HTMLCanvasElement {
  const { canvas: layer, context } = createCanvas(CHARACTER_TEXTURE_SIZE);
  getDilationOffsets(radius).forEach(([dx, dy]) => context.drawImage(source, x + dx, y + dy));
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, CHARACTER_TEXTURE_SIZE, CHARACTER_TEXTURE_SIZE);
  context.globalCompositeOperation = 'source-over';
  return layer;
}

function configureTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = CHARACTER_TEXTURE_ANISOTROPY;
}

/**
 * Bakes the die-cut standee texture. The SVG is rasterized once into an art canvas. The border is that bitmap stamped on a disc
 * of offsets and flattened to white (`source-in`); the rim is the border layer grown the same way by a few pixels. Rim, border
 * and art are then layered in that order.
 */
function createRasterizedCharacterTexture(image: HTMLImageElement): THREE.CanvasTexture {
  const size = CHARACTER_TEXTURE_SIZE;
  const margin = (size - CHARACTER_ART_SIZE) / 2;
  const { canvas: artCanvas, context: artContext } = createCanvas(CHARACTER_ART_SIZE);
  artContext.drawImage(image, 0, 0, CHARACTER_ART_SIZE, CHARACTER_ART_SIZE);

  const border = createDilatedSilhouette(artCanvas, margin, margin, CHARACTER_BORDER_PX, CHARACTER_BORDER_COLOR);
  const rim = createDilatedSilhouette(border, 0, 0, CHARACTER_RIM_PX, CHARACTER_RIM_COLOR);
  const { canvas, context } = createCanvas(size);
  context.drawImage(rim, 0, 0);
  context.drawImage(border, 0, 0);
  context.drawImage(artCanvas, margin, margin);

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
