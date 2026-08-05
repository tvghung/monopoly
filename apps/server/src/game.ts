import {
  tileState,
  chestCards,
  chanceCards,
  type GameCard,
  type GameState,
  type DiceValue,
  type Die,
} from '@monopoly/shared';

const diceFaces: Record<number, Die> = {
  1: ['⚀', 1],
  2: ['⚁', 2],
  3: ['⚂', 3],
  4: ['⚃', 4],
  5: ['⚄', 5],
  6: ['⚅', 6],
};

const railRoadTiles = [5, 15, 25, 35];

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
  // A fresh turn always starts before the player has rolled.
  state.boardState.currentPlayer.hasMoved = false;
  state.turnInfo = {};
};

// Roll two dice server-side (the only source of truth for a roll).
export const rollDice = (): DiceValue => {
  const rollOne = (): Die => diceFaces[Math.floor(Math.random() * 6) + 1];
  return { dice1: rollOne(), dice2: rollOne() };
};

// Advance a player `steps` tiles forward, granting the pass-GO bonus on wrap.
export const movePlayer = (state: GameState, playerId: string, steps: number): void => {
  const player = state.players[playerId];
  if (!player) return;
  const from = player.currentTile;
  if (from + steps < 40) {
    player.currentTile = from + steps;
  } else {
    player.currentTile = from + steps - 40;
    player.accountBalance += 200;
    sendToLog(state, `${player.name} has passed start and recieved $200M`);
  }
};

// Resolve whatever tile a player has just landed on: pay rent, draw a card, go to
// jail, pay tax, or offer to buy an unowned property. Advances the turn itself for
// every outcome except an unowned buyable tile (which waits for buy / end turn).
export const resolveTile = (state: GameState, playerId: string, diceResult: number): void => {
  const player = state.players[playerId];
  if (!player) return;
  const { currentTile } = player;
  const playerName = player.name;
  const tile = tileState[currentTile];
  const rent = tile.rent ?? 0;

  switch (tile.tileType) {
    case 'normal':
      checkOwned(state, playerId, currentTile, () => {
        const currentTileOwner = state.boardState.ownedProps[currentTile].id;
        player.accountBalance -= rent;
        state.players[currentTileOwner].accountBalance += rent;
        sendToLog(state, `${playerName} have paid rent $${rent}M to ${state.players[currentTileOwner].name}`);
      });
      break;
    case 'expense':
      player.accountBalance -= rent;
      sendToLog(state, `${playerName} paid ${rent} in taxes.`);
      nextTurn(state);
      break;
    case 'railroad':
      checkOwned(state, playerId, currentTile, () => {
        const ownerId = state.boardState.ownedProps[currentTile].id;
        let ownedRailroads = 0;
        railRoadTiles.forEach((tileNumb) => {
          if (
            state.boardState.ownedProps[tileNumb]
            && state.boardState.ownedProps[tileNumb].id === ownerId
          ) {
            ownedRailroads += 1;
          }
        });
        const priceToPay = 25 * 2 ** (ownedRailroads - 1);
        player.accountBalance -= priceToPay;
        state.players[ownerId].accountBalance += priceToPay;
        if (ownedRailroads > 1) {
          sendToLog(state, `${playerName} have paid rent $${priceToPay}M for ${ownedRailroads} owned railroads to ${state.players[ownerId].name}`);
        } else {
          sendToLog(state, `${playerName} have paid rent $${priceToPay}M to ${state.players[ownerId].name}`);
        }
      });
      break;
    case 'gojail':
      player.isJail = true;
      player.jailRounds = 0;
      player.currentTile = 10;
      sendToLog(state, `${playerName} was sent to jail for tax fraud.`);
      nextTurn(state);
      break;
    case 'jail':
      sendToLog(state, `${playerName}, dont't worry! You're just visiting.`);
      nextTurn(state);
      break;
    case 'company':
      checkOwned(state, playerId, currentTile, () => {
        const ownerId = state.boardState.ownedProps[currentTile].id;
        let priceToPay = 0;
        if (
          state.boardState.ownedProps[12]
          && state.boardState.ownedProps[28]
          && state.boardState.ownedProps[12].id === ownerId
          && state.boardState.ownedProps[28].id === ownerId
        ) {
          priceToPay = diceResult * 10;
        } else {
          priceToPay = diceResult * 4;
        }
        player.accountBalance -= priceToPay;
        state.players[ownerId].accountBalance += priceToPay;
        sendToLog(state, `${playerName} have paid rent $${priceToPay}M to ${state.players[ownerId].name}`);
      });
      break;
    case 'chance':
    case 'chest': {
      const deck = tile.tileType === 'chance' ? chanceCards : chestCards;
      const card = deck[Math.floor(Math.random() * deck.length)];
      applyCard(state, playerId, card);
      nextTurn(state);
      break;
    }
    default:
      nextTurn(state);
      break;
  }
};

// Resolve a roll made from jail: escape on a double or after waiting two rounds,
// otherwise stay put. Either way the turn passes on.
export const handleJailRoll = (state: GameState, playerId: string, dice: DiceValue): void => {
  const player = state.players[playerId];
  if (!player) return;
  const { jailRounds, currentTile, name } = player;
  const diceResult = dice.dice1[1] + dice.dice2[1];
  state.boardState.diceValue = dice;

  if (jailRounds === 2) {
    player.currentTile = currentTile + diceResult;
    player.isJail = false;
    player.jailRounds = 0;
    sendToLog(state, `${name} waited patiently and got out of jail.`);
  } else if (dice.dice1[1] === dice.dice2[1]) {
    player.currentTile = currentTile + diceResult;
    player.isJail = false;
    player.jailRounds = 0;
    sendToLog(state, `${name} got lucky and escaped jail!`);
  } else {
    player.jailRounds += 1;
    sendToLog(state, `${name} has to stay in jail.`);
  }
  nextTurn(state);
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
