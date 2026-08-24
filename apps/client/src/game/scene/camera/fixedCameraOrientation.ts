import * as THREE from 'three';
import {
  CAMERA_DIRECTION,
  CAMERA_RIGHT,
  CAMERA_UP,
  ORTHOGRAPHIC_CAMERA_DISTANCE,
} from './cameraMath';

const fixedCamera = new THREE.OrthographicCamera();
fixedCamera.position.set(
  CAMERA_DIRECTION[0] * ORTHOGRAPHIC_CAMERA_DISTANCE,
  CAMERA_DIRECTION[1] * ORTHOGRAPHIC_CAMERA_DISTANCE,
  CAMERA_DIRECTION[2] * ORTHOGRAPHIC_CAMERA_DISTANCE,
);
fixedCamera.lookAt(0, 0, 0);

export const FIXED_CAMERA_QUATERNION = fixedCamera.quaternion.clone();

export const FIXED_CARD_BACK_QUATERNION = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...CAMERA_RIGHT),
    new THREE.Vector3(...CAMERA_DIRECTION),
    new THREE.Vector3(...CAMERA_UP).negate(),
  ),
);
