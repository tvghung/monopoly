import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import ContactShadow from '../../fx/ContactShadow';

const TREE_POSITIONS: readonly (readonly [number, number])[] = [
  [-2.35, -2.35],
  [2.35, -2.35],
  [-2.35, 2.35],
  [2.35, 2.35],
];

export default function ParkTrees() {
  const trunksRef = useRef<THREE.InstancedMesh>(null);
  const crownsRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const trunks = trunksRef.current;
    const crowns = crownsRef.current;
    if (!trunks || !crowns) return;
    const dummy = new THREE.Object3D();
    TREE_POSITIONS.forEach(([x, z], index) => {
      dummy.position.set(x, 0.27, z);
      dummy.scale.set(1, 1.2, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
      dummy.position.set(x, 0.78, z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      crowns.setMatrixAt(index, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group name="ParkTrees">
      <instancedMesh ref={trunksRef} args={[undefined, undefined, TREE_POSITIONS.length]}>
        <cylinderGeometry args={[0.1, 0.13, 0.46, 12]} />
        <meshStandardMaterial color={boardVisualTokens.plazaTreeTrunk} roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={crownsRef} args={[undefined, undefined, TREE_POSITIONS.length]}>
        <sphereGeometry args={[0.48, 16, 10]} />
        <meshStandardMaterial color={boardVisualTokens.plazaTree} roughness={0.76} />
      </instancedMesh>
      {TREE_POSITIONS.map(([x, z]) => (
        <ContactShadow key={`${x}:${z}`} position={[x, 0, z]} scale={[0.95, 0.68]} opacity={0.18} />
      ))}
    </group>
  );
}
