import { AIRPORT_RUNWAY_INNER_HALF_SIZE } from './airportRunwayGeometry';

export const CENTER_ORTHOGONAL_PATH_WIDTH = 0.36;
export const CENTER_ORTHOGONAL_PATH_COVERAGE_TARGET = 0.05;
export const CENTER_PATH_BOUNDARY_MARGIN = 0.18;

export interface CenterPathSegment {
  x: number;
  z: number;
  width: number;
  length: number;
  axis: 'x' | 'z';
}

const CENTER_FIELD_PATH_POINTS: readonly (readonly [number, number])[] = [
  [-4.35, 3.6],
  [-1.15, 3.6],
  [-1.15, 0.65],
  [2, 0.65],
  [2, -2.8],
  [4.35, -2.8],
];

function createSegment(
  start: readonly [number, number],
  end: readonly [number, number],
): CenterPathSegment {
  const [startX, startZ] = start;
  const [endX, endZ] = end;
  if (startX !== endX && startZ !== endZ) {
    throw new Error('Center path segments must be orthogonal.');
  }
  const axis = startX === endX ? 'z' : 'x';
  return {
    x: (startX + endX) / 2,
    z: (startZ + endZ) / 2,
    width: CENTER_ORTHOGONAL_PATH_WIDTH,
    length: axis === 'x' ? Math.abs(endX - startX) : Math.abs(endZ - startZ),
    axis,
  };
}

export const CENTER_ORTHOGONAL_PATH_SEGMENTS: readonly CenterPathSegment[] = (
  CENTER_FIELD_PATH_POINTS.slice(0, -1).map((point, index) => (
    createSegment(point, CENTER_FIELD_PATH_POINTS[index + 1])
  ))
);

export function getCenterPathRotationY(segment: CenterPathSegment): number {
  return segment.axis === 'x' ? 0 : Math.PI / 2;
}

export function getCenterPathBounds(
  segment: CenterPathSegment,
): readonly [number, number, number, number] {
  const halfLength = segment.length / 2;
  const halfWidth = segment.width / 2;
  return segment.axis === 'x'
    ? [segment.x - halfLength, segment.z - halfWidth, segment.x + halfLength, segment.z + halfWidth]
    : [segment.x - halfWidth, segment.z - halfLength, segment.x + halfWidth, segment.z + halfLength];
}

export function isCenterPathSegmentInOpenField(
  segment: CenterPathSegment,
  innerHalfSize = AIRPORT_RUNWAY_INNER_HALF_SIZE,
): boolean {
  const [minX, minZ, maxX, maxZ] = getCenterPathBounds(segment);
  return minX >= -innerHalfSize + CENTER_PATH_BOUNDARY_MARGIN
    && maxX <= innerHalfSize - CENTER_PATH_BOUNDARY_MARGIN
    && minZ >= -innerHalfSize + CENTER_PATH_BOUNDARY_MARGIN
    && maxZ <= innerHalfSize - CENTER_PATH_BOUNDARY_MARGIN;
}

export function areCenterPathSegmentsConnected(
  segments: readonly CenterPathSegment[],
): boolean {
  return segments.slice(1).every((segment, index) => {
    const previous = getCenterPathBounds(segments[index]);
    const current = getCenterPathBounds(segment);
    return previous[0] <= current[2]
      && current[0] <= previous[2]
      && previous[1] <= current[3]
      && current[1] <= previous[3];
  });
}

export function estimateCenterPathCoverage(
  segments: readonly CenterPathSegment[],
  innerHalfSize = AIRPORT_RUNWAY_INNER_HALF_SIZE,
): number {
  const pathArea = segments.reduce((area, segment) => area + segment.length * segment.width, 0);
  return pathArea / ((innerHalfSize * 2) ** 2);
}
