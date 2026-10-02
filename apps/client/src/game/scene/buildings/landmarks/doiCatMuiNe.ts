import { box, cylinder, dome, lathe } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { SAND, WATER, WOOD, palm, waterPlate } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 16, Đồi cát Mũi Né and the thuyền thúng (plan 05 §8.3): two soft sand dunes on a beach, two round basket boats at the
 * water's edge with a paddle each, and a leaning palm.
 */
const SAND_LIGHT = '#F1D6A4';
const SAND_SHADE = '#D9A86A';
const BOAT = '#D9552B';
const BOAT_FLOOR = '#C9A66B';

const FLOOR = 0.03;

/** A round basket boat: a shallow painted bowl, a woven floor and a paddle laid across it. `scale` makes the second one differ. */
function basketBoat(x: number, z: number, scale: number, heading: number) {
  const at = { position: [x, FLOOR, z] as const, rotation: [0, heading, 0] as const, scale };
  return [
    lathe([[0, 0], [0.1, 0.005], [0.165, 0.065], [0.165, 0.09]], 8, BOAT, at),
    cylinder(0.115, 0.115, 0.006, 8, BOAT_FLOOR, { position: [x, FLOOR + 0.088 * scale, z], scale }),
    box(0.018, 0.012, 0.36, WOOD, { position: [x + 0.04 * scale, FLOOR + 0.1 * scale, z], rotation: [0, heading + 0.7, 0], scale }),
  ];
}

export function buildDoiCatMuiNe(): LandmarkGeometry {
  const opaque = [
    // The beach: a sand slab at the back, a strip of sea at the front.
    box(1.2, FLOOR, 0.66, SAND, { position: [0, 0, -0.15] }),
    waterPlate(1.2, 0.3, WATER, { position: [0, 0, 0.33] }),
    // The dunes: faceted, flattened balls, a pale one behind a darker one so their ridge lines overlap.
    dome(0.46, 1, SAND_LIGHT, { position: [-0.1, FLOOR, -0.16], scale: [1.2, 0.68, 0.72] }),
    dome(0.3, 1, SAND_SHADE, { position: [0.28, FLOOR, -0.06], scale: [1.2, 0.6, 0.8] }),
    ...palm(0.38, -0.36, 0.5, 0.15, FLOOR),
    ...basketBoat(-0.3, 0.3, 1, 0.3),
    ...basketBoat(0.14, 0.4, 0.85, -0.5),
  ];
  return assembleLandmark({ opaque });
}
