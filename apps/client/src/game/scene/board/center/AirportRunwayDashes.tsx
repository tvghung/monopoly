import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import { getAirportRunwayDashSpecs } from './airportRunwayGeometry';

export const AIRPORT_RUNWAY_DASH_SPECS = getAirportRunwayDashSpecs();

export default function AirportRunwayDashes() {
  const dashesRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const dashes = dashesRef.current;
    if (!dashes || typeof dashes.setMatrixAt !== 'function') return;
    const dummy = new THREE.Object3D();
    AIRPORT_RUNWAY_DASH_SPECS.forEach((spec, index) => {
      dummy.position.set(...spec.position);
      dummy.scale.set(spec.size[0], 0.018, spec.size[1]);
      dummy.updateMatrix();
      dashes.setMatrixAt(index, dummy.matrix);
    });
    dashes.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh
      ref={dashesRef}
      args={[undefined, undefined, AIRPORT_RUNWAY_DASH_SPECS.length]}
      name="AirportRunwayDashes"
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={boardVisualTokens.airportMarking}
        roughness={0.8}
        metalness={0}
      />
    </instancedMesh>
  );
}
