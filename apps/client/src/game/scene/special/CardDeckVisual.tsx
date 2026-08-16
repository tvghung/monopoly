import { chestCards } from '@monopoly/shared';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import QuestionMarkIcon25D from './QuestionMarkIcon25D';

interface CardDeckVisualProps {
  panel: TilePanelLayout;
  kind: 'chance' | 'chest';
}

export const FORTUNE_WHEEL_SEGMENT_COUNT = chestCards.length;
export const FORTUNE_WHEEL_RADIUS_RATIO = 0.36;

const FORTUNE_WHEEL_PALETTE = [
  '#ffd21a', '#ff8a25', '#ef4056', '#e45ca8', '#8256ce',
  '#416bd8', '#59aeea', '#1cc9d2', '#00a995', '#24b66b', '#a9d63f',
] as const;

export function getFortuneWheelColors(segmentCount = FORTUNE_WHEEL_SEGMENT_COUNT): readonly string[] {
  return Array.from({ length: segmentCount }, (_, index) => FORTUNE_WHEEL_PALETTE[index % FORTUNE_WHEEL_PALETTE.length]);
}

export function createFortuneWheelGeometry(
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

export function createFortuneWheelSeparatorGeometry(
  radius: number,
  segmentCount: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const innerRadius = radius * 0.18;
  const outerRadius = radius * 0.96;
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = index * Math.PI * 2 / segmentCount;
    positions.push(
      Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, 0,
      Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, 0,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function FortuneWheelGraphic({ panel }: { panel: TilePanelLayout }) {
  const isCorner = panel.side === 'CORNER';
  const radius = Math.min(panel.upperSize[0], panel.upperSize[1])
    * (isCorner ? 0.31 : FORTUNE_WHEEL_RADIUS_RATIO);
  const colors = useMemo(() => getFortuneWheelColors(), []);
  const wheelGeometry = useMemo(
    () => createFortuneWheelGeometry(radius, colors),
    [colors, radius],
  );
  const separatorGeometry = useMemo(
    () => createFortuneWheelSeparatorGeometry(radius, colors.length),
    [colors.length, radius],
  );
  useEffect(() => () => {
    wheelGeometry.dispose();
    separatorGeometry.dispose();
  }, [separatorGeometry, wheelGeometry]);

  return (
    <group
      name="FortuneWheel2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panel.upperArtCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
    >
      <mesh
        name="FortuneWheelSegments"
        geometry={wheelGeometry}
        position={[0, 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial vertexColors roughness={0.58} metalness={0} />
      </mesh>
      <lineSegments
        name="FortuneWheelSeparators"
        geometry={separatorGeometry}
        position={[0, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <lineBasicMaterial color={boardVisualTokens.wheelSeparator} transparent opacity={0.78} />
      </lineSegments>
      <mesh name="FortuneWheelOuterRing" position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.87, radius * 0.98, 40]} />
        <meshStandardMaterial color={boardVisualTokens.wheelRing} roughness={0.46} />
      </mesh>
      <mesh name="FortuneWheelHub" position={[0, 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.16, 20]} />
        <meshStandardMaterial color={boardVisualTokens.wheelHub} roughness={0.38} metalness={0.08} />
      </mesh>
      <mesh name="FortuneWheelCenterPointer" position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.055, 16]} />
        <meshStandardMaterial color={boardVisualTokens.wheelPointer} roughness={0.3} />
      </mesh>
    </group>
  );
}

export default function CardDeckVisual({ panel, kind }: CardDeckVisualProps) {
  return kind === 'chance'
    ? <QuestionMarkIcon25D panel={panel} />
    : <FortuneWheelGraphic panel={panel} />;
}
