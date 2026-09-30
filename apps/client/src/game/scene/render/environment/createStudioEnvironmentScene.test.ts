import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHT_RIG, directionTo } from '../lighting/lightRigSpec';
import {
  STUDIO_RIM_STRIP_EMISSIVE,
  STUDIO_SOFTBOX_EMISSIVE,
  createStudioEnvironmentScene,
  disposeStudioEnvironmentScene,
} from './createStudioEnvironmentScene';

function find(scene: THREE.Scene, name: string): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const found = scene.getObjectByName(name);
  if (!(found instanceof THREE.Mesh)) throw new Error(`Missing ${name}`);
  return found as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

const basicColor = (mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>) => mesh.material.color;

describe('studio environment scene', () => {
  const scene = createStudioEnvironmentScene();

  it('contains the room, ceiling, floor bounce, softbox and rim strip', () => {
    for (const name of ['StudioRoom', 'StudioCeiling', 'StudioFloorBounce', 'StudioSoftbox', 'StudioRimStrip']) {
      expect(scene.getObjectByName(name)).toBeDefined();
    }
  });

  it('aligns the softbox with the key light and the strip with the rim light', () => {
    const softbox = find(scene, 'StudioSoftbox').position.clone().normalize();
    const key = directionTo(LIGHT_RIG.key.position);
    expect(softbox.dot(new THREE.Vector3(...key))).toBeGreaterThan(0.999);

    const strip = find(scene, 'StudioRimStrip').position.clone().normalize();
    const rim = directionTo(LIGHT_RIG.rim.position);
    expect(strip.dot(new THREE.Vector3(...rim))).toBeGreaterThan(0.999);
  });

  it('faces the light panels toward the middle of the studio', () => {
    for (const name of ['StudioSoftbox', 'StudioRimStrip']) {
      const mesh = find(scene, name);
      mesh.updateMatrixWorld(true);
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
      const towardCenter = mesh.position.clone().negate().normalize();
      expect(normal.dot(towardCenter)).toBeGreaterThan(0.999);
    }
  });

  it('uses HDR emissive values for the lights so glossy materials get real highlights', () => {
    const softbox = basicColor(find(scene, 'StudioSoftbox'));
    expect(Math.max(softbox.r, softbox.g, softbox.b)).toBeGreaterThan(1);
    expect(STUDIO_SOFTBOX_EMISSIVE).toBeGreaterThan(STUDIO_RIM_STRIP_EMISSIVE);
    const strip = basicColor(find(scene, 'StudioRimStrip'));
    expect(strip.b).toBeGreaterThan(strip.r);
  });

  it('bounces warm light from below and keeps the ceiling neutral', () => {
    const floor = basicColor(find(scene, 'StudioFloorBounce'));
    expect(floor.r).toBeGreaterThan(floor.b);
    const ceiling = basicColor(find(scene, 'StudioCeiling'));
    expect(ceiling.r).toBeCloseTo(ceiling.g, 2);
    expect(ceiling.g).toBeCloseTo(ceiling.b, 1);
  });

  it('disposes its owned resources and empties the scene', () => {
    const owned = createStudioEnvironmentScene();
    disposeStudioEnvironmentScene(owned);

    expect(owned.children).toHaveLength(0);
  });
});
