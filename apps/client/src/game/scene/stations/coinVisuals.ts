import * as THREE from 'three';

export const COIN_RADIUS = 0.21;
export const COIN_THICKNESS = 0.1;
export const COIN_RADIAL_SEGMENTS = 12;
export const COIN_BEVEL_SIZE = 0.012;
export const COIN_BEVEL_THICKNESS = 0.012;
export const COIN_RIM_WIDTH = 0.034;
export const COIN_RIM_RAISE = 0.009;
export type CoinFinish = 'COPPER' | 'SILVER' | 'GOLD';

export const COIN_COPPER = new THREE.Color('#b8734f');
export const COIN_SILVER = new THREE.Color('#dbe4e8');
export const COIN_GOLD = new THREE.Color('#d6a932');
export const COIN_DISABLED = new THREE.Color('#8d9692');
export const COIN_FINISH_ORDER: readonly CoinFinish[] = ['COPPER', 'SILVER', 'GOLD'];
export const COIN_FINISH_SEQUENCE: readonly CoinFinish[] = [
  'COPPER', 'COPPER', 'COPPER', 'COPPER', 'COPPER', 'COPPER',
  'SILVER', 'SILVER',
  'GOLD',
];

const coinHalfThickness = COIN_THICKNESS / 2;
const coinInnerRadius = COIN_RADIUS - COIN_RIM_WIDTH;
const coinFaceY = coinHalfThickness - COIN_RIM_RAISE;
const coinProfile = [
  new THREE.Vector2(0, -coinHalfThickness),
  new THREE.Vector2(COIN_RADIUS - COIN_BEVEL_SIZE, -coinHalfThickness),
  new THREE.Vector2(COIN_RADIUS, -coinHalfThickness + COIN_BEVEL_SIZE),
  new THREE.Vector2(COIN_RADIUS, coinHalfThickness - COIN_BEVEL_SIZE),
  new THREE.Vector2(COIN_RADIUS - COIN_BEVEL_SIZE, coinHalfThickness),
  new THREE.Vector2(coinInnerRadius, coinHalfThickness),
  new THREE.Vector2(coinInnerRadius - COIN_BEVEL_SIZE, coinFaceY),
  new THREE.Vector2(0, coinFaceY),
];

export const SHARED_COIN_GEOMETRY = new THREE.LatheGeometry(
  coinProfile,
  COIN_RADIAL_SEGMENTS,
);
SHARED_COIN_GEOMETRY.computeVertexNormals();

const COIN_ENV_MAP_INTENSITY: Record<CoinFinish, number> = {
  COPPER: 1.08,
  SILVER: 1.24,
  GOLD: 1.14,
};

export const COIN_FINISH_MATERIALS: Record<CoinFinish, THREE.MeshPhysicalMaterial> = {
  COPPER: new THREE.MeshPhysicalMaterial({
    color: COIN_COPPER,
    roughness: 0.17,
    metalness: 0.74,
    clearcoat: 0.38,
    clearcoatRoughness: 0.12,
    reflectivity: 0.88,
    emissive: '#000000',
    emissiveIntensity: 0,
    envMapIntensity: COIN_ENV_MAP_INTENSITY.COPPER,
  }),
  SILVER: new THREE.MeshPhysicalMaterial({
    color: COIN_SILVER,
    roughness: 0.13,
    metalness: 0.8,
    clearcoat: 0.44,
    clearcoatRoughness: 0.09,
    reflectivity: 0.95,
    emissive: '#000000',
    emissiveIntensity: 0,
    envMapIntensity: COIN_ENV_MAP_INTENSITY.SILVER,
  }),
  GOLD: new THREE.MeshPhysicalMaterial({
    color: COIN_GOLD,
    roughness: 0.15,
    metalness: 0.77,
    clearcoat: 0.4,
    clearcoatRoughness: 0.1,
    reflectivity: 0.91,
    emissive: '#000000',
    emissiveIntensity: 0,
    envMapIntensity: COIN_ENV_MAP_INTENSITY.GOLD,
  }),
};

export function applyCoinEnvironmentMap(envMap: THREE.Texture | null): void {
  COIN_FINISH_ORDER.forEach(finish => {
    const material = COIN_FINISH_MATERIALS[finish];
    material.envMap = envMap;
    material.envMapIntensity = COIN_ENV_MAP_INTENSITY[finish];
    material.needsUpdate = true;
  });
}

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

const COIN_TILT_PATTERN: readonly (readonly [number, number])[] = [
  [2.6, -3.2],
  [-3.4, 2.2],
  [2.1, 3.5],
  [-2.5, -2.8],
];

export function coinTiltForIndex(
  index: number,
  seed = 0,
  featured = true,
): readonly [number, number] {
  if (!featured) return [0, 0];
  const safeIndex = Math.max(0, Math.floor(index));
  const pattern = COIN_TILT_PATTERN[
    (safeIndex + Math.floor(seed)) % COIN_TILT_PATTERN.length
  ] ?? [0, 0];
  return [
    THREE.MathUtils.degToRad(pattern[0]),
    THREE.MathUtils.degToRad(pattern[1]),
  ];
}
