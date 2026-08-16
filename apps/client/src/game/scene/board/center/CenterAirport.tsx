import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CENTER_AIRPORT_SURFACE_Y } from '../architecture/boardArtSpec';
import { INNER_SIDE_BOUNDARY } from '../boardLayout';
import { boardVisualTokens } from '../boardVisualTokens';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';

export const CENTER_DECORATION_MESH_COUNT = 4;
export const CENTER_DECORATION_THEME = 'airport';

const FIELD_SIZE = INNER_SIDE_BOUNDARY * 2 - 0.38;
const RUNWAY_EDGE = FIELD_SIZE / 2 - 0.25;
const RUNWAY_LENGTH = FIELD_SIZE - 0.52;
const RUNWAY_WIDTH = 0.28;
const RUNWAY_MARK_COUNT = 12;

function AirportRunwayStrips() {
  const stripsRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const strips = stripsRef.current;
    if (!strips) return;
    const dummy = new THREE.Object3D();
    [
      [0, -RUNWAY_EDGE, RUNWAY_LENGTH, RUNWAY_WIDTH],
      [0, RUNWAY_EDGE, RUNWAY_LENGTH, RUNWAY_WIDTH],
      [-RUNWAY_EDGE, 0, RUNWAY_WIDTH, RUNWAY_LENGTH],
      [RUNWAY_EDGE, 0, RUNWAY_WIDTH, RUNWAY_LENGTH],
    ].forEach(([x, z, width, depth], index) => {
      dummy.position.set(x, 0.082, z);
      dummy.scale.set(width, 1, depth);
      dummy.updateMatrix();
      strips.setMatrixAt(index, dummy.matrix);
    });
    strips.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={stripsRef} args={[undefined, undefined, 4]} name="AirportRunwayStrips">
      <boxGeometry args={[1, 0.028, 1]} />
      <meshStandardMaterial color={boardVisualTokens.airportRunway} roughness={0.76} metalness={0} />
    </instancedMesh>
  );
}

function AirportRunwayMarkings() {
  const markingsRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const markings = markingsRef.current;
    if (!markings) return;
    const dummy = new THREE.Object3D();
    for (let index = 0; index < RUNWAY_MARK_COUNT; index += 1) {
      const offset = -RUNWAY_LENGTH / 2 + 0.36 + index * ((RUNWAY_LENGTH - 0.72) / (RUNWAY_MARK_COUNT - 1));
      dummy.position.set(offset, 0.101, -RUNWAY_EDGE);
      dummy.scale.set(0.14, 1, 0.045);
      dummy.updateMatrix();
      markings.setMatrixAt(index, dummy.matrix);
      dummy.position.set(offset, 0.101, RUNWAY_EDGE);
      dummy.updateMatrix();
      markings.setMatrixAt(index + RUNWAY_MARK_COUNT, dummy.matrix);
      dummy.position.set(-RUNWAY_EDGE, 0.101, offset);
      dummy.scale.set(0.045, 1, 0.14);
      dummy.updateMatrix();
      markings.setMatrixAt(index + RUNWAY_MARK_COUNT * 2, dummy.matrix);
      dummy.position.set(RUNWAY_EDGE, 0.101, offset);
      dummy.updateMatrix();
      markings.setMatrixAt(index + RUNWAY_MARK_COUNT * 3, dummy.matrix);
    }
    markings.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh
      ref={markingsRef}
      args={[undefined, undefined, RUNWAY_MARK_COUNT * 4]}
      name="AirportRunwayMarkings"
    >
      <boxGeometry args={[1, 0.018, 1]} />
      <meshStandardMaterial color={boardVisualTokens.airportMarking} roughness={0.72} metalness={0} />
    </instancedMesh>
  );
}

export default function CenterAirport() {
  return (
    <group name="CenterAirport" position={[0, CENTER_AIRPORT_SURFACE_Y, 0]}>
      <RoundedBoxMesh
        name="AirportField"
        width={FIELD_SIZE}
        height={0.08}
        depth={FIELD_SIZE}
        radius={0.18}
        color={boardVisualTokens.airportField}
        materialProfile="centerWell"
        position={[0, 0.04, 0]}
      />
      <AirportRunwayStrips />
      <AirportRunwayMarkings />
      <mesh name="AirportCenterMarker" position={[0, 0.102, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.56, 32]} />
        <meshStandardMaterial color={boardVisualTokens.airportCenterMark} roughness={0.7} metalness={0} />
      </mesh>
    </group>
  );
}
