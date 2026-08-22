import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DevelopmentChangeSignal } from '../../presentation/store/types';
import { presentationTiming } from '../../presentation/timings';
import HouseMesh from './HouseMesh';
import HotelMesh from './HotelMesh';
import { getBuildingSlots, getHotelSlot } from '../board/architecture/tileAnchors';

interface BuildingLayerProps {
  houses: number;
  developmentChange?: DevelopmentChangeSignal;
}

export interface SequentialHouseBuildStep {
  houseIndex: number;
  delayMs: number;
  durationMs: number;
}

export function getSequentialHouseBuildSteps(fromHouses: number, toHouses: number): SequentialHouseBuildStep[] {
  const from = Math.max(0, Math.min(4, fromHouses));
  const to = Math.max(from, Math.min(4, toHouses));
  return Array.from({ length: to - from }, (_, index) => ({
    houseIndex: from + index,
    delayMs: index * presentationTiming.houseStagger,
    durationMs: presentationTiming.housePop,
  }));
}

function BuildingShapes({ houses }: { houses: number }) {
  if (houses === 5) return <HotelMesh position={getHotelSlot()} />;
  return <>{getBuildingSlots(houses).map((position, index) => <HouseMesh key={index} position={position} />)}</>;
}

function ConstructionPuff({ delayMs, durationMs }: { delayMs: number; durationMs: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const elapsedRef = useRef(0);
  const object = useMemo(() => new THREE.Object3D(), []);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, []);
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    elapsedRef.current += delta * 1000;
    const local = elapsedRef.current - delayMs;
    const progress = THREE.MathUtils.clamp(local / Math.max(1, durationMs), 0, 1);
    for (let index = 0; index < 4; index += 1) {
      const angle = index / 4 * Math.PI * 2;
      const distance = progress * 0.22;
      object.position.set(Math.cos(angle) * distance, 0.03 + progress * 0.13, Math.sin(angle) * distance);
      object.scale.setScalar(local >= 0 && progress < 1 ? (1 - progress) * 0.75 : 0);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (local < durationMs) invalidate();
  });
  useEffect(() => { invalidate(); }, [invalidate]);
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 4]}>
      <octahedronGeometry args={[0.055, 0]} />
      <meshStandardMaterial color="#e9dcc0" transparent opacity={0.82} roughness={1} />
    </instancedMesh>
  );
}

function AnimatedHouse({
  position,
  delayMs,
  durationMs,
}: {
  position: readonly [number, number, number];
  delayMs: number;
  durationMs: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { invalidate(); }, [invalidate]);
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    elapsedRef.current += delta * 1000;
    const local = elapsedRef.current - delayMs;
    const progress = THREE.MathUtils.clamp(local / Math.max(1, durationMs), 0, 1);
    const overshoot = progress < 0.72
      ? 1.12 * (progress / 0.72)
      : THREE.MathUtils.lerp(1.12, 1, (progress - 0.72) / 0.28);
    group.scale.setScalar(local < 0 ? 0 : overshoot);
    if (progress < 1) invalidate();
  });
  return (
    <group ref={groupRef} position={position} scale={0}>
      <HouseMesh position={[0, 0, 0]} />
      <ConstructionPuff delayMs={delayMs} durationMs={durationMs} />
    </group>
  );
}

function HotelTransition({ durationMs }: { durationMs: number }) {
  const oldRef = useRef<THREE.Group>(null);
  const hotelRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { invalidate(); }, [invalidate]);
  useFrame((_, delta) => {
    elapsedRef.current += delta * 1000;
    const progress = THREE.MathUtils.clamp(elapsedRef.current / Math.max(1, durationMs), 0, 1);
    oldRef.current?.scale.setScalar(Math.max(0, 1 - progress / 0.38));
    const hotelProgress = THREE.MathUtils.clamp((progress - 0.22) / 0.78, 0, 1);
    const hotelScale = hotelProgress < 0.75
      ? hotelProgress / 0.75 * 1.1
      : THREE.MathUtils.lerp(1.1, 1, (hotelProgress - 0.75) / 0.25);
    hotelRef.current?.scale.setScalar(hotelScale);
    if (progress < 1) invalidate();
  });
  return (
    <group name="HotelTransition">
      <group ref={oldRef}><BuildingShapes houses={4} /></group>
      <group ref={hotelRef} scale={0}><HotelMesh position={getHotelSlot()} /></group>
      <group position={getHotelSlot()}>
        <ConstructionPuff delayMs={Math.round(durationMs * 0.2)} durationMs={Math.round(durationMs * 0.42)} />
      </group>
    </group>
  );
}

export default function BuildingLayer({ houses, developmentChange }: BuildingLayerProps) {
  if (
    !developmentChange
    || developmentChange.durationMs <= 0
    || developmentChange.direction === 'DOWN'
    || developmentChange.toHouses !== houses
  ) return <BuildingShapes houses={houses} />;

  if (developmentChange.fromHouses === 4 && developmentChange.toHouses === 5) {
    return <HotelTransition key={developmentChange.id} durationMs={developmentChange.durationMs} />;
  }
  const from = Math.max(0, Math.min(4, developmentChange.fromHouses));
  const to = Math.max(from, Math.min(4, developmentChange.toHouses));
  const slots = getBuildingSlots(to);
  const buildSteps = getSequentialHouseBuildSteps(from, to);
  return (
    <group name="SequentialHouseBuild">
      {slots.slice(0, from).map((position, index) => <HouseMesh key={`existing-${index}`} position={position} />)}
      {buildSteps.map(step => (
        <AnimatedHouse
          key={`${developmentChange.id}:${step.houseIndex}`}
          position={slots[step.houseIndex]}
          delayMs={step.delayMs}
          durationMs={step.durationMs}
        />
      ))}
    </group>
  );
}
