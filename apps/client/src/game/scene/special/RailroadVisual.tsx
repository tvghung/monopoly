import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CARD_HEIGHT, TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';

interface RailroadVisualProps {
  size: readonly [number, number];
}

function RailroadTrackBatch({ trackWidth }: { trackWidth: number }) {
  const railsRef = useRef<THREE.InstancedMesh>(null);
  const sleepersRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const rails = railsRef.current;
    const sleepers = sleepersRef.current;
    if (!rails || !sleepers) return;
    const dummy = new THREE.Object3D();
    [0.13, 0.33].forEach((z, index) => {
      dummy.position.set(0, 0.02, z);
      dummy.scale.set(trackWidth, 0.035, 0.08);
      dummy.updateMatrix();
      rails.setMatrixAt(index, dummy.matrix);
    });
    Array.from({ length: 5 }, (_, index) => index).forEach(index => {
      dummy.position.set((index - 2) * 0.22, 0.045, 0.23);
      dummy.scale.set(0.06, 0.04, 0.42);
      dummy.updateMatrix();
      sleepers.setMatrixAt(index, dummy.matrix);
    });
    rails.instanceMatrix.needsUpdate = true;
    sleepers.instanceMatrix.needsUpdate = true;
  }, [trackWidth]);

  return (
    <group name="RailroadTrackBatch">
      <instancedMesh ref={railsRef} args={[undefined, undefined, 2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={boardVisualTokens.railroad} roughness={0.3} metalness={0.45} />
      </instancedMesh>
      <instancedMesh ref={sleepersRef} args={[undefined, undefined, 5]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={boardVisualTokens.railroadLight} roughness={0.3} metalness={0.35} />
      </instancedMesh>
    </group>
  );
}

export default function RailroadVisual({ size }: RailroadVisualProps) {
  const trackWidth = Math.min(size[0] * 0.78, 1.1);
  return (
    <group name="RailroadVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]}>
      <RailroadTrackBatch trackWidth={trackWidth} />
      <RoundedBoxMesh width={size[0] * 0.42} height={0.12} depth={size[1] * 0.22} radius={0.035} color={boardVisualTokens.railroadPlatform} materialProfile="boardEdge" position={[0, 0.1, -0.28]} />
      <mesh position={[0, 0.24, -0.28]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.12, 0.025, 8, 16]} />
        <meshStandardMaterial color={boardVisualTokens.railroadLight} roughness={0.3} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.17, -0.28]}>
        <boxGeometry args={[0.08, CARD_HEIGHT, 0.08]} />
        <meshStandardMaterial color={boardVisualTokens.railroadLight} roughness={0.3} metalness={0.35} />
      </mesh>
      <ContactShadow scale={[0.62, 0.38]} opacity={0.16} position={[0, -0.008, -0.08]} />
    </group>
  );
}
