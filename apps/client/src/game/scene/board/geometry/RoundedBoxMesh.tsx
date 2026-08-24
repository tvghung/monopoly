import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Texture } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { BoardMaterialProfile } from '../materials/boardMaterialSpecs';
import { getBoardMaterialProps } from '../materials/boardMaterialSpecs';
import { SelectiveRoundedBoxGeometry } from './SelectiveRoundedBoxGeometry';

interface RoundedBoxMeshProps {
  width: number;
  height: number;
  depth: number;
  radius: number;
  segments?: number;
  cornerSegments?: number;
  color: string;
  map?: Texture;
  materialProfile: BoardMaterialProfile;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  name?: string;
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}

export default function RoundedBoxMesh({
  width,
  height,
  depth,
  radius,
  segments = 2,
  cornerSegments,
  color,
  map,
  materialProfile,
  position,
  rotation,
  name,
  onPointerEnter,
  onPointerLeave,
  onClick,
}: RoundedBoxMeshProps) {
  const geometry = useMemo(
    () => cornerSegments === undefined
      ? new RoundedBoxGeometry(width, height, depth, segments, radius)
      : new SelectiveRoundedBoxGeometry(width, height, depth, segments, cornerSegments, radius),
    [cornerSegments, depth, height, radius, segments, width],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      name={name}
      position={position}
      rotation={rotation}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial {...getBoardMaterialProps(materialProfile, color)} map={map} />
    </mesh>
  );
}
