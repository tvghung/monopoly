import { DICE_SIZE } from './diceLayout';

// The die remains a cube, but this radius is large enough to catch the board
// light on the edge instead of reading as a sharp grey block.
export const DICE_EDGE_RADIUS_RATIO = 0.085;
export const DICE_EDGE_RADIUS = DICE_SIZE * DICE_EDGE_RADIUS_RATIO;
export const DICE_EDGE_SEGMENTS = 5;

export const DICE_FACE_SIZE = DICE_SIZE * 0.82;
export const DICE_SURFACE_EPSILON = DICE_SIZE * 0.012;
// The pip footprint is deliberately explicit because the fixed isometric
// camera reads the circular insert, not the hidden depth of an embedded sphere.
export const DICE_PIP_RADIUS = DICE_SIZE * 0.105;
export const DICE_PIP_OFFSET = DICE_SIZE * 0.22;
export const DICE_PIP_SEGMENTS = 16;
export const DICE_PIP_DEPTH = DICE_SIZE * 0.018;
// The cap is flush with the face plane; DiceLayer renders it after the plane
// so the coplanar depth test remains deterministic without a raised lip.
export const DICE_PIP_SURFACE_OFFSET = 0;
export const DICE_PIP_CENTER_OFFSET = DICE_PIP_SURFACE_OFFSET
  - DICE_PIP_DEPTH / 2;
export const DICE_CORNER_SEGMENTS = 10;
export const DICE_RESULT_FONT_SIZE = 0.42;

// These are intentionally near-neutral white and near-black blue-green. The
// standard materials remain lit by the existing ACESFilmic scene lights.
export const DICE_BODY_COLOR = '#ffffff';
export const DICE_FACE_COLOR = '#ffffff';
export const DICE_FACE_ROUGHNESS = 0.18;
export const DICE_FACE_METALNESS = 0.02;
