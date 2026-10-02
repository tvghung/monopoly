import type * as THREE from 'three';
import { bevelBox, box, cylinder, extrude, place } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { arcStrip } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 24, Cầu Vàng in Đà Nẵng (plan 05 §8.3): a curved golden walkway held by two giant stone hands rising from a green hill.
 */
const GOLD = '#D9A93A';
const GOLD_LIGHT = '#F0C95A';
const STONE = '#8C9482';
const MOSS = '#5E8C4A';
const HILL = '#6B9A55';

/** One giant hand: a palm tilted outward and four fingers fanning up from it. */
function hand(side: 1 | -1): THREE.BufferGeometry[] {
  const palmTilt = 0.32 * side;
  const parts = [
    bevelBox(0.3, 0.28, 0.24, 0.03, STONE, { position: [0.3 * side, 0.1, 0], rotation: [0, 0, -palmTilt] }),
  ];
  for (let finger = 0; finger < 4; finger += 1) {
    const spread = (finger - 1.5) * 0.16;
    parts.push(box(0.07, 0.3, 0.07, finger === 0 ? MOSS : STONE, {
      position: [0.3 * side + spread * Math.cos(palmTilt) * 0.9, 0.3 - Math.abs(finger - 1.5) * 0.02, spread * 0.3],
      rotation: [0, 0, -palmTilt + spread * 0.9 * side],
    }));
  }
  return parts;
}

export function buildCauVang(): LandmarkGeometry {
  const opaque = [
    // The hill the hands grow from.
    cylinder(0.52, 0.6, 0.12, 12, HILL, { scale: [1, 1, 0.72] }),
    ...hand(1),
    ...hand(-1),
    // The golden walkway and its handrails.
    extrude(arcStrip(1.2, 0.2, 0.045, 12), 0.15, GOLD, { position: [0, 0.34, 0] }),
    extrude(arcStrip(1.2, 0.2, 0.025, 12), 0.02, GOLD_LIGHT, { position: [0, 0.385, 0.075] }),
    extrude(arcStrip(1.2, 0.2, 0.025, 12), 0.02, GOLD_LIGHT, { position: [0, 0.385, -0.075] }),
  ];
  // The left hand reaches a little further than the right one: shift the whole landmark so it is centered on the plinth.
  return assembleLandmark({ opaque: opaque.map(part => place(part, { position: [0.04, 0, 0] })) });
}
