import { box, cylinder, gableRoof, lathe, plate } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { WHITE } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 34, trụ sở UBND TP.HCM (plan 05 §8.3): the colonial city hall. A yellow facade with white string courses and rows of dark
 * windows, red roofs, two end pavilions, and a central clock tower under a red dome. The tower carries the height (slim class).
 */
const YELLOW = '#EBC84F';
const RED = '#B8432F';
const STONE = '#C9BBA0';
const WINDOW = '#4A5B6B';
const GOLD = '#E3B94E';

export function buildUbndTphcm(): LandmarkGeometry {
  const floor = 0.04;
  const blockHeight = 0.34;
  const blockTop = floor + blockHeight;
  const blockZ = -0.06;
  const frontZ = blockZ + 0.18;
  const towerZ = -0.01;
  const towerTop = 0.74;
  const belfryHeight = 0.12;
  // Between the clock tower (to 0.17) and the pavilions (from 0.38) on each side.
  const windowXs = [-0.32, -0.23, 0.23, 0.32];
  const opaque = [
    box(1.26, floor, 0.6, STONE),
    box(1.1, blockHeight, 0.36, YELLOW, { position: [0, floor, blockZ] }),
    // White string course between the floors, and the cornice under the roof.
    box(1.12, 0.018, 0.38, WHITE, { position: [0, floor + 0.17, blockZ] }),
    box(1.14, 0.03, 0.4, WHITE, { position: [0, blockTop, blockZ] }),
    gableRoof(1.12, 0.38, 0.13, RED, { position: [0, blockTop + 0.03, blockZ] }),
    // The end pavilions: a little taller than the block, each under its own red gable facing the street.
    ...[-0.5, 0.5].flatMap(x => [
      box(0.24, 0.4, 0.42, YELLOW, { position: [x, floor, blockZ] }),
      gableRoof(0.46, 0.28, 0.14, RED, { position: [x, floor + 0.4, blockZ], rotation: [0, Math.PI / 2, 0] }),
      plate(0.06, 0.1, WINDOW, { position: [x, floor + 0.05, blockZ + 0.212] }),
      plate(0.06, 0.1, WINDOW, { position: [x, floor + 0.22, blockZ + 0.212] }),
    ]),
    // Two rows of windows on the long front, leaving the middle to the tower.
    ...windowXs.flatMap(x => [
      plate(0.06, 0.1, WINDOW, { position: [x, floor + 0.05, frontZ + 0.002] }),
      plate(0.06, 0.1, WINDOW, { position: [x, floor + 0.22, frontZ + 0.002] }),
    ]),
    // The clock tower: body, door and clock face, cornice, belfry, red dome and a gold finial.
    box(0.34, towerTop - floor, 0.3, YELLOW, { position: [0, floor, towerZ] }),
    plate(0.08, 0.14, WINDOW, { position: [0, floor + 0.05, towerZ + 0.152] }),
    plate(0.15, 0.15, WHITE, { position: [0, 0.5, towerZ + 0.152] }),
    box(0.4, 0.035, 0.36, WHITE, { position: [0, towerTop, towerZ] }),
    box(0.24, belfryHeight, 0.24, YELLOW, { position: [0, towerTop + 0.035, towerZ] }),
    lathe([[0.15, 0], [0.145, 0.04], [0.11, 0.1], [0.06, 0.15], [0, 0.18]], 8, RED, { position: [0, towerTop + 0.035 + belfryHeight, towerZ] }),
    cylinder(0.008, 0.01, 0.12, 4, GOLD, { position: [0, towerTop + 0.035 + belfryHeight + 0.17, towerZ] }),
  ];
  return assembleLandmark({ opaque });
}
