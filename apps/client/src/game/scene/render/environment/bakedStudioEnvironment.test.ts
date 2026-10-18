import { readFileSync } from 'node:fs';
import { Blob as NodeBlob } from 'node:buffer';
import { DecompressionStream as NodeDecompressionStream } from 'node:stream/web';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BAKED_STUDIO_HEIGHT,
  BAKED_STUDIO_META,
  BAKED_STUDIO_WIDTH,
  loadBakedStudioEnvironment,
  resetBakedStudioEnvironmentCache,
  studioEnvironmentInputsHash,
} from './bakedStudioEnvironment';
import { createStudioEnvironmentScene } from './createStudioEnvironmentScene';

const assetBytes = readFileSync(resolve(process.cwd(), 'src/game/scene/render/environment/studio-environment.cubeuv.f16.z'));

afterEach(() => {
  vi.unstubAllGlobals();
  resetBakedStudioEnvironmentCache();
});

function stubBrowser(response: () => Response): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response())));
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('DecompressionStream', NodeDecompressionStream);
}

describe('the baked studio environment', () => {
  it('is current: the committed hash is the hash of what the code builds now', () => {
    // When this fails the palette, the light rig, a studio constant, the sigma or three.js changed: run
    // `node scripts/bakeStudioEnvironment.mjs --dist <uat-dist>` (see that script) and commit the two files it writes.
    expect(BAKED_STUDIO_META.inputsHash).toBe(studioEnvironmentInputsHash());
    expect(BAKED_STUDIO_META.threeRevision).toBe(THREE.REVISION);
  });

  it('describes its file: half-float RGBA of the PMREM layout, not empty', () => {
    expect([BAKED_STUDIO_META.width, BAKED_STUDIO_META.height]).toEqual([BAKED_STUDIO_WIDTH, BAKED_STUDIO_HEIGHT]);
    expect(BAKED_STUDIO_META.bytes).toBe(BAKED_STUDIO_WIDTH * BAKED_STUDIO_HEIGHT * 8);
    const raw = inflateSync(assetBytes);
    expect(raw.length).toBe(BAKED_STUDIO_META.bytes);
    expect(raw.some(value => value !== 0)).toBe(true);
  });

  it('hashes every input of the picture', () => {
    const base = studioEnvironmentInputsHash();
    const recolored = createStudioEnvironmentScene();
    ((recolored.getObjectByName('StudioCeiling') as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set('#123456');
    const moved = createStudioEnvironmentScene();
    moved.getObjectByName('StudioSoftbox')?.position.addScalar(1);
    expect(studioEnvironmentInputsHash(recolored)).not.toBe(base);
    expect(studioEnvironmentInputsHash(moved)).not.toBe(base);
    expect(studioEnvironmentInputsHash(createStudioEnvironmentScene())).toBe(base);
  });

  it('loads as a texture with the properties of the PMREM render target texture', async () => {
    stubBrowser(() => new Response(assetBytes));
    const texture = await loadBakedStudioEnvironment();
    expect(texture).not.toBeNull();
    expect(texture?.mapping).toBe(THREE.CubeUVReflectionMapping);
    expect(texture?.type).toBe(THREE.HalfFloatType);
    expect(texture?.format).toBe(THREE.RGBAFormat);
    expect(texture?.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(texture?.generateMipmaps).toBe(false);
    expect(texture?.flipY).toBe(false);
    expect([texture?.image.width, texture?.image.height]).toEqual([BAKED_STUDIO_WIDTH, BAKED_STUDIO_HEIGHT]);
    // The same properties the program key reads from a PMREM texture (mapping and image height).
    const pmrem = new THREE.WebGLRenderTarget(BAKED_STUDIO_WIDTH, BAKED_STUDIO_HEIGHT, { type: THREE.HalfFloatType });
    expect(texture?.image.height).toBe((pmrem.texture.image as { height: number }).height);
    texture?.dispose();
  });

  it('downloads once however often it is asked for', async () => {
    stubBrowser(() => new Response(assetBytes));
    await Promise.all([loadBakedStudioEnvironment(), loadBakedStudioEnvironment()]);
    await loadBakedStudioEnvironment();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('gives nothing, so the caller filters the studio itself, when the file cannot be used', async () => {
    stubBrowser(() => new Response('missing', { status: 404 }));
    expect(await loadBakedStudioEnvironment()).toBeNull();

    resetBakedStudioEnvironmentCache();
    stubBrowser(() => new Response(new Uint8Array([1, 2, 3])));
    expect(await loadBakedStudioEnvironment()).toBeNull();

    resetBakedStudioEnvironmentCache();
    vi.unstubAllGlobals();
    // No fetch or no DecompressionStream (jsdom): nothing is attempted.
    vi.stubGlobal('DecompressionStream', undefined);
    expect(await loadBakedStudioEnvironment()).toBeNull();
  });
});
