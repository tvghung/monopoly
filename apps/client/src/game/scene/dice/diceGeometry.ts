import * as THREE from 'three';
import { DICE_SIZE } from './diceLayout';
import {
  DICE_PIP_CENTER_OFFSET,
  DICE_PIP_OFFSET,
  DICE_SURFACE_EPSILON,
} from './diceVisualConfig';

const DICE_PIP_CAP_ORIENTATION = new THREE.Quaternion()
  .setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

export const PIP_POSITIONS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
};

export interface DiceFaceSpec {
  value: number;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
}

export interface DicePipInstance {
  faceValue: number;
  row: number;
  column: number;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
}

/** CylinderGeometry's visible top cap uses the local +Y normal. */
export function getDicePipCylinderQuaternion(
  faceRotation: readonly [number, number, number],
): THREE.Quaternion {
  return new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(...faceRotation))
    .multiply(DICE_PIP_CAP_ORIENTATION);
}

export function getDiceFaceSpecs(): readonly DiceFaceSpec[] {
  const faceHalf = DICE_SIZE / 2 + DICE_SURFACE_EPSILON;
  return [
    { value: 1, position: [0, faceHalf, 0], rotation: [-Math.PI / 2, 0, 0] },
    { value: 6, position: [0, -faceHalf, 0], rotation: [Math.PI / 2, 0, 0] },
    { value: 2, position: [0, 0, faceHalf], rotation: [0, 0, 0] },
    { value: 5, position: [0, 0, -faceHalf], rotation: [0, Math.PI, 0] },
    { value: 3, position: [faceHalf, 0, 0], rotation: [0, Math.PI / 2, 0] },
    { value: 4, position: [-faceHalf, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  ];
}

export function getDicePipInstances(): readonly DicePipInstance[] {
  return getDiceFaceSpecs().flatMap(face => {
    const rotation = new THREE.Euler(...face.rotation);
    const orientation = new THREE.Quaternion().setFromEuler(rotation);
    return PIP_POSITIONS[face.value].map(([row, column]) => {
      const localPosition = new THREE.Vector3(
        (column - 2) * DICE_PIP_OFFSET,
        (2 - row) * DICE_PIP_OFFSET,
        DICE_PIP_CENTER_OFFSET,
      ).applyQuaternion(orientation);
      const position: [number, number, number] = [
        face.position[0] + localPosition.x,
        face.position[1] + localPosition.y,
        face.position[2] + localPosition.z,
      ];
      return { faceValue: face.value, row, column, position, rotation: face.rotation };
    });
  });
}
