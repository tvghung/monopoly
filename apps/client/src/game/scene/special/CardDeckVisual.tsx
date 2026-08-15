import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { boardVisualTokens } from '../board/boardVisualTokens';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';

interface CardDeckVisualProps {
  size: readonly [number, number];
  kind: 'chance' | 'chest';
}

function ChanceSpinnerSpokes() {
  const spokesRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const spokes = spokesRef.current;
    if (!spokes) return;
    const dummy = new THREE.Object3D();
    Array.from({ length: 8 }, (_, index) => index).forEach((index) => {
      const angle = index * Math.PI / 4;
      dummy.position.set(Math.cos(angle) * 0.14, 0.145, Math.sin(angle) * 0.14);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(0.16, 0.018, 0.042);
      dummy.updateMatrix();
      spokes.setMatrixAt(index, dummy.matrix);
    });
    spokes.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={spokesRef} args={[undefined, undefined, 8]} name="ChanceSpinnerSpokes">
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={boardVisualTokens.chance} roughness={0.42} metalness={0.02} />
    </instancedMesh>
  );
}

function ChanceSpinnerVisual({ size }: Pick<CardDeckVisualProps, 'size'>) {
  const radius = Math.min(size[0] * 0.25, 0.34);
  return (
    <group name="ChanceSpinnerVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]}>
      <mesh position={[0, 0.055, 0]}>
        <cylinderGeometry args={[radius + 0.04, radius + 0.06, 0.1, 24]} />
        <meshStandardMaterial color={boardVisualTokens.chanceDark} roughness={0.62} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[radius, radius, 0.045, 24]} />
        <meshStandardMaterial color={boardVisualTokens.chanceFace} roughness={0.52} metalness={0.01} />
      </mesh>
      <ChanceSpinnerSpokes />
      <mesh position={[0, 0.175, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.8, 0.025, 8, 24]} />
        <meshStandardMaterial color={boardVisualTokens.chanceDark} roughness={0.42} metalness={0.06} />
      </mesh>
      <RoundedBoxMesh
        name="ChanceSpinnerNeedle"
        width={radius * 1.25}
        height={0.045}
        depth={0.055}
        radius={0.018}
        color={boardVisualTokens.chanceDark}
        materialProfile="propertyTrim"
        position={[0, 0.195, 0]}
        rotation={[0, Math.PI / 6, 0]}
      />
      <mesh position={[0, 0.225, 0]}>
        <cylinderGeometry args={[0.065, 0.075, 0.07, 16]} />
        <meshStandardMaterial color={boardVisualTokens.chanceDark} roughness={0.34} metalness={0.12} />
      </mesh>
      <ContactShadow scale={[0.68, 0.48]} opacity={0.18} position={[0, -0.008, 0]} />
    </group>
  );
}

function ChestContainerVisual({ size }: Pick<CardDeckVisualProps, 'size'>) {
  const width = Math.min(size[0] * 0.52, 0.68);
  const depth = Math.min(size[1] * 0.28, 0.5);
  return (
    <group name="ChestContainerVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]} rotation={[0, Math.PI / 12, 0]}>
      <RoundedBoxMesh
        name="ChestBody"
        width={width}
        height={0.22}
        depth={depth}
        radius={0.045}
        color={boardVisualTokens.chestBody}
        materialProfile="tileChassis"
        position={[0, 0.12, 0]}
      />
      <RoundedBoxMesh
        name="ChestLid"
        width={width + 0.04}
        height={0.11}
        depth={depth + 0.035}
        radius={0.055}
        color={boardVisualTokens.chestLid}
        materialProfile="propertyTrim"
        position={[0, 0.285, 0]}
      />
      <RoundedBoxMesh
        name="ChestBand"
        width={0.075}
        height={0.31}
        depth={depth + 0.045}
        radius={0.02}
        color={boardVisualTokens.chestBand}
        materialProfile="propertyTrim"
        position={[0, 0.185, 0]}
      />
      <RoundedBoxMesh
        name="ChestLatch"
        width={0.13}
        height={0.13}
        depth={0.055}
        radius={0.02}
        color={boardVisualTokens.chestLatch}
        materialProfile="propertyTrim"
        position={[0, 0.19, -depth / 2 - 0.025]}
      />
      <mesh position={[0, 0.405, 0]}>
        <torusGeometry args={[0.13, 0.024, 8, 18, Math.PI]} />
        <meshStandardMaterial color={boardVisualTokens.chestBand} roughness={0.34} metalness={0.18} />
      </mesh>
      <ContactShadow scale={[0.7, 0.46]} opacity={0.18} position={[0, -0.008, 0]} />
    </group>
  );
}

export default function CardDeckVisual({ size, kind }: CardDeckVisualProps) {
  return kind === 'chance'
    ? <ChanceSpinnerVisual size={size} />
    : <ChestContainerVisual size={size} />;
}
