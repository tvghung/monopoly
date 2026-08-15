import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PLATFORM_HEIGHT } from './boardLayout';
import { boardVisualTokens } from './boardVisualTokens';

const PLAZA_SURFACE_Y = PLATFORM_HEIGHT + 0.08;
const TREE_POSITIONS: readonly (readonly [number, number])[] = [
  [-2.35, -2.35],
  [2.35, -2.35],
  [-2.35, 2.35],
  [2.35, 2.35],
];

export const CENTER_DECORATION_MESH_COUNT = 6;

export default function BoardCenterDecoration() {
  const treesRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const trees = treesRef.current;
    if (!trees) return;
    const dummy = new THREE.Object3D();
    TREE_POSITIONS.forEach(([x, z], index) => {
      dummy.position.set(x, 0.42, z);
      dummy.updateMatrix();
      trees.setMatrixAt(index, dummy.matrix);
    });
    trees.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group position={[0, PLAZA_SURFACE_Y, 0]}>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[7.8, 0.06, 7.8]} />
        <meshBasicMaterial color={boardVisualTokens.plazaBase} />
      </mesh>
      <mesh position={[0, 0.065, 0]}>
        <boxGeometry args={[0.5, 0.025, 7.35]} />
        <meshBasicMaterial color={boardVisualTokens.plazaPath} />
      </mesh>
      <mesh position={[0, 0.066, 0]}>
        <boxGeometry args={[7.35, 0.025, 0.5]} />
        <meshBasicMaterial color={boardVisualTokens.plazaPath} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.78, 0.86, 0.12, 12]} />
        <meshBasicMaterial color={boardVisualTokens.plazaFountain} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.57, 0.57, 0.04, 12]} />
        <meshBasicMaterial color={boardVisualTokens.plazaPath} />
      </mesh>
      <instancedMesh ref={treesRef} args={[undefined, undefined, TREE_POSITIONS.length]}>
        <coneGeometry args={[0.44, 0.76, 6]} />
        <meshBasicMaterial color={boardVisualTokens.plazaTree} />
      </instancedMesh>
    </group>
  );
}
