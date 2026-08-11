import type {
  FinishedPlayerReason,
  GameState,
  PlayerId,
} from '@monopoly/shared';
import { sendToLog } from './text';

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
      delete state.boardState.ownedProps[tileID];
    }
  });

  Object.keys(state.boardState.openMarket).forEach((tileKey) => {
    const tileID = Number(tileKey);
    if (state.boardState.openMarket[tileID]?.seller === playerId) {
      delete state.boardState.openMarket[tileID];
    }
  });

  const { auction } = state.boardState;
  if (auction) {
    auction.active = auction.active.filter((id) => id !== playerId);
    if (auction.highestBidder === playerId) {
      auction.highestBid = 0;
      auction.highestBidder = null;
      auction.highestBidderName = null;
      auction.passed = [];
    } else {
      auction.passed = auction.passed.filter((id) => id !== playerId);
    }
  }

  if (state.boardState.turnRecovery?.playerId === playerId) {
    state.boardState.turnRecovery = null;
  }
};

const removalMessage = (name: string, reason: FinishedPlayerReason): string => (
  reason === 'BANKRUPT'
    ? `${name} went bankrupt and can no longer play; their properties returned to the bank.`
    : `${name} left the game and forfeited their properties.`
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
    sendToLog(state, `<span class="bankrupt-message">${winner.name} wins the game!</span>`);
  }
};

// Permanently remove a player for an explicit forfeit. A current-player removal
// hands the turn to the next surviving player exactly once; removing anyone else
// leaves the current turn untouched.
export const removePlayerFromGame = (
  state: GameState,
  playerId: PlayerId,
  reason: FinishedPlayerReason = 'LEFT',
  options: { deferTurnHandoff?: boolean } = {},
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

  checkWinner(state);
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
  const bankrupt = previousOrder.filter((id) => state.players[id]?.accountBalance < 1);
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
  resetForFreshTurn(state);
};
