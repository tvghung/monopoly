import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  calculateOrthographicHalfHeight,
  getOrthographicCameraPosition,
  ORTHOGRAPHIC_READABILITY_ZOOM,
} from './cameraMath';

/** The fixed board camera for a canvas of this aspect; exported so layout tests can compare analytic projections with it. */
export function configureOrthographicCamera(
  camera: THREE.OrthographicCamera,
  aspect: number,
): void {
  const halfHeight = calculateOrthographicHalfHeight(aspect);
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.zoom = ORTHOGRAPHIC_READABILITY_ZOOM;
  camera.position.set(...getOrthographicCameraPosition());
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

/**
 * The `camera` prop of the board Canvas. `manual` keeps R3F away from the frustum: without it R3F rewrites an orthographic
 * camera to +-size/2 pixels on every size AND pixel-ratio change. A graphics tier change moves the pixel ratio, while
 * FixedBoardCamera only re-applies the board frustum when the size changes, so the board used to shrink to a few dozen pixels
 * and vanish together with the player stations (V1.1 feedback item 12). FixedBoardCamera is the only writer of the frustum.
 */
export const BOARD_CANVAS_CAMERA = {
  manual: true,
  near: 0.1,
  far: 100,
  position: getOrthographicCameraPosition(),
} as const;

export default function FixedBoardCamera() {
  const camera = useThree(state => state.camera);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const invalidate = useThree(state => state.invalidate);

  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const aspect = width > 0 && height > 0 ? width / height : 1;
    configureOrthographicCamera(camera, aspect);
    invalidate();
  }, [camera, height, invalidate, width]);

  return null;
}
