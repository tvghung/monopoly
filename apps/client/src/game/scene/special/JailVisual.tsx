import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import { getTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';

interface JailVisualProps {
  size: readonly [number, number];
  isCorner: boolean;
  contentRotationY: number;
}

export default function JailVisual({ size, isCorner, contentRotationY }: JailVisualProps) {
  const panels = getTilePanelLayoutForTileSize(size);
  const width = panels.upperSize[0] * (isCorner ? 0.54 : 0.78);
  const depth = Math.min(panels.upperSize[1] * 0.68, 0.9);
  const barCount = 9;
  const barSpacing = width / (barCount - 1);

  return (
    <group
      name="JailCellBars2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panels.upperCenterLocalZ]}
      rotation={[0, contentRotationY, 0]}
    >
      <RoundedBoxMesh
        name="JailCellThreshold"
        width={width + 0.1}
        height={0.024}
        depth={0.08}
        radius={0.018}
        color={boardVisualTokens.jailBars}
        materialProfile="metal"
        position={[0, 0.022, depth / 2]}
      />
      <RoundedBoxMesh
        name="JailCellHeader"
        width={width + 0.1}
        height={0.024}
        depth={0.08}
        radius={0.018}
        color={boardVisualTokens.jailBars}
        materialProfile="metal"
        position={[0, 0.022, -depth / 2]}
      />
      {Array.from({ length: barCount }, (_, index) => (
        <RoundedBoxMesh
          key={index}
          name="JailCellBar"
          width={0.052}
          height={0.032}
          depth={depth}
          radius={0.018}
          color={boardVisualTokens.jailBars}
          materialProfile="metal"
          position={[(index - (barCount - 1) / 2) * barSpacing, 0.026, 0]}
        />
      ))}
      <RoundedBoxMesh
        name="JailCellSideLeft"
        width={0.07}
        height={0.03}
        depth={depth + 0.08}
        radius={0.02}
        color={boardVisualTokens.jailBars}
        materialProfile="metal"
        position={[-width / 2, 0.025, 0]}
      />
      <RoundedBoxMesh
        name="JailCellSideRight"
        width={0.07}
        height={0.03}
        depth={depth + 0.08}
        radius={0.02}
        color={boardVisualTokens.jailBars}
        materialProfile="metal"
        position={[width / 2, 0.025, 0]}
      />
    </group>
  );
}
