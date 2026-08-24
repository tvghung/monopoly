import type { CharacterPlayerModel } from '../board/boardRenderModel';
import type {
  CharacterLandingSignal,
  CharacterMovementSignal,
  CharacterReactionSignal,
} from '../../presentation/store/types';
import CharacterBillboard from './CharacterBillboard';
import { assignCharacterSlots } from './characterPlacement';

interface CharactersLayerProps {
  players: readonly CharacterPlayerModel[];
  movementSignals: readonly CharacterMovementSignal[];
  landingSignals: readonly CharacterLandingSignal[];
  animationSpeedMultiplier: number;
  resetEpoch: number;
  reactions: readonly CharacterReactionSignal[];
}

export default function CharactersLayer({
  players,
  movementSignals,
  landingSignals,
  animationSpeedMultiplier,
  resetEpoch,
  reactions,
}: CharactersLayerProps) {
  const latestReactionByPlayer = new Map<string, CharacterReactionSignal>();
  const movementSignalsByPlayer = new Map<string, CharacterMovementSignal[]>();
  const landingSignalsByPlayer = new Map<string, CharacterLandingSignal[]>();
  reactions.forEach(reaction => {
    const current = latestReactionByPlayer.get(reaction.playerId);
    if (!current || reaction.sequence > current.sequence) {
      latestReactionByPlayer.set(reaction.playerId, reaction);
    }
  });
  movementSignals.forEach(signal => {
    const current = movementSignalsByPlayer.get(signal.playerId) ?? [];
    current.push(signal);
    movementSignalsByPlayer.set(signal.playerId, current);
  });
  landingSignals.forEach(signal => {
    const current = landingSignalsByPlayer.get(signal.playerId) ?? [];
    current.push(signal);
    landingSignalsByPlayer.set(signal.playerId, current);
  });
  return (
    <group name="CharactersLayer">
      {assignCharacterSlots(players).map(({ player, slotIndex, occupantCount }) => (
        <CharacterBillboard
          key={player.playerId}
          player={player}
          slotIndex={slotIndex}
          occupantCount={occupantCount}
          movementSignals={movementSignalsByPlayer.get(player.playerId) ?? []}
          landingSignals={landingSignalsByPlayer.get(player.playerId) ?? []}
          animationSpeedMultiplier={animationSpeedMultiplier}
          resetEpoch={resetEpoch}
          reaction={latestReactionByPlayer.get(player.playerId)}
        />
      ))}
    </group>
  );
}
