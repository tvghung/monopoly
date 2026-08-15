import type { Phase2PlayerMarkerModel } from '../board/boardRenderModel';
import {
  PLAYER_ACTIVE_RING_LOCAL_Y,
  PLAYER_ACTIVE_RING_TUBE_RADIUS,
} from '../board/buildingPlacement';
import { PLAYER_MARKER_BODY_HEIGHT, getPlayerLandingAnchor } from '../board/architecture/tileAnchors';
import { useTileMotionOffset } from '../board/motion/TileMotionProvider';
import { boardVisualTokens } from '../board/boardVisualTokens';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import ContactShadow from '../fx/ContactShadow';

interface Phase2PlayerMarkersProps {
  players: readonly Phase2PlayerMarkerModel[];
}

function PlayerMarker({
  player, slotIndex,
}: { player: Phase2PlayerMarkerModel; slotIndex: number }) {
  const position = getPlayerLandingAnchor(player.tileId, slotIndex);
  const tileMotionOffsetY = useTileMotionOffset(player.tileId);
  if (!position) return null;
  const displayColor = getPlayerDisplayColor(player.color);
  return (
    <group position={[position[0], position[1] + tileMotionOffsetY, position[2]]}>
      {player.isActive
        ? (
          <mesh
            position={[0, PLAYER_ACTIVE_RING_LOCAL_Y, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.28, PLAYER_ACTIVE_RING_TUBE_RADIUS, 8, 24]} />
            <meshStandardMaterial color={boardVisualTokens.selection} emissive={boardVisualTokens.selection} emissiveIntensity={0.2} />
          </mesh>
        )
        : null}
      <mesh>
        <cylinderGeometry args={[0.2, 0.25, 0.26, 10]} />
        <meshStandardMaterial color={displayColor} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.16, 10, 6]} />
        <meshStandardMaterial color={displayColor} roughness={0.58} />
      </mesh>
      <ContactShadow position={[0, -PLAYER_MARKER_BODY_HEIGHT / 2 - 0.01, 0]} scale={[0.52, 0.4]} opacity={0.2} />
    </group>
  );
}

export default function Phase2PlayerMarkers({ players }: Phase2PlayerMarkersProps) {
  const playersByTile = new Map<number, Phase2PlayerMarkerModel[]>();
  players.forEach(player => {
    const current = playersByTile.get(player.tileId) ?? [];
    current.push(player);
    playersByTile.set(player.tileId, current);
  });
  return (
    <group>
      {[...playersByTile.entries()].flatMap(([tileId, occupants]) => occupants.map((player, index) => (
        <PlayerMarker key={player.playerId} player={{ ...player, tileId }} slotIndex={index} />
      )))}
    </group>
  );
}
