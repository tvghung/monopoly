import { archWall, box, curvedEaveRoof, cylinder, gableRoof } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import type { LandmarkGeometry } from './types';

/**
 * Tile 13, Chùa Cầu in Hội An (plan 05 §8.3): the covered bridge. A stone arch carries a yellow corridor with a long tiled roof
 * and upturned eaves; a small pavilion with a crossing roof sits in the middle; two red lanterns hang at its corners.
 */
const STONE = '#9C8C79';
const WOOD = '#8C4B34';
const WALL = '#E3B94E';
const TILE_ROOF = '#9B4A33';
const LANTERN = '#E0342B';

export function buildChuaCau(): LandmarkGeometry {
  const archHeight = 0.26;
  const wallBottom = archHeight;
  const wallHeight = 0.2;
  const roofBase = wallBottom + wallHeight;
  const opaque = [
    // The bridge body with one round-topped opening, and a short pier at each end.
    archWall(1.22, archHeight, 0.3, 0.46, 0.2, STONE),
    box(0.1, 0.05, 0.34, WOOD, { position: [-0.58, archHeight, 0] }),
    box(0.1, 0.05, 0.34, WOOD, { position: [0.58, archHeight, 0] }),
    // The corridor walls and their posts.
    box(1.1, wallHeight, 0.24, WALL, { position: [0, wallBottom, 0] }),
    ...[-0.52, -0.26, 0, 0.26, 0.52].flatMap(x => [
      box(0.045, wallHeight + 0.03, 0.05, WOOD, { position: [x, wallBottom, 0.13] }),
      box(0.045, wallHeight + 0.03, 0.05, WOOD, { position: [x, wallBottom, -0.13] }),
    ]),
    // The long roof with curved eaves, then the pavilion in the middle with a gable crossing it.
    curvedEaveRoof(1.26, 0.46, 0.14, 0.05, TILE_ROOF, { position: [0, roofBase, 0] }),
    box(0.34, 0.14, 0.3, WALL, { position: [0, roofBase + 0.04, 0] }),
    gableRoof(0.4, 0.36, 0.16, TILE_ROOF, { position: [0, roofBase + 0.18, 0], rotation: [0, Math.PI / 2, 0] }),
    // The finial on the pavilion.
    cylinder(0.012, 0.018, 0.08, 6, WOOD, { position: [0, roofBase + 0.34, 0] }),
  ];
  const emissive = [
    // Two lanterns at the front corners of the pavilion.
    box(0.06, 0.08, 0.06, LANTERN, { position: [-0.19, roofBase + 0.02, 0.2] }),
    box(0.06, 0.08, 0.06, LANTERN, { position: [0.19, roofBase + 0.02, 0.2] }),
  ];
  return assembleLandmark({ opaque, emissive });
}
