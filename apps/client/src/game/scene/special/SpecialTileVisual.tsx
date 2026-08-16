import type { TileType } from '@monopoly/shared';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import { getTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';

interface SpecialTileVisualProps {
  size: readonly [number, number];
  tileType: TileType;
  isCorner: boolean;
  contentRotationY: number;
}

function TaxPaperStack({
  size,
  isCorner,
  contentRotationY,
}: Pick<SpecialTileVisualProps, 'size' | 'isCorner' | 'contentRotationY'>) {
  const panels = getTilePanelLayoutForTileSize(size);
  const paperWidth = panels.upperSize[0] * (isCorner ? 0.4 : 0.58);
  const paperDepth = Math.min(panels.upperSize[1] * 0.52, 0.78);
  const lines = [
    [-0.12, 0.12, 0.28],
    [-0.08, 0.02, 0.2],
    [-0.13, -0.08, 0.34],
  ] as const;

  return (
    <group
      name="TaxPaperStack2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.016, isCorner ? 0 : panels.upperCenterLocalZ]}
      rotation={[0, contentRotationY, 0]}
    >
      <RoundedBoxMesh
        name="TaxPaperBack"
        width={paperWidth}
        height={0.025}
        depth={paperDepth}
        radius={0.025}
        color="#d9e1dd"
        materialProfile="boardTop"
        position={[-0.06, 0.018, 0.055]}
        rotation={[0, -0.08, 0]}
      />
      <RoundedBoxMesh
        name="TaxPaperFront"
        width={paperWidth}
        height={0.028}
        depth={paperDepth}
        radius={0.025}
        color="#fffdf3"
        materialProfile="boardTop"
        position={[0.06, 0.04, -0.03]}
        rotation={[0, 0.06, 0]}
      />
      {lines.map(([x, z, width], index) => (
        <RoundedBoxMesh
          key={index}
          name="TaxPaperMark"
          width={width}
          height={0.012}
          depth={0.018}
          radius={0.008}
          color={boardVisualTokens.expenseDark}
          materialProfile="propertyTrim"
          position={[x, 0.07, z - 0.03]}
        />
      ))}
    </group>
  );
}

function PoliceIcon({
  size,
  isCorner,
  contentRotationY,
}: Pick<SpecialTileVisualProps, 'size' | 'isCorner' | 'contentRotationY'>) {
  const panels = getTilePanelLayoutForTileSize(size);
  return (
    <group
      name="PoliceIcon2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.018, isCorner ? 0 : panels.upperCenterLocalZ]}
      rotation={[0, contentRotationY, 0]}
    >
      <RoundedBoxMesh
        name="PoliceShoulders"
        width={panels.upperSize[0] * 0.46}
        height={0.028}
        depth={0.22}
        radius={0.08}
        color="#4d93d0"
        materialProfile="propertyTrim"
        position={[0, 0.026, 0.12]}
      />
      <mesh name="PoliceFace" position={[0, 0.05, -0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 16]} />
        <meshStandardMaterial color="#f3bc88" roughness={0.72} />
      </mesh>
      <RoundedBoxMesh
        name="PoliceCap"
        width={0.28}
        height={0.024}
        depth={0.09}
        radius={0.025}
        color="#1d5592"
        materialProfile="propertyTrim"
        position={[0, 0.07, -0.17]}
      />
      <RoundedBoxMesh
        name="PoliceBadge"
        width={0.075}
        height={0.018}
        depth={0.075}
        radius={0.025}
        color="#f4d36c"
        materialProfile="propertyTrim"
        position={[0, 0.065, 0.12]}
      />
    </group>
  );
}

function ParkingGraphic({
  size,
  contentRotationY,
}: Pick<SpecialTileVisualProps, 'size' | 'contentRotationY'>) {
  const panels = getTilePanelLayoutForTileSize(size);
  return (
    <group
      name="ParkingGraphic2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, 0]}
      rotation={[0, contentRotationY, 0]}
    >
      <RoundedBoxMesh
        name="ParkingBay"
        width={panels.surfaceSize[0] * 0.48}
        height={0.026}
        depth={panels.surfaceSize[1] * 0.34}
        radius={0.06}
        color={boardVisualTokens.parkingCar}
        materialProfile="propertyTrim"
        position={[0, 0.014, 0]}
      />
      {[-0.16, 0, 0.16].map(offset => (
        <RoundedBoxMesh
          key={offset}
          name="ParkingBayMark"
          width={0.04}
          height={0.014}
          depth={panels.surfaceSize[1] * 0.25}
          radius={0.01}
          color={boardVisualTokens.parkingGlass}
          materialProfile="boardTop"
          position={[offset, 0.036, 0]}
        />
      ))}
    </group>
  );
}

export default function SpecialTileVisual({
  size,
  tileType,
  isCorner,
  contentRotationY,
}: SpecialTileVisualProps) {
  if (tileType === 'start') {
    return (
      <group name="StartVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]} rotation={[0, contentRotationY, 0]}>
        <mesh position={[0, 0.055, 0]}>
          <cylinderGeometry args={[0.34, 0.38, 0.1, 20]} />
          <meshStandardMaterial color={boardVisualTokens.boardFrame} roughness={0.64} metalness={0.02} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.29, 0.29, 0.04, 20]} />
          <meshStandardMaterial color={boardVisualTokens.selection} roughness={0.42} metalness={0.04} />
        </mesh>
        <mesh position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 4]}>
          <coneGeometry args={[0.2, 0.38, 4]} />
          <meshStandardMaterial color={boardVisualTokens.selection} roughness={0.3} metalness={0.05} />
        </mesh>
      </group>
    );
  }
  if (tileType === 'gojail') return <PoliceIcon size={size} isCorner={isCorner} contentRotationY={contentRotationY} />;
  if (tileType === 'parking') return <ParkingGraphic size={size} contentRotationY={contentRotationY} />;
  if (tileType === 'expense') return <TaxPaperStack size={size} isCorner={isCorner} contentRotationY={contentRotationY} />;
  return null;
}
