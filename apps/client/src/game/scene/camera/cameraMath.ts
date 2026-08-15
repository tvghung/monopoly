import { BOARD_BOUNDING_RADIUS } from '../board/boardLayout';

export const DEFAULT_CAMERA_FOV = 34;
export const DEFAULT_FRAMING_MARGIN = 1.12;
export const CAMERA_DIRECTION: readonly [number, number, number] = (() => {
  const length = Math.hypot(1, 1.25, 1);
  return [1 / length, 1.25 / length, 1 / length];
})();

export interface CameraFramingOptions {
  fov?: number;
  boardBoundingRadius?: number;
  framingMargin?: number;
}

export function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function calculateCameraDistance(
  aspect: number,
  options: CameraFramingOptions = {},
): number {
  const fov = options.fov ?? DEFAULT_CAMERA_FOV;
  const boardBoundingRadius = options.boardBoundingRadius ?? BOARD_BOUNDING_RADIUS;
  const framingMargin = options.framingMargin ?? DEFAULT_FRAMING_MARGIN;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const verticalFov = degreesToRadians(fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  return boardBoundingRadius / Math.sin(limitingFov / 2) * framingMargin;
}

export function getCameraPosition(
  aspect: number,
  options: CameraFramingOptions = {},
): readonly [number, number, number] {
  const distance = calculateCameraDistance(aspect, options);
  return CAMERA_DIRECTION.map(component => component * distance) as [number, number, number];
}
