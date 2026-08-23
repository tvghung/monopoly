import * as THREE from 'three';

export const COIN_RADIUS = 0.21;
export const COIN_THICKNESS = 0.082;
export const COIN_RADIAL_SEGMENTS = 12;
export const COIN_BEVEL_SIZE = 0.018;
export const COIN_BEVEL_THICKNESS = 0.012;
export type CoinFinish = 'COPPER' | 'SILVER' | 'GOLD';

export const COIN_COPPER = new THREE.Color('#e7a070');
export const COIN_SILVER = new THREE.Color('#f6fbff');
export const COIN_GOLD = new THREE.Color('#ffd45f');
export const COIN_DISABLED = new THREE.Color('#8d9692');
export const COIN_FINISH_ORDER: readonly CoinFinish[] = ['COPPER', 'SILVER', 'GOLD'];
export const COIN_FINISH_SEQUENCE: readonly CoinFinish[] = [
  'COPPER', 'COPPER', 'COPPER', 'COPPER', 'COPPER', 'COPPER',
  'SILVER', 'SILVER',
  'GOLD',
];

const coinShape = new THREE.Shape();
coinShape.absarc(0, 0, COIN_RADIUS, 0, Math.PI * 2, false);

export const SHARED_COIN_GEOMETRY = new THREE.ExtrudeGeometry(coinShape, {
  depth: COIN_THICKNESS,
  curveSegments: COIN_RADIAL_SEGMENTS,
  bevelEnabled: true,
  bevelSegments: 1,
  steps: 1,
  bevelSize: COIN_BEVEL_SIZE,
  bevelThickness: COIN_BEVEL_THICKNESS,
});
SHARED_COIN_GEOMETRY.translate(0, 0, -COIN_THICKNESS / 2);
SHARED_COIN_GEOMETRY.rotateX(Math.PI / 2);
SHARED_COIN_GEOMETRY.computeVertexNormals();

export const COIN_FINISH_MATERIALS: Record<CoinFinish, THREE.MeshPhysicalMaterial> = {
  COPPER: new THREE.MeshPhysicalMaterial({
    color: COIN_COPPER,
    roughness: 0.18,
    metalness: 0.56,
    clearcoat: 0.62,
    clearcoatRoughness: 0.1,
    reflectivity: 0.9,
    emissive: COIN_COPPER,
    emissiveIntensity: 0.025,
  }),
  SILVER: new THREE.MeshPhysicalMaterial({
    color: COIN_SILVER,
    roughness: 0.15,
    metalness: 0.62,
    clearcoat: 0.7,
    clearcoatRoughness: 0.08,
    reflectivity: 0.95,
    emissive: COIN_SILVER,
    emissiveIntensity: 0.02,
  }),
  GOLD: new THREE.MeshPhysicalMaterial({
    color: COIN_GOLD,
    roughness: 0.17,
    metalness: 0.58,
    clearcoat: 0.66,
    clearcoatRoughness: 0.09,
    reflectivity: 0.92,
    emissive: COIN_GOLD,
    emissiveIntensity: 0.025,
  }),
};

export function stableCoinSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function coinFinishForIndex(index: number, seed = 0): CoinFinish {
  const safeIndex = Math.max(0, Math.floor(index));
  return COIN_FINISH_SEQUENCE[(safeIndex + Math.floor(seed)) % COIN_FINISH_SEQUENCE.length] ?? 'COPPER';
}
