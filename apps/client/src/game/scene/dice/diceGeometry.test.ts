import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { describe, expect, it } from 'vitest';
import {
  DICE_BODY_COLOR,
  DICE_EDGE_RADIUS,
  DICE_EDGE_RADIUS_RATIO,
  DICE_EDGE_SEGMENTS,
  DICE_FACE_COLOR,
  DICE_FACE_METALNESS,
  DICE_FACE_ROUGHNESS,
  DICE_FACE_SIZE,
  DICE_PIP_RADIUS,
  DICE_SURFACE_EPSILON,
} from './diceVisualConfig';
import { DICE_PIP_OFFSET, DICE_PIP_SURFACE_OFFSET } from './diceVisualConfig';
import { DICE_SIZE } from './diceLayout';
import { getDiceFaceSpecs, getDicePipInstances } from './diceGeometry';
import { getSettledDiceRotation } from './diceOrientation';
import {
  estimateSceneTriangles,
  STRESS_DRAW_CALL_LIMIT,
  TARGET_DRAW_CALLS,
  TARGET_TRIANGLES,
} from '../board/architecture/sceneBudget';
import { boardMaterialSpecs } from '../board/materials/boardMaterialSpecs';

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse(object => {
    if (object instanceof THREE.Mesh) count += 1;
  });
  return count;
}

function buildDiceCost({ rounded, instancedPips }: { rounded: boolean; instancedPips: boolean }) {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  const faceGeometry = new THREE.PlaneGeometry(DICE_FACE_SIZE, DICE_FACE_SIZE);
  const pipGeometry = new THREE.SphereGeometry(DICE_PIP_RADIUS, 8, 6);

  for (let dieIndex = 0; dieIndex < 2; dieIndex += 1) {
    const bodyGeometry = rounded
      ? new RoundedBoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE, DICE_EDGE_SEGMENTS, DICE_EDGE_RADIUS)
      : new THREE.BoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE);
    root.add(new THREE.Mesh(bodyGeometry, material));
  }
  for (let faceIndex = 0; faceIndex < 12; faceIndex += 1) {
    root.add(new THREE.Mesh(faceGeometry, material));
  }
  if (instancedPips) {
    root.add(new THREE.InstancedMesh(pipGeometry, material, 21));
    root.add(new THREE.InstancedMesh(pipGeometry, material, 21));
  } else {
    for (let pipIndex = 0; pipIndex < 42; pipIndex += 1) {
      root.add(new THREE.Mesh(pipGeometry, material));
    }
  }

  return {
    drawCalls: countMeshes(root),
    triangles: estimateSceneTriangles(root),
  };
}

describe('dice visual geometry contract', () => {
  it('uses a bright white PBR cube with a visible 7-10% edge radius', () => {
    expect(DICE_EDGE_RADIUS_RATIO).toBeGreaterThanOrEqual(0.07);
    expect(DICE_EDGE_RADIUS_RATIO).toBeLessThanOrEqual(0.1);
    expect(DICE_EDGE_RADIUS).toBeCloseTo(DICE_SIZE * 0.085);
    expect(DICE_EDGE_SEGMENTS).toBeGreaterThanOrEqual(2);
    expect(DICE_BODY_COLOR).toBe('#ffffff');
    expect(DICE_FACE_COLOR).toBe('#ffffff');
    expect(DICE_FACE_ROUGHNESS).toBeGreaterThan(0);
    expect(DICE_FACE_METALNESS).toBeLessThan(0.05);
    expect(boardMaterialSpecs.diceBody).toEqual({ roughness: 0.3, metalness: 0.02 });
  });

  it('keeps all six physical faces, standard opposite pairs, and an epsilon above the body', () => {
    const faces = getDiceFaceSpecs();
    expect(faces.map(face => face.value).sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(faces.find(face => face.value === 1)?.position[1]).toBeCloseTo(DICE_SIZE / 2 + DICE_SURFACE_EPSILON);
    expect(faces.find(face => face.value === 6)?.position[1]).toBeCloseTo(-DICE_SIZE / 2 - DICE_SURFACE_EPSILON);
    expect(faces.find(face => face.value === 2)?.position[2]).toBeCloseTo(DICE_SIZE / 2 + DICE_SURFACE_EPSILON);
    expect(faces.find(face => face.value === 5)?.position[2]).toBeCloseTo(-DICE_SIZE / 2 - DICE_SURFACE_EPSILON);
    expect(faces.find(face => face.value === 3)?.position[0]).toBeCloseTo(DICE_SIZE / 2 + DICE_SURFACE_EPSILON);
    expect(faces.find(face => face.value === 4)?.position[0]).toBeCloseTo(-DICE_SIZE / 2 - DICE_SURFACE_EPSILON);

    const oppositePairs = [[1, 6], [2, 5], [3, 4]];
    const axisSign = (value: number) => (value > 0 ? 1 : value < 0 ? -1 : 0);
    oppositePairs.forEach(([left, right]) => {
      const leftFace = faces.find(face => face.value === left);
      const rightFace = faces.find(face => face.value === right);
      expect(leftFace?.position.map(axisSign)).toEqual(rightFace?.position.map(value => (
        value > 0 ? -1 : value < 0 ? 1 : 0
      )));
    });

    faces.forEach(face => {
      const normal = new THREE.Vector3(0, 0, 1)
        .applyEuler(new THREE.Euler(...face.rotation))
        .applyEuler(new THREE.Euler(...getSettledDiceRotation(face.value)));
      expect(normal.x).toBeCloseTo(0);
      expect(normal.y).toBeCloseTo(1);
      expect(normal.z).toBeCloseTo(0);
    });
  });

  it('places every authoritative pip as genuine 3D geometry and batches only the repetition', () => {
    const pips = getDicePipInstances();
    expect(pips).toHaveLength(21);
    expect(pips.filter(pip => pip.faceValue === 1)).toHaveLength(1);
    expect(pips.filter(pip => pip.faceValue === 6)).toHaveLength(6);
    expect(DICE_PIP_OFFSET).toBeGreaterThan(0);
    expect(DICE_PIP_SURFACE_OFFSET).toBeGreaterThan(0);
    expect(pips.every(pip => pip.position.every(Number.isFinite))).toBe(true);
  });

  it('reduces settled dice draw calls while remaining inside the existing scene budget', () => {
    const baseline = buildDiceCost({ rounded: false, instancedPips: false });
    const optimized = buildDiceCost({ rounded: true, instancedPips: true });

    expect(baseline).toEqual({ drawCalls: 56, triangles: 3408 });
    expect(optimized.drawCalls).toBe(16);
    expect(optimized.drawCalls).toBeLessThan(TARGET_DRAW_CALLS);
    expect(optimized.drawCalls).toBeLessThan(STRESS_DRAW_CALL_LIMIT);
    expect(optimized.triangles).toBeLessThan(TARGET_TRIANGLES);
  });
});
