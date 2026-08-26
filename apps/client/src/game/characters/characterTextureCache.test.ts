import * as THREE from 'three';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { CHARACTER_REGISTRY } from './characterRegistry';
import { characterSvgDataUri } from './characterSvg';
import {
  acquireCharacterTexture,
  getCharacterTextureCacheSize,
  resetCharacterTextureCacheForTests,
} from './characterTextureCache';

class MockImage {
  static instances: MockImage[] = [];

  onload: (() => void) | null = null;
  onerror: ((cause: unknown) => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  width = 0;
  height = 0;
  complete = false;
  private source = '';

  constructor() {
    MockImage.instances.push(this);
  }

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
  }

  resolve(width = 150, height = 150): void {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.width = width;
    this.height = height;
    this.complete = true;
    this.onload?.();
  }

  reject(cause: unknown): void {
    this.complete = true;
    this.onerror?.(cause);
  }
}

function mockImagePipeline(): {
  images: MockImage[];
  drawImage: ReturnType<typeof vi.fn>;
} {
  MockImage.instances = [];
  vi.stubGlobal('Image', MockImage);
  const drawImage = vi.fn();
  const context = {
    clearRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  return { images: MockImage.instances, drawImage };
}

describe('character texture cache lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCharacterTextureCacheForTests();
  });

  it('uses the exact colorized URI and rasterizes a ready 256px CanvasTexture', () => {
    const { images, drawImage } = mockImagePipeline();
    const ready = vi.fn();
    const release = acquireCharacterTexture('dog', 'red', ready);

    expect(images).toHaveLength(1);
    expect(images[0].src).toBe(
      characterSvgDataUri(CHARACTER_REGISTRY.dog.svgSource, 'red'),
    );
    expect(ready).not.toHaveBeenCalled();

    images[0].resolve();

    const texture = ready.mock.calls[0]?.[0] as THREE.CanvasTexture;
    expect(ready).toHaveBeenCalledTimes(1);
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    expect(texture.image.width).toBe(256);
    expect(texture.image.height).toBe(256);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(drawImage).toHaveBeenCalledWith(images[0], 0, 0, 256, 256);
    release();
  });

  it('delivers image failure through onError, never publishes a placeholder, and retries', () => {
    const { images } = mockImagePipeline();
    const ready = vi.fn();
    const error = vi.fn();
    const release = acquireCharacterTexture('dog', 'red', ready, error);
    const cause = new Error('SVG decode failed');

    images[0].reject(cause);

    expect(ready).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({
      key: 'dog:red',
      characterId: 'dog',
      playerColor: 'red',
      cause,
    }));

    release();
    const retryReady = vi.fn();
    const retryRelease = acquireCharacterTexture('dog', 'red', retryReady);

    expect(images).toHaveLength(2);
    images[1].resolve();
    expect(retryReady).toHaveBeenCalledWith(expect.any(THREE.CanvasTexture));
    retryRelease();
    expect(getCharacterTextureCacheSize()).toBe(0);
  });

  it('disposes a stale rasterized load and never attaches it to a replacement entry', () => {
    const { images } = mockImagePipeline();
    const dispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const staleReady = vi.fn();
    const replacementReady = vi.fn();

    const releaseStale = acquireCharacterTexture('panda', 'blue', staleReady);
    releaseStale();
    const releaseReplacement = acquireCharacterTexture('panda', 'blue', replacementReady);

    expect(images).toHaveLength(2);
    images[0].resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(staleReady).not.toHaveBeenCalled();

    images[1].resolve();
    expect(replacementReady).toHaveBeenCalledWith(expect.any(THREE.CanvasTexture));
    releaseReplacement();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(getCharacterTextureCacheSize()).toBe(0);
  });

  it('shares one rasterization and disposes only after the last reference releases', () => {
    const { images } = mockImagePipeline();
    const dispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const firstReady = vi.fn<(texture: THREE.Texture) => void>();
    const secondReady = vi.fn<(texture: THREE.Texture) => void>();
    const firstRelease = acquireCharacterTexture('panda', 'blue', firstReady);
    const secondRelease = acquireCharacterTexture('panda', 'blue', secondReady);

    expect(images).toHaveLength(1);
    images[0].resolve();
    const texture = firstReady.mock.calls[0]?.[0];
    expect(firstReady).toHaveBeenCalledWith(texture);
    expect(secondReady).toHaveBeenCalledWith(texture);

    firstRelease();
    expect(dispose).not.toHaveBeenCalled();
    expect(getCharacterTextureCacheSize()).toBe(1);
    secondRelease();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(getCharacterTextureCacheSize()).toBe(0);
  });
});
