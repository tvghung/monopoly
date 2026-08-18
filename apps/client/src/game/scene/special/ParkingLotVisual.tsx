import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

interface ParkingLotVisualProps {
  panel: TilePanelLayout;
}

export const PARKING_ART_WIDTH_RATIO = 0.78;
export const PARKING_STALL_COUNT = 6;
export const PARKING_CAR_COUNT = 4;

const PARKING_CAR_SPECS = [
  { position: [-0.25, -0.22] as const, rotation: 0.02, color: boardVisualTokens.parkingCarCyan },
  { position: [0.25, -0.22] as const, rotation: -0.025, color: boardVisualTokens.parkingCarOrange },
  { position: [-0.25, 0.22] as const, rotation: Math.PI + 0.02, color: boardVisualTokens.parkingCarCream },
  { position: [0.25, 0.22] as const, rotation: Math.PI - 0.025, color: boardVisualTokens.parkingCarGreen },
] as const;

function ParkingLaneMarkings({ width, depth }: { width: number; depth: number }) {
  const marksRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const specs = useMemo(() => [
    [-width * 0.25, -depth * 0.24, width * 0.035, depth * 0.32],
    [width * 0.25, -depth * 0.24, width * 0.035, depth * 0.32],
    [-width * 0.25, depth * 0.24, width * 0.035, depth * 0.32],
    [width * 0.25, depth * 0.24, width * 0.035, depth * 0.32],
    [0, -depth * 0.24, width * 0.035, depth * 0.32],
    [0, depth * 0.24, width * 0.035, depth * 0.32],
  ] as const, [depth, width]);

  useEffect(() => {
    const marks = marksRef.current;
    if (!marks || typeof marks.setMatrixAt !== 'function') return;
    const dummy = new THREE.Object3D();
    specs.forEach(([x, z, markWidth, markDepth], index) => {
      dummy.position.set(x, 0.048, z);
      dummy.scale.set(markWidth, 0.012, markDepth);
      dummy.updateMatrix();
      marks.setMatrixAt(index, dummy.matrix);
    });
    marks.instanceMatrix.needsUpdate = true;
  }, [specs]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <instancedMesh ref={marksRef} args={[undefined, undefined, specs.length]} name="ParkingStallMarkings">
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={boardVisualTokens.parkingLane} roughness={0.72} metalness={0} />
    </instancedMesh>
  );
}

function ParkingCars({ width, depth }: { width: number; depth: number }) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);
  const windowRef = useRef<THREE.InstancedMesh>(null);
  const wheelRef = useRef<THREE.InstancedMesh>(null);
  const bodyGeometry = useMemo(() => new THREE.BoxGeometry(0.38, 0.075, 0.2), []);
  const cabinGeometry = useMemo(() => new THREE.BoxGeometry(0.22, 0.065, 0.15), []);
  const windowGeometry = useMemo(() => new THREE.BoxGeometry(0.16, 0.012, 0.11), []);
  const wheelGeometry = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(0.042, 0.042, 0.026, 10);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }, []);

  const positions = useMemo(
    () => PARKING_CAR_SPECS.map(spec => [
      spec.position[0] * width,
      spec.position[1] * depth,
      spec.rotation,
    ] as const),
    [depth, width],
  );

  useEffect(() => {
    const body = bodyRef.current;
    const cabin = cabinRef.current;
    const windows = windowRef.current;
    const wheels = wheelRef.current;
    if (
      !body || !cabin || !windows || !wheels
      || typeof body.setMatrixAt !== 'function'
      || typeof cabin.setMatrixAt !== 'function'
      || typeof windows.setMatrixAt !== 'function'
      || typeof wheels.setMatrixAt !== 'function'
    ) return;

    const dummy = new THREE.Object3D();
    positions.forEach(([x, z, rotation], index) => {
      dummy.position.set(x, 0.085, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      body.setMatrixAt(index, dummy.matrix);

      dummy.position.y = 0.145;
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      cabin.setMatrixAt(index, dummy.matrix);

      dummy.position.y = 0.185;
      dummy.updateMatrix();
      windows.setMatrixAt(index, dummy.matrix);
    });
    body.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    windows.instanceMatrix.needsUpdate = true;

    positions.forEach(([x, z, rotation], index) => {
      const wheelPair = [
        [-0.12, -0.11],
        [0.12, -0.11],
        [-0.12, 0.11],
        [0.12, 0.11],
      ] as const;
      wheelPair.forEach(([localX, localZ], wheelIndex) => {
        const rotatedX = localX * Math.cos(rotation) - localZ * Math.sin(rotation);
        const rotatedZ = localX * Math.sin(rotation) + localZ * Math.cos(rotation);
        dummy.position.set(x + rotatedX, 0.06, z + rotatedZ);
        dummy.rotation.set(0, rotation, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        wheels.setMatrixAt(index * wheelPair.length + wheelIndex, dummy.matrix);
      });
    });
    wheels.instanceMatrix.needsUpdate = true;

    PARKING_CAR_SPECS.forEach((spec, index) => body.setColorAt(index, new THREE.Color(spec.color)));
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  }, [positions]);

  useEffect(() => () => {
    bodyGeometry.dispose();
    cabinGeometry.dispose();
    windowGeometry.dispose();
    wheelGeometry.dispose();
  }, [bodyGeometry, cabinGeometry, wheelGeometry, windowGeometry]);

  return (
    <group name="ParkingCars" userData={{ deterministic: true, count: PARKING_CAR_COUNT }}>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, PARKING_CAR_COUNT]} name="ParkingCarBodies">
        <primitive object={bodyGeometry} attach="geometry" />
        <meshStandardMaterial color={boardVisualTokens.parkingCar} roughness={0.42} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={cabinRef} args={[undefined, undefined, PARKING_CAR_COUNT]} name="ParkingCarCabins">
        <primitive object={cabinGeometry} attach="geometry" />
        <meshStandardMaterial color={boardVisualTokens.parkingCar} roughness={0.4} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={windowRef} args={[undefined, undefined, PARKING_CAR_COUNT]} name="ParkingCarWindows">
        <primitive object={windowGeometry} attach="geometry" />
        <meshStandardMaterial color={boardVisualTokens.parkingGlass} roughness={0.3} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={wheelRef} args={[undefined, undefined, PARKING_CAR_COUNT * 4]} name="ParkingCarWheels">
        <primitive object={wheelGeometry} attach="geometry" />
        <meshStandardMaterial color={boardVisualTokens.tileText} roughness={0.54} metalness={0.12} />
      </instancedMesh>
    </group>
  );
}

export default function ParkingLotVisual({ panel }: ParkingLotVisualProps) {
  const width = panel.surfaceSize[0] * PARKING_ART_WIDTH_RATIO;
  const depth = panel.surfaceSize[1] * PARKING_ART_WIDTH_RATIO;

  return (
    <group
      name="ParkingLotVisual"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.012, 0]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{ deterministic: true, carCount: PARKING_CAR_COUNT, stallCount: PARKING_STALL_COUNT }}
    >
      <RoundedBoxMesh
        name="ParkingAsphalt"
        width={width}
        height={0.035}
        depth={depth}
        radius={0.08}
        color={boardVisualTokens.airportRunway}
        materialProfile="parkPath"
        position={[0, 0.018, 0]}
      />
      <ParkingLaneMarkings width={width} depth={depth} />
      <ParkingCars width={width} depth={depth} />
    </group>
  );
}
