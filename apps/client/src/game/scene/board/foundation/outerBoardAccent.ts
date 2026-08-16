import * as THREE from 'three';
import { BOARD_FOUNDATION_BEVEL } from '../architecture/boardArtSpec';
import { OUTER_BOARD_SIZE } from '../boardLayout';

export const FOUNDATION_SIZE = OUTER_BOARD_SIZE + 0.72;
export const OUTER_BOARD_ACCENT_BAND_WIDTH = 0.055;
export const OUTER_BOARD_ACCENT_HEIGHT = 0.012;
export const OUTER_BOARD_ACCENT_LIFT_Y = 0.002;
export const OUTER_BOARD_ACCENT_OUTER_SIZE = FOUNDATION_SIZE - 0.265;
export const OUTER_BOARD_ACCENT_INNER_SIZE = OUTER_BOARD_ACCENT_OUTER_SIZE
  - OUTER_BOARD_ACCENT_BAND_WIDTH * 2;
export const OUTER_BOARD_ACCENT_OUTER_RADIUS = BOARD_FOUNDATION_BEVEL * 0.72;
export const OUTER_BOARD_ACCENT_INNER_RADIUS = Math.max(
  0.02,
  OUTER_BOARD_ACCENT_OUTER_RADIUS - OUTER_BOARD_ACCENT_BAND_WIDTH,
);

export interface OuterBoardAccentBounds {
  outerSize: number;
  innerSize: number;
  bandWidth: number;
  outerRadius: number;
  innerRadius: number;
}

export function getOuterBoardAccentBounds(): OuterBoardAccentBounds {
  return {
    outerSize: OUTER_BOARD_ACCENT_OUTER_SIZE,
    innerSize: OUTER_BOARD_ACCENT_INNER_SIZE,
    bandWidth: OUTER_BOARD_ACCENT_BAND_WIDTH,
    outerRadius: OUTER_BOARD_ACCENT_OUTER_RADIUS,
    innerRadius: OUTER_BOARD_ACCENT_INNER_RADIUS,
  };
}

function addRoundedRectangle(
  path: THREE.Shape | THREE.Path,
  size: number,
  radius: number,
  clockwise: boolean,
): void {
  const half = size / 2;
  const r = Math.min(radius, half - 0.01);
  if (!clockwise) {
    path.moveTo(-half + r, -half);
    path.lineTo(half - r, -half);
    path.quadraticCurveTo(half, -half, half, -half + r);
    path.lineTo(half, half - r);
    path.quadraticCurveTo(half, half, half - r, half);
    path.lineTo(-half + r, half);
    path.quadraticCurveTo(-half, half, -half, half - r);
    path.lineTo(-half, -half + r);
    path.quadraticCurveTo(-half, -half, -half + r, -half);
    path.closePath();
    return;
  }

  path.moveTo(half - r, -half);
  path.lineTo(-half + r, -half);
  path.quadraticCurveTo(-half, -half, -half, -half + r);
  path.lineTo(-half, half - r);
  path.quadraticCurveTo(-half, half, -half + r, half);
  path.lineTo(half - r, half);
  path.quadraticCurveTo(half, half, half, half - r);
  path.lineTo(half, -half + r);
  path.quadraticCurveTo(half, -half, half - r, -half);
  path.closePath();
}

export function createOuterBoardAccentShape(
  bounds = getOuterBoardAccentBounds(),
): THREE.Shape {
  const shape = new THREE.Shape();
  addRoundedRectangle(shape, bounds.outerSize, bounds.outerRadius, false);
  const hole = new THREE.Path();
  addRoundedRectangle(hole, bounds.innerSize, bounds.innerRadius, true);
  shape.holes.push(hole);
  return shape;
}

export function createOuterBoardAccentGeometry(): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(createOuterBoardAccentShape(), {
    depth: OUTER_BOARD_ACCENT_HEIGHT,
    bevelEnabled: false,
    curveSegments: 4,
  });
}
