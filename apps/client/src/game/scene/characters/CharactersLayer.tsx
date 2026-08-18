import type { CharacterPlayerModel } from '../board/boardRenderModel';
import CharacterBillboard from './CharacterBillboard';
import { assignCharacterSlots } from './characterPlacement';

interface CharactersLayerProps {
  players: readonly CharacterPlayerModel[];
  resetEpoch: number;
}

export default function CharactersLayer({ players, resetEpoch }: CharactersLayerProps) {
  return (
    <group name="CharactersLayer">
      {assignCharacterSlots(players).map(({ player, slotIndex, occupantCount }) => (
        <CharacterBillboard
          key={player.playerId}
          player={player}
          slotIndex={slotIndex}
          occupantCount={occupantCount}
          resetEpoch={resetEpoch}
        />
      ))}
    </group>
  );
}
