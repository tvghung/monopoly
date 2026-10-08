import { useContext } from 'react';
import stateContext from '../../../internal';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';
import { resolveDisplayedPlayer } from './displayedPlayer';
import JailPanel from '../../../components/dashboard/JailPanel';
import { NARROW_HUD_QUERY, useMediaQuery } from '../../../design-system/useMediaQuery';
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
 * The middle of the board. On your turn the roll call to action waits here; on somebody else's turn a quiet pill names
 * who is on the move. Both step aside while the dice are rolling or a card is on screen.
 *
 * In a narrow window (up to 720 px wide) the stage also carries the jail panel of a jailed player, under the roll button, so
 * the ways out of jail form one group that cannot overlap itself. There is still one `RollControl` and one `JailPanel` at a
 * time: wider windows keep the jail panel in the bottom dock's context stack (`BottomDock`).
 */
export default function CenterStage() {
  const { state, playerId } = useContext(stateContext);
  const { t } = useTranslation();
  const { displayActivePlayerId, hideStage } = usePresentationSelector(selectStageSlice, sameStageSlice);
  const narrow = useMediaQuery(NARROW_HUD_QUERY);
  const activePlayerId = displayActivePlayerId ?? state.boardState.currentPlayer.id;
  const opponent = activePlayerId !== playerId ? resolveDisplayedPlayer(state, activePlayerId) : undefined;
  const showOpponent = Boolean(opponent) && !hideStage && !state.boardState.winner && state.loaded;

  return (
    <div className="center-stage" data-hud-region="center-stage" data-stage-busy={hideStage ? 'true' : undefined}>
      <RollControl />
      {narrow ? <JailPanel /> : null}
      {showOpponent && opponent ? (
        <p className="center-stage__pill">
          <span aria-hidden="true">
            <PlayerAvatar characterId={opponent.characterId} colorId={opponent.color} size={32} />
          </span>
          {t('hud.opponentTurn', { name: opponent.name })}
        </p>
      ) : null}
    </div>
  );
}
