import * as THREE from 'three';
import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import { characterSvgDataUri } from './characterSvg';
import { getCharacterDefinition } from './characterRegistry';
import { recordCharacterTextureDiagnostic } from './characterTextureDiagnostics';

type ProbeEvent = 'onload' | 'onerror' | 'timeout' | 'unavailable';

export interface CharacterTextureProbeResult {
  key: string;
  characterId: CharacterId | null;
  playerColor: PlayerColorId;
  svgSourceExists: boolean;
  svgSourceLength: number;
  dataUriLength: number;
  image: {
    event: ProbeEvent;
    naturalWidth: number;
    naturalHeight: number;
    error?: string;
  };
  textureLoader: {
    event: ProbeEvent;
    imageWidth: number;
    imageHeight: number;
    error?: string;
  };
}

interface ImageDimensions {
  width: number;
  height: number;
}

function getImageDimensions(image: unknown): ImageDimensions {
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

function describeError(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  return String(cause);
}

function loadImage(uri: string, context: Omit<CharacterTextureProbeResult, 'image' | 'textureLoader'>): Promise<CharacterTextureProbeResult['image']> {
  if (typeof Image === 'undefined') {
    return Promise.resolve({ event: 'unavailable', naturalWidth: 0, naturalHeight: 0 });
  }

  return new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const finish = (result: CharacterTextureProbeResult['image']): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => finish({
      event: 'timeout',
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }), 5_000);
    image.onload = () => {
      clearTimeout(timer);
      finish({
        event: 'onload',
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });
    };
    image.onerror = cause => {
      clearTimeout(timer);
      finish({
        event: 'onerror',
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        error: describeError(cause),
      });
    };
    recordCharacterTextureDiagnostic({
      ...context,
      stage: 'image-load-start',
    });
    image.src = uri;
  });
}

function loadTexture(uri: string, context: Omit<CharacterTextureProbeResult, 'image' | 'textureLoader'>): Promise<CharacterTextureProbeResult['textureLoader']> {
  if (typeof Image === 'undefined') {
    return Promise.resolve({ event: 'unavailable', imageWidth: 0, imageHeight: 0 });
  }

  return new Promise(resolve => {
    const loader = new THREE.TextureLoader();
    let settled = false;
    let loadedTexture: THREE.Texture | undefined;
    const finish = (result: CharacterTextureProbeResult['textureLoader']): void => {
      if (settled) return;
      settled = true;
      loadedTexture?.dispose();
      resolve(result);
    };
    const timer = setTimeout(() => finish({
      event: 'timeout',
      imageWidth: getImageDimensions(loadedTexture?.image).width,
      imageHeight: getImageDimensions(loadedTexture?.image).height,
    }), 5_000);
    recordCharacterTextureDiagnostic({
      ...context,
      stage: 'texture-loader-probe-start',
    });
    try {
      loadedTexture = loader.load(
        uri,
        texture => {
          clearTimeout(timer);
          const dimensions = getImageDimensions(texture.image);
          recordCharacterTextureDiagnostic({
            ...context,
            stage: 'texture-loader-probe-onload',
            loaded: true,
            imageWidth: dimensions.width,
            imageHeight: dimensions.height,
          });
          finish({
            event: 'onload',
            imageWidth: dimensions.width,
            imageHeight: dimensions.height,
          });
        },
        undefined,
        cause => {
          clearTimeout(timer);
          const dimensions = getImageDimensions(loadedTexture?.image);
          recordCharacterTextureDiagnostic({
            ...context,
            stage: 'texture-loader-probe-onerror',
            loaded: false,
            imageWidth: dimensions.width,
            imageHeight: dimensions.height,
            error: describeError(cause),
          });
          finish({
            event: 'onerror',
            imageWidth: dimensions.width,
            imageHeight: dimensions.height,
            error: describeError(cause),
          });
        },
      );
    } catch (cause) {
      clearTimeout(timer);
      finish({ event: 'onerror', imageWidth: 0, imageHeight: 0, error: describeError(cause) });
    }
  });
}

export async function probeCharacterTexturePipeline(
  characterId: CharacterId | null = 'shiba',
  playerColor: PlayerColorId = 'red',
): Promise<CharacterTextureProbeResult> {
  const key = `${characterId ?? 'legacy'}:${playerColor}`;
  const definition = getCharacterDefinition(characterId);
  const rawSvg = definition.svgSource;
  const uri = characterSvgDataUri(rawSvg, playerColor);
  const context = {
    key,
    characterId,
    playerColor,
    svgSourceExists: rawSvg.length > 0,
    svgSourceLength: rawSvg.length,
    dataUriLength: uri.length,
  };
  recordCharacterTextureDiagnostic({ ...context, stage: 'probe-start' });
  const image = await loadImage(uri, context);
  const textureLoader = await loadTexture(uri, context);
  return { ...context, image, textureLoader };
}
