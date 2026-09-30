import {
  CAMERA_DIRECTION,
  ORTHOGRAPHIC_READABILITY_ZOOM,
  calculateOrthographicHalfHeight,
} from '../../camera/cameraMath';

/** Side length of the square tabletop plane, in world units (plan 02 §8.5 starts at 120). */
export const TABLETOP_SIZE = 120;
export const TABLETOP_Y = -0.002;

/**
 * Half side of the smallest axis-aligned square, centered on the origin, that covers everything the fixed
 * orthographic camera can see of the ground plane at `aspect`. The visible footprint is a rectangle with
 * half extents `halfHeight * aspect / zoom` across and `halfHeight / zoom / sin(elevation)` in depth, so a
 * square whose half side is that rectangle's circumradius always contains it.
 */
export function getTabletopRequiredHalfSize(aspect: number): number {
  const halfHeight = calculateOrthographicHalfHeight(aspect) / ORTHOGRAPHIC_READABILITY_ZOOM;
  const elevationSine = CAMERA_DIRECTION[1];
  return Math.hypot(halfHeight * aspect, halfHeight / elevationSine);
}

export const TABLETOP_COVERED_ASPECTS = [1, 1.33, 1.6, 1.78, 2, 2.4] as const;
