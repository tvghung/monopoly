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
  contentRotationY: number;
}

export const FORTUNE_WHEEL_SEGMENT_COUNT = 12;
export const FORTUNE_WHEEL_RADIUS_RATIO = 0.36;

const FORTUNE_WHEEL_COLORS = [
  '#10a89b', '#f5c84c', '#f07858', '#5bb8dc',
  '#9b79d1', '#ef9250', '#57c59d', '#e56b96',
  '#3f91c5', '#f0a94d', '#70c8c8', '#d66cc5',
] as const;

function createFortuneWheelGeometry(
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

function FortuneWheelGraphic({
  size,
  isCorner,
  contentRotationY,
}: Omit<CardDeckVisualProps, 'kind'>) {
  const panels = getTilePanelLayoutForTileSize(size);
  const radius = Math.min(panels.upperSize[0], panels.upperSize[1])
    * (isCorner ? 0.31 : FORTUNE_WHEEL_RADIUS_RATIO);
  const wheelGeometry = useMemo(
    () => createFortuneWheelGeometry(radius, FORTUNE_WHEEL_COLORS),
    [radius],
  );
  useEffect(() => () => wheelGeometry.dispose(), [wheelGeometry]);

  return (
    <group
      name="FortuneWheel2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panels.upperCenterLocalZ]}
      rotation={[0, contentRotationY, 0]}
    >
      <mesh
        name="FortuneWheelSegments"
        geometry={wheelGeometry}
        position={[0, 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial vertexColors roughness={0.62} metalness={0} />
      </mesh>
      <mesh name="FortuneWheelOuterRing" position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.84, radius * 0.96, 32]} />
        <meshStandardMaterial color="#087e79" roughness={0.5} />
      </mesh>
      <mesh name="FortuneWheelCenter" position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.16, 20]} />
        <meshStandardMaterial color="#fff3ca" roughness={0.45} />
      </mesh>
    </group>
  );
}

function TreasureChestGraphic({
  size,
  isCorner,
  contentRotationY,
}: Omit<CardDeckVisualProps, 'kind'>) {
  const panels = getTilePanelLayoutForTileSize(size);
  const chestWidth = panels.upperSize[0] * (isCorner ? 0.48 : 0.68);
  const chestDepth = Math.min(panels.upperSize[1] * 0.42, 0.62);
  const jewelColors = ['#e84e70', '#58b9ea', '#f4c94b'] as const;

  return (
    <group
      name="ChanceTreasureChest2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panels.upperCenterLocalZ]}
      rotation={[0, contentRotationY, 0]}
    >
      <RoundedBoxMesh
        name="TreasureChestBody"
        width={chestWidth}
        height={0.052}
        depth={chestDepth}
        radius={0.035}
        color={boardVisualTokens.chestBody}
        materialProfile="propertyTrim"
        position={[0, 0.034, 0.035]}
      />
      <RoundedBoxMesh
        name="TreasureChestLid"
        width={chestWidth * 1.04}
        height={0.045}
        depth={chestDepth * 0.62}
        radius={0.04}
        color={boardVisualTokens.chest}
        materialProfile="propertyTrim"
        position={[0, 0.078, -0.09]}
      />
      <RoundedBoxMesh
        name="TreasureChestBand"
        width={0.055}
        height={0.02}
        depth={chestDepth * 0.9}
        radius={0.012}
        color={boardVisualTokens.chestBand}
        materialProfile="propertyTrim"
        position={[0, 0.09, 0.005]}
      />
      <mesh name="TreasureChestLatch" position={[0, 0.102, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.045, 16]} />
        <meshStandardMaterial color={boardVisualTokens.chestLatch} roughness={0.32} metalness={0.1} />
      </mesh>
      {jewelColors.map((color, index) => (
        <mesh
          key={color}
          name="TreasureJewel"
          position={[(index - 1) * 0.12, 0.104, 0.1]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.045, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.16} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

export default function CardDeckVisual({ size, kind, isCorner, contentRotationY }: CardDeckVisualProps) {
  return kind === 'chance'
    ? <TreasureChestGraphic size={size} isCorner={isCorner} contentRotationY={contentRotationY} />
    : <FortuneWheelGraphic size={size} isCorner={isCorner} contentRotationY={contentRotationY} />;
}
