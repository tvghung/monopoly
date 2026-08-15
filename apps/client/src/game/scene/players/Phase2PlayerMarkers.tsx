import type { Phase2PlayerMarkerModel } from '../board/boardRenderModel';
import {
  PLAYER_MARKER_BODY_HEIGHT,
  getOccupantWorldPosition,
} from '../board/buildingPlacement';
import { boardVisualTokens } from '../board/boardVisualTokens';

interface Phase2PlayerMarkersProps {
  players: readonly Phase2PlayerMarkerModel[];
}

function PlayerMarker({
  player, slotIndex,
}: { player: Phase2PlayerMarkerModel; slotIndex: number }) {
  const position = getOccupantWorldPosition(player.tileId, slotIndex);
  if (!position) return null;
  return (
    <group position={position}>
      {player.isActive
        ? (
          <mesh
            position={[0, -PLAYER_MARKER_BODY_HEIGHT / 2 + 0.015, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <torusGeometry args={[0.28, 0.035, 8, 24]} />
            <meshStandardMaterial color={boardVisualTokens.selection} emissive={boardVisualTokens.selection} emissiveIntensity={0.2} />
          </mesh>
        )
        : null}
      <mesh castShadow>
        <cylinderGeometry args={[0.2, 0.25, 0.26, 12]} />
        <meshStandardMaterial color={player.color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow>
        <sphereGeometry args={[0.16, 12, 8]} />
        <meshStandardMaterial color={player.color} roughness={0.58} />
      </mesh>
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
