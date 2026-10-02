import { blob, box, cylinder } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { LEAF, LEAF_DARK, WATER, boatHull, waterPlate } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 26, Vịnh Hạ Long (plan 05 §8.3): the bay. A sheet of teal water with five limestone karst peaks of different height,
 * grey with a green cap, and a wooden junk with two red-brown sails sailing between them. The tallest peak carries the height
 * (the slim class).
 */
const WATER_DEEP = '#3F8FA6';
const KARST = '#9AA39C';
const KARST_DARK = '#7E877F';
const HULL = '#5A3320';
const SAIL = '#C2452B';
const SAIL_LIGHT = '#D9692F';
const MAST = '#4A2F22';

const SURFACE = 0.03;

/** One karst peak: a tapering, seven-sided limestone column with a green cap blob on top. */
function peak(x: number, z: number, topRadius: number, footRadius: number, height: number, tone: string) {
  return [
    cylinder(topRadius, footRadius, height, 7, tone, { position: [x, SURFACE, z] }),
    blob(topRadius * 1.5, 0, x < 0 ? LEAF : LEAF_DARK, { position: [x, SURFACE + height, z], scale: [1, 0.7, 1] }),
  ];
}

export function buildVinhHaLong(): LandmarkGeometry {
  const deck = SURFACE * 2;
  const opaque = [
    waterPlate(1.22, 1.0, WATER_DEEP),
    waterPlate(0.76, 0.5, WATER, { position: [0.12, SURFACE, 0.28] }),
    ...peak(-0.3, -0.1, 0.07, 0.2, 0.92, KARST),
    ...peak(0.12, -0.3, 0.06, 0.17, 0.68, KARST_DARK),
    ...peak(0.42, -0.02, 0.09, 0.21, 0.5, KARST),
    ...peak(-0.5, 0.22, 0.05, 0.12, 0.38, KARST_DARK),
    ...peak(-0.12, 0.12, 0.045, 0.1, 0.26, KARST),
    // The junk: a low hull, two masts and two sails that catch the light differently.
    boatHull(0.46, 0.13, 0.07, HULL, [0.14, deck, 0.34], 0.1),
    cylinder(0.009, 0.012, 0.36, 4, MAST, { position: [0.04, deck + 0.05, 0.345] }),
    cylinder(0.009, 0.012, 0.3, 4, MAST, { position: [0.24, deck + 0.05, 0.335] }),
    box(0.2, 0.26, 0.014, SAIL, { position: [0.04, deck + 0.1, 0.345], rotation: [0, 0.1, 0] }),
    box(0.17, 0.22, 0.014, SAIL_LIGHT, { position: [0.24, deck + 0.1, 0.335], rotation: [0, 0.1, 0] }),
  ];
  return assembleLandmark({ opaque });
}
