import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import {
  AIRPORT_RUNWAY_SURFACE_Y,
  createAirportRunwayLoopGeometry,
} from './airportRunwayGeometry';

export default function AirportRunwayLoop() {
  const geometry = useMemo(() => createAirportRunwayLoopGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      name="AirportRunwayLoop"
      geometry={geometry}
      position={[0, AIRPORT_RUNWAY_SURFACE_Y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshStandardMaterial
        color={boardVisualTokens.airportRunway}
        roughness={0.84}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
