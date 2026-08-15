import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HARD_TRIANGLE_LIMIT,
  STRESS_DRAW_CALL_LIMIT,
  TARGET_DRAW_CALLS,
  estimateSceneTriangles,
  getTileTextureAnisotropy,
} from './sceneBudget';

describe('commercial scene budget helpers', () => {
  it('caps anisotropy to the declared tile-texture budget', () => {
    expect(getTileTextureAnisotropy(Number.NaN)).toBe(1);
    expect(getTileTextureAnisotropy(2)).toBe(2);
    expect(getTileTextureAnisotropy(16)).toBe(8);
  });

  it('counts indexed and instanced geometry without returning NaN', () => {
    const root = new THREE.Group();
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial();
    root.add(new THREE.Mesh(boxGeometry));
    root.add(new THREE.InstancedMesh(
      planeGeometry,
      material,
      4,
    ));

    expect(estimateSceneTriangles(root)).toBe(20);
    expect(TARGET_DRAW_CALLS).toBe(210);
    expect(STRESS_DRAW_CALL_LIMIT).toBe(240);
    expect(HARD_TRIANGLE_LIMIT).toBe(100_000);

    boxGeometry.dispose();
    planeGeometry.dispose();
    material.dispose();
  });
});
