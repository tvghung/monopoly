import type * as THREE from 'three';
import { box } from '../kit/lowPolyKit';
import { PLINTH } from './limits';

const LACQUER = '#3A2822';
/** Color of the rim until an owner is known. */
export const NEUTRAL_RIM = '#C9A24D';

/**
 * The plinth of a landmark (plan 05 §8.3): a lacquer slab below the landmark's origin with a low rim round its top edge. The
 * rim is the owner's color, so ownership reads from the landmark itself; it is returned separately because its vertices are
 * the ones recolored when the owner changes (see `recolorRim`).
 */
export function buildPlinthParts(): { slab: THREE.BufferGeometry[]; rim: THREE.BufferGeometry[] } {
  const { size, height, rim } = PLINTH;
  const rimHeight = 0.02;
  const half = size / 2;
  const rimY = -rimHeight;
  return {
    slab: [box(size, height - rimHeight, size, LACQUER, { position: [0, -height, 0] })],
    rim: [
      box(size, rimHeight, rim, NEUTRAL_RIM, { position: [0, rimY, half - rim / 2] }),
      box(size, rimHeight, rim, NEUTRAL_RIM, { position: [0, rimY, -half + rim / 2] }),
      box(rim, rimHeight, size - rim * 2, NEUTRAL_RIM, { position: [half - rim / 2, rimY, 0] }),
      box(rim, rimHeight, size - rim * 2, NEUTRAL_RIM, { position: [-half + rim / 2, rimY, 0] }),
    ],
  };
}
