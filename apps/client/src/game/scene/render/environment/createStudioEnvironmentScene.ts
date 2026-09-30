import * as THREE from 'three';
import { OTB_PALETTE } from '../../../../design-system/tokens/palette';
import { LIGHT_RIG, directionTo } from '../lighting/lightRigSpec';

/**
 * Procedural product-photo studio used as image-based lighting (plan 02 §8.4). Unlike a file-based HDR it
 * needs no asset, no loader and no CSP change. It is a small emissive room, captured once into a PMREM
 * cube: a large warm softbox aligned with the key light, a thin cool strip aligned with the rim light, a
 * warm floor bounce (the light oak table) and a neutral gray ceiling and walls.
 */
export const STUDIO_LIGHT_DISTANCE = 24;
export const STUDIO_SOFTBOX_EMISSIVE = 7;
export const STUDIO_RIM_STRIP_EMISSIVE = 5;

const plane = new THREE.PlaneGeometry(1, 1);

function emissive(hex: string, strength: number): THREE.MeshBasicMaterial {
  // Values above 1 are what make the PMREM contain real highlights for glossy materials to reflect.
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex).multiplyScalar(strength),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function panel(
  name: string,
  material: THREE.MeshBasicMaterial,
  size: readonly [number, number],
  position: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(plane, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(size[0], size[1], 1);
  mesh.lookAt(0, 0, 0);
  return mesh;
}

export function createStudioEnvironmentScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = 'StudioEnvironment';

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(60, 40, 60),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a5754'), side: THREE.BackSide, toneMapped: false }),
  );
  room.name = 'StudioRoom';
  room.position.y = 6;
  scene.add(room);

  scene.add(panel('StudioCeiling', emissive('#a0a0a0', 1), [40, 40], [0, 19, 0]));
  scene.add(panel('StudioFloorBounce', emissive(OTB_PALETTE['table-oak'], 0.6), [46, 46], [0, -12, 0]));

  const keyDirection = directionTo(LIGHT_RIG.key.position);
  scene.add(panel(
    'StudioSoftbox',
    emissive(LIGHT_RIG.key.color, STUDIO_SOFTBOX_EMISSIVE),
    [16, 11],
    keyDirection.map(component => component * STUDIO_LIGHT_DISTANCE) as unknown as readonly [number, number, number],
  ));

  const rimDirection = directionTo(LIGHT_RIG.rim.position);
  scene.add(panel(
    'StudioRimStrip',
    emissive(LIGHT_RIG.rim.color, STUDIO_RIM_STRIP_EMISSIVE),
    [2.5, 14],
    rimDirection.map(component => component * STUDIO_LIGHT_DISTANCE) as unknown as readonly [number, number, number],
  ));

  return scene;
}

export function disposeStudioEnvironmentScene(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse(object => {
    if (!('isMesh' in object)) return;
    const mesh = object as unknown as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    geometries.add(mesh.geometry);
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
  });
  // The shared unit plane lives for the whole session; only the room box and the materials are owned.
  geometries.forEach(geometry => {
    if (geometry !== plane) geometry.dispose();
  });
  materials.forEach(material => material.dispose());
  scene.clear();
}
