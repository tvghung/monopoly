import type * as THREE from 'three';
import { FINALIZE_SLICE_MS, type CompileStatus, type WarmupRenderer } from './shaderCompile';

/**
 * Texture uploads for the first frames (Phase B3). Once every program is ready, what is left in the first frame is mostly
 * uploading the textures the scene's materials sample (about 140 ms of `texSubImage2D` cold on the reference machine for 28
 * of them). `renderer.initTexture()` does the upload without drawing, so the warm-up does it a few at a time between
 * browser tasks instead of inside one frame.
 */

function isUploadable(texture: THREE.Texture): boolean {
  if (texture.isRenderTargetTexture || texture.version === 0) return false;
  const image = texture.image as { complete?: boolean } | null | undefined;
  return image != null && image.complete !== false;
}

/** Every distinct, ready texture a material in `roots` samples: its map-like properties and its shader uniforms. */
export function collectTextures(roots: readonly THREE.Object3D[]): THREE.Texture[] {
  const found = new Set<THREE.Texture>();
  const add = (value: unknown) => {
    const texture = value as THREE.Texture | null | undefined;
    if (texture?.isTexture && isUploadable(texture)) found.add(texture);
  };
  const seenMaterials = new Set<THREE.Material>();
  for (const root of roots) {
    root.traverse(object => {
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const entry of Array.isArray(material) ? material : [material]) {
        if (!entry || seenMaterials.has(entry)) continue;
        seenMaterials.add(entry);
        for (const value of Object.values(entry)) add(value);
        const uniforms = (entry as THREE.ShaderMaterial).uniforms as Record<string, { value: unknown }> | undefined;
        if (uniforms) for (const uniform of Object.values(uniforms)) add(uniform.value);
      }
    });
  }
  return [...found];
}

export interface TextureUploadOptions {
  signal: AbortSignal;
  deadlineMs: number;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
}

/** Uploads the textures in slices of about `FINALIZE_SLICE_MS`, yielding to the browser between slices. */
export async function uploadTextures(
  renderer: Pick<WarmupRenderer, 'initTexture'>,
  textures: readonly THREE.Texture[],
  options: TextureUploadOptions,
): Promise<CompileStatus> {
  const now = options.now ?? (() => performance.now());
  const schedule = options.setTimeout ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const startedAt = now();
  let sliceStartedAt = startedAt;
  for (const texture of textures) {
    if (options.signal.aborted) return 'aborted';
    if (now() - startedAt > options.deadlineMs) return 'timeout';
    renderer.initTexture(texture);
    if (now() - sliceStartedAt >= FINALIZE_SLICE_MS) {
      await new Promise<void>(resolve => { schedule(resolve, 0); });
      sliceStartedAt = now();
    }
  }
  return options.signal.aborted ? 'aborted' : 'ready';
}
