import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { describe, expect, it } from 'vitest';
import {
  DICE_BODY_COLOR,
  DICE_CORNER_SEGMENTS,
  DICE_EDGE_RADIUS,
  DICE_EDGE_RADIUS_RATIO,
  DICE_EDGE_SEGMENTS,
  DICE_FACE_COLOR,
  DICE_FACE_METALNESS,
  DICE_FACE_ROUGHNESS,
  DICE_FACE_SIZE,
  DICE_PIP_CENTER_OFFSET,
  DICE_PIP_DEPTH_TEST,
  DICE_PIP_DEPTH,
  DICE_PIP_POLYGON_OFFSET_ENABLED,
  DICE_PIP_POLYGON_OFFSET_FACTOR,
  DICE_PIP_POLYGON_OFFSET_UNITS,
  DICE_PIP_SEGMENTS,
  DICE_PIP_RADIUS,
  DICE_PIP_SURFACE_OFFSET,
  DICE_RESULT_FONT_SIZE,
  DICE_SURFACE_EPSILON,
} from './diceVisualConfig';
import { DICE_PIP_OFFSET } from './diceVisualConfig';
import { DICE_SIZE } from './diceLayout';
import {
  getDiceFaceSpecs,
  getDicePipCylinderQuaternion,
  getDicePipInstances,
} from './diceGeometry';
import { getSettledDiceRotation } from './diceOrientation';
import { SelectiveRoundedBoxGeometry } from '../board/geometry/SelectiveRoundedBoxGeometry';
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
  const pipGeometry = rounded
    ? new THREE.CylinderGeometry(
      DICE_PIP_RADIUS,
      DICE_PIP_RADIUS,
      DICE_PIP_DEPTH,
      DICE_PIP_SEGMENTS,
      1,
      false,
    )
    : new THREE.SphereGeometry(DICE_PIP_RADIUS, 8, 6);

  for (let dieIndex = 0; dieIndex < 2; dieIndex += 1) {
    const bodyGeometry = rounded
      ? new SelectiveRoundedBoxGeometry(
        DICE_SIZE,
        DICE_SIZE,
        DICE_SIZE,
        DICE_EDGE_SEGMENTS,
        DICE_CORNER_SEGMENTS,
        DICE_EDGE_RADIUS,
      )
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
    expect(DICE_EDGE_SEGMENTS).toBe(5);
    expect(DICE_CORNER_SEGMENTS).toBe(10);
    expect(DICE_FACE_ROUGHNESS).toBeCloseTo(0.18);
    expect(DICE_FACE_METALNESS).toBeCloseTo(0.02);
    expect(boardMaterialSpecs.diceBody).toEqual({ roughness: 0.16, metalness: 0.02 });
  });

  it('increases subdivision only across the eight corner patches', () => {
    const base = new RoundedBoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE, DICE_EDGE_SEGMENTS, DICE_EDGE_RADIUS);
    const selective = new SelectiveRoundedBoxGeometry(
      DICE_SIZE,
      DICE_SIZE,
      DICE_SIZE,
      DICE_EDGE_SEGMENTS,
      DICE_CORNER_SEGMENTS,
      DICE_EDGE_RADIUS,
    );
    const basePositionCount = base.getAttribute('position').count;
    expect(selective.edgeSegments).toBe(DICE_EDGE_SEGMENTS);
    expect(selective.cornerSegments).toBe(DICE_CORNER_SEGMENTS);
    expect(selective.radius).toBeCloseTo(DICE_EDGE_RADIUS);
    const cornerTriangleCount = DICE_CORNER_SEGMENTS * (2 * DICE_CORNER_SEGMENTS - 1);
    expect(selective.getAttribute('position').count).toBe(
      basePositionCount + 8 * cornerTriangleCount * 3,
    );

    const positions = selective.getAttribute('position');
    const normals = selective.getAttribute('normal');
    for (let index = 0; index < positions.count; index += 3) {
      const first = new THREE.Vector3().fromBufferAttribute(positions, index);
      const second = new THREE.Vector3().fromBufferAttribute(positions, index + 1);
      const third = new THREE.Vector3().fromBufferAttribute(positions, index + 2);
      const triangleNormal = new THREE.Vector3()
        .subVectors(second, first)
        .cross(new THREE.Vector3().subVectors(third, first));
      if (triangleNormal.lengthSq() === 0) continue;
      const averageNormal = new THREE.Vector3(
        normals.getX(index) + normals.getX(index + 1) + normals.getX(index + 2),
        normals.getY(index) + normals.getY(index + 1) + normals.getY(index + 2),
        normals.getZ(index) + normals.getZ(index + 1) + normals.getZ(index + 2),
      ).normalize();
      expect(triangleNormal.normalize().dot(averageNormal)).toBeGreaterThan(0.9);
    }
    base.dispose();
    selective.dispose();
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
    expect(DICE_PIP_RADIUS).toBeCloseTo(DICE_SIZE * 0.105);
    const visibleDiameterRatio = (DICE_PIP_RADIUS * 2) / DICE_SIZE;
    expect(visibleDiameterRatio).toBeGreaterThanOrEqual(0.2);
    expect(visibleDiameterRatio).toBeLessThanOrEqual(0.23);
    expect(DICE_PIP_SEGMENTS).toBe(16);
    expect(DICE_PIP_DEPTH).toBeGreaterThan(0);
    expect(DICE_PIP_SURFACE_OFFSET).toBe(0);
    expect(DICE_PIP_SURFACE_OFFSET).toBeLessThan(DICE_SURFACE_EPSILON);
    expect(DICE_PIP_CENTER_OFFSET).toBeLessThan(0);
    expect(pips.every(pip => pip.position.every(Number.isFinite))).toBe(true);

    const faces = getDiceFaceSpecs();
    pips.forEach(pip => {
      const face = faces.find(candidate => candidate.value === pip.faceValue);
      expect(face).toBeDefined();
      const faceNormal = new THREE.Vector3(0, 0, 1)
        .applyEuler(new THREE.Euler(...face!.rotation));
      const offsetFromFace = new THREE.Vector3(...pip.position)
        .sub(new THREE.Vector3(...face!.position))
        .dot(faceNormal);
      expect(offsetFromFace).toBeCloseTo(DICE_PIP_CENTER_OFFSET);
      expect(offsetFromFace + DICE_PIP_DEPTH / 2)
        .toBeCloseTo(DICE_PIP_SURFACE_OFFSET);
      expect(offsetFromFace + DICE_PIP_DEPTH / 2).toBeLessThanOrEqual(1e-8);
      expect(pip.rotation).toEqual(face!.rotation);
    });
  });

  it('keeps the shallow cylinder cap flush while its body stays behind the face', () => {
    const capOffset = DICE_PIP_CENTER_OFFSET + DICE_PIP_DEPTH / 2;
    const backOffset = DICE_PIP_CENTER_OFFSET - DICE_PIP_DEPTH / 2;
    expect(capOffset).toBeCloseTo(DICE_PIP_SURFACE_OFFSET);
    expect(capOffset).toBeLessThanOrEqual(DICE_PIP_SURFACE_OFFSET);
    expect(backOffset).toBeLessThan(capOffset);
  });

  it('uses an explicit negative pip depth bias without disabling depth testing', () => {
    expect(DICE_PIP_DEPTH_TEST).toBe(true);
    expect(DICE_PIP_POLYGON_OFFSET_ENABLED).toBe(true);
    expect(DICE_PIP_POLYGON_OFFSET_FACTOR).toBeLessThan(0);
    expect(DICE_PIP_POLYGON_OFFSET_UNITS).toBeLessThan(0);
  });

  it('aligns the composed cylinder cap normal with every physical face normal', () => {
    const capNormal = new THREE.Vector3(0, 1, 0);
    getDiceFaceSpecs().forEach(face => {
      const faceNormal = new THREE.Vector3(0, 0, 1)
        .applyEuler(new THREE.Euler(...face.rotation));
      const composedCapNormal = capNormal.clone()
        .applyQuaternion(getDicePipCylinderQuaternion(face.rotation));
      expect(composedCapNormal.dot(faceNormal)).toBeCloseTo(1);
    });
  });

  it('raises the settled total through the text component size', () => {
    expect(DICE_RESULT_FONT_SIZE / 0.36).toBeGreaterThanOrEqual(1.15);
    expect(DICE_RESULT_FONT_SIZE / 0.36).toBeLessThanOrEqual(1.2);
  });

  it('reduces settled dice draw calls while remaining inside the existing scene budget', () => {
    const baseline = buildDiceCost({ rounded: false, instancedPips: false });
    const optimized = buildDiceCost({ rounded: true, instancedPips: true });

    expect(baseline).toEqual({ drawCalls: 56, triangles: 3408 });
    expect(optimized.drawCalls).toBe(16);
    expect(optimized.drawCalls).toBeLessThan(TARGET_DRAW_CALLS);
    expect(optimized.drawCalls).toBeLessThan(STRESS_DRAW_CALL_LIMIT);
    expect(optimized.triangles).toBe(8656);
    expect(optimized.triangles).toBeLessThan(TARGET_TRIANGLES);
  });
});
