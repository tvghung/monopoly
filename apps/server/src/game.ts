import type { GameCard, GameState } from '@monopoly/shared';

// Current time (HH:MM:SS) for log lines.
export const date = (): string => new Date(Date.now()).toLocaleTimeString('en-GB', { hour12: false });

// Escape HTML so user-supplied text (chat) can't inject markup/scripts.
export const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

// Sanitise a player name: strip markup-significant characters, trim, cap length.
export const sanitizeName = (value: unknown): string => String(value ?? '')
  .replace(/[<>&"']/g, '')
  .trim()
  .slice(0, 20);

// Append a message to a room's game log.
export const sendToLog = (state: GameState, text: string): void => {
  state.boardState.logs = [...state.boardState.logs, `${date()} - ${text}`];
};

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
        `<span class="bancrupt-message">${state.players[e].name} went bancrupt and can no longer play the game, all his properties were put on sale again!</span>`,
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
  state.turnInfo = {};
};

// Apply the effects of a drawn Chance / Community Chest card to a player, then
// log the card's message. Turn advancement is handled by the caller.
export const applyCard = (state: GameState, playerId: string, card: GameCard): void => {
  const player = state.players[playerId];
  if (!player) return;

  if (card.reward) player.accountBalance += card.reward;
  if (card.penalty) player.accountBalance -= card.penalty;

  if (typeof card.collectFromEachPlayer === 'number') {
    const amount = card.collectFromEachPlayer;
    Object.keys(state.players).forEach((otherId) => {
      if (otherId === playerId) return;
      state.players[otherId].accountBalance -= amount;
      player.accountBalance += amount;
    });
  }

  if (typeof card.payEachPlayer === 'number') {
    const amount = card.payEachPlayer;
    Object.keys(state.players).forEach((otherId) => {
      if (otherId === playerId) return;
      state.players[otherId].accountBalance += amount;
      player.accountBalance -= amount;
    });
  }

  if (card.goToJail) {
    player.currentTile = 10;
    player.isJail = true;
    player.jailRounds = 0;
  } else if (typeof card.moveToTile === 'number') {
    // Money for advance cards is handled explicitly via `reward`, so no
    // automatic "pass GO" bonus is added here.
    player.currentTile = card.moveToTile;
  } else if (typeof card.moveBy === 'number') {
    player.currentTile = ((player.currentTile + card.moveBy) % 40 + 40) % 40;
  }

  sendToLog(state, `${player.name}: ${card.message}`);
};

// Decide what happens when a player lands on a property tile: offer to buy an
// unowned tile, run `payRent` on someone else's tile, or just pass the turn on
// when the player already owns it.
export const checkOwned = (
  state: GameState,
  playerId: string,
  currentTile: number,
  payRent: () => void,
): void => {
  if (!Object.prototype.hasOwnProperty.call(state.boardState.ownedProps, currentTile)) {
    state.turnInfo.canBuyProp = true;
  } else if (state.boardState.ownedProps[currentTile].id !== playerId) {
    payRent();
    nextTurn(state);
  } else {
    nextTurn(state);
  }
};
