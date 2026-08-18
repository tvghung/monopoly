import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import ContactShadow from '../../fx/ContactShadow';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';

const BENCH_POSITIONS: readonly (readonly [number, number, number])[] = [
  [-1.55, 0.16, 0],
  [1.55, 0.16, 0],
];
const LAMP_POSITIONS: readonly (readonly [number, number])[] = [
  [-1.25, -1.35],
  [1.25, -1.35],
  [-1.25, 1.35],
  [1.25, 1.35],
];

export default function ParkFurniture() {
  const benchRef = useRef<THREE.InstancedMesh>(null);
  const lampRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const bench = benchRef.current;
    const lamp = lampRef.current;
    if (!bench || !lamp) return;
    const dummy = new THREE.Object3D();
    BENCH_POSITIONS.forEach(([x, y, z], index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.y = index === 0 ? Math.PI / 2 : -Math.PI / 2;
      dummy.updateMatrix();
      bench.setMatrixAt(index, dummy.matrix);
    });
    LAMP_POSITIONS.forEach(([x, z], index) => {
      dummy.position.set(x, 0.48, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      lamp.setMatrixAt(index, dummy.matrix);
    });
    bench.instanceMatrix.needsUpdate = true;
    lamp.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group name="ParkFurniture">
      <instancedMesh ref={benchRef} args={[undefined, undefined, BENCH_POSITIONS.length]}>
        <boxGeometry args={[0.8, 0.12, 0.18]} />
        <meshStandardMaterial color={boardVisualTokens.plazaBench} roughness={0.58} />
      </instancedMesh>
      <instancedMesh ref={lampRef} args={[undefined, undefined, LAMP_POSITIONS.length]}>
        <cylinderGeometry args={[0.035, 0.05, 0.82, 10]} />
        <meshStandardMaterial color={boardVisualTokens.plazaLamp} roughness={0.28} metalness={0.45} />
      </instancedMesh>
      <group name="FlowerBeds">
        <RoundedBoxMesh width={0.7} height={0.05} depth={0.34} radius={0.06} color={boardVisualTokens.plazaFlowerBed} materialProfile="parkPath" position={[-1.62, 0.035, -1.05]} />
        <RoundedBoxMesh width={0.7} height={0.05} depth={0.34} radius={0.06} color={boardVisualTokens.plazaFlowerBed} materialProfile="parkPath" position={[1.62, 0.035, 1.05]} />
      </group>
      {BENCH_POSITIONS.map(([x, , z]) => (
        <ContactShadow key={`${x}:${z}`} position={[x, 0, z]} scale={[0.9, 0.28]} opacity={0.16} />
      ))}
    </group>
  );
}
