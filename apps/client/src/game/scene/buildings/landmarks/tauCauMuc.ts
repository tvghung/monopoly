import { box, cylinder } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { SAND, WATER, WHITE, boatHull, palm, waterPlate } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 29, the Phú Quốc beach and its tàu câu mực (plan 05 §8.3): a strip of sand with two palms, and two squid-fishing boats on
 * the water, each with a bar of lamps over the deck. The lamps are the one emissive part, so they glow like the night fleet.
 */
const LAMP = '#FFF3B0';
const POLE = '#4A2F22';
const BLUE_HULL = '#2F6FA8';
const RED_HULL = '#D9552B';

const FLOOR = 0.03;

interface BoatSpec {
  x: number;
  z: number;
  length: number;
  width: number;
  hull: string;
  /** Turn about Y, radians. */
  heading: number;
  lamps: number;
}

/** A point at (`lx`, `lz`) in the boat's own frame, in the scene frame: the boat is turned `heading` about Y. */
function inBoat(boat: BoatSpec, lx: number, lz: number): [number, number] {
  const cos = Math.cos(boat.heading);
  const sin = Math.sin(boat.heading);
  return [boat.x + lx * cos + lz * sin, boat.z - lx * sin + lz * cos];
}

/** One squid boat: a hull, a white cabin at the stern, a mast with a cross bar and lamps hanging from it. */
function squidBoat(boat: BoatSpec) {
  const hullHeight = 0.08;
  const deck = FLOOR + hullHeight;
  const barY = deck + 0.22;
  const [cabinX, cabinZ] = inBoat(boat, -boat.length * 0.28, 0);
  const [mastX, mastZ] = inBoat(boat, boat.length * 0.08, 0);
  const lampSpacing = 0.075;
  const parts = [
    boatHull(boat.length, boat.width, hullHeight, boat.hull, [boat.x, FLOOR, boat.z], boat.heading),
    box(0.13, 0.09, boat.width * 0.7, WHITE, { position: [cabinX, deck, cabinZ], rotation: [0, boat.heading, 0] }),
    cylinder(0.009, 0.012, barY - deck, 4, POLE, { position: [mastX, deck, mastZ] }),
    // The cross bar runs across the hull, so it is turned a quarter against the boat.
    box(0.34, 0.012, 0.012, POLE, { position: [mastX, barY, mastZ], rotation: [0, boat.heading + Math.PI / 2, 0] }),
  ];
  const lamps = Array.from({ length: boat.lamps }, (_, index) => {
    const [lampX, lampZ] = inBoat(boat, boat.length * 0.08, (index - (boat.lamps - 1) / 2) * lampSpacing);
    return box(0.032, 0.032, 0.032, LAMP, { position: [lampX, barY - 0.04, lampZ] });
  });
  return { parts, lamps };
}

export function buildTauCauMuc(): LandmarkGeometry {
  const first = squidBoat({ x: -0.18, z: 0.26, length: 0.5, width: 0.15, hull: BLUE_HULL, heading: 0.12, lamps: 4 });
  const second = squidBoat({ x: 0.3, z: 0.42, length: 0.42, width: 0.13, hull: RED_HULL, heading: -0.2, lamps: 3 });
  const opaque = [
    box(1.2, FLOOR, 0.5, SAND, { position: [0, 0, -0.3] }),
    waterPlate(1.2, 0.62, WATER, { position: [0, 0, 0.26] }),
    ...palm(-0.4, -0.34, 0.55, 0.12, FLOOR),
    ...palm(0.18, -0.4, 0.45, -0.15, FLOOR),
    ...first.parts,
    ...second.parts,
  ];
  const emissive = [...first.lamps, ...second.lamps];
  return assembleLandmark({ opaque, emissive });
}
