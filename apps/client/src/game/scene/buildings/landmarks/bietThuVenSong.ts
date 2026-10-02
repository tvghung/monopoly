import { box, plate } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { LEAF, LEAF_DARK, WATER, WHITE, boatHull, tree, waterPlate } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 32, biệt thự ven sông (plan 05 §8.3): a modern riverside villa. Two white volumes, the upper one pushed sideways so it
 * overhangs, flat dark roof slabs, big glass fronts, a wooden deck and a small boat on the river. The glass is the only glass.
 */
const GRASS = '#6FA05A';
const ROOF = '#4A4F57';
const DECK = '#B07A4A';
const FRAME = '#3A3F47';
const GLASS = '#8FC6D8';
const GLASS_LIGHT = '#B4DBE6';
const BOAT = '#F4F1EA';

const FLOOR = 0.03;
/** Where both volumes' front walls stand (the ground floor is 0.4 deep about z = -0.18, the upper one 0.38 about z = -0.17). */
const FRONT = 0.02;

export function buildBietThuVenSong(): LandmarkGeometry {
  const groundHeight = 0.26;
  const upperAt = FLOOR + groundHeight + 0.03;
  const upperHeight = 0.22;
  const opaque = [
    box(1.2, FLOOR, 0.7, GRASS, { position: [0, 0, -0.1] }),
    waterPlate(1.2, 0.36, WATER, { position: [0, 0, 0.32] }),
    // The two volumes: a long ground floor, and a shorter upper floor shifted to the right so it overhangs the terrace.
    box(0.78, groundHeight, 0.4, WHITE, { position: [-0.12, FLOOR, -0.18] }),
    box(0.62, upperHeight, 0.38, WHITE, { position: [0.0, upperAt, -0.17] }),
    // Flat roof slabs with a thin overhang, and a dark frame line between the floors.
    box(0.84, 0.03, 0.46, ROOF, { position: [-0.12, FLOOR + groundHeight, -0.18] }),
    box(0.7, 0.03, 0.44, ROOF, { position: [0, upperAt + upperHeight, -0.17] }),
    // The deck in front of the ground floor, running out toward the river, and a small boat moored at its end.
    box(0.7, 0.03, 0.26, DECK, { position: [-0.1, FLOOR, 0.14] }),
    boatHull(0.22, 0.08, 0.04, BOAT, [0.34, FLOOR, 0.4], 0.2),
    // Window frames: thin dark bars in front of the glass fronts (both volumes' fronts are at z = 0.02).
    plate(0.012, 0.18, FRAME, { position: [-0.18, FLOOR + 0.04, FRONT + 0.0135] }),
    plate(0.012, 0.18, FRAME, { position: [0.06, FLOOR + 0.04, FRONT + 0.0135] }),
    plate(0.012, 0.14, FRAME, { position: [-0.08, upperAt + 0.04, FRONT + 0.0135] }),
    plate(0.012, 0.14, FRAME, { position: [0.08, upperAt + 0.04, FRONT + 0.0135] }),
    ...tree(-0.52, -0.1, 0.16, LEAF),
    ...tree(0.5, -0.3, 0.14, LEAF_DARK),
  ];
  const glass = [
    box(0.5, 0.18, 0.012, GLASS, { position: [-0.1, FLOOR + 0.04, FRONT + 0.006] }),
    box(0.46, 0.14, 0.012, GLASS_LIGHT, { position: [0.0, upperAt + 0.04, FRONT + 0.006] }),
  ];
  return assembleLandmark({ opaque, glass });
}
