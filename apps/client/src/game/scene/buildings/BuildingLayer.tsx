import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DevelopmentChangeSignal } from '../../presentation/store/types';
import { presentationTiming } from '../../presentation/timings';
import { getSequentialHouseBuildSteps } from '../../presentation/buildingSchedule';
import HouseMesh from './HouseMesh';
import HotelMesh from './HotelMesh';
import ConstructionPuff from './ConstructionPuff';
import LandmarkMesh, { getLandmarkLocalOrigin } from './LandmarkMesh';
import { getLandmarkDefinition } from './landmarks/registry';
import { useHouseRenderMode } from './houseRenderMode';
import { getHotelTransitionScales, getHousePopScale } from './buildingMotion';
import { getScaledConstructionBurstDuration } from './constructionTiming';
import { getBuildingSlots, getHotelSlot } from '../board/architecture/tileAnchors';

interface BuildingLayerProps {
  tileId: number;
  houses: number;
  developmentChange?: DevelopmentChangeSignal;
  ownerColor?: string;
  reducedMotion?: boolean;
}

export { getSequentialHouseBuildSteps } from '../../presentation/buildingSchedule';
export { getHousePopScale, getHotelTransitionScales, type HotelTransitionScales } from './buildingMotion';
export { getScaledConstructionBurstDuration } from './constructionTiming';

/** Where the hotel (or its landmark) stands in the tile-local frame, and where its dust puff goes. */
function getHotelAnchor(tileId: number): readonly [number, number, number] {
  return getLandmarkLocalOrigin(tileId) ?? getHotelSlot();
}

/** The hotel tier: the street's landmark when it has one built, otherwise today's hotel box. */
function Hotel({ tileId, ownerColor }: { tileId: number; ownerColor?: string }) {
  return getLandmarkDefinition(tileId)
    ? <LandmarkMesh tileId={tileId} ownerColor={ownerColor} />
    : <HotelMesh position={getHotelSlot()} ownerColor={ownerColor} />;
}

/**
 * Houses as per-tile groups: only used when the instanced tube houses are off (a failure fell back to the placeholder, plan 05
 * §7.7). While they are on, `TubeHouseInstances` draws every house of the board and this layer draws nothing for 1 to 4 houses.
 */
function LegacyHouses({ houses, ownerColor }: { houses: number; ownerColor?: string }) {
  return <>{getBuildingSlots(houses).map((position, index) => (
    <HouseMesh key={index} position={position} ownerColor={ownerColor} />
  ))}</>;
}

function BuildingShapes({ tileId, houses, ownerColor }: { tileId: number; houses: number; ownerColor?: string }) {
  const mode = useHouseRenderMode();
  if (houses === 5) return <Hotel tileId={tileId} ownerColor={ownerColor} />;
  return mode === 'legacy' ? <LegacyHouses houses={houses} ownerColor={ownerColor} /> : null;
}

function AnimatedLegacyHouse({
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
    group.scale.setScalar(local < 0 ? 0 : getHousePopScale(progress));
    if (progress < 1) invalidate();
  });
  return (
    <group ref={groupRef} position={position} scale={0}>
      <HouseMesh position={[0, 0, 0]} ownerColor={ownerColor} />
      {!reducedMotion
        ? <ConstructionPuff
          delayMs={delayMs}
          durationMs={getScaledConstructionBurstDuration(durationMs, presentationTiming.housePop)}
          ownerColor={ownerColor}
        />
        : null}
    </group>
  );
}

/**
 * The 4 → 5 transition: the hotel (or landmark) pops in with its dust puff. The four old houses shrink away too, either here
 * (legacy houses) or in `TubeHouseInstances` (instanced houses, which plays the same curve).
 */
function HotelTransition({
  tileId,
  durationMs,
  ownerColor,
  reducedMotion,
}: {
  tileId: number;
  durationMs: number;
  ownerColor?: string;
  reducedMotion: boolean;
}) {
  const mode = useHouseRenderMode();
  const oldRef = useRef<THREE.Group>(null);
  const hotelRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { invalidate(); }, [invalidate]);
  useFrame((_, delta) => {
    elapsedRef.current += delta * 1000;
    const progress = THREE.MathUtils.clamp(elapsedRef.current / Math.max(1, durationMs), 0, 1);
    const scales = getHotelTransitionScales(progress);
    oldRef.current?.scale.setScalar(scales.oldScale);
    hotelRef.current?.scale.setScalar(scales.hotelScale);
    if (progress < 1) invalidate();
  });
  const anchor = getHotelAnchor(tileId);
  return (
    <group name="HotelTransition">
      {mode === 'legacy'
        ? <group ref={oldRef}><LegacyHouses houses={4} ownerColor={ownerColor} /></group>
        : null}
      <group ref={hotelRef} scale={0}><Hotel tileId={tileId} ownerColor={ownerColor} /></group>
      {!reducedMotion
        ? (
          <group position={anchor}>
            <ConstructionPuff
              delayMs={Math.round(durationMs * 0.18)}
              durationMs={Math.round(getScaledConstructionBurstDuration(durationMs, presentationTiming.hotelTransition))}
              ownerColor={ownerColor}
              particleCount={11}
              spread={0.44}
              lift={0.3}
            />
          </group>
        )
        : null}
    </group>
  );
}

export default function BuildingLayer({
  tileId,
  houses,
  developmentChange,
  ownerColor,
  reducedMotion = false,
}: BuildingLayerProps) {
  const mode = useHouseRenderMode();
  if (
    reducedMotion
    ||
    !developmentChange
    || developmentChange.durationMs <= 0
    || developmentChange.direction === 'DOWN'
    || developmentChange.toHouses !== houses
  ) return <BuildingShapes tileId={tileId} houses={houses} ownerColor={ownerColor} />;

  if (developmentChange.fromHouses === 4 && developmentChange.toHouses === 5) {
    return (
      <HotelTransition
        key={developmentChange.id}
        tileId={tileId}
        durationMs={developmentChange.durationMs}
        ownerColor={ownerColor}
        reducedMotion={reducedMotion}
      />
    );
  }
  // Instanced houses animate (and puff) in TubeHouseInstances.
  if (mode !== 'legacy') return null;
  const from = Math.max(0, Math.min(4, developmentChange.fromHouses));
  const to = Math.max(from, Math.min(4, developmentChange.toHouses));
  const slots = getBuildingSlots(to);
  const buildSteps = getSequentialHouseBuildSteps(from, to, developmentChange.durationMs);
  return (
    <group name="SequentialHouseBuild">
      {slots.slice(0, from).map((position, index) => (
        <HouseMesh key={`existing-${index}`} position={position} ownerColor={ownerColor} />
      ))}
      {buildSteps.map(step => (
        <AnimatedLegacyHouse
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

