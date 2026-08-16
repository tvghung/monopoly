import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

interface RailroadVisualProps {
  panel: TilePanelLayout;
}

export default function RailroadVisual({ panel }: RailroadVisualProps) {
  const isCorner = panel.side === 'CORNER';
  const trainWidth = panel.upperSize[0] * (isCorner ? 0.48 : 0.68);
  const trainDepth = Math.min(panel.upperSize[1] * 0.5, 0.62);

  return (
    <group
      name="TrainIcon2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.012, isCorner ? 0 : panel.upperCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
    >
      <RoundedBoxMesh
        name="TrainBody"
        width={trainWidth}
        height={0.035}
        depth={trainDepth * 0.55}
        radius={0.035}
        color={boardVisualTokens.railroad}
        materialProfile="propertyTrim"
        position={[0, 0.028, 0.035]}
      />
      <RoundedBoxMesh
        name="TrainCab"
        width={trainWidth * 0.38}
        height={0.046}
        depth={trainDepth * 0.62}
        radius={0.03}
        color={boardVisualTokens.railroad}
        materialProfile="propertyTrim"
        position={[-trainWidth * 0.22, 0.054, -0.08]}
      />
      <RoundedBoxMesh
        name="TrainCabRoof"
        width={trainWidth * 0.48}
        height={0.018}
        depth={0.07}
        radius={0.012}
        color={boardVisualTokens.railroadLight}
        materialProfile="boardTop"
        position={[-trainWidth * 0.22, 0.084, -0.08]}
      />
      <RoundedBoxMesh
        name="TrainWindow"
        width={trainWidth * 0.2}
        height={0.012}
        depth={0.07}
        radius={0.01}
        color={boardVisualTokens.utilityLight}
        materialProfile="boardTop"
        position={[-trainWidth * 0.22, 0.084, -0.08]}
      />
      <RoundedBoxMesh
        name="TrainFront"
        width={trainWidth * 0.16}
        height={0.025}
        depth={0.11}
        radius={0.018}
        color={boardVisualTokens.railroadLight}
        materialProfile="boardTop"
        position={[trainWidth * 0.38, 0.035, 0.03]}
      />
      {[-trainWidth * 0.28, trainWidth * 0.28].map(x => (
        <mesh key={x} name="TrainWheel" position={[x, 0.058, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.06, 16]} />
          <meshStandardMaterial color={boardVisualTokens.tileText} roughness={0.48} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}
