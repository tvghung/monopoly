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

function readUnknownProperty(value: unknown, property: PropertyKey): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }
  return Reflect.get(value, property);
}

export function estimateSceneTriangles(root: THREE.Object3D): number {
  let triangleCount = 0;
  root.traverse(object => {
    if (readUnknownProperty(object, 'isMesh') !== true) return;
    const candidateGeometry = readUnknownProperty(object, 'geometry');
    if (!(candidateGeometry instanceof THREE.BufferGeometry)) return;
    const geometry = candidateGeometry;
    const indexCount = readUnknownProperty(readUnknownProperty(geometry, 'index'), 'count');
    const attributes = readUnknownProperty(geometry, 'attributes');
    const positionCount = readUnknownProperty(
      readUnknownProperty(attributes, 'position'),
      'count',
    );
    const elementCount = typeof indexCount === 'number'
      ? indexCount
      : typeof positionCount === 'number' ? positionCount : 0;
    const instanceCount = object instanceof THREE.InstancedMesh ? object.count : 1;
    triangleCount += Math.floor(elementCount / 3) * instanceCount;
  });
  return triangleCount;
}
