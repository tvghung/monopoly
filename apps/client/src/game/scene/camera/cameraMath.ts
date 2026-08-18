import {
  BOARD_BOUNDING_RADIUS,
  OUTER_BOARD_SIZE,
} from '../board/boardLayout';

export const DEFAULT_CAMERA_FOV = 40;
export const DEFAULT_FRAMING_MARGIN = 1.06;
export const ORTHOGRAPHIC_CAMERA_DISTANCE = 32;
export const CAMERA_DIRECTION: readonly [number, number, number] = (() => {
  const length = Math.hypot(1, 1.25, 1);
  return [1 / length, 1.25 / length, 1 / length];
})();

type Vector3 = readonly [number, number, number];

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ] as Vector3;
}

export const CAMERA_FORWARD: Vector3 = [
  -CAMERA_DIRECTION[0],
  -CAMERA_DIRECTION[1],
  -CAMERA_DIRECTION[2],
];
export const CAMERA_RIGHT: Vector3 = normalize(cross(CAMERA_FORWARD, [0, 1, 0]));
export const CAMERA_UP: Vector3 = normalize(cross(CAMERA_RIGHT, CAMERA_FORWARD));

export const BOARD_FIT_HALF_EXTENT = (OUTER_BOARD_SIZE + 0.72) / 2;
export const BOARD_FIT_MIN_Y = 0;
export const BOARD_FIT_MAX_Y = 1.6;

export const BOARD_FIT_CORNERS: readonly Vector3[] = [
  ...[BOARD_FIT_MIN_Y, BOARD_FIT_MAX_Y].flatMap(y => (
    [-BOARD_FIT_HALF_EXTENT, BOARD_FIT_HALF_EXTENT].flatMap(x => (
      [-BOARD_FIT_HALF_EXTENT, BOARD_FIT_HALF_EXTENT].map(z => [x, y, z] as Vector3)
    ))
  )),
];

export interface CameraFramingOptions {
  fov?: number;
  boardBoundingRadius?: number;
  boardCorners?: readonly Vector3[];
  framingMargin?: number;
}

export function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function getSafeFramingMargin(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return DEFAULT_FRAMING_MARGIN;
  }
  return value;
}

export function calculateBoundingSphereCameraDistance(
  aspect: number,
  options: CameraFramingOptions = {},
): number {
  const fov = options.fov ?? DEFAULT_CAMERA_FOV;
  const boardBoundingRadius = options.boardBoundingRadius ?? BOARD_BOUNDING_RADIUS;
  const framingMargin = getSafeFramingMargin(options.framingMargin);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const verticalFov = degreesToRadians(fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  return boardBoundingRadius / Math.sin(limitingFov / 2) * framingMargin;
}

export function calculateProjectedCornerCameraDistance(
  aspect: number,
  options: CameraFramingOptions = {},
): number {
  const fov = options.fov ?? DEFAULT_CAMERA_FOV;
  const framingMargin = getSafeFramingMargin(options.framingMargin);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const verticalFov = degreesToRadians(fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const verticalLimit = Math.tan(verticalFov / 2);
  const horizontalLimit = Math.tan(horizontalFov / 2);
  const corners = options.boardCorners ?? BOARD_FIT_CORNERS;

  const requiredDistance = corners.reduce((required, corner) => {
    const depthOffset = dot(corner, CAMERA_FORWARD);
    const horizontalProjection = Math.abs(dot(corner, CAMERA_RIGHT));
    const verticalProjection = Math.abs(dot(corner, CAMERA_UP));
    return Math.max(
      required,
      -depthOffset + 0.001,
      horizontalProjection / horizontalLimit - depthOffset,
      verticalProjection / verticalLimit - depthOffset,
    );
  }, 0);

  return Math.max(0.001, requiredDistance) * framingMargin;
}

export function calculateCameraDistance(
  aspect: number,
  options: CameraFramingOptions = {},
): number {
  return calculateProjectedCornerCameraDistance(aspect, options);
}

export function getCameraPosition(
  aspect: number,
  options: CameraFramingOptions = {},
): readonly [number, number, number] {
  const distance = calculateCameraDistance(aspect, options);
  return CAMERA_DIRECTION.map(component => component * distance) as [number, number, number];
}

export function calculateOrthographicHalfHeight(
  aspect: number,
  options: CameraFramingOptions = {},
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const framingMargin = getSafeFramingMargin(options.framingMargin);
  const corners = options.boardCorners ?? BOARD_FIT_CORNERS;
  const projectedHalfWidth = Math.max(...corners.map(corner => Math.abs(dot(corner, CAMERA_RIGHT))));
  const projectedHalfHeight = Math.max(...corners.map(corner => Math.abs(dot(corner, CAMERA_UP))));
  return Math.max(projectedHalfHeight, projectedHalfWidth / safeAspect) * framingMargin;
}

export function getOrthographicCameraPosition(): readonly [number, number, number] {
  return CAMERA_DIRECTION.map(component => (
    component * ORTHOGRAPHIC_CAMERA_DISTANCE
  )) as [number, number, number];
}
