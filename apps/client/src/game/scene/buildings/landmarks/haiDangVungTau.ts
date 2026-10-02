import { blob, box, cone, cylinder, dome } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { LEAF, WHITE } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 21, Hải đăng Vũng Tàu (plan 05 §8.3): the lighthouse on its rocky hill. A tapered white tower with a dark gallery, a
 * lantern room that glows (the one emissive part), a red cap, and boulders and bushes round the foot.
 */
const ROCK = '#8E8A82';
const ROCK_DARK = '#6F6B65';
const GRASS = '#6FA05A';
const RED = '#C9442E';
const GALLERY = '#4A4A52';
const LAMP = '#FFE9A8';
const WINDOW = '#3A4656';

export function buildHaiDangVungTau(): LandmarkGeometry {
  const towerAt = 0.22;
  const towerHeight = 0.78;
  const galleryAt = towerAt + towerHeight;
  const lanternAt = galleryAt + 0.035;
  const capAt = lanternAt + 0.13;
  // A cylinder turned by half a facet has a flat face, not an edge, toward +Z, where the windows go.
  const faceTurn = Math.PI / 10;
  const opaque = [
    // The hill: a big boulder with a green cap, and smaller rocks round it.
    dome(0.4, 0, ROCK, { scale: [1.25, 0.6, 1.1] }),
    dome(0.3, 0, GRASS, { position: [0, 0.14, 0], scale: [1.1, 0.5, 1] }),
    dome(0.22, 0, ROCK_DARK, { position: [-0.38, 0, 0.2], scale: [1, 0.8, 1] }),
    dome(0.19, 0, ROCK, { position: [0.36, 0, 0.24], scale: [1, 0.75, 1] }),
    dome(0.16, 0, ROCK_DARK, { position: [0.14, 0, -0.34], scale: [1, 0.8, 1] }),
    blob(0.1, 0, LEAF, { position: [0.3, 0.26, 0.04] }),
    // The tower, its windows and door, the gallery, the lantern and the cap.
    cylinder(0.12, 0.18, towerHeight, 10, WHITE, { position: [0, towerAt, 0], rotation: [0, faceTurn, 0] }),
    box(0.045, 0.09, 0.02, WINDOW, { position: [0, towerAt + 0.1, 0.168] }),
    box(0.035, 0.07, 0.02, WINDOW, { position: [0, towerAt + 0.38, 0.145] }),
    box(0.03, 0.06, 0.02, WINDOW, { position: [0, towerAt + 0.6, 0.128] }),
    cylinder(0.17, 0.17, 0.035, 10, GALLERY, { position: [0, galleryAt, 0] }),
    cone(0.12, 0.17, 10, RED, { position: [0, capAt, 0] }),
    cylinder(0.008, 0.01, 0.07, 4, GALLERY, { position: [0, capAt + 0.16, 0] }),
  ];
  const emissive = [cylinder(0.075, 0.075, 0.13, 8, LAMP, { position: [0, lanternAt, 0] })];
  return assembleLandmark({ opaque, emissive });
}
