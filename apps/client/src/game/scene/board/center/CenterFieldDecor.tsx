import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import { AIRPORT_RUNWAY_INNER_HALF_SIZE } from './airportRunwayGeometry';
import {
  createCenterPebbleSpecs,
  createCenterTrailSpecs,
} from './centerFieldDecorGenerator';

function CenterPebbles() {
  const specs = useMemo(() => createCenterPebbleSpecs(), []);
  const pebblesRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const circle = new THREE.CircleGeometry(1, 8);
    circle.rotateX(-Math.PI / 2);
    return circle;
  }, []);
  const colors = useMemo(() => [
    new THREE.Color(boardVisualTokens.centerPebble),
    new THREE.Color(boardVisualTokens.centerPebbleWarm),
    new THREE.Color(boardVisualTokens.centerPebbleCool),
  ], []);

  useEffect(() => {
    const pebbles = pebblesRef.current;
    if (!pebbles) return;
    const dummy = new THREE.Object3D();
    specs.forEach((spec, index) => {
      dummy.position.set(spec.position[0], 0.101, spec.position[1]);
      dummy.rotation.set(0, spec.rotation, 0);
      dummy.scale.set(spec.scale[0], 1, spec.scale[1]);
      dummy.updateMatrix();
      pebbles.setMatrixAt(index, dummy.matrix);
      pebbles.setColorAt(index, colors[spec.colorIndex]);
    });
    pebbles.instanceMatrix.needsUpdate = true;
    if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  }, [colors, specs]);

  useEffect(() => () => {
    geometry.dispose();
  }, [geometry]);

  return (
    <instancedMesh
      ref={pebblesRef}
      args={[undefined, undefined, specs.length]}
      name="CenterPebbles"
      userData={{ seed: '0x2f6a91', coverageTarget: 0.03, count: specs.length }}
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={boardVisualTokens.centerPebble} roughness={0.88} metalness={0} />
    </instancedMesh>
  );
}

function CenterTrails() {
  const specs = useMemo(() => createCenterTrailSpecs(), []);
  const trailsRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useEffect(() => {
    const trails = trailsRef.current;
    if (!trails) return;
    const dummy = new THREE.Object3D();
    specs.forEach((spec, index) => {
      dummy.position.set(spec.position[0], 0.088, spec.position[1]);
      dummy.rotation.set(0, spec.rotation, 0);
      dummy.scale.set(spec.length, 0.012, spec.width);
      dummy.updateMatrix();
      trails.setMatrixAt(index, dummy.matrix);
    });
    trails.instanceMatrix.needsUpdate = true;
  }, [specs]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <instancedMesh
      ref={trailsRef}
      args={[undefined, undefined, specs.length]}
      name="CenterWornPaths"
      userData={{ coverageTarget: 0.05, count: specs.length }}
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={boardVisualTokens.centerPath} roughness={0.92} metalness={0} transparent opacity={0.62} />
    </instancedMesh>
  );
}

export default function CenterFieldDecor() {
  return (
    <group
      name="CenterFieldDecor"
      userData={{ innerGrassHalfSize: AIRPORT_RUNWAY_INNER_HALF_SIZE, deterministic: true }}
    >
      <CenterTrails />
      <CenterPebbles />
    </group>
  );
}
