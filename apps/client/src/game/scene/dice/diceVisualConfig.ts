import { DICE_SIZE } from './diceLayout';

// The die remains a cube, but this radius is large enough to catch the board
// light on the edge instead of reading as a sharp grey block.
export const DICE_EDGE_RADIUS_RATIO = 0.085;
export const DICE_EDGE_RADIUS = DICE_SIZE * DICE_EDGE_RADIUS_RATIO;
export const DICE_EDGE_SEGMENTS = 3;

export const DICE_FACE_SIZE = DICE_SIZE * 0.82;
export const DICE_SURFACE_EPSILON = DICE_SIZE * 0.012;
export const DICE_PIP_RADIUS = DICE_SIZE * 0.075;
export const DICE_PIP_OFFSET = DICE_SIZE * 0.22;
export const DICE_PIP_SURFACE_OFFSET = DICE_SIZE * 0.028;

// These are intentionally near-neutral white and near-black blue-green. The
// standard materials remain lit by the existing ACESFilmic scene lights.
export const DICE_BODY_COLOR = '#ffffff';
export const DICE_FACE_COLOR = '#ffffff';
export const DICE_FACE_ROUGHNESS = 0.32;
export const DICE_FACE_METALNESS = 0.01;
