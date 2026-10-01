import type * as THREE from 'three';
import { bevelBox, box, cylinder, extrude, type Vec2 } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import type { LandmarkGeometry } from './types';

/**
 * Tile 24, Cầu Vàng in Đà Nẵng (plan 05 §8.3): a curved golden walkway held by two giant stone hands rising from a green hill.
 */
const GOLD = '#D9A93A';
const GOLD_LIGHT = '#F0C95A';
const STONE = '#8C9482';
const MOSS = '#5E8C4A';
const HILL = '#6B9A55';

/** The walkway as a thin arch strip: an upper curve and a lower curve of the same span. */
function walkwayOutline(span: number, rise: number, thickness: number, steps: number): Vec2[] {
  const upper: Vec2[] = [];
  const lower: Vec2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = (t - 0.5) * span;
    const y = rise * (1 - (2 * t - 1) ** 2);
    upper.push([x, y + thickness]);
    lower.push([x, y]);
  }
  return [...lower, ...upper.reverse()];
}

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
    extrude(walkwayOutline(1.2, 0.2, 0.045, 12), 0.15, GOLD, { position: [0, 0.34, 0] }),
    extrude(walkwayOutline(1.2, 0.2, 0.025, 12), 0.02, GOLD_LIGHT, { position: [0, 0.4, 0.075] }),
    extrude(walkwayOutline(1.2, 0.2, 0.025, 12), 0.02, GOLD_LIGHT, { position: [0, 0.4, -0.075] }),
  ];
  return assembleLandmark({ opaque });
}
