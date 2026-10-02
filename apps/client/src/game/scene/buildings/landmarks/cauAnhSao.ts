import { box, extrude, tubeAlong, type Vec3 } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { LEAF, LEAF_DARK, arcStrip, tree, waterPlate } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 31, Cầu Ánh Sao (plan 05 §8.3): the Starlight Bridge. A curved white deck between two grassy banks, a tall bow arch over
 * it on hangers, and two rails of light along its edges. The light rails are the emissive part.
 */
const DECK = '#E8E2D6';
const GRASS = '#6FA05A';
const LIGHT = '#FFF1B8';
const ARCH = '#F4F1EA';
const WATER_DEEP = '#3F8FA6';

const BANK = 0.06;
const SPAN = 1.0;
const RISE = 0.16;
const DECK_THICKNESS = 0.045;
const DECK_WIDTH = 0.3;
const ARCH_RISE = 0.42;

/** Height of the deck's top surface at `t` (0 at one end, 1 at the other). */
function deckTop(t: number): number {
  return BANK + RISE * (1 - (2 * t - 1) ** 2) + DECK_THICKNESS;
}

const xAt = (t: number): number => (t - 0.5) * SPAN;

/** Points of a curve over the deck, at `lift` above the deck top and `z` across it (a rail or the arch), `steps` segments. */
function curveOver(z: number, lift: (t: number) => number, steps: number): Vec3[] {
  return Array.from({ length: steps + 1 }, (_, index): Vec3 => {
    const t = index / steps;
    return [xAt(t), deckTop(t) + lift(t), z];
  });
}

export function buildCauAnhSao(): LandmarkGeometry {
  const half = DECK_WIDTH / 2;
  const railLift = 0.09;
  const archLift = (t: number): number => ARCH_RISE * (1 - (2 * t - 1) ** 2);
  const opaque = [
    waterPlate(1.22, 0.9, WATER_DEEP),
    box(0.24, BANK, 0.8, GRASS, { position: [-0.48, 0, 0] }),
    box(0.24, BANK, 0.8, GRASS, { position: [0.48, 0, 0] }),
    extrude(arcStrip(SPAN, RISE, DECK_THICKNESS, 10), DECK_WIDTH, DECK, { position: [0, BANK, 0] }),
    // The bow arch over the middle of the deck, and four hangers from it to the deck.
    tubeAlong(curveOver(0, archLift, 12), 0.02, ARCH, { tubularSegments: 12, radialSegments: 4 }),
    ...[0.25, 0.4, 0.6, 0.75].map(t => box(0.01, archLift(t), 0.01, ARCH, { position: [xAt(t), deckTop(t), 0] })),
    // Rail posts at the ends and the middle of each edge.
    ...[-1, 1].flatMap(side => [0.04, 0.5, 0.96].map(t => box(0.014, railLift, 0.014, ARCH, { position: [xAt(t), deckTop(t), side * half] }))),
    ...tree(-0.5, -0.28, 0.13, LEAF, BANK),
    ...tree(0.5, 0.28, 0.11, LEAF_DARK, BANK),
  ];
  const emissive = [-1, 1].map(side => tubeAlong(
    curveOver(side * half, () => railLift, 8),
    0.014,
    LIGHT,
    { tubularSegments: 10, radialSegments: 3 },
  ));
  return assembleLandmark({ opaque, emissive });
}
