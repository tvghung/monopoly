import { blob, box, cylinder, gableRoof, lathe, plate } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { TRUNK } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 9, Nhà hát lớn Hải Phòng (plan 05 §8.3): the colonial opera house. A cream facade with a row of columns and a central
 * pediment, a copper-green dome on a drum, and one red flame tree (hoa phượng) beside the steps.
 */
const CREAM = '#F2E0B5';
const WHITE = '#F7F3EA';
const COPPER = '#7FB7A0';
const ROOF = '#B8803F';
const WINDOW = '#4A5B6B';
const FLAME = '#D9381E';

export function buildNhaHatLonHaiPhong(): LandmarkGeometry {
  const podium = 0.08;
  const hall = 0.36;
  const hallTop = podium + hall;
  const columns = [-0.4, -0.24, -0.08, 0.08, 0.24, 0.4];
  const opaque = [
    box(1.14, podium, 0.62, WHITE),
    // The hall, with a low roof over the wings.
    box(1.0, hall, 0.44, CREAM, { position: [0, podium, -0.02] }),
    gableRoof(1.04, 0.5, 0.1, ROOF, { position: [0, hallTop, -0.02] }),
    // The portico: a row of columns in front, a beam on top and the pediment above it.
    ...columns.map(x => box(0.045, 0.32, 0.045, WHITE, { position: [x, podium, 0.24] })),
    box(0.96, 0.04, 0.1, WHITE, { position: [0, podium + 0.32, 0.22] }),
    gableRoof(0.14, 0.96, 0.16, WHITE, { position: [0, podium + 0.36, 0.22], rotation: [0, Math.PI / 2, 0] }),
    // The drum and the dome over the middle of the hall.
    cylinder(0.2, 0.2, 0.07, 8, CREAM, { position: [0, hallTop + 0.05, -0.02] }),
    lathe([[0.2, 0], [0.19, 0.04], [0.15, 0.1], [0.09, 0.15], [0.03, 0.19], [0, 0.2]], 8, COPPER, { position: [0, hallTop + 0.12, -0.02] }),
    cylinder(0.01, 0.014, 0.1, 4, WHITE, { position: [0, hallTop + 0.32, -0.02] }),
    // The flame tree on the plaza in front of the steps: a short trunk and a wide red crown.
    cylinder(0.016, 0.026, 0.3, 5, TRUNK, { position: [-0.5, 0, 0.46] }),
    blob(0.16, 0, FLAME, { position: [-0.5, 0.44, 0.46] }),
    blob(0.1, 0, FLAME, { position: [-0.38, 0.36, 0.5] }),
    // Tall windows between the columns, as dark plates on the hall wall.
    ...[-0.32, -0.16, 0, 0.16, 0.32].map(x => plate(0.07, 0.16, WINDOW, { position: [x, podium + 0.1, 0.205] })),
  ];
  return assembleLandmark({ opaque });
}
