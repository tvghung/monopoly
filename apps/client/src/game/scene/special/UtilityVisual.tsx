import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import { getTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';

interface UtilityVisualProps {
  size: readonly [number, number];
  label: string;
  isCorner: boolean;
}

export default function UtilityVisual({ size, label, isCorner }: UtilityVisualProps) {
  const isWater = label.toLocaleLowerCase('vi-VN').includes('nước');
  const panels = getTilePanelLayoutForTileSize(size);
  const badgeRadius = Math.min(panels.upperSize[0], panels.upperSize[1]) * (isCorner ? 0.24 : 0.28);

  return (
    <group
      name="UtilityGraphic2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panels.upperCenterLocalZ]}
    >
      <mesh name="UtilityBadge" position={[0, 0.018, 0]}>
        <cylinderGeometry args={[badgeRadius, badgeRadius, 0.028, 24]} />
        <meshStandardMaterial
          color={isWater ? boardVisualTokens.utilityWater : boardVisualTokens.utility}
          roughness={0.42}
          metalness={0.02}
        />
      </mesh>
      {isWater ? (
        <>
          <RoundedBoxMesh width={badgeRadius * 1.15} height={0.018} depth={0.035} radius={0.015} color={boardVisualTokens.utilityLight} materialProfile="boardTop" position={[0, 0.045, -0.07]} />
          <RoundedBoxMesh width={badgeRadius * 0.9} height={0.018} depth={0.035} radius={0.015} color={boardVisualTokens.utilityLight} materialProfile="boardTop" position={[0.04, 0.045, 0.045]} />
        </>
      ) : (
        <>
          <RoundedBoxMesh width={0.11} height={0.018} depth={badgeRadius * 0.95} radius={0.015} color={boardVisualTokens.utilityLight} materialProfile="boardTop" position={[-0.035, 0.046, -0.01]} rotation={[0, -0.48, 0]} />
          <RoundedBoxMesh width={0.11} height={0.018} depth={badgeRadius * 0.75} radius={0.015} color={boardVisualTokens.utilityLight} materialProfile="boardTop" position={[0.05, 0.047, 0.07]} rotation={[0, 0.48, 0]} />
        </>
      )}
    </group>
  );
}
