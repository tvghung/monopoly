import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_DIRECTION, CAMERA_RIGHT, CAMERA_UP } from './cameraMath';
import {
  FIXED_CAMERA_QUATERNION,
  FIXED_CARD_BACK_QUATERNION,
} from './fixedCameraOrientation';

describe('fixed camera-facing orientation', () => {
  it('maps local back and up vectors to the frozen camera basis', () => {
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(FIXED_CAMERA_QUATERNION);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(FIXED_CAMERA_QUATERNION);
    back.toArray().forEach((component, index) => {
      expect(component).toBeCloseTo(CAMERA_DIRECTION[index], 10);
    });
    up.toArray().forEach((component, index) => {
      expect(component).toBeCloseTo(CAMERA_UP[index], 10);
    });
  });

  it('keeps a camera-facing physical card screen-horizontal and text-up', () => {
    const longEdge = new THREE.Vector3(1, 0, 0).applyQuaternion(FIXED_CARD_BACK_QUATERNION);
    const backNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(FIXED_CARD_BACK_QUATERNION);
    const textUp = new THREE.Vector3(0, 0, -1).applyQuaternion(FIXED_CARD_BACK_QUATERNION);
    longEdge.toArray().forEach((component, index) => {
      expect(component).toBeCloseTo(CAMERA_RIGHT[index], 10);
    });
    backNormal.toArray().forEach((component, index) => {
      expect(component).toBeCloseTo(CAMERA_DIRECTION[index], 10);
    });
    textUp.toArray().forEach((component, index) => {
      expect(component).toBeCloseTo(CAMERA_UP[index], 10);
    });
  });
});
