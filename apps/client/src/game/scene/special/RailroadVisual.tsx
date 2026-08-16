import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

interface RailroadVisualProps {
  panel: TilePanelLayout;
}

interface TrainBoxSpec {
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
}

export const TRAIN_WAGON_COUNT = 2;
export const TRAIN_ART_WIDTH_RATIO = 0.86;
export const TRAIN_WHEEL_COUNT = 12;
export const TRAIN_BOX_PART_COUNT = 14;

function trainBox(
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  color: string,
): TrainBoxSpec {
  return { position, size, color };
}

function TrainBoxParts({ specs }: { specs: readonly TrainBoxSpec[] }) {
  const partsRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => new RoundedBoxGeometry(1, 1, 1, 2, 0.08),
    [],
  );

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || typeof parts.setMatrixAt !== 'function') return;
    const dummy = new THREE.Object3D();
    specs.forEach((spec, index) => {
      dummy.position.set(...spec.position);
      dummy.scale.set(...spec.size);
      dummy.updateMatrix();
      parts.setMatrixAt(index, dummy.matrix);
      parts.setColorAt(index, new THREE.Color(spec.color));
    });
    parts.instanceMatrix.needsUpdate = true;
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  }, [specs]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <instancedMesh
      ref={partsRef}
      args={[undefined, undefined, specs.length]}
      name="TrainBoxParts"
      userData={{ locomotive: true, boxPartCount: specs.length }}
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={boardVisualTokens.tileSurface} roughness={0.48} metalness={0.08} />
    </instancedMesh>
  );
}

function TrainWheels({ positions }: { positions: readonly (readonly [number, number])[] }) {
  const wheelsRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const wheel = new THREE.CylinderGeometry(0.062, 0.062, 0.045, 12);
    wheel.rotateX(Math.PI / 2);
    return wheel;
  }, []);

  useEffect(() => {
    const wheels = wheelsRef.current;
    if (!wheels || typeof wheels.setMatrixAt !== 'function') return;
    const dummy = new THREE.Object3D();
    positions.forEach(([x, z], index) => {
      dummy.position.set(x, 0.058, z);
      dummy.updateMatrix();
      wheels.setMatrixAt(index, dummy.matrix);
    });
    wheels.instanceMatrix.needsUpdate = true;
  }, [positions]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <instancedMesh ref={wheelsRef} args={[undefined, undefined, positions.length]} name="TrainWheels">
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial
        color={boardVisualTokens.tileText}
        roughness={0.52}
        metalness={0.18}
      />
    </instancedMesh>
  );
}

export default function RailroadVisual({ panel }: RailroadVisualProps) {
  const isCorner = panel.side === 'CORNER';
  const trainWidth = Math.min(
    panel.upperSize[0] * TRAIN_ART_WIDTH_RATIO,
    isCorner ? 1.52 : 1.3,
  );
  const trainDepth = Math.min(panel.upperSize[1] * 0.3, 0.4);
  const locomotiveWidth = trainWidth * 0.3;
  const wagonWidth = trainWidth * 0.25;
  const locomotiveX = -trainWidth * 0.33;
  const wagonOneX = -trainWidth * 0.01;
  const wagonTwoX = trainWidth * 0.3;
  const wheelPositions = [
    locomotiveX - locomotiveWidth * 0.25,
    locomotiveX + locomotiveWidth * 0.25,
    wagonOneX - wagonWidth * 0.28,
    wagonOneX + wagonWidth * 0.28,
    wagonTwoX - wagonWidth * 0.28,
    wagonTwoX + wagonWidth * 0.28,
  ].flatMap(x => ([-trainDepth * 0.44, trainDepth * 0.44] as const).map(z => [x, z] as const));
  const boxSpecs = useMemo<readonly TrainBoxSpec[]>(() => {
    const wagonCenters = [wagonOneX, wagonTwoX] as const;
    return [
    trainBox(
      [locomotiveX, 0.046, 0],
      [locomotiveWidth, 0.075, trainDepth * 0.62],
      boardVisualTokens.railroad,
    ),
    trainBox(
      [locomotiveX + locomotiveWidth * 0.08, 0.12, -trainDepth * 0.06],
      [locomotiveWidth * 0.62, 0.14, trainDepth * 0.72],
      boardVisualTokens.railroad,
    ),
    trainBox(
      [locomotiveX + locomotiveWidth * 0.08, 0.205, -trainDepth * 0.06],
      [locomotiveWidth * 0.76, 0.025, trainDepth * 0.82],
      boardVisualTokens.railroadLight,
    ),
    trainBox(
      [locomotiveX + locomotiveWidth * 0.08, 0.17, -trainDepth * 0.06],
      [locomotiveWidth * 0.32, 0.035, trainDepth * 0.76],
      boardVisualTokens.utilityLight,
    ),
    trainBox(
      [locomotiveX - locomotiveWidth * 0.42, 0.065, 0],
      [locomotiveWidth * 0.25, 0.06, trainDepth * 0.7],
      boardVisualTokens.railroadLight,
    ),
    trainBox(
      [locomotiveX - locomotiveWidth * 0.2, 0.16, trainDepth * 0.05],
      [0.07, 0.11, 0.07],
      boardVisualTokens.railroadLight,
    ),
    ...wagonCenters.flatMap((x, index) => {
      const wagonColor = index === 0 ? boardVisualTokens.parkingCar : boardVisualTokens.selection;
      const topColor = index === 0 ? boardVisualTokens.parkingGlass : boardVisualTokens.hotelWindow;
      return [
        trainBox([x, 0.044, 0], [wagonWidth, 0.07, trainDepth * 0.64], wagonColor),
        trainBox([x, 0.115, 0], [wagonWidth * 0.86, 0.12, trainDepth * 0.82], wagonColor),
        trainBox([x, 0.185, 0], [wagonWidth * 0.92, 0.018, trainDepth * 0.88], topColor),
      ];
    }),
    trainBox(
      [locomotiveX + locomotiveWidth * 0.5, 0.075, 0],
      [0.09, 0.035, 0.06],
      boardVisualTokens.tileText,
    ),
    trainBox(
      [(wagonOneX + wagonTwoX) / 2, 0.075, 0],
      [0.09, 0.035, 0.06],
      boardVisualTokens.tileText,
    ),
    ];
  }, [
    locomotiveWidth,
    locomotiveX,
    trainDepth,
    wagonOneX,
    wagonTwoX,
    wagonWidth,
  ]);

  return (
    <group
      name="TrainConvoy25D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.012, isCorner ? 0 : panel.upperArtCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{ locomotive: true, wagons: TRAIN_WAGON_COUNT, wheelCount: TRAIN_WHEEL_COUNT }}
    >
      <TrainBoxParts specs={boxSpecs} />
      <TrainWheels positions={wheelPositions} />
    </group>
  );
}
