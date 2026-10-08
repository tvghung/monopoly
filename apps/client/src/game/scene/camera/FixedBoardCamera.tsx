import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import { boardViewStore, type BoardView } from './boardView';
import {
  calculateOrthographicHalfHeight,
  CAMERA_RIGHT,
  CAMERA_UP,
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
 * The overview camera with the player's own view on top of it (`boardViewStore`): the zoom multiplies the overview zoom and the
 * pan slides the camera along its own right/up axes, which leaves its orientation (and so every camera-facing part of the scene)
 * untouched. At the default view this is exactly the old fixed camera.
 */
export function applyBoardView(camera: THREE.OrthographicCamera, view: BoardView): void {
  const base = getOrthographicCameraPosition();
  camera.zoom = ORTHOGRAPHIC_READABILITY_ZOOM * view.zoom;
  camera.position.set(
    base[0] + CAMERA_RIGHT[0] * view.panX + CAMERA_UP[0] * view.panY,
    base[1] + CAMERA_RIGHT[1] * view.panX + CAMERA_UP[1] * view.panY,
    base[2] + CAMERA_RIGHT[2] * view.panX + CAMERA_UP[2] * view.panY,
  );
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
  const reducedMotion = useEffectiveReducedMotion();

  useEffect(() => boardViewStore.attach(), []);

  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return undefined;
    const aspect = width > 0 && height > 0 ? width / height : 1;
    configureOrthographicCamera(camera, aspect);
    // The window the overview shows, so the pan limits and the pixel-to-world scale follow the canvas.
    const halfHeight = calculateOrthographicHalfHeight(aspect) / ORTHOGRAPHIC_READABILITY_ZOOM;
    boardViewStore.setFrame(
      { halfWidth: halfHeight * aspect, halfHeight },
      height > 0 ? (2 * halfHeight) / height : 0.02,
      reducedMotion,
    );
    const apply = () => {
      applyBoardView(camera, boardViewStore.getView());
      invalidate();
    };
    apply();
    return boardViewStore.subscribe(apply);
  }, [camera, height, invalidate, reducedMotion, width]);

  return null;
}
