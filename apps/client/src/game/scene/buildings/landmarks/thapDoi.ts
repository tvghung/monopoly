import { box, cone } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import type { LandmarkGeometry } from './types';

/**
 * Tile 23, Tháp Đôi in Quy Nhơn (plan 05 §8.3): two Cham brick towers of different height on one low platform, each a stack of
 * shrinking tiers with a pyramid cap and a dark doorway.
 */
const BRICK = '#A0522D';
const BRICK_LIGHT = '#B8683C';
const BELT = '#C98A55';
const DOOR = '#3A2518';
const STONE = '#B9AC98';

const PLATFORM = 0.05;

/**
 * One tower standing on the platform: a square body with a doorway, three tiers that shrink with height, a thin belt between
 * them and a pyramid cap. `height` is the tower's own height above the platform.
 */
function tower(x: number, width: number, height: number) {
  const body = 0.38 * height;
  const tiers = [0.15 * height, 0.13 * height, 0.11 * height];
  const sizes = [0.84 * width, 0.68 * width, 0.52 * width];
  const parts = [
    box(width, body, width, BRICK, { position: [x, PLATFORM, 0] }),
    // The doorway on the front face, as a dark plate with a lintel above it.
    box(width * 0.3, body * 0.55, 0.02, DOOR, { position: [x, PLATFORM, width / 2] }),
    box(width * 0.42, 0.025, 0.03, BELT, { position: [x, PLATFORM + body * 0.55, width / 2] }),
  ];
  let top = PLATFORM + body;
  tiers.forEach((tierHeight, index) => {
    parts.push(box(sizes[index] * 1.1, 0.025, sizes[index] * 1.1, BELT, { position: [x, top, 0] }));
    parts.push(box(sizes[index], tierHeight, sizes[index], index % 2 === 0 ? BRICK_LIGHT : BRICK, { position: [x, top + 0.025, 0] }));
    top += 0.025 + tierHeight;
  });
  // A 4-sided cone turned a quarter is a square pyramid whose base side is radius * sqrt(2).
  const last = sizes[sizes.length - 1];
  parts.push(cone((last * Math.SQRT2) / 2, 0.23 * height, 4, BRICK_LIGHT, { position: [x, top, 0], rotation: [0, Math.PI / 4, 0] }));
  return parts;
}

export function buildThapDoi(): LandmarkGeometry {
  const opaque = [
    box(1.16, PLATFORM, 0.62, STONE),
    ...tower(-0.3, 0.34, 1.0),
    ...tower(0.3, 0.32, 0.8),
  ];
  return assembleLandmark({ opaque });
}
