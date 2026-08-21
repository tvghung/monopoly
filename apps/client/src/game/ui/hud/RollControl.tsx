import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import stateContext from '../../../internal';
import { localizeAckError } from '../../../presentation';
import { usePresentation } from '../../presentation/PresentationProvider';
import { areAllTokensSettled, canRollForState } from './rollControlLogic';

function hasDiceResult(dice: { dice1: number; dice2: number }): boolean {
  return dice.dice1 >= 1 && dice.dice1 <= 6 && dice.dice2 >= 1 && dice.dice2 <= 6;
}

export default function RollControl() {
  const {
    state, socketFunctions, playerId, canMutate, connected,
  } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const [pendingSequence, setPendingSequence] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPlayer = state.players[state.boardState.currentPlayer.id];
  const isMyTurn = state.boardState.currentPlayer.id === playerId;
  const turnLabel = isMyTurn
    ? 'Lượt của bạn'
    : currentPlayer?.name
      ? `${currentPlayer.name} đang chơi`
      : 'Đang chờ lượt chơi';
  const tokensSettled = areAllTokensSettled(state, presentationState);
  const canRoll = canRollForState(state, presentationState, {
    connected,
    canMutate,
    playerId,
    pendingRequest: pendingSequence !== null,
  });

  useEffect(() => {
    if (pendingSequence === null) return;
    const currentTurn = state.boardState.currentPlayer;
    const authoritativeRollArrived = state.boardState.rollSequence > pendingSequence;
    const turnMovedForward = currentTurn.id !== playerId
      || (currentTurn.id === playerId && currentTurn.hasMoved);
    if (authoritativeRollArrived || turnMovedForward) setPendingSequence(null);
  }, [pendingSequence, playerId, state.boardState.currentPlayer, state.boardState.rollSequence]);

  const handleRoll = useCallback(() => {
    if (!canRoll) return;
    const startingSequence = state.boardState.rollSequence;
    setPendingSequence(startingSequence);
    setError(null);
    void Promise.resolve(socketFunctions.rollDice())
      .then((response: Ack | undefined) => {
        if (response && !response.ok) {
          setPendingSequence(null);
          setError(localizeAckError(response.error));
        }
      })
      .catch(() => {
        setPendingSequence(null);
        setError('Không thể gửi lệnh đổ xúc xắc.');
      });
  }, [canRoll, socketFunctions, state.boardState.rollSequence]);

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
      <button
        className="game-board__roll-button"
        data-testid="roll-button"
        type="button"
        disabled={!canRoll}
        aria-busy={pendingSequence !== null}
        onClick={handleRoll}
      >
        {pendingSequence !== null ? 'Đang chờ máy chủ…' : 'Đổ Xúc Xắc'}
      </button>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {diceAnnouncement}
      </p>
      {error ? <p className="game-board__roll-error" role="alert">{error}</p> : null}
      {!tokensSettled && isMyTurn ? <p className="sr-only">Đang chờ quân cờ về đúng vị trí.</p> : null}
    </section>
  );
}
