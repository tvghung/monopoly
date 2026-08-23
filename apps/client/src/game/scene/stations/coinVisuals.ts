import * as THREE from 'three';

export const COIN_RADIUS = 0.21;
export const COIN_THICKNESS = 0.082;
export const COIN_RADIAL_SEGMENTS = 16;
export type CoinFinish = 'COPPER' | 'SILVER' | 'GOLD';

export const COIN_COPPER = new THREE.Color('#d98250');
export const COIN_SILVER = new THREE.Color('#edf5f7');
export const COIN_GOLD = new THREE.Color('#f2bd3f');
export const COIN_DISABLED = new THREE.Color('#8d9692');
export const COIN_FINISH_ORDER: readonly CoinFinish[] = ['COPPER', 'SILVER', 'GOLD'];
export const COIN_FINISH_SEQUENCE: readonly CoinFinish[] = [
  'COPPER', 'COPPER', 'COPPER', 'COPPER', 'COPPER', 'COPPER',
  'SILVER', 'SILVER',
  'GOLD',
];

export const SHARED_COIN_GEOMETRY = new THREE.CylinderGeometry(
  COIN_RADIUS,
  COIN_RADIUS,
  COIN_THICKNESS,
  COIN_RADIAL_SEGMENTS,
);

export const COIN_FINISH_MATERIALS: Record<CoinFinish, THREE.MeshPhysicalMaterial> = {
  COPPER: new THREE.MeshPhysicalMaterial({
    color: COIN_COPPER,
    roughness: 0.2,
    metalness: 0.86,
    clearcoat: 0.32,
    clearcoatRoughness: 0.16,
    reflectivity: 0.7,
  }),
  SILVER: new THREE.MeshPhysicalMaterial({
    color: COIN_SILVER,
    roughness: 0.18,
    metalness: 0.9,
    clearcoat: 0.3,
    clearcoatRoughness: 0.14,
    reflectivity: 0.72,
  }),
  GOLD: new THREE.MeshPhysicalMaterial({
    color: COIN_GOLD,
    roughness: 0.19,
    metalness: 0.88,
    clearcoat: 0.32,
    clearcoatRoughness: 0.15,
    reflectivity: 0.72,
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
