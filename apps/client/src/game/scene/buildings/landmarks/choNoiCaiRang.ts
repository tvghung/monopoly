import { blob, box, cylinder } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { LEAF, TRUNK, boatHull, waterPlate } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 8, Chợ nổi Cái Răng in Cần Thơ (plan 05 §8.3): two wooden boats piled with produce and one tall "cây bẹo" pole hung with
 * fruit, on the river.
 */
const HULL = '#9A6B43';
const HULL_DARK = '#7B5230';
const RIVER = '#5AA7A0';
const ORANGE = '#F08A24';
const PINEAPPLE = '#E5B83A';
const MELON = '#5FA84E';
const FLAG = '#C8352D';

export function buildChoNoiCaiRang(): LandmarkGeometry {
  const water = 0.03;
  const opaque = [
    waterPlate(1.25, 0.9, RIVER),
    // Boat one: orange and pineapple piles under a small canopy.
    boatHull(0.62, 0.24, 0.1, HULL, [-0.3, water, -0.12], 0.25),
    blob(0.09, 0, ORANGE, { position: [-0.42, water + 0.14, -0.08] }),
    blob(0.08, 0, ORANGE, { position: [-0.3, water + 0.15, -0.13] }),
    blob(0.085, 0, PINEAPPLE, { position: [-0.2, water + 0.14, -0.18] }),
    box(0.2, 0.02, 0.2, HULL_DARK, { position: [-0.26, water + 0.34, -0.13], rotation: [0, 0.25, 0] }),
    // Boat two: watermelons and a seller's shelter.
    boatHull(0.58, 0.22, 0.1, HULL_DARK, [0.22, water, 0.22], -0.2),
    blob(0.08, 0, MELON, { position: [0.1, water + 0.14, 0.2] }),
    blob(0.08, 0, MELON, { position: [0.22, water + 0.14, 0.23] }),
    blob(0.075, 0, MELON, { position: [0.34, water + 0.14, 0.27] }),
    // The pole with fruit hanging from it, so shoppers know what the boat sells.
    cylinder(0.014, 0.018, 0.78, 5, TRUNK, { position: [0.45, water, -0.28] }),
    box(0.1, 0.06, 0.01, FLAG, { position: [0.5, water + 0.7, -0.28] }),
    blob(0.045, 0, ORANGE, { position: [0.45, water + 0.55, -0.22] }),
    blob(0.045, 0, PINEAPPLE, { position: [0.38, water + 0.5, -0.28] }),
    blob(0.045, 0, LEAF, { position: [0.5, water + 0.45, -0.34] }),
  ];
  return assembleLandmark({ opaque });
}
