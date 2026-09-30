import { useContext } from 'react';
import stateContext from '../../../internal';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';

const selectActivePlayerId = (state: PresentationState) => state.displayActivePlayerId;

/** The turn text. The strings and the `p.game-board__turn-label` element are unchanged from the old roll control. */
export function turnText(
  activePlayerId: string,
  localPlayerId: string | null,
  activeName: string | undefined,
): string {
  if (activePlayerId === localPlayerId) return 'Lượt của bạn';
  return activeName ? `${activeName} đang chơi` : 'Đang chờ lượt chơi';
}

/**
 * Top-center status: the room code and whose turn it is. It follows the displayed active player, so the text changes
 * when the presentation reaches the turn change, not when the server commits it.
 */
export default function StatusPill() {
  const { state, playerId, roomCode } = useContext(stateContext);
  const displayActive = usePresentationSelector(selectActivePlayerId);
  const activePlayerId = displayActive ?? state.boardState.currentPlayer.id;
  const active = state.players[activePlayerId];
  const isMine = activePlayerId === playerId;

  return (
    <section className="status-pill" data-hud-region="status-pill" aria-label="Trạng thái lượt chơi">
      {roomCode ? <span className="status-pill__room">{`Phòng ${roomCode}`}</span> : null}
      {active ? (
        <span className="status-pill__avatar" aria-hidden="true">
          <PlayerAvatar characterId={active.characterId} colorId={active.color} size={28} active={isMine} />
        </span>
      ) : null}
      <p className="game-board__turn-label status-pill__turn">{turnText(activePlayerId, playerId, active?.name)}</p>
    </section>
  );
}
