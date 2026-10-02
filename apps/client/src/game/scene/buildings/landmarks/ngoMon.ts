import { arcadeWall, box, gableRoof } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import type { LandmarkGeometry } from './types';

/**
 * Tile 14, Ngọ Môn in Huế (plan 05 §8.3): the imperial gate. A wide red-brown base with three arched passages and two short
 * wings, with a two-tier pavilion of yellow roofs on top (Lầu Ngũ Phụng).
 */
const BASE = '#9A4A3A';
const WALL = '#B8584A';
const YELLOW = '#E0B43C';
const PILLAR = '#C9442E';
const STONE = '#9D8E7C';

export function buildNgoMon(): LandmarkGeometry {
  const base = 0.34;
  const lower = 0.14;
  const opaque = [
    box(1.26, 0.04, 0.6, STONE),
    // The gate: one wall with three arches, the middle one a little wider in spirit by the pavilion above it.
    arcadeWall(1.2, base, 0.46, 3, 0.2, 0.26, BASE, { position: [0, 0.04, 0] }),
    box(0.28, 0.07, 0.5, WALL, { position: [-0.46, 0.04 + base, 0] }),
    box(0.28, 0.07, 0.5, WALL, { position: [0.46, 0.04 + base, 0] }),
    // The lower pavilion with its wide yellow roof.
    box(0.72, lower, 0.3, PILLAR, { position: [0, 0.04 + base, 0] }),
    gableRoof(0.84, 0.44, 0.13, YELLOW, { position: [0, 0.04 + base + lower, 0] }),
    // The upper pavilion and its roof.
    box(0.4, 0.12, 0.22, PILLAR, { position: [0, 0.04 + base + lower + 0.12, 0] }),
    gableRoof(0.52, 0.32, 0.13, YELLOW, { position: [0, 0.04 + base + lower + 0.24, 0] }),
    // Two small roofs on the wings, so the gate reads as a whole building.
    gableRoof(0.34, 0.34, 0.1, YELLOW, { position: [-0.46, 0.04 + base + 0.07, 0] }),
    gableRoof(0.34, 0.34, 0.1, YELLOW, { position: [0.46, 0.04 + base + 0.07, 0] }),
  ];
  return assembleLandmark({ opaque });
}
