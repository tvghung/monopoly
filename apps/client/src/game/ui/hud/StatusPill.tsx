import { useContext } from 'react';
import stateContext from '../../../internal';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';
import { resolveDisplayedPlayer } from './displayedPlayer';
import { useTranslation, type Language } from '../../../i18n/I18n';
import { translate } from '../../../i18n/I18n';

const selectActivePlayerId = (state: PresentationState) => state.displayActivePlayerId;

/** The turn text. The strings and the `p.game-board__turn-label` element are unchanged from the old roll control. */
export function turnText(
  activePlayerId: string,
  localPlayerId: string | null,
  activeName: string | undefined,
  language: Language = 'vi',
): string {
  if (activePlayerId === localPlayerId) return translate('hud.turnLabel.mine', language);
  return activeName
    ? translate('hud.turnLabel.other', language, { name: activeName })
    : translate('hud.turnLabel.waiting', language);
}

/**
 * Top-center status: the room code and whose turn it is. It follows the displayed active player, so the text changes
 * when the presentation reaches the turn change, not when the server commits it.
 */
export default function StatusPill() {
  const { language, t } = useTranslation();
  const { state, playerId, roomCode } = useContext(stateContext);
  const displayActive = usePresentationSelector(selectActivePlayerId);
  const activePlayerId = displayActive ?? state.boardState.currentPlayer.id;
  const active = resolveDisplayedPlayer(state, activePlayerId);
  const isMine = activePlayerId === playerId;

  return (
    <section className="status-pill" data-hud-region="status-pill" aria-label={t('hud.turnStatus')}>
      {roomCode ? <span className="status-pill__room">{t('hud.room', { roomCode })}</span> : null}
      {active ? (
        <span className="status-pill__avatar" aria-hidden="true">
          <PlayerAvatar characterId={active.characterId} colorId={active.color} size={28} active={isMine} />
        </span>
      ) : null}
      <p className="game-board__turn-label status-pill__turn">{turnText(activePlayerId, playerId, active?.name, language)}</p>
    </section>
  );
}
