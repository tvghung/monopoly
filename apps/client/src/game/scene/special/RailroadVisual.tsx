import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import { getTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';

interface RailroadVisualProps {
  size: readonly [number, number];
  isCorner: boolean;
}

export default function RailroadVisual({ size, isCorner }: RailroadVisualProps) {
  const panels = getTilePanelLayoutForTileSize(size);
  const trackLength = panels.upperSize[0] * 0.74;
  const trackDepth = Math.min(panels.upperSize[1] * 0.64, 0.72);
  const centerZ = isCorner ? 0 : panels.upperCenterLocalZ;

  return (
    <group
      name="RailroadFlatVisual"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.012, centerZ]}
    >
      <RoundedBoxMesh
        name="RailroadConcreteInset"
        width={panels.upperSize[0] * 0.82}
        height={0.018}
        depth={trackDepth + 0.16}
        radius={0.025}
        color={boardVisualTokens.railroadPlatform}
        materialProfile="boardTop"
        position={[0, 0.01, 0]}
      />
      {[-0.14, 0.14].map(offset => (
        <RoundedBoxMesh
          key={offset}
          name="RailroadRail"
          width={trackLength}
          height={0.024}
          depth={0.042}
          radius={0.012}
          color={boardVisualTokens.railroad}
          materialProfile="metal"
          position={[0, 0.03, offset]}
        />
      ))}
      {[-0.25, -0.125, 0, 0.125, 0.25].map(offset => (
        <RoundedBoxMesh
          key={offset}
          name="RailroadSleeper"
          width={0.045}
          height={0.018}
          depth={trackDepth}
          radius={0.01}
          color={boardVisualTokens.railroadLight}
          materialProfile="boardTop"
          position={[offset, 0.027, 0]}
        />
      ))}
      <RoundedBoxMesh
        name="RailroadDirectionMark"
        width={panels.upperSize[0] * 0.32}
        height={0.018}
        depth={0.045}
        radius={0.01}
        color={boardVisualTokens.railroadLight}
        materialProfile="boardTop"
        position={[0, 0.036, -trackDepth * 0.43]}
      />
    </group>
  );
}
