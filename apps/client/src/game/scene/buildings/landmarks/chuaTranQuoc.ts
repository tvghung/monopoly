import { box, cone, cylinder, gableRoof } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { LEAF, WATER, WHITE, tree, waterPlate } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 27, Chùa Trấn Quốc in Hà Nội (plan 05 §8.3): the pagoda on its islet in the lake. A six-tier hexagonal stupa in cream and
 * red-brown, with a lotus-bud finial, beside a small hall with a red-brown roof and a green tree. The stupa carries the height
 * (the slim class).
 */
const GRASS = '#6FA05A';
const STONE = '#B9AC98';
const RED_BROWN = '#A5482F';
const ROOF_DARK = '#7A3B2A';
const HALL = '#C4553A';
const GOLD = '#E3B94E';

const ISLAND_TOP = 0.09;
const TIERS = 6;

export function buildChuaTranQuoc(): LandmarkGeometry {
  const stupaX = -0.16;
  const stupaZ = -0.1;
  const baseHeight = 0.05;
  const opaque = [
    waterPlate(1.22, 1.0, WATER),
    // The islet.
    cylinder(0.46, 0.52, ISLAND_TOP - 0.02, 12, GRASS, { position: [0, 0.02, 0] }),
    // The stupa: a stone footing, then six storeys, each a cream body under a red-brown roof ring that narrows with height.
    cylinder(0.26, 0.28, baseHeight, 6, STONE, { position: [stupaX, ISLAND_TOP, stupaZ] }),
  ];
  let top = ISLAND_TOP + baseHeight;
  for (let tier = 0; tier < TIERS; tier += 1) {
    const radius = 0.2 - tier * 0.018;
    opaque.push(cylinder(radius, radius, 0.09, 6, WHITE, { position: [stupaX, top, stupaZ] }));
    opaque.push(cylinder(radius * 0.62, radius * 1.18, 0.05, 6, RED_BROWN, { position: [stupaX, top + 0.09, stupaZ] }));
    top += 0.14;
  }
  opaque.push(
    cone(0.05, 0.14, 6, RED_BROWN, { position: [stupaX, top, stupaZ] }),
    cone(0.012, 0.06, 4, GOLD, { position: [stupaX, top + 0.13, stupaZ] }),
    // The hall: a red body under two stacked roofs, in front of and to the right of the stupa.
    box(0.34, 0.12, 0.2, HALL, { position: [0.22, ISLAND_TOP, 0.1] }),
    gableRoof(0.42, 0.28, 0.12, ROOF_DARK, { position: [0.22, ISLAND_TOP + 0.12, 0.1] }),
    gableRoof(0.22, 0.18, 0.08, ROOF_DARK, { position: [0.22, ISLAND_TOP + 0.22, 0.1] }),
    ...tree(-0.3, 0.2, 0.1, LEAF, ISLAND_TOP),
  );
  return assembleLandmark({ opaque });
}
