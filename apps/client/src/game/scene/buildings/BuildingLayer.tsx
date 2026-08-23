import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DevelopmentChangeSignal } from '../../presentation/store/types';
import { presentationTiming } from '../../presentation/timings';
import HouseMesh from './HouseMesh';
import HotelMesh from './HotelMesh';
import { getBuildingSlots, getHotelSlot } from '../board/architecture/tileAnchors';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';

interface BuildingLayerProps {
  houses: number;
  developmentChange?: DevelopmentChangeSignal;
  ownerColor?: string;
  reducedMotion?: boolean;
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

function BuildingShapes({ houses, ownerColor }: { houses: number; ownerColor?: string }) {
  if (houses === 5) return <HotelMesh position={getHotelSlot()} ownerColor={ownerColor} />;
  return <>{getBuildingSlots(houses).map((position, index) => (
    <HouseMesh key={index} position={position} ownerColor={ownerColor} />
  ))}</>;
}

function ConstructionPuff({
  delayMs,
  durationMs,
  ownerColor,
  particleCount = 9,
  spread = 0.26,
  lift = 0.16,
}: {
  delayMs: number;
  durationMs: number;
  ownerColor?: string;
  particleCount?: number;
  spread?: number;
  lift?: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const elapsedRef = useRef(0);
  const objectRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const invalidate = useThree(state => state.invalidate);
  const ownerDisplayColor = useMemo(() => new THREE.Color(getPlayerDisplayColor(ownerColor)), [ownerColor]);
  const dustColor = useMemo(() => new THREE.Color('#e8d8bb'), []);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < particleCount; index += 1) {
      mesh.setColorAt(index, index % 3 === 0 ? ownerDisplayColor : dustColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dustColor, ownerDisplayColor, particleCount]);
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const object = objectRef.current;
    elapsedRef.current += delta * 1000;
    const local = elapsedRef.current - delayMs;
    const progress = THREE.MathUtils.clamp(local / Math.max(1, durationMs), 0, 1);
    for (let index = 0; index < particleCount; index += 1) {
      const angle = index / particleCount * Math.PI * 2;
      const distance = progress * spread;
      object.position.set(Math.cos(angle) * distance, 0.03 + progress * lift, Math.sin(angle) * distance);
      object.scale.setScalar(local >= 0 && progress < 1 ? (1 - progress) * 0.85 : 0);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (local < durationMs) invalidate();
  });
  useEffect(() => { invalidate(); }, [invalidate]);
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]}>
      <octahedronGeometry args={[0.06, 0]} />
      <meshStandardMaterial vertexColors color="#ffffff" transparent opacity={0.86} roughness={0.94} />
    </instancedMesh>
  );
}

function AnimatedHouse({
  position,
  delayMs,
  durationMs,
  ownerColor,
  reducedMotion,
}: {
  position: readonly [number, number, number];
  delayMs: number;
  durationMs: number;
  ownerColor?: string;
  reducedMotion: boolean;
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
      <HouseMesh position={[0, 0, 0]} ownerColor={ownerColor} />
      {!reducedMotion
        ? <ConstructionPuff delayMs={delayMs} durationMs={durationMs} ownerColor={ownerColor} />
        : null}
    </group>
  );
}

function HotelTransition({
  durationMs,
  ownerColor,
  reducedMotion,
}: {
  durationMs: number;
  ownerColor?: string;
  reducedMotion: boolean;
}) {
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
      <group ref={oldRef}><BuildingShapes houses={4} ownerColor={ownerColor} /></group>
      <group ref={hotelRef} scale={0}><HotelMesh position={getHotelSlot()} ownerColor={ownerColor} /></group>
      {!reducedMotion
        ? (
          <group position={getHotelSlot()}>
            <ConstructionPuff
              delayMs={Math.round(durationMs * 0.2)}
              durationMs={Math.round(durationMs * 0.42)}
              ownerColor={ownerColor}
              particleCount={10}
              spread={0.38}
              lift={0.24}
            />
          </group>
        )
        : null}
    </group>
  );
}

export default function BuildingLayer({
  houses,
  developmentChange,
  ownerColor,
  reducedMotion = false,
}: BuildingLayerProps) {
  if (
    reducedMotion
    ||
    !developmentChange
    || developmentChange.durationMs <= 0
    || developmentChange.direction === 'DOWN'
    || developmentChange.toHouses !== houses
  ) return <BuildingShapes houses={houses} ownerColor={ownerColor} />;

  if (developmentChange.fromHouses === 4 && developmentChange.toHouses === 5) {
    return (
      <HotelTransition
        key={developmentChange.id}
        durationMs={developmentChange.durationMs}
        ownerColor={ownerColor}
        reducedMotion={reducedMotion}
      />
    );
  }
  const from = Math.max(0, Math.min(4, developmentChange.fromHouses));
  const to = Math.max(from, Math.min(4, developmentChange.toHouses));
  const slots = getBuildingSlots(to);
  const buildSteps = getSequentialHouseBuildSteps(from, to);
  return (
    <group name="SequentialHouseBuild">
      {slots.slice(0, from).map((position, index) => (
        <HouseMesh key={`existing-${index}`} position={position} ownerColor={ownerColor} />
      ))}
      {buildSteps.map(step => (
        <AnimatedHouse
          key={`${developmentChange.id}:${step.houseIndex}`}
          position={slots[step.houseIndex]}
          delayMs={step.delayMs}
          durationMs={step.durationMs}
          ownerColor={ownerColor}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}
