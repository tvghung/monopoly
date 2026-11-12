import * as THREE from 'three';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { CHARACTER_REGISTRY } from './characterRegistry';
import { characterSvgDataUri } from './characterSvg';
import {
  CHARACTER_ART_SIZE,
  CHARACTER_BORDER_COLOR,
  CHARACTER_BORDER_PX,
  CHARACTER_RIM_COLOR,
  CHARACTER_RIM_PX,
  CHARACTER_TEXTURE_SIZE,
  acquireCharacterTexture,
  getCharacterTextureCacheSize,
  getDilationOffsets,
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
  context: { fillRect: ReturnType<typeof vi.fn>; globalCompositeOperation: string; fillStyle: string };
} {
  MockImage.instances = [];
  vi.stubGlobal('Image', MockImage);
  const drawImage = vi.fn();
  const context = {
    clearRect: vi.fn(),
    drawImage,
    fillRect: vi.fn(),
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  return { images: MockImage.instances, drawImage, context };
}

describe('character texture cache lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCharacterTextureCacheForTests();
  });

  it('uses the exact colorized URI and bakes a ready, mipmapped 512px die-cut CanvasTexture', () => {
    const { images, drawImage, context } = mockImagePipeline();
    const fillStyles: string[] = [];
    context.fillRect.mockImplementation(() => fillStyles.push(context.fillStyle));
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
    expect(texture.image.width).toBe(CHARACTER_TEXTURE_SIZE);
    expect(texture.image.height).toBe(CHARACTER_TEXTURE_SIZE);
    // A power of two, so every WebGL context can build the mip chain that keeps the border whole when the card is small.
    expect(Math.log2(CHARACTER_TEXTURE_SIZE) % 1).toBe(0);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.anisotropy).toBeGreaterThan(1);

    // The SVG is rasterized exactly once, at the art size; every other copy is a bitmap of it.
    const svgDraws = drawImage.mock.calls.filter(call => call[0] === images[0]);
    expect(svgDraws).toEqual([[images[0], 0, 0, CHARACTER_ART_SIZE, CHARACTER_ART_SIZE]]);
    const margin = (CHARACTER_TEXTURE_SIZE - CHARACTER_ART_SIZE) / 2;
    const artCanvas = drawImage.mock.calls[1]?.[0] as HTMLCanvasElement;
    // Border: one copy of the art per offset of a solid disc of the border radius, flattened to white.
    const borderDraws = drawImage.mock.calls.slice(1, 1 + getDilationOffsets(CHARACTER_BORDER_PX).length);
    borderDraws.forEach((call, index) => {
      const [dx, dy] = getDilationOffsets(CHARACTER_BORDER_PX)[index];
      expect(call).toEqual([artCanvas, margin + dx, margin + dy]);
    });
    // Rim around the border, then rim, border and art layered; the art sits in the middle of the card.
    expect(fillStyles).toEqual([CHARACTER_BORDER_COLOR, CHARACTER_RIM_COLOR]);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, CHARACTER_TEXTURE_SIZE, CHARACTER_TEXTURE_SIZE);
    expect(drawImage).toHaveBeenLastCalledWith(artCanvas, margin, margin);
    expect(context.globalCompositeOperation).toBe('source-over');
    release();
  });

  it('dilates with a solid disc: rings and directions close enough that a silhouette grows without notches', () => {
    const offsets = getDilationOffsets(CHARACTER_BORDER_PX);
    const radii = [...new Set(offsets.map(([x, y]) => Math.round(Math.hypot(x, y) * 1000) / 1000))].sort((a, b) => a - b);
    expect(radii.at(-1)).toBeCloseTo(CHARACTER_BORDER_PX, 5);
    // Rings no more than 5 px apart, starting within 5 px of the art.
    radii.forEach((radius, index) => expect(radius - (radii[index - 1] ?? 0)).toBeLessThanOrEqual(5 + 1e-6));
    // Neighbouring copies on the outer ring are at most 2 px apart (the first bake left ~2.4 px gaps on a 6 px ring).
    const outer = offsets.filter(([x, y]) => Math.abs(Math.hypot(x, y) - CHARACTER_BORDER_PX) < 1e-6);
    const chord = Math.hypot(outer[1][0] - outer[0][0], outer[1][1] - outer[0][1]);
    expect(chord).toBeLessThanOrEqual(2);
    // The border is a visible share of the art (≥ 3%), not the ~1 screen pixel line of the first bake.
    expect(CHARACTER_BORDER_PX / CHARACTER_ART_SIZE).toBeGreaterThanOrEqual(0.03);
    expect(CHARACTER_TEXTURE_SIZE - CHARACTER_ART_SIZE).toBeGreaterThanOrEqual(2 * (CHARACTER_BORDER_PX + CHARACTER_RIM_PX));
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
