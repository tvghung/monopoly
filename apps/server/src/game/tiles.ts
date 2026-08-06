import {
  tileState,
  chestCards,
  chanceCards,
  type GameCard,
  type GameState,
  type DiceValue,
} from '@monopoly/shared';
import { sendToLog } from './text';
import { nextTurn } from './turn';
import { streetRent } from './property';

const railRoadTiles = [5, 15, 25, 35];

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

  if (card.getOutOfJailFree) {
    player.getOutOfJailCards += 1;
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
        const owned = state.boardState.ownedProps[currentTile];
        const currentTileOwner = owned.id;
        const rentDue = streetRent(state, currentTile);
        if (rentDue <= 0) {
          sendToLog(state, `${playerName} landed on ${tile.streetName} (mortgaged) — no rent due.`);
          return;
        }
        player.accountBalance -= rentDue;
        state.players[currentTileOwner].accountBalance += rentDue;
        sendToLog(state, `${playerName} have paid rent $${rentDue}M to ${state.players[currentTileOwner].name}`);
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
        if (state.boardState.ownedProps[currentTile].mortgaged) {
          sendToLog(state, `${playerName} landed on ${tile.streetName} (mortgaged) — no rent due.`);
          return;
        }
        let ownedRailroads = 0;
        railRoadTiles.forEach((tileNumb) => {
          if (
            state.boardState.ownedProps[tileNumb]
            && state.boardState.ownedProps[tileNumb].id === ownerId
            && !state.boardState.ownedProps[tileNumb].mortgaged
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
      sendToLog(state, `${playerName}, don't worry! You're just visiting.`);
      nextTurn(state);
      break;
    case 'company':
      checkOwned(state, playerId, currentTile, () => {
        const ownerId = state.boardState.ownedProps[currentTile].id;
        if (state.boardState.ownedProps[currentTile].mortgaged) {
          sendToLog(state, `${playerName} landed on ${tile.streetName} (mortgaged) — no rent due.`);
          return;
        }
        const ownsBothUtilities = Boolean(
          state.boardState.ownedProps[12]
          && state.boardState.ownedProps[28]
          && state.boardState.ownedProps[12].id === ownerId
          && state.boardState.ownedProps[28].id === ownerId,
        );
        const priceToPay = ownsBothUtilities ? diceResult * 10 : diceResult * 4;
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
