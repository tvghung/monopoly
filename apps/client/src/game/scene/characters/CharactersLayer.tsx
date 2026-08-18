import type { CharacterPlayerModel } from '../board/boardRenderModel';
import type { CharacterReactionSignal } from '../../presentation/store/types';
import CharacterBillboard from './CharacterBillboard';
import { assignCharacterSlots } from './characterPlacement';

interface CharactersLayerProps {
  players: readonly CharacterPlayerModel[];
  resetEpoch: number;
  reactions: readonly CharacterReactionSignal[];
}

export default function CharactersLayer({ players, resetEpoch, reactions }: CharactersLayerProps) {
  const latestReactionByPlayer = new Map<string, CharacterReactionSignal>();
  reactions.forEach(reaction => {
    const current = latestReactionByPlayer.get(reaction.playerId);
    if (!current || reaction.sequence > current.sequence) {
      latestReactionByPlayer.set(reaction.playerId, reaction);
    }
  });
  return (
    <group name="CharactersLayer">
      {assignCharacterSlots(players).map(({ player, slotIndex, occupantCount }) => (
        <CharacterBillboard
          key={player.playerId}
          player={player}
          slotIndex={slotIndex}
          occupantCount={occupantCount}
          resetEpoch={resetEpoch}
          reaction={latestReactionByPlayer.get(player.playerId)}
        />
      ))}
    </group>
  );
}
