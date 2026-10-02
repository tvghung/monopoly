import { cone, cylinder, lathe, type Vec2 } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import type { LandmarkGeometry } from './types';

/**
 * Tile 19, Tháp Trầm Hương in Nha Trang (plan 05 §8.3): the lotus-bud tower. Three stacked, flared rings in white and pale pink
 * (a lathe profile each) on a round base, with a slim spire. The slim class allows 1.4; this one stops at 1.38.
 */
const WHITE = '#F7F3EA';
const PINK = '#F2C6CF';
const PINK_DEEP = '#E6A6B6';
const BASE = '#E8E0D4';
const GOLD = '#E3B94E';
const RIB = '#D9CFC0';

/** One bud ring: wide at the foot, swelling a little, then narrowing like a petal. `foot` is the radius at its bottom. */
function ring(foot: number, height: number): Vec2[] {
  return [
    [foot, 0],
    [foot * 1.12, height * 0.14],
    [foot * 1.0, height * 0.46],
    [foot * 0.68, height * 0.82],
    [foot * 0.5, height],
  ];
}

export function buildThapTramHuong(): LandmarkGeometry {
  const baseTop = 0.08;
  const stepTop = baseTop + 0.05;
  const lowerHeight = 0.38;
  const middleHeight = 0.38;
  const upperHeight = 0.32;
  // Each ring starts a hair inside the top of the one below it, so the stack reads as one tower.
  const lowerAt = stepTop;
  const middleAt = lowerAt + lowerHeight - 0.02;
  const upperAt = middleAt + middleHeight - 0.02;
  const budAt = upperAt + upperHeight - 0.02;
  const opaque = [
    cylinder(0.4, 0.46, baseTop, 12, BASE),
    cylinder(0.28, 0.32, 0.05, 12, RIB, { position: [0, baseTop, 0] }),
    lathe(ring(0.22, lowerHeight), 10, WHITE, { position: [0, lowerAt, 0] }),
    lathe(ring(0.15, middleHeight), 10, PINK, { position: [0, middleAt, 0] }),
    lathe(ring(0.1, upperHeight), 10, WHITE, { position: [0, upperAt, 0] }),
    // The bud itself, a pale pink cone, and a small gold tip.
    cone(0.055, 0.2, 10, PINK_DEEP, { position: [0, budAt, 0] }),
    cone(0.012, 0.05, 6, GOLD, { position: [0, budAt + 0.18, 0] }),
  ];
  return assembleLandmark({ opaque });
}
