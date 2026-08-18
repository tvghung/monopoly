import * as THREE from 'three';
import {
  acquireCharacterTexture,
  getCharacterTextureCacheSize,
  resetCharacterTextureCacheForTests,
} from './characterTextureCache';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('character texture cache lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetCharacterTextureCacheForTests();
  });

  it('disposes a stale load and never attaches it to a replacement entry', () => {
    type LoadedTexture = THREE.Texture<HTMLImageElement>;
    const pendingLoads: Array<(texture: LoadedTexture) => void> = [];
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, onLoad) => {
      if (onLoad) pendingLoads.push(onLoad);
      return new THREE.Texture();
    });
    const staleTexture = new THREE.Texture<HTMLImageElement>();
    const replacementTexture = new THREE.Texture<HTMLImageElement>();
    const staleDispose = vi.spyOn(staleTexture, 'dispose');
    const replacementDispose = vi.spyOn(replacementTexture, 'dispose');
    const staleReady = vi.fn();
    const replacementReady = vi.fn();

    const releaseStale = acquireCharacterTexture('shiba', 'red', staleReady);
    releaseStale();
    const releaseReplacement = acquireCharacterTexture('shiba', 'red', replacementReady);

    expect(pendingLoads).toHaveLength(2);
    pendingLoads[0](staleTexture);
    expect(staleDispose).toHaveBeenCalledTimes(1);
    expect(replacementReady).not.toHaveBeenCalled();

    pendingLoads[1](replacementTexture);
    expect(replacementReady).toHaveBeenCalledWith(replacementTexture);
    releaseReplacement();
    expect(replacementDispose).toHaveBeenCalledTimes(1);
    expect(getCharacterTextureCacheSize()).toBe(0);
  });

  it('does not notify a released acquisition and keeps release idempotent', () => {
    type LoadedTexture = THREE.Texture<HTMLImageElement>;
    const pendingLoads: Array<(texture: LoadedTexture) => void> = [];
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, onLoad) => {
      if (onLoad) pendingLoads.push(onLoad);
      return new THREE.Texture();
    });
    const ready = vi.fn();
    const release = acquireCharacterTexture('cat', 'blue', ready);
    release();
    release();

    pendingLoads[0](new THREE.Texture<HTMLImageElement>());

    expect(ready).not.toHaveBeenCalled();
    expect(getCharacterTextureCacheSize()).toBe(0);
  });
});
