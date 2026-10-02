import { box, cylinder } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { WATER, WHITE, waterPlate } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 3, Cánh đồng điện gió Bạc Liêu (plan 05 §8.3): three slim white wind turbines of different heights standing in shallow
 * water, their rotors turned to different angles so they do not read as copies.
 */
const GREY = '#B7BDC2';
const BLADE = '#EDEFF0';

interface Turbine {
  x: number;
  z: number;
  tower: number;
  /** Angle of the first blade, in radians. */
  spin: number;
}

function turbine({ x, z, tower, spin }: Turbine) {
  const base = 0.03;
  const hubY = base + tower;
  const yaw = Math.PI / 4;
  const parts = [
    cylinder(0.016, 0.034, tower, 6, WHITE, { position: [x, base, z] }),
    box(0.05, 0.05, 0.1, GREY, { position: [x, hubY - 0.02, z] }),
  ];
  for (let blade = 0; blade < 3; blade += 1) {
    // A blade is a thin box standing on its inner end; turned about Z it spins in the rotor plane, then yawed to face the camera.
    parts.push(box(0.032, 0.34, 0.008, BLADE, {
      position: [x + Math.sin(yaw) * 0.06, hubY, z + Math.cos(yaw) * 0.06],
      rotation: [0, yaw, spin + (blade * Math.PI * 2) / 3],
    }));
  }
  return parts;
}

export function buildDienGio(): LandmarkGeometry {
  const opaque = [
    waterPlate(1.2, 0.7, WATER),
    ...turbine({ x: -0.39, z: 0.12, tower: 0.95, spin: 0.2 }),
    ...turbine({ x: -0.01, z: -0.12, tower: 1.1, spin: 0.9 }),
    ...turbine({ x: 0.35, z: 0.12, tower: 0.9, spin: 0.55 }),
  ];
  return assembleLandmark({ opaque });
}
