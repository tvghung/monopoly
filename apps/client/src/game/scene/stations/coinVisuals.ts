import * as THREE from 'three';

export const COIN_RADIUS = 0.14;
export const COIN_THICKNESS = 0.06;
export const COIN_RADIAL_SEGMENTS = 14;
export type CoinFinish = 'COPPER' | 'SILVER' | 'GOLD';

export const COIN_COPPER = new THREE.Color('#bd7048');
export const COIN_SILVER = new THREE.Color('#d7e0e2');
export const COIN_GOLD = new THREE.Color('#e6ad36');
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

export const COIN_FINISH_MATERIALS: Record<CoinFinish, THREE.MeshStandardMaterial> = {
  COPPER: new THREE.MeshStandardMaterial({
    color: COIN_COPPER,
    roughness: 0.22,
    metalness: 0.84,
  }),
  SILVER: new THREE.MeshStandardMaterial({
    color: COIN_SILVER,
    roughness: 0.2,
    metalness: 0.88,
  }),
  GOLD: new THREE.MeshStandardMaterial({
    color: COIN_GOLD,
    roughness: 0.2,
    metalness: 0.86,
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
