import { AIRPORT_RUNWAY_INNER_HALF_SIZE } from './airportRunwayGeometry';

export const CENTER_PEBBLE_SEED = 0x2f6a91;
export const CENTER_PEBBLE_COUNT = 72;
export const CENTER_PEBBLE_COVERAGE_TARGET = 0.03;
export const CENTER_TRAIL_COVERAGE_TARGET = 0.05;
export const CENTER_PEBBLE_TIMER_MARGIN = 0.24;
export const CENTER_TRAIL_BOUNDARY_MARGIN = 0.12;
export const CENTER_TRAIL_TIMER_MARGIN = 0.1;
export const CENTER_TIMER_CLEAR_ZONE: readonly [number, number, number, number] = [
  -1.25,
  -2.7,
  1.25,
  -1.05,
];

export interface CenterPebbleSpec {
  position: readonly [number, number];
  scale: readonly [number, number];
  rotation: number;
  colorIndex: number;
}

export interface CenterTrailSpec {
  position: readonly [number, number];
  length: number;
  width: number;
  rotation: number;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function isInsideTimerClearZone(
  x: number,
  z: number,
  margin = CENTER_PEBBLE_TIMER_MARGIN,
): boolean {
  const [minX, minZ, maxX, maxZ] = CENTER_TIMER_CLEAR_ZONE;
  return x >= minX - margin
    && x <= maxX + margin
    && z >= minZ - margin
    && z <= maxZ + margin;
}

export function createCenterPebbleSpecs(
  innerHalfSize = AIRPORT_RUNWAY_INNER_HALF_SIZE,
): readonly CenterPebbleSpec[] {
  const random = createSeededRandom(CENTER_PEBBLE_SEED);
  const margin = 0.22;
  const specs: CenterPebbleSpec[] = [];
  let attempts = 0;
  while (specs.length < CENTER_PEBBLE_COUNT && attempts < CENTER_PEBBLE_COUNT * 40) {
    attempts += 1;
    const x = (random() * 2 - 1) * (innerHalfSize - margin);
    const z = (random() * 2 - 1) * (innerHalfSize - margin);
    if (isInsideTimerClearZone(x, z)) continue;
    specs.push({
      position: [x, z],
      scale: [0.125 + random() * 0.095, 0.07 + random() * 0.045],
      rotation: (random() - 0.5) * Math.PI,
      colorIndex: specs.length % 3,
    });
  }
  return specs;
}

export function estimateCenterPebbleCoverage(
  specs: readonly CenterPebbleSpec[],
  innerHalfSize = AIRPORT_RUNWAY_INNER_HALF_SIZE,
): number {
  const pebbleArea = specs.reduce(
    (area, spec) => area + Math.PI * spec.scale[0] * spec.scale[1],
    0,
  );
  return pebbleArea / ((innerHalfSize * 2) ** 2);
}

export function isCenterTrailSpecInOpenField(
  spec: CenterTrailSpec,
  innerHalfSize = AIRPORT_RUNWAY_INNER_HALF_SIZE,
): boolean {
  const [x, z] = spec.position;
  const halfLength = spec.length / 2;
  const halfWidth = spec.width / 2;
  const xExtent = Math.abs(Math.cos(spec.rotation)) * halfLength
    + Math.abs(Math.sin(spec.rotation)) * halfWidth;
  const zExtent = Math.abs(Math.sin(spec.rotation)) * halfLength
    + Math.abs(Math.cos(spec.rotation)) * halfWidth;
  if (
    Math.abs(x) + xExtent > innerHalfSize - CENTER_TRAIL_BOUNDARY_MARGIN
    || Math.abs(z) + zExtent > innerHalfSize - CENTER_TRAIL_BOUNDARY_MARGIN
  ) return false;

  const [minX, minZ, maxX, maxZ] = CENTER_TIMER_CLEAR_ZONE;
  const timerMinX = minX - CENTER_TRAIL_TIMER_MARGIN;
  const timerMinZ = minZ - CENTER_TRAIL_TIMER_MARGIN;
  const timerMaxX = maxX + CENTER_TRAIL_TIMER_MARGIN;
  const timerMaxZ = maxZ + CENTER_TRAIL_TIMER_MARGIN;
  return x - xExtent > timerMaxX
    || x + xExtent < timerMinX
    || z - zExtent > timerMaxZ
    || z + zExtent < timerMinZ;
}

export function createCenterTrailSpecs(
  innerHalfSize = AIRPORT_RUNWAY_INNER_HALF_SIZE,
): readonly CenterTrailSpec[] {
  const specs: readonly CenterTrailSpec[] = [
    { position: [-1.6, 1.3], length: 4.35, width: 0.36, rotation: -0.08 },
    { position: [-3.2, -0.65], length: 3.8, width: 0.34, rotation: 0.56 },
    { position: [3.3, -2.7], length: 3.4, width: 0.32, rotation: -0.15 },
    { position: [0.9, 2.55], length: 3.15, width: 0.3, rotation: 1.12 },
    { position: [2.55, 0.45], length: 2.35, width: 0.26, rotation: 0.18 },
  ];
  return specs.filter(spec => isCenterTrailSpecInOpenField(spec, innerHalfSize));
}

export function estimateCenterTrailCoverage(
  specs: readonly CenterTrailSpec[],
  innerHalfSize = AIRPORT_RUNWAY_INNER_HALF_SIZE,
): number {
  const pathArea = specs.reduce((area, spec) => area + spec.length * spec.width, 0);
  return pathArea / ((innerHalfSize * 2) ** 2);
}
