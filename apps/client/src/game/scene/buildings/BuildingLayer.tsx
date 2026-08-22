import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import type { DevelopmentChangeSignal } from '../../presentation/store/types';
import HouseMesh from './HouseMesh';
import HotelMesh from './HotelMesh';
import { getBuildingSlots, getHotelSlot } from '../board/architecture/tileAnchors';

interface BuildingLayerProps {
  houses: number;
  developmentChange?: DevelopmentChangeSignal;
}

export function getBuildingPulseScale(
  progress: number,
  direction: DevelopmentChangeSignal['direction'],
): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const pulse = Math.sin(clamped * Math.PI);
  return direction === 'UP'
    ? 1 + pulse * 0.12
    : 1 - pulse * 0.12;
}

function BuildingShapes({ houses }: { houses: number }) {
  if (houses === 5) {
    return (
      <>
        <HotelMesh position={getHotelSlot()} />
      </>
    );
  }
  const slots = getBuildingSlots(houses);
  return (
    <>
      {slots.map((position, index) => <HouseMesh key={index} position={position} />)}
    </>
  );
}

function BuildingPop({
  houses,
  direction,
  durationMs,
}: {
  houses: number;
  direction: DevelopmentChangeSignal['direction'];
  durationMs: number;
}) {
  const invalidate = useThree(state => state.invalidate);
  const groupRef = useRef<Group>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const group = groupRef.current;
    invalidate();
    return () => {
      group?.scale.set(1, 1, 1);
    };
  }, [invalidate]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const startedAt = startedAtRef.current ?? clock.elapsedTime * 1000;
    startedAtRef.current = startedAt;
    const progress = Math.min(1, (clock.elapsedTime * 1000 - startedAt) / Math.max(1, durationMs));
    group.scale.setScalar(getBuildingPulseScale(progress, direction));
    if (progress < 1) invalidate();
  });

  return (
    <group ref={groupRef} name="BuildingFeedbackPop">
      <BuildingShapes houses={houses} />
    </group>
  );
}

export default function BuildingLayer({ houses, developmentChange }: BuildingLayerProps) {
  const [activeChange, setActiveChange] = useState<DevelopmentChangeSignal | null>(null);

  useEffect(() => {
    if (!developmentChange || developmentChange.durationMs <= 0) {
      setActiveChange(null);
      return undefined;
    }
    setActiveChange(developmentChange);
    const timeout = window.setTimeout(() => {
      setActiveChange(current => current?.id === developmentChange.id ? null : current);
    }, developmentChange.durationMs);
    return () => window.clearTimeout(timeout);
  }, [developmentChange]);

  return activeChange
    ? (
      <BuildingPop
        houses={houses}
        direction={activeChange.direction}
        durationMs={activeChange.durationMs}
      />
    )
    : <BuildingShapes houses={houses} />;
}
