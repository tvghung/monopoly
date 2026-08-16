import * as THREE from 'three';
import {
  CENTER_FIELD_CLEARANCE,
  INNER_TILE_SURFACE_BOUNDARY,
} from '../boardLayout';

export const AIRPORT_FIELD_SIZE = INNER_TILE_SURFACE_BOUNDARY * 2 - CENTER_FIELD_CLEARANCE * 2;
export const AIRPORT_RUNWAY_OLD_WIDTH = 0.28;
export const AIRPORT_RUNWAY_WIDTH = 0.52;
export const AIRPORT_RUNWAY_OUTER_MARGIN = 0.1;
export const AIRPORT_RUNWAY_OUTER_HALF_SIZE = AIRPORT_FIELD_SIZE / 2 - AIRPORT_RUNWAY_OUTER_MARGIN;
export const AIRPORT_RUNWAY_INNER_HALF_SIZE = AIRPORT_RUNWAY_OUTER_HALF_SIZE - AIRPORT_RUNWAY_WIDTH;
export const AIRPORT_RUNWAY_CENTERLINE_HALF_SIZE = (
  AIRPORT_RUNWAY_OUTER_HALF_SIZE + AIRPORT_RUNWAY_INNER_HALF_SIZE
) / 2;
export const AIRPORT_RUNWAY_SURFACE_Y = 0.09;
export const AIRPORT_RUNWAY_DASH_Y = 0.109;
export const AIRPORT_RUNWAY_DASH_LENGTH = 0.26;
export const AIRPORT_RUNWAY_DASH_WIDTH = 0.045;
export const AIRPORT_RUNWAY_DASH_GAP = 0.19;
export const AIRPORT_RUNWAY_CORNER_CLEARANCE = 0.25;

export type AirportRunwaySide = 'BOTTOM' | 'LEFT' | 'TOP' | 'RIGHT';

export interface AirportRunwayDashSpec {
  side: AirportRunwaySide;
  position: readonly [number, number, number];
  size: readonly [number, number];
}

export function createAirportRunwayLoopShape(
  outerHalfSize = AIRPORT_RUNWAY_OUTER_HALF_SIZE,
  innerHalfSize = AIRPORT_RUNWAY_INNER_HALF_SIZE,
): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-outerHalfSize, -outerHalfSize);
  shape.lineTo(outerHalfSize, -outerHalfSize);
  shape.lineTo(outerHalfSize, outerHalfSize);
  shape.lineTo(-outerHalfSize, outerHalfSize);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-innerHalfSize, -innerHalfSize);
  hole.lineTo(-innerHalfSize, innerHalfSize);
  hole.lineTo(innerHalfSize, innerHalfSize);
  hole.lineTo(innerHalfSize, -innerHalfSize);
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

export function createAirportRunwayLoopGeometry(): THREE.ShapeGeometry {
  return new THREE.ShapeGeometry(createAirportRunwayLoopShape());
}

function createDashOffsets(): readonly number[] {
  const offsets: number[] = [];
  const start = -AIRPORT_RUNWAY_CENTERLINE_HALF_SIZE + AIRPORT_RUNWAY_CORNER_CLEARANCE;
  const end = AIRPORT_RUNWAY_CENTERLINE_HALF_SIZE - AIRPORT_RUNWAY_CORNER_CLEARANCE;
  for (
    let offset = start;
    offset + AIRPORT_RUNWAY_DASH_LENGTH / 2 <= end;
    offset += AIRPORT_RUNWAY_DASH_LENGTH + AIRPORT_RUNWAY_DASH_GAP
  ) {
    offsets.push(offset);
  }
  return offsets;
}

export function getAirportRunwayDashSpecs(): readonly AirportRunwayDashSpec[] {
  const offsets = createDashOffsets();
  return offsets.flatMap(offset => [
    {
      side: 'BOTTOM' as const,
      position: [offset, AIRPORT_RUNWAY_DASH_Y, -AIRPORT_RUNWAY_CENTERLINE_HALF_SIZE] as const,
      size: [AIRPORT_RUNWAY_DASH_LENGTH, AIRPORT_RUNWAY_DASH_WIDTH] as const,
    },
    {
      side: 'TOP' as const,
      position: [offset, AIRPORT_RUNWAY_DASH_Y, AIRPORT_RUNWAY_CENTERLINE_HALF_SIZE] as const,
      size: [AIRPORT_RUNWAY_DASH_LENGTH, AIRPORT_RUNWAY_DASH_WIDTH] as const,
    },
    {
      side: 'LEFT' as const,
      position: [-AIRPORT_RUNWAY_CENTERLINE_HALF_SIZE, AIRPORT_RUNWAY_DASH_Y, offset] as const,
      size: [AIRPORT_RUNWAY_DASH_WIDTH, AIRPORT_RUNWAY_DASH_LENGTH] as const,
    },
    {
      side: 'RIGHT' as const,
      position: [AIRPORT_RUNWAY_CENTERLINE_HALF_SIZE, AIRPORT_RUNWAY_DASH_Y, offset] as const,
      size: [AIRPORT_RUNWAY_DASH_WIDTH, AIRPORT_RUNWAY_DASH_LENGTH] as const,
    },
  ]);
}
