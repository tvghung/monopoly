import { OTB_PALETTE } from '../../../../design-system/tokens/palette';

/**
 * Single source of the light rig (plan 02 §8.2). Camera basis: the fixed camera looks from world
 * direction (1, 1.25, 1), so screen-right is about (+1, 0, -1)/sqrt(2) and screen-up on the ground plane
 * is about (-1, 0, -1)/sqrt(2). The key light therefore sits on the screen's left and slightly above,
 * which lights the +Z face and the tops and leaves the +X face shaded.
 */
export type Vec3 = readonly [number, number, number];

export interface KeyLightSpec {
  position: Vec3;
  target: Vec3;
  color: string;
  intensity: number;
  shadow: {
    /** Orthographic shadow camera half extents, near and far. */
    halfExtent: number;
    near: number;
    far: number;
    bias: number;
    normalBias: number;
    radius: number;
  };
}

export interface FillLightSpec {
  skyColor: string;
  groundColor: string;
  intensity: number;
}

export interface RimLightSpec {
  position: Vec3;
  color: string;
  intensity: number;
}

export interface LightRigSpec {
  key: KeyLightSpec;
  fill: FillLightSpec;
  rim: RimLightSpec;
}

export const LIGHT_RIG: LightRigSpec = {
  key: {
    position: [-9, 16, 5],
    target: [0, 0, 0],
    color: '#FFF1DE',
    intensity: 2.2,
    shadow: {
      halfExtent: 15,
      near: 1,
      far: 60,
      bias: -0.0004,
      normalBias: 0.02,
      radius: 3,
    },
  },
  fill: {
    skyColor: '#FFF8EC',
    // The light oak table bounces warm light back up onto the board.
    groundColor: OTB_PALETTE['table-oak'],
    intensity: 0.55,
  },
  rim: {
    position: [8, 10, -12],
    color: '#DDE9FF',
    intensity: 0.6,
  },
};

/** Unit direction from the scene origin toward a light position. */
export function directionTo(position: Vec3): Vec3 {
  const length = Math.hypot(position[0], position[1], position[2]);
  return [position[0] / length, position[1] / length, position[2] / length];
}
