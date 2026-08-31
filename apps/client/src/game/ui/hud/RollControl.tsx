import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import { Dices } from 'lucide-react';
import stateContext from '../../../internal';
import { localizeAckError } from '../../../presentation';
import { usePresentation } from '../../presentation/PresentationProvider';
import { areAllTokensSettled, canRollForState, shouldShowRollButton } from './rollControlLogic';

function hasDiceResult(dice: { dice1: number; dice2: number }): boolean {
  return dice.dice1 >= 1 && dice.dice1 <= 6 && dice.dice2 >= 1 && dice.dice2 <= 6;
}

interface PendingRoll {
  sequence: number;
  resetEpoch: number;
}

export default function RollControl() {
  const {
    state, socketFunctions, playerId, canMutate, connected,
  } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const [pendingRoll, setPendingRoll] = useState<PendingRoll | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visualActivePlayerId = presentationState.displayActivePlayerId
    ?? state.boardState.currentPlayer.id;
  const visualCurrentPlayer = state.players[visualActivePlayerId];
  const isMyTurn = state.boardState.currentPlayer.id === playerId;
  const isMyVisualTurn = visualActivePlayerId === playerId;
  const turnLabel = isMyVisualTurn
    ? 'Lượt của bạn'
    : visualCurrentPlayer?.name
      ? `${visualCurrentPlayer.name} đang chơi`
      : 'Đang chờ lượt chơi';
  const tokensSettled = areAllTokensSettled(state, presentationState);
  const canRoll = canRollForState(state, presentationState, {
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
  );

  useEffect(() => {
    if (!pendingRoll) return;
    if (presentationState.presentationResetEpoch !== pendingRoll.resetEpoch) {
      setPendingRoll(null);
      setError(null);
      return;
    }
    const currentTurn = state.boardState.currentPlayer;
    const authoritativeRollArrived = state.boardState.rollSequence > pendingRoll.sequence;
    const turnMovedForward = currentTurn.id !== playerId
      || (currentTurn.id === playerId && currentTurn.hasMoved);
    if (authoritativeRollArrived || turnMovedForward) setPendingRoll(null);
  }, [pendingRoll, playerId, presentationState.presentationResetEpoch, state.boardState.currentPlayer, state.boardState.rollSequence]);

  useEffect(() => {
    setError(null);
  }, [presentationState.presentationResetEpoch]);

  useEffect(() => {
    if (!connected && pendingRoll) setPendingRoll(null);
  }, [connected, pendingRoll]);

  const handleRoll = useCallback(() => {
    if (!canRoll) return;
    const startingSequence = state.boardState.rollSequence;
    setPendingRoll({
      sequence: startingSequence,
      resetEpoch: presentationState.presentationResetEpoch,
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
  }, [canRoll, presentationState.presentationResetEpoch, socketFunctions, state.boardState.rollSequence]);

  const diceAnnouncement = useMemo(() => {
    if (presentationState.diceRoll) return 'Đang trình bày kết quả đổ xúc xắc.';
    const dice = presentationState.displayDice;
    return hasDiceResult(dice)
      ? `Kết quả đổ xúc xắc: ${dice.dice1} + ${dice.dice2} = ${dice.dice1 + dice.dice2}.`
      : 'Chưa có kết quả đổ xúc xắc.';
  }, [presentationState.diceRoll, presentationState.displayDice]);

  return (
    <section className="game-board__roll-controls" data-testid="roll-control" aria-label="Điều khiển lượt chơi">
      <p className="game-board__turn-label">{turnLabel}</p>
      {showRollButton
        ? (
          <button
            className="game-board__roll-button"
            data-testid="roll-button"
            type="button"
            disabled={!canRoll}
            aria-busy={pendingRoll !== null}
            onClick={handleRoll}
          >
            <Dices className="action-icon action-icon--major" aria-hidden="true" />
            {pendingRoll !== null ? 'Đang chờ…' : 'Chơi'}
          </button>
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
