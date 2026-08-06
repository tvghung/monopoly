import type { GameState } from '@monopoly/shared';
import { sendToLog } from './text';

// Remove any player whose balance dropped below 1, releasing their properties
// and market listings. When `advanceTurn` is true, hand the turn on afterwards.
export const checkBalance = (state: GameState, advanceTurn?: boolean): void => {
  Object.keys(state.players).forEach((e) => {
    if (state.players[e].accountBalance < 1) {
      state.boardState.finishedPlayers[e] = {
        name: state.players[e].name,
        color: state.players[e].color,
      };
      sendToLog(
        state,
        `<span class="bankrupt-message">${state.players[e].name} went bankrupt and can no longer play the game, all his properties were put on sale again!</span>`,
      );
      delete state.players[e];
      if (e === state.boardState.currentPlayer.id) {
        const currentPlayer = state.boardState.currentPlayer.id;
        const indexOfCurrentPlayer = state.boardState.players.indexOf(currentPlayer);
        if (indexOfCurrentPlayer > 0) {
          state.boardState.currentPlayer.id = state.boardState.players[indexOfCurrentPlayer - 1];
        } else {
          const playersLength = state.boardState.players;
          state.boardState.currentPlayer.id = state.boardState.players[playersLength.length - 1];
        }
        const { hasMoved } = state.boardState.currentPlayer;
        if (hasMoved) state.boardState.currentPlayer.hasMoved = false;
      }
      state.boardState.players = Object.keys(state.players);
      if (advanceTurn) nextTurn(state);
      for (let i = 0; i < 40; i++) {
        if (state.boardState.ownedProps[i] && state.boardState.ownedProps[i].id === e) {
          delete state.boardState.ownedProps[i];
        }
        if (state.boardState.openMarket[i] && state.boardState.openMarket[i].seller === e) {
          delete state.boardState.openMarket[i];
        }
      }
    }
  });
  checkWinner(state);
};

// Declare a winner once only one player is left standing and at least one other
// has already gone bankrupt (so a solo game in progress is never "won").
export const checkWinner = (state: GameState): void => {
  if (state.boardState.winner) return;
  if (!state.boardState.gameStarted) return;
  const remaining = Object.keys(state.players);
  const someoneEliminated = Object.keys(state.boardState.finishedPlayers).length > 0;
  if (remaining.length === 1 && someoneEliminated) {
    const [id] = remaining;
    state.boardState.winner = { name: state.players[id].name, color: state.players[id].color };
    sendToLog(state, `<span class="bankrupt-message">${state.players[id].name} wins the game!</span>`);
  }
};

// Advance the turn to the next player (wrapping around).
export const nextTurn = (state: GameState): void => {
  // Remove any bankrupt players first.
  checkBalance(state);

  const numberOfPlayers = state.boardState.players.length;
  const currentPlayerIndex = state.boardState.players.indexOf(state.boardState.currentPlayer.id);
  if (currentPlayerIndex + 1 < numberOfPlayers) {
    state.boardState.currentPlayer.id = state.boardState.players[currentPlayerIndex + 1];
  } else {
    const firstPlayer = state.boardState.players[0];
    state.boardState.currentPlayer.id = firstPlayer;
  }
  // A fresh turn always starts before the player has rolled.
  state.boardState.currentPlayer.hasMoved = false;
  state.turnInfo = {};
};
