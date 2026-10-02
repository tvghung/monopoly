import { blob, box, cone, cylinder, plate, prism } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { LEAF, LEAF_DARK, tree, waterPlate } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 1, Mũi Cà Mau (plan 05 §8.3): the southern tip of Vietnam. A two-step concrete platform shaped like a ship's bow, with a
 * red stripe, a tapering marker pillar with a red cap, a flag on a pole, and mangroves on the muddy water behind it.
 */
const CONCRETE = '#D8CFC2';
const CONCRETE_LIGHT = '#EDE6DA';
const RED = '#C8352D';
const GOLD = '#F2C230';
const POLE = '#8C8C92';
const MUD = '#6F8F8A';

const DECK = 0.03;
const BOW_LOWER = [[-0.5, -0.28], [0.1, -0.28], [0.5, 0], [0.1, 0.28], [-0.5, 0.28]] as const;
const BOW_UPPER = [[-0.4, -0.2], [0.08, -0.2], [0.38, 0], [0.08, 0.2], [-0.4, 0.2]] as const;

export function buildMuiCaMau(): LandmarkGeometry {
  const stepTop = DECK + 0.14;
  const opaque = [
    waterPlate(1.25, 0.82, MUD),
    // The bow: a wide lower step with a red stripe round it, and a smaller, paler upper step.
    prism(BOW_LOWER, 0.07, CONCRETE, { position: [0, DECK, 0] }),
    prism(BOW_LOWER, 0.022, RED, { position: [0, DECK + 0.05, 0], scale: [1.02, 1, 1.05] }),
    prism(BOW_UPPER, 0.07, CONCRETE_LIGHT, { position: [0, DECK + 0.07, 0] }),
    // The marker pillar near the tip: a tapering square column (a four-sided cylinder turned an eighth) under a red cap.
    cylinder(0.05, 0.08, 0.5, 4, CONCRETE_LIGHT, { position: [0.26, stepTop, 0], rotation: [0, Math.PI / 4, 0] }),
    cone(0.08, 0.15, 4, RED, { position: [0.26, stepTop + 0.5, 0], rotation: [0, Math.PI / 4, 0] }),
    // The flag: a pole behind the pillar, a red field and a small gold star block on its front.
    cylinder(0.008, 0.012, 0.56, 4, POLE, { position: [-0.2, stepTop, 0.0] }),
    box(0.17, 0.11, 0.008, RED, { position: [-0.115, stepTop + 0.43, 0.0] }),
    plate(0.04, 0.04, GOLD, { position: [-0.115, stepTop + 0.465, 0.006] }),
    // Mangroves on the water behind and beside the platform.
    ...tree(-0.5, -0.34, 0.1, LEAF_DARK, DECK),
    ...tree(-0.28, -0.36, 0.09, LEAF, DECK),
    ...tree(0.1, -0.37, 0.08, LEAF_DARK, DECK),
    blob(0.07, 0, LEAF, { position: [0.38, DECK + 0.05, -0.3] }),
    blob(0.06, 0, LEAF_DARK, { position: [-0.1, DECK + 0.05, 0.37] }),
  ];
  return assembleLandmark({ opaque });
}
