import { box, gableRoof } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { WOOD } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 6, Nhà dài Ê Đê in Buôn Ma Thuột (plan 05 §8.3): a long house raised on short posts, a tall thatched roof that overhangs
 * the front, a small ladder, and a patch of red earth underneath.
 */
const THATCH = '#C9A45C';
const THATCH_DARK = '#B58F4A';
const EARTH = '#B8704A';
const WOOD_DARK = '#6E4429';

export function buildNhaDaiEDe(): LandmarkGeometry {
  const posts = [-0.46, -0.16, 0.16, 0.46];
  const floorY = 0.2;
  const opaque = [
    box(1.2, 0.03, 0.5, EARTH),
    // Posts under the floor, two rows of four.
    ...posts.flatMap(x => [
      box(0.05, floorY, 0.05, WOOD_DARK, { position: [x, 0.03, 0.1] }),
      box(0.05, floorY, 0.05, WOOD_DARK, { position: [x, 0.03, -0.1] }),
    ]),
    box(1.18, 0.04, 0.32, WOOD, { position: [0, 0.03 + floorY, 0] }),
    // The wall, then the tall roof: a gable with a second, shorter one in front that makes the overhang.
    box(1.08, 0.2, 0.26, WOOD, { position: [0, 0.07 + floorY, 0] }),
    gableRoof(1.2, 0.56, 0.4, THATCH, { position: [0, 0.27 + floorY - 0.02, 0] }),
    // The front dormer: a second gable across the first, which gives the overhang over the entrance.
    gableRoof(0.46, 0.32, 0.26, THATCH_DARK, { position: [0.44, 0.27 + floorY - 0.02, 0], rotation: [0, Math.PI / 2, 0] }),
    // The ladder up to the front, leaning on the floor edge.
    box(0.05, 0.3, 0.04, WOOD_DARK, { position: [0.56, 0.03, 0.1], rotation: [0, 0, 0.5] }),
    box(0.05, 0.3, 0.04, WOOD_DARK, { position: [0.56, 0.03, 0.2], rotation: [0, 0, 0.5] }),
  ];
  return assembleLandmark({ opaque });
}
