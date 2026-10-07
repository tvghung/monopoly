import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import stateContext from '../../../internal';
import Button from '../../../design-system/components/Button/Button';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';
import { resolveDisplayedPlayer } from './displayedPlayer';
import { areAllTokensSettled, canRollForState, shouldShowRollButton } from './rollControlLogic';
import { useRollShortcut } from './useRollShortcut';
import { useTurnAnnouncement } from './useTurnAnnouncement';
import { useTranslation } from '../../../i18n/I18n';
import { useLocalizedError } from '../../../i18n/useLocalizedError';

function hasDiceResult(dice: { dice1: number; dice2: number }): boolean {
  return dice.dice1 >= 1 && dice.dice1 <= 6 && dice.dice2 >= 1 && dice.dice2 <= 6;
}

interface PendingRoll {
  sequence: number;
  resetEpoch: number;
}

/** The presentation fields the roll gate and the dice announcement read. */
const selectRollSlice = (state: PresentationState) => ({
  status: state.status,
  settledPositions: state.settledPositions,
  presentationResetEpoch: state.presentationResetEpoch,
  diceRoll: state.diceRoll,
  displayDice: state.displayDice,
  displayActivePlayerId: state.displayActivePlayerId,
});
type RollSlice = ReturnType<typeof selectRollSlice>;
const sameRollSlice = (previous: RollSlice, next: RollSlice) => previous.status === next.status
  && previous.settledPositions === next.settledPositions
  && previous.presentationResetEpoch === next.presentationResetEpoch
  && previous.diceRoll === next.diceRoll
  && previous.displayDice === next.displayDice
  && previous.displayActivePlayerId === next.displayActivePlayerId;

/**
 * The roll permission and the one live announcement of the turn change and the dice result. The permission still
 * comes from the authoritative state (`canRollForState`); only how the call to action looks and where it sits changed
 * (it lives in the center stage). The turn text is shown in the status pill and spoken here.
 */
export default function RollControl() {
  const { language, t } = useTranslation();
  const {
    state, socketFunctions, playerId, canMutate, connected,
  } = useContext(stateContext);
  const rollSlice = usePresentationSelector(selectRollSlice, sameRollSlice);
  const [pendingRoll, setPendingRoll] = useState<PendingRoll | null>(null);
  const { error, clearError, setErrorKey, setAckError } = useLocalizedError();

  const isMyTurn = state.boardState.currentPlayer.id === playerId;
  const tokensSettled = areAllTokensSettled(state, rollSlice);
  const canRoll = canRollForState(state, rollSlice, {
    connected,
    canMutate,
    playerId,
    pendingRequest: pendingRoll !== null,
  });
  const showRollButton = shouldShowRollButton(
    state.boardState.currentPlayer.id,
    playerId,
    canRoll,
    pendingRoll !== null,
  ) && rollSlice.diceRoll === null;

  useEffect(() => {
    if (!pendingRoll) return;
    if (rollSlice.presentationResetEpoch !== pendingRoll.resetEpoch) {
      setPendingRoll(null);
      clearError();
      return;
    }
    const currentTurn = state.boardState.currentPlayer;
    const authoritativeRollArrived = state.boardState.rollSequence > pendingRoll.sequence;
    const turnMovedForward = currentTurn.id !== playerId
      || (currentTurn.id === playerId && currentTurn.hasMoved);
    if (authoritativeRollArrived || turnMovedForward) setPendingRoll(null);
  }, [clearError, pendingRoll, playerId, rollSlice.presentationResetEpoch, state.boardState.currentPlayer, state.boardState.rollSequence]);

  useEffect(() => {
    clearError();
  }, [clearError, rollSlice.presentationResetEpoch]);

  useEffect(() => {
    if (!connected && pendingRoll) setPendingRoll(null);
  }, [connected, pendingRoll]);

  const handleRoll = useCallback(() => {
    if (!canRoll) return;
    const startingSequence = state.boardState.rollSequence;
    setPendingRoll({
      sequence: startingSequence,
      resetEpoch: rollSlice.presentationResetEpoch,
    });
    clearError();
    void Promise.resolve(socketFunctions.rollDice())
      .then((response: Ack | undefined) => {
        if (response && !response.ok) {
          setPendingRoll(null);
          setAckError(response.error);
        }
      })
      .catch(() => {
        setPendingRoll(null);
        setErrorKey('hud.rollFailed');
      });
  }, [canRoll, clearError, rollSlice.presentationResetEpoch, setAckError, setErrorKey, socketFunctions, state.boardState.rollSequence]);

  useRollShortcut(showRollButton && canRoll, handleRoll);

  const turnAnnouncement = useTurnAnnouncement(
    rollSlice.displayActivePlayerId,
    rollSlice.displayActivePlayerId ? resolveDisplayedPlayer(state, rollSlice.displayActivePlayerId)?.name : undefined,
    playerId ?? null,
    rollSlice.presentationResetEpoch,
    language,
  );

  const diceAnnouncement = useMemo(() => {
    if (rollSlice.diceRoll) return t('hud.rollPresenting');
    return hasDiceResult(rollSlice.displayDice)
      ? t('hud.rollResult', { first: rollSlice.displayDice.dice1, second: rollSlice.displayDice.dice2, total: rollSlice.displayDice.dice1 + rollSlice.displayDice.dice2 })
      : t('hud.noRollResult');
  }, [rollSlice.diceRoll, rollSlice.displayDice, t]);

  return (
    <section className="game-board__roll-controls" data-testid="roll-control" aria-label={t('hud.rollControl')}>
      {showRollButton
        ? (
          <Button
            className="game-board__roll-button"
            data-testid="roll-button"
            size="xl"
            busy={pendingRoll !== null}
            disabled={!canRoll}
            aria-keyshortcuts="Space"
            icon={<ActionIcon name="roll" />}
            onClick={handleRoll}
          >
            {pendingRoll !== null ? t('hud.rolling') : t('hud.roll')}
          </Button>
        )
        : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {turnAnnouncement ? `${turnAnnouncement} ${diceAnnouncement}` : diceAnnouncement}
      </p>
      {error ? <p className="game-board__roll-error" role="alert">{error}</p> : null}
        {!tokensSettled && isMyTurn ? <p className="sr-only">{t('hud.tokensSettling')}</p> : null}
    </section>
  );
}
