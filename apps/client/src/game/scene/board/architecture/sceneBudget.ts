import * as THREE from 'three';

export const TARGET_TRIANGLES = 80_000;
export const HARD_TRIANGLE_LIMIT = 100_000;
export const TARGET_DRAW_CALLS = 210;
export const STRESS_DRAW_CALL_LIMIT = 240;
export const TILE_TEXTURE_ANISOTROPY_CAP = 8;
export const DEFAULT_TILE_TEXTURE_ANISOTROPY = 4;

export function getTileTextureAnisotropy(maxSupported: number): number {
  if (!Number.isFinite(maxSupported)) return 1;
  return Math.max(1, Math.min(TILE_TEXTURE_ANISOTROPY_CAP, Math.floor(maxSupported)));
}

export function estimateSceneTriangles(root: THREE.Object3D): number {
  let triangleCount = 0;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const elementCount = geometry.index?.count
      ?? geometry.getAttribute('position')?.count
      ?? 0;
    const instanceCount = object instanceof THREE.InstancedMesh ? object.count : 1;
    triangleCount += Math.floor(elementCount / 3) * instanceCount;
  });
  return triangleCount;
}
