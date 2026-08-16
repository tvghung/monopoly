import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import { getTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';

interface CardDeckVisualProps {
  size: readonly [number, number];
  kind: 'chance' | 'chest';
  isCorner: boolean;
}

const CHANCE_WHEEL_COLORS = [
  '#f47b65', '#f7c95f', '#6ec4a1', '#6fb7e6',
  '#a98bd4', '#f39a54', '#77c6c9', '#e9789d',
] as const;

const CHEST_WHEEL_COLORS = [
  '#0c9f97', '#f1cf66', '#ee8f64', '#6bb7a6',
  '#4d99bc', '#f0ad61', '#6dbaa5', '#8d9bd1',
] as const;

function createLuckyWheelGeometry(
  radius: number,
  colors: readonly string[],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const vertexColors: number[] = [];
  const segmentAngle = Math.PI * 2 / colors.length;

  colors.forEach((color, index) => {
    const start = index * segmentAngle;
    const end = start + segmentAngle;
    const points = [
      [0, 0, 0],
      [Math.cos(start) * radius, Math.sin(start) * radius, 0],
      [Math.cos(end) * radius, Math.sin(end) * radius, 0],
    ];
    const parsedColor = new THREE.Color(color);
    points.forEach(point => {
      positions.push(...point);
      vertexColors.push(parsedColor.r, parsedColor.g, parsedColor.b);
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function LuckyWheelGraphic({
  size,
  kind,
  isCorner,
}: CardDeckVisualProps) {
  const panels = getTilePanelLayoutForTileSize(size);
  const radius = Math.min(panels.upperSize[0], panels.upperSize[1]) * (isCorner ? 0.27 : 0.3);
  const colors = kind === 'chance' ? CHANCE_WHEEL_COLORS : CHEST_WHEEL_COLORS;
  const wheelGeometry = useMemo(() => createLuckyWheelGeometry(radius, colors), [colors, radius]);
  useEffect(() => () => wheelGeometry.dispose(), [wheelGeometry]);

  return (
    <group
      name={`LuckyWheel2D:${kind}`}
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panels.upperCenterLocalZ]}
    >
      <mesh name="LuckyWheelSegments" geometry={wheelGeometry} position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial vertexColors roughness={0.62} metalness={0} />
      </mesh>
      <mesh name="LuckyWheelOuterRing" position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.84, radius * 0.96, 32]} />
        <meshStandardMaterial color={kind === 'chance' ? '#d85d4c' : '#087e79'} roughness={0.5} />
      </mesh>
      <mesh name="LuckyWheelCenter" position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.16, 20]} />
        <meshStandardMaterial color="#fff3ca" roughness={0.45} />
      </mesh>
      <RoundedBoxMesh
        name="LuckyWheelPointer"
        width={radius * 1.1}
        height={0.024}
        depth={0.045}
        radius={0.012}
        color={kind === 'chance' ? boardVisualTokens.chanceDark : boardVisualTokens.chestBody}
        materialProfile="propertyTrim"
        position={[0, 0.034, 0]}
        rotation={[0, Math.PI / 7, 0]}
      />
    </group>
  );
}

export default function CardDeckVisual({ size, kind, isCorner }: CardDeckVisualProps) {
  return <LuckyWheelGraphic size={size} kind={kind} isCorner={isCorner} />;
}
