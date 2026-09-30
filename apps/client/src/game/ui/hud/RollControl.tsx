import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import stateContext from '../../../internal';
import Button from '../../../design-system/components/Button/Button';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import { localizeAckError } from '../../../presentation';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';
import { areAllTokensSettled, canRollForState, shouldShowRollButton } from './rollControlLogic';
import { useRollShortcut } from './useRollShortcut';

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
});
type RollSlice = ReturnType<typeof selectRollSlice>;
const sameRollSlice = (previous: RollSlice, next: RollSlice) => previous.status === next.status
  && previous.settledPositions === next.settledPositions
  && previous.presentationResetEpoch === next.presentationResetEpoch
  && previous.diceRoll === next.diceRoll
  && previous.displayDice === next.displayDice;

/**
 * The roll permission and the one live announcement of the dice result. The permission still comes from the
 * authoritative state (`canRollForState`); only how the call to action looks and where it sits changed (it lives in
 * the center stage). The turn text moved to the status pill.
 */
export default function RollControl() {
  const {
    state, socketFunctions, playerId, canMutate, connected,
  } = useContext(stateContext);
  const rollSlice = usePresentationSelector(selectRollSlice, sameRollSlice);
  const [pendingRoll, setPendingRoll] = useState<PendingRoll | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
      return;
    }
    const currentTurn = state.boardState.currentPlayer;
    const authoritativeRollArrived = state.boardState.rollSequence > pendingRoll.sequence;
    const turnMovedForward = currentTurn.id !== playerId
      || (currentTurn.id === playerId && currentTurn.hasMoved);
    if (authoritativeRollArrived || turnMovedForward) setPendingRoll(null);
  }, [pendingRoll, playerId, rollSlice.presentationResetEpoch, state.boardState.currentPlayer, state.boardState.rollSequence]);

  useEffect(() => {
    setError(null);
  }, [rollSlice.presentationResetEpoch]);

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
    setError(null);
    void Promise.resolve(socketFunctions.rollDice())
      .then((response: Ack | undefined) => {
        if (response && !response.ok) {
          setPendingRoll(null);
          setError(localizeAckError(response.error));
        }
      })
      .catch(() => {
        setPendingRoll(null);
        setError('Không thể gửi lệnh đổ xúc xắc.');
      });
  }, [canRoll, rollSlice.presentationResetEpoch, socketFunctions, state.boardState.rollSequence]);

  useRollShortcut(showRollButton && canRoll, handleRoll);

  const diceAnnouncement = useMemo(() => {
    if (rollSlice.diceRoll) return 'Đang trình bày kết quả đổ xúc xắc.';
    return hasDiceResult(rollSlice.displayDice)
      ? `Kết quả đổ xúc xắc: ${rollSlice.displayDice.dice1} + ${rollSlice.displayDice.dice2} = ${rollSlice.displayDice.dice1 + rollSlice.displayDice.dice2}.`
      : 'Chưa có kết quả đổ xúc xắc.';
  }, [rollSlice.diceRoll, rollSlice.displayDice]);

  return (
    <section className="game-board__roll-controls" data-testid="roll-control" aria-label="Điều khiển lượt chơi">
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
            {pendingRoll !== null ? 'Đang đổ…' : 'Đổ xúc xắc'}
          </Button>
        )
        : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {diceAnnouncement}
      </p>
      {error ? <p className="game-board__roll-error" role="alert">{error}</p> : null}
      {!tokensSettled && isMyTurn ? <p className="sr-only">Đang chờ quân cờ về đúng vị trí.</p> : null}
    </section>
  );
}
