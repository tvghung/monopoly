import type {
  FinishedPlayerReason,
  GameState,
  PendingTurnContinuation,
  PlayerId,
} from '@monopoly/shared';
import { sendToLog } from './text';
import { transferProperty } from './transfer';

const orderedPlayerIds = (state: GameState): PlayerId[] => {
  const inTurnOrder = state.boardState.players.filter((id) => Boolean(state.players[id]));
  const known = new Set(inTurnOrder);
  const missing = Object.keys(state.players).filter((id) => !known.has(id));
  return [...inTurnOrder, ...missing];
};

const clearPlayerReferences = (state: GameState, playerId: PlayerId): void => {
  Object.keys(state.boardState.ownedProps).forEach((tileKey) => {
    const tileID = Number(tileKey);
    if (state.boardState.ownedProps[tileID]?.id === playerId) {
      transferProperty(state, tileID, playerId, null, 'RETURN_TO_BANK');
    }
  });

  Object.keys(state.boardState.openMarket).forEach((tileKey) => {
    const tileID = Number(tileKey);
    if (state.boardState.openMarket[tileID]?.seller === playerId) {
      delete state.boardState.openMarket[tileID];
    }
  });

  const proposal = state.privateState.forcedSaleProposal;
  if (proposal && (proposal.sellerPlayerId === playerId || proposal.buyerPlayerId === playerId)) {
    state.privateState.forcedSaleProposal = null;
  }

  if (state.boardState.turnRecovery?.playerId === playerId) {
    state.boardState.turnRecovery = null;
  }

  // A creditor who explicitly leaves surrenders the receivable to the Bank;
  // otherwise the queue would retain a PLAYER claim whose recipient vanished.
  const paymentQueue = state.boardState.paymentQueue;
  if (paymentQueue) {
    for (const claim of paymentQueue.orderedClaims) {
      if (claim.debtorPlayerId === playerId && claim.status === 'PENDING') {
        claim.status = 'BANKRUPT';
        claim.remainingAmount = 0;
      }
      if (claim.creditor === 'PLAYER' && claim.creditorPlayerId === playerId) {
        claim.creditor = 'BANK';
        delete claim.creditorPlayerId;
      }
    }
    while (
      paymentQueue.activeClaimIndex < paymentQueue.orderedClaims.length
      && paymentQueue.orderedClaims[paymentQueue.activeClaimIndex].status !== 'PENDING'
    ) {
      paymentQueue.activeClaimIndex += 1;
    }
  }
};

const removalMessage = (name: string, reason: FinishedPlayerReason): string => (
  reason === 'BANKRUPT'
    ? `${name} đã phá sản và rời khỏi ván chơi.`
    : `${name} đã rời ván và từ bỏ tài sản.`
);

const removePlayerRecord = (
  state: GameState,
  playerId: PlayerId,
  reason: FinishedPlayerReason,
): boolean => {
  const player = state.players[playerId];
  if (!player) return false;

  state.boardState.finishedPlayers[playerId] = {
    name: player.name,
    color: player.color,
    reason,
  };
  sendToLog(
    state,
    `<span class="bankrupt-message">${removalMessage(player.name, reason)}</span>`,
  );
  delete state.players[playerId];
  clearPlayerReferences(state, playerId);
  return true;
};

const successorAfter = (
  previousOrder: PlayerId[],
  removedPlayerId: PlayerId,
  remaining: Set<PlayerId>,
): PlayerId | undefined => {
  const removedIndex = previousOrder.indexOf(removedPlayerId);
  if (removedIndex < 0) return previousOrder.find((id) => remaining.has(id));

  for (let offset = 1; offset <= previousOrder.length; offset += 1) {
    const candidate = previousOrder[(removedIndex + offset) % previousOrder.length];
    if (remaining.has(candidate)) return candidate;
  }
  return undefined;
};

const resetForFreshTurn = (state: GameState): void => {
  state.boardState.currentPlayer.hasMoved = false;
  state.boardState.turnNumber += 1;
  state.boardState.turnRecovery = null;
  state.turnInfo = {};
};

// Declare a winner once only one player is left standing and at least one other
// player has already been eliminated. The guard makes both the state and win log
// idempotent when recovery or a repeated command checks the result again.
export const checkWinner = (state: GameState): void => {
  if (state.boardState.winner) return;
  if (!state.boardState.gameStarted) return;
  const remaining = Object.keys(state.players);
  const someoneEliminated = Object.keys(state.boardState.finishedPlayers).length > 0;
  if (remaining.length === 1 && someoneEliminated) {
    const [playerId] = remaining;
    const winner = state.players[playerId];
    state.boardState.winner = {
      playerId,
      name: winner.name,
      color: winner.color,
    };
    sendToLog(state, `<span class="bankrupt-message">${winner.name} đã chiến thắng!</span>`);
  }
};

// Permanently remove a player for an explicit forfeit. A current-player removal
// hands the turn to the next surviving player exactly once; removing anyone else
// leaves the current turn untouched.
export const removePlayerFromGame = (
  state: GameState,
  playerId: PlayerId,
  reason: FinishedPlayerReason = 'LEFT',
  options: { deferTurnHandoff?: boolean; deferWinner?: boolean } = {},
): boolean => {
  const previousOrder = orderedPlayerIds(state);
  const wasCurrent = state.boardState.currentPlayer.id === playerId;
  if (!removePlayerRecord(state, playerId, reason)) return false;

  state.boardState.players = orderedPlayerIds(state);
  const remaining = new Set(state.boardState.players);
  if (wasCurrent) {
    const successor = successorAfter(previousOrder, playerId, remaining);
    if (options.deferTurnHandoff && successor) {
      const successorIndex = state.boardState.players.indexOf(successor);
      state.boardState.players = [
        ...state.boardState.players.slice(successorIndex),
        ...state.boardState.players.slice(0, successorIndex),
      ];
      state.boardState.currentPlayer.id = '';
    } else {
      state.boardState.currentPlayer.id = successor ?? '';
    }
  }

  if (!options.deferWinner) checkWinner(state);
  if (wasCurrent) {
    state.boardState.turnRecovery = null;
    state.turnInfo = {};
    state.boardState.currentPlayer.hasMoved = false;
    if (
      !options.deferTurnHandoff
      && !state.boardState.winner
      && state.boardState.currentPlayer.id
    ) {
      resetForFreshTurn(state);
    }
  }
  return true;
};

// Remove every insolvent player as one deterministic batch. This deliberately
// does not call nextTurn while iterating: recursive removal used to revisit stale
// player ids and could throw when several players went bankrupt together.
export const checkBalance = (state: GameState, advanceTurn = false): void => {
  const previousOrder = orderedPlayerIds(state);
  // A zero balance is solvent. Compulsory payments that cannot be paid are
  // represented by PaymentQueue and require an explicit/recovered bankruptcy.
  const bankrupt = previousOrder.filter((id) => state.players[id]?.accountBalance < 0);
  if (bankrupt.length === 0) {
    checkWinner(state);
    return;
  }

  const previousCurrent = state.boardState.currentPlayer.id;
  bankrupt.forEach((playerId) => removePlayerRecord(state, playerId, 'BANKRUPT'));
  state.boardState.players = orderedPlayerIds(state);

  const remaining = new Set(state.boardState.players);
  const currentWasRemoved = bankrupt.includes(previousCurrent);
  if (currentWasRemoved) {
    const successor = successorAfter(previousOrder, previousCurrent, remaining);
    state.boardState.currentPlayer.id = successor ?? '';
  }

  checkWinner(state);
  if (state.boardState.winner || state.boardState.players.length === 0) {
    state.boardState.turnRecovery = null;
    state.turnInfo = {};
    state.boardState.currentPlayer.hasMoved = false;
    return;
  }

  if (currentWasRemoved) {
    resetForFreshTurn(state);
    return;
  }

  if (advanceTurn) nextTurn(state);
};

// Advance the turn to the next player (wrapping around). If balance cleanup has
// already removed the current player, that cleanup performs the handoff and this
// function must not skip a second player.
export const nextTurn = (state: GameState): void => {
  const previousCurrent = state.boardState.currentPlayer.id;
  checkBalance(state);

  state.boardState.turnRecovery = null;
  state.turnInfo = {};
  if (state.boardState.winner || state.boardState.players.length === 0) {
    state.boardState.currentPlayer.hasMoved = false;
    return;
  }

  if (previousCurrent && !state.players[previousCurrent]) {
    return;
  }

  const playerIds = orderedPlayerIds(state);
  state.boardState.players = playerIds;
  const currentIndex = playerIds.indexOf(state.boardState.currentPlayer.id);
  state.boardState.currentPlayer.id = currentIndex < 0
    ? playerIds[0]
    : playerIds[(currentIndex + 1) % playerIds.length];
  const selected = state.players[state.boardState.currentPlayer.id];
  if (selected?.isJail) {
    const elapsed = selected.jailOpponentRoundsElapsed;
    selected.jailOpponentRoundsElapsed = Math.min(2, elapsed + 1);
    if (selected.jailOpponentRoundsElapsed >= 2) {
      selected.isJail = false;
      selected.jailOpponentRoundsElapsed = 0;
      sendToLog(state, `${selected.name} đã tự động ra tù sau hai vòng đối thủ.`);
    }
  }
  resetForFreshTurn(state);
};

export type TurnResolutionOutcome = 'ADVANCE_TURN';

export const continuationForRoll = (
  state: GameState,
  playerId: PlayerId,
  options: Pick<PendingTurnContinuation, 'resume'> = {},
): PendingTurnContinuation => {
  return {
    playerId,
    turnNumber: state.boardState.turnNumber,
    ...options,
  };
};

/**
 * The single turn-completion gateway. Callers resolve their entire synchronous
 * tile/card/payment flow first, and invoke this only after every external wait
 * (purchase, development or payment shortfall) has also completed.
 */
export const completeTurnResolution = (
  state: GameState,
  continuation: PendingTurnContinuation,
): TurnResolutionOutcome | null => {
  if (
    state.boardState.winner
    || state.boardState.paymentQueue
    || state.turnInfo.pendingPropertyDecision
    || state.turnInfo.pendingDevelopmentDecision
  ) {
    return null;
  }
  if (continuation.resume?.kind === 'NO_TURN_CHANGE') return null;
  if (
    state.boardState.currentPlayer.id !== continuation.playerId
    || state.boardState.turnNumber !== continuation.turnNumber
    || !state.players[continuation.playerId]
  ) {
    return null;
  }

  nextTurn(state);
  return 'ADVANCE_TURN';
};
