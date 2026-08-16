import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import { AIRPORT_RUNWAY_INNER_HALF_SIZE } from './airportRunwayGeometry';
import {
  CENTER_ORTHOGONAL_PATH_COVERAGE_TARGET,
  CENTER_ORTHOGONAL_PATH_SEGMENTS,
  getCenterPathRotationY,
} from './centerFieldPathLayout';

function CenterOrthogonalPath() {
  const pathRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useEffect(() => {
    const path = pathRef.current;
    if (!path || typeof path.setMatrixAt !== 'function') return;
    const dummy = new THREE.Object3D();
    CENTER_ORTHOGONAL_PATH_SEGMENTS.forEach((segment, index) => {
      dummy.position.set(segment.x, 0.088, segment.z);
      dummy.rotation.set(0, getCenterPathRotationY(segment), 0);
      dummy.scale.set(
        segment.axis === 'x' ? segment.length : segment.width,
        0.012,
        segment.axis === 'x' ? segment.width : segment.length,
      );
      dummy.updateMatrix();
      path.setMatrixAt(index, dummy.matrix);
    });
    if (path.instanceMatrix) path.instanceMatrix.needsUpdate = true;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <instancedMesh
      ref={pathRef}
      args={[undefined, undefined, CENTER_ORTHOGONAL_PATH_SEGMENTS.length]}
      name="CenterOrthogonalPath"
      userData={{
        pattern: 'authored-orthogonal-s',
        deterministic: true,
        segmentCount: CENTER_ORTHOGONAL_PATH_SEGMENTS.length,
        coverageTarget: CENTER_ORTHOGONAL_PATH_COVERAGE_TARGET,
        rotations: [0, Math.PI / 2],
      }}
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial
        color={boardVisualTokens.centerPath}
        roughness={0.92}
        metalness={0}
        transparent
        opacity={0.62}
      />
    </instancedMesh>
  );
}

export default function CenterFieldDecor() {
  return (
    <group
      name="CenterFieldDecor"
      userData={{
        innerGrassHalfSize: AIRPORT_RUNWAY_INNER_HALF_SIZE,
        deterministic: true,
        decoration: 'orthogonal-path-only',
      }}
    >
      <CenterOrthogonalPath />
    </group>
  );
}
