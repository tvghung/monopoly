import * as THREE from 'three';

/**
 * The full-screen programs of the high tier's post-processing chain (Phase B3). The chain's passes keep their materials in
 * private fields (the ambient occlusion pass alone holds six, the bloom effect three more inside its own sub-passes), and none
 * of them is part of the scene graph, so `renderer.compile(scene)` never reaches them and the first High frame links about ten
 * programs one by one. They are found by walking the chain's own object graph (a few levels, no scene, textures, renderer or
 * targets) and compiled on a one-triangle stand-in with the target the owning pass draws into.
 */

interface ChainPass {
  enabled: boolean;
  name: string;
  renderToScreen?: boolean;
}

export interface PostChainMaterial {
  material: THREE.ShaderMaterial;
  /** True for the pass that writes to the canvas: its program is keyed on drawing there, not into a buffer. */
  toScreen: boolean;
  owner: string;
}

const MAX_DEPTH = 4;
const MAX_ARRAY = 32;

function isShaderMaterial(value: unknown): value is THREE.ShaderMaterial {
  return (value as THREE.ShaderMaterial | null)?.isShaderMaterial === true;
}

function isWalkable(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  // Never descend into the heavy or cyclic parts of the graph: the renderer and its buffers, scenes, cameras, textures.
  return !candidate.isWebGLRenderer && !candidate.isTexture && !candidate.isScene && !candidate.isCamera
    && !candidate.isWebGLRenderTarget && !candidate.isBufferGeometry && !candidate.isLight
    && !(typeof Node !== 'undefined' && value instanceof Node);
}

/** Every distinct shader material reachable from one pass: its own, those of its effects and of its sub-passes. */
export function collectPassMaterials(pass: object): THREE.ShaderMaterial[] {
  const found = new Set<THREE.ShaderMaterial>();
  const visited = new Set<unknown>();
  const visit = (value: unknown, depth: number): void => {
    if (isShaderMaterial(value)) {
      found.add(value);
      return;
    }
    // A mesh (a full-screen quad) holds its material.
    const meshMaterial = (value as THREE.Mesh | null)?.material;
    if ((value as THREE.Mesh | null)?.isMesh && isShaderMaterial(meshMaterial)) {
      found.add(meshMaterial);
      return;
    }
    if (depth > MAX_DEPTH || !isWalkable(value) || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.slice(0, MAX_ARRAY).forEach(entry => visit(entry, depth + 1));
      return;
    }
    for (const key of Object.keys(value)) visit((value)[key], depth + 1);
  };
  visit(pass, 0);
  return [...found];
}

/** All shader materials of the enabled passes of a chain, each with the kind of target its pass draws into. */
export function collectPostChainMaterials(chain: { passes: readonly ChainPass[] }): PostChainMaterial[] {
  const seen = new Set<THREE.ShaderMaterial>();
  const out: PostChainMaterial[] = [];
  for (const pass of chain.passes) {
    if (!pass.enabled) continue;
    for (const material of collectPassMaterials(pass)) {
      if (seen.has(material)) continue;
      seen.add(material);
      out.push({ material, toScreen: pass.renderToScreen === true, owner: pass.name });
    }
  }
  return out;
}

/** One triangle covering the screen: position and uv, the layout every post pass draws with. */
export function createFullscreenTriangle(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return geometry;
}
