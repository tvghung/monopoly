import * as THREE from 'three';
import bakedUrl from './studio-environment.cubeuv.f16.z?url';
import bakedMeta from './studio-environment.meta.json';
import { createStudioEnvironmentScene, disposeStudioEnvironmentScene } from './createStudioEnvironmentScene';

/**
 * The studio environment as a file (Phase B3 follow-up, 08G Task 2). Filtering the procedural studio into a PMREM blocks the main
 * thread for about 0.9 s on a cold launch (its convolution shader is the heaviest compile of the page) before any lit
 * program can be compiled, so the filtered result is baked once into `studio-environment.cubeuv.f16.z` (the PMREM render target
 * as raw half-float RGBA, zlib-deflated; 768 x 1024, `PMREMGenerator` layout for its default 256 cube) and uploaded as a
 * `DataTexture` with the same properties.
 *
 * It can never show a stale picture: the metadata stores a hash of everything that goes into the picture (the studio scene as
 * built from the palette and the light rig, the blur sigma, the PMREM layout and the three.js revision) and the baked file is used
 * only while that hash equals the one computed from the code now. Otherwise, and whenever the file cannot be loaded or
 * decompressed, the caller falls back to the procedural PMREM, which is also the generator
 * (`scripts/bakeStudioEnvironment.mjs`). A unit test fails when the committed hash is stale.
 */

/** Blur applied while filtering the studio into the PMREM (plan 02 §8.4); part of the inputs hash. */
export const STUDIO_PMREM_SIGMA = 0.04;
export const BAKED_STUDIO_WIDTH = 768;
export const BAKED_STUDIO_HEIGHT = 1024;
const BYTES_PER_PIXEL = 8;

export interface BakedStudioMeta {
  inputsHash: string;
  width: number;
  height: number;
  bytes: number;
  threeRevision: string;
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/** A hash of every input of the picture: the studio scene's panels (placement, size, color, side), sigma, layout and revision. */
export function studioEnvironmentInputsHash(studio: THREE.Scene = createStudioEnvironmentScene()): string {
  const parts: unknown[] = [STUDIO_PMREM_SIGMA, BAKED_STUDIO_WIDTH, BAKED_STUDIO_HEIGHT, THREE.REVISION];
  studio.updateMatrixWorld(true);
  studio.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const geometry = mesh.geometry as THREE.BufferGeometry & { parameters?: unknown };
    parts.push([
      object.name,
      object.matrixWorld.elements.map(round),
      geometry.type,
      geometry.parameters ?? null,
      material.color.getHexString(),
      material.side,
      material.type,
    ]);
  });
  return fnv1a(JSON.stringify(parts));
}

export const BAKED_STUDIO_META: BakedStudioMeta = bakedMeta;

async function inflate(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).arrayBuffer();
}

let bakedData: Promise<Uint16Array | null> | null = null;

/**
 * Starts (once) fetching and decoding the baked environment; resolves to its half-float data, or null when it cannot be used
 * (no fetch or decompression in this environment, a failed request, a size mismatch, or a stale hash). Called when the scene chunk is
 * evaluated so the request overlaps the canvas creation instead of following it.
 */
export function preloadBakedStudioEnvironment(): Promise<Uint16Array | null> {
  bakedData ??= (async () => {
    try {
      if (typeof fetch !== 'function' || typeof DecompressionStream !== 'function') return null;
      const studio = createStudioEnvironmentScene();
      const current = studioEnvironmentInputsHash(studio);
      disposeStudioEnvironmentScene(studio);
      const expectedBytes = BAKED_STUDIO_WIDTH * BAKED_STUDIO_HEIGHT * BYTES_PER_PIXEL;
      if (
        current !== BAKED_STUDIO_META.inputsHash
        || BAKED_STUDIO_META.width !== BAKED_STUDIO_WIDTH
        || BAKED_STUDIO_META.height !== BAKED_STUDIO_HEIGHT
        || BAKED_STUDIO_META.bytes !== expectedBytes
      ) {
        console.warn('[scene] the baked studio environment is out of date; filtering the studio at runtime.');
        return null;
      }
      const response = await fetch(bakedUrl);
      if (!response.ok) return null;
      const bytes = await inflate(await response.arrayBuffer());
      return bytes.byteLength === expectedBytes ? new Uint16Array(bytes) : null;
    } catch {
      return null;
    }
  })();
  return bakedData;
}

/** The environment texture, built from the baked data with the properties of the PMREM's own render target texture. */
export async function loadBakedStudioEnvironment(): Promise<THREE.DataTexture | null> {
  const data = await preloadBakedStudioEnvironment();
  if (!data) return null;
  const texture = new THREE.DataTexture(data, BAKED_STUDIO_WIDTH, BAKED_STUDIO_HEIGHT, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.mapping = THREE.CubeUVReflectionMapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.name = 'BakedStudioEnvironment';
  return texture;
}

/** For tests: forget the cached download. */
export function resetBakedStudioEnvironmentCache(): void {
  bakedData = null;
}
