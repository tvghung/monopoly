import * as THREE from 'three';
import type { BoardTileLayout } from '../boardLayout';
import { TILE_SURFACE_LOCAL_POSITION, TILE_SURFACE_LOCAL_ROTATION } from '../boardLayout';

const WORLD_UP_AXIS = new THREE.Vector3(0, 1, 0);
const LOCAL_X_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * Composes a plane transform in the same order as a tile anchor containing a
 * horizontal face: R_y(tile yaw) * R_x(face tilt).
 */
export function composeTileSurfaceMatrix(
  layout: BoardTileLayout,
  surfaceSize: readonly [number, number],
  motionOffsetY = 0,
  target = new THREE.Matrix4(),
  surfacePlaneOffset = 0,
): THREE.Matrix4 {
  const tileYaw = new THREE.Quaternion().setFromAxisAngle(WORLD_UP_AXIS, layout.rotation[1]);
  const faceTilt = new THREE.Quaternion().setFromAxisAngle(
    LOCAL_X_AXIS,
    TILE_SURFACE_LOCAL_ROTATION[0],
  );
  const orientation = tileYaw.multiply(faceTilt);

  const position = new THREE.Vector3(
      layout.position[0],
      TILE_SURFACE_LOCAL_POSITION[1] + motionOffsetY,
      layout.position[2],
  );
  position.add(new THREE.Vector3(0, surfacePlaneOffset, 0).applyQuaternion(orientation));

  return target.compose(
    position,
    orientation,
    new THREE.Vector3(surfaceSize[0], surfaceSize[1], 1),
  );
}
