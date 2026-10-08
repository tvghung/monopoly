import { useContext } from 'react';
import stateContext from '../../../internal';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';
import { resolveDisplayedPlayer } from './displayedPlayer';
import JailPanel from '../../../components/dashboard/JailPanel';
import RollControl from './RollControl';
import { useTranslation } from '../../../i18n/I18n';

const selectStageSlice = (state: PresentationState) => ({
  displayActivePlayerId: state.displayActivePlayerId,
  hideStage: state.diceRoll !== null || state.cardPresentation !== null,
});
type StageSlice = ReturnType<typeof selectStageSlice>;
const sameStageSlice = (previous: StageSlice, next: StageSlice) => previous.displayActivePlayerId === next.displayActivePlayerId
  && previous.hideStage === next.hideStage;

/**
 * The middle of the board, and the one place that says whose turn it is. On your turn the roll call to action waits here; on
 * somebody else's turn a quiet pill names who is on the move. Both step aside while the dice are rolling or a card is on screen.
 *
 * A jailed player's ways out live here too, at every window size: the jail panel sits right under the roll button, so the
 * group is one column that cannot overlap itself. There is one `RollControl` and one `JailPanel`, always mounted in the same place.
 */
export default function CenterStage() {
  const { state, playerId } = useContext(stateContext);
  const { t } = useTranslation();
  const { displayActivePlayerId, hideStage } = usePresentationSelector(selectStageSlice, sameStageSlice);
  const activePlayerId = displayActivePlayerId ?? state.boardState.currentPlayer.id;
  const opponent = activePlayerId !== playerId ? resolveDisplayedPlayer(state, activePlayerId) : undefined;
  const showOpponent = Boolean(opponent) && !hideStage && !state.boardState.winner && state.loaded;

  return (
    <div className="center-stage" data-hud-region="center-stage" data-stage-busy={hideStage ? 'true' : undefined}>
      <RollControl />
      <JailPanel />
      {showOpponent && opponent ? (
        <p className="center-stage__pill">
          <span className="center-stage__pill-avatar" aria-hidden="true">
            <PlayerAvatar characterId={opponent.characterId} colorId={opponent.color} size={32} />
          </span>
          <span className="center-stage__pill-text">{t('hud.opponentTurn', { name: opponent.name })}</span>
        </p>
      ) : null}
    </div>
  );
}
