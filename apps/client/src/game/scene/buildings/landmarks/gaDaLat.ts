import { box, gableRoof, plate } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import type { LandmarkGeometry } from './types';

/**
 * Tile 11, Ga Đà Lạt (plan 05 §8.3): the station with its three steep gables and a band of colored glass across the front. Butter
 * walls, dark brown roofs; the glass band is the only glass. A low awning shades the platform side without hiding the glass.
 */
const WALL = '#F2DE9B';
const ROOF = '#5A3A2A';
const TRIM = '#7A5A3A';
const PLATFORM = '#C9BBA0';
const DOOR = '#6B4A32';
const WINDOW = '#4A5B6B';

export function buildGaDaLat(): LandmarkGeometry {
  const floor = 0.03;
  const wallHeight = 0.3;
  const wallTop = floor + wallHeight;
  const frontZ = 0.13;
  // The ridge runs front to back (0.34, the depth of the hall); `span` is the width of the gable across the front.
  const gableAt = (x: number, span: number, height: number) => gableRoof(0.34, span, height, ROOF, {
    position: [x, wallTop, -0.04],
    rotation: [0, Math.PI / 2, 0],
  });
  const opaque = [
    box(1.2, floor, 0.56, PLATFORM),
    box(1.1, wallHeight, 0.34, WALL, { position: [0, floor, -0.04] }),
    // Three steep gables across the front, the middle one taller, turned so their triangles face the platform.
    gableAt(-0.38, 0.34, 0.26),
    gableAt(0, 0.4, 0.36),
    gableAt(0.38, 0.34, 0.26),
    // A trim line under the eaves, and a low awning on slim posts over the doors below the glass.
    box(1.12, 0.025, 0.36, TRIM, { position: [0, wallTop - 0.025, -0.04] }),
    box(1.1, 0.025, 0.12, TRIM, { position: [0, floor + 0.15, frontZ + 0.06] }),
    ...[-0.5, -0.25, 0, 0.25, 0.5].map(x => box(0.025, 0.15, 0.025, TRIM, { position: [x, floor, frontZ + 0.1] })),
    // Doors and windows under the awning.
    ...[-0.4, -0.12, 0.12, 0.4].map(x => plate(0.1, 0.12, x < 0 ? WINDOW : DOOR, { position: [x, floor, frontZ + 0.002] })),
  ];
  // The colored glass band across the front wall, above the awning: three panes under the three gables.
  const glass = [
    box(0.3, 0.1, 0.02, '#E8A33D', { position: [-0.36, floor + 0.18, frontZ + 0.01] }),
    box(0.3, 0.1, 0.02, '#4AA58A', { position: [0, floor + 0.18, frontZ + 0.01] }),
    box(0.3, 0.1, 0.02, '#D95D4A', { position: [0.36, floor + 0.18, frontZ + 0.01] }),
  ];
  return assembleLandmark({ opaque, glass });
}
