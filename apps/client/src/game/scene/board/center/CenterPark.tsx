import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CENTER_PARK_SURFACE_Y } from '../architecture/boardArtSpec';
import { boardVisualTokens } from '../boardVisualTokens';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';
import ParkFountain from './ParkFountain';
import ParkFurniture from './ParkFurniture';
import ParkTrees from './ParkTrees';

export const CENTER_DECORATION_MESH_COUNT = 6;

const PAVER_LINE_OFFSETS = [-2.9, -1.45, 0, 1.45, 2.9] as const;

function ParkGroundPaverLines() {
  const linesRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const lines = linesRef.current;
    if (!lines) return;
    const dummy = new THREE.Object3D();
    PAVER_LINE_OFFSETS.forEach((offset, index) => {
      dummy.position.set(0, 0.083, offset);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(6.7, 0.008, 0.022);
      dummy.updateMatrix();
      lines.setMatrixAt(index, dummy.matrix);

      dummy.position.set(offset, 0.084, 0);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix();
      lines.setMatrixAt(index + PAVER_LINE_OFFSETS.length, dummy.matrix);
    });
    lines.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh
      ref={linesRef}
      args={[undefined, undefined, PAVER_LINE_OFFSETS.length * 2]}
      name="ParkGroundPaverLines"
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={boardVisualTokens.plazaGroundDetail} roughness={0.94} metalness={0} />
    </instancedMesh>
  );
}

export default function CenterPark() {
  return (
    <group name="CenterPark" position={[0, CENTER_PARK_SURFACE_Y, 0]}>
      <RoundedBoxMesh
        name="ParkGroundPlatform"
        width={7.8}
        height={0.08}
        depth={7.8}
        radius={0.16}
        color={boardVisualTokens.plazaBase}
        materialProfile="parkGround"
        position={[0, 0.04, 0]}
      />
      <ParkGroundPaverLines />
      <RoundedBoxMesh
        name="ParkVerticalPath"
        width={0.56}
        height={0.035}
        depth={7.25}
        radius={0.03}
        color={boardVisualTokens.plazaPath}
        materialProfile="parkPath"
        position={[0, 0.1, 0]}
      />
      <RoundedBoxMesh
        name="ParkHorizontalPath"
        width={7.25}
        height={0.035}
        depth={0.56}
        radius={0.03}
        color={boardVisualTokens.plazaPath}
        materialProfile="parkPath"
        position={[0, 0.102, 0]}
      />
      <ParkFountain />
      <ParkTrees />
      <ParkFurniture />
    </group>
  );
}
