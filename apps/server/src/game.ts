import {
  tileState,
  colorGroups,
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
    sendToLog(state, `<span class="bancrupt-message">${state.players[id].name} wins the game!</span>`);
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
      sendToLog(state, `${playerName}, dont't worry! You're just visiting.`);
      nextTurn(state);
      break;
    case 'company':
      checkOwned(state, playerId, currentTile, () => {
        const ownerId = state.boardState.ownedProps[currentTile].id;
        if (state.boardState.ownedProps[currentTile].mortgaged) {
          sendToLog(state, `${playerName} landed on ${tile.streetName} (mortgaged) — no rent due.`);
          return;
        }
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

// True when `ownerId` owns every tile in a colour group (a monopoly).
export const ownsFullGroup = (state: GameState, ownerId: string, color: string): boolean => {
  const group = colorGroups[color];
  if (!group) return false;
  return group.every((tileIndex) => state.boardState.ownedProps[tileIndex]?.id === ownerId);
};

// Rent owed for landing on an owned street: nothing if mortgaged, the house-tier
// rent when built up, double the base rent for an unbuilt monopoly, else base.
export const streetRent = (state: GameState, tileIndex: number): number => {
  const owned = state.boardState.ownedProps[tileIndex];
  const tile = tileState[tileIndex];
  if (!owned || owned.mortgaged) return 0;
  const base = tile.rent ?? 0;
  if (owned.houses > 0 && tile.rentTiers) return tile.rentTiers[owned.houses - 1];
  if (ownsFullGroup(state, owned.id, tile.color ?? '')) return base * 2;
  return base;
};

// Build one house (or a hotel at level 5) on a monopolised street, respecting the
// even-building rule and available funds.
export const buildHouse = (state: GameState, playerId: string, tileID: number): void => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || owned.id !== playerId) return;
  if (tile.tileType !== 'normal' || !tile.houseCost || !tile.rentTiers) return;
  if (!ownsFullGroup(state, playerId, tile.color ?? '')) return;
  if (owned.houses >= 5) return;
  const group = colorGroups[tile.color ?? ''] ?? [];
  // Can't build while any tile in the group is mortgaged.
  if (group.some((t) => state.boardState.ownedProps[t]?.mortgaged)) return;
  // Even building: only add to a tile currently at the group's minimum.
  const minHouses = Math.min(...group.map((t) => state.boardState.ownedProps[t]?.houses ?? 0));
  if (owned.houses !== minHouses) return;
  if (player.accountBalance < tile.houseCost) {
    sendToLog(state, `${player.name} can't afford to build on ${tile.streetName}.`);
    return;
  }
  player.accountBalance -= tile.houseCost;
  owned.houses += 1;
  const label = owned.houses === 5 ? 'a hotel' : `house #${owned.houses}`;
  sendToLog(state, `${player.name} built ${label} on ${tile.streetName}.`);
};

// Sell one house back to the bank for half its build cost, keeping the group even.
export const sellHouse = (state: GameState, playerId: string, tileID: number): void => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || owned.id !== playerId) return;
  if (!tile.houseCost || owned.houses <= 0) return;
  const group = colorGroups[tile.color ?? ''] ?? [];
  // Even selling: only remove from a tile currently at the group's maximum.
  const maxHouses = Math.max(...group.map((t) => state.boardState.ownedProps[t]?.houses ?? 0));
  if (owned.houses !== maxHouses) return;
  owned.houses -= 1;
  const refund = Math.floor(tile.houseCost / 2);
  player.accountBalance += refund;
  sendToLog(state, `${player.name} sold a house on ${tile.streetName} for $${refund}M.`);
};

// Mortgage a property for half its price. Only allowed with no houses on it.
export const mortgageProperty = (state: GameState, playerId: string, tileID: number): void => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || owned.id !== playerId) return;
  if (owned.mortgaged || owned.houses > 0) return;
  const value = Math.floor((tile.price ?? 0) / 2);
  if (value <= 0) return;
  owned.mortgaged = true;
  player.accountBalance += value;
  sendToLog(state, `${player.name} mortgaged ${tile.streetName} for $${value}M.`);
};

// Lift a mortgage for half the price plus 10% interest.
export const unmortgageProperty = (state: GameState, playerId: string, tileID: number): void => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || owned.id !== playerId) return;
  if (!owned.mortgaged) return;
  const cost = Math.ceil(((tile.price ?? 0) / 2) * 1.1);
  if (player.accountBalance < cost) {
    sendToLog(state, `${player.name} can't afford to lift the mortgage on ${tile.streetName}.`);
    return;
  }
  owned.mortgaged = false;
  player.accountBalance -= cost;
  sendToLog(state, `${player.name} lifted the mortgage on ${tile.streetName} for $${cost}M.`);
};

// Start an auction for the tile the current player declined to buy.
export const startAuction = (state: GameState, tileID: number): void => {
  const tile = tileState[tileID];
  state.turnInfo.canBuyProp = false;
  state.boardState.auction = {
    tileID,
    tileName: tile.streetName,
    price: tile.price ?? 0,
    highestBid: 0,
    highestBidder: null,
    highestBidderName: null,
    active: Object.keys(state.players),
    timer: 15,
  };
  sendToLog(state, `Auction started for ${tile.streetName}!`);
};

// Award the auctioned tile to the highest bidder (if any) and pass the turn on.
export const finalizeAuction = (state: GameState): void => {
  const auction = state.boardState.auction;
  if (!auction) return;
  if (auction.highestBidder && auction.highestBid > 0 && state.players[auction.highestBidder]) {
    const winner = state.players[auction.highestBidder];
    winner.accountBalance -= auction.highestBid;
    state.boardState.ownedProps[auction.tileID] = {
      id: auction.highestBidder,
      color: winner.color,
      houses: 0,
      mortgaged: false,
    };
    sendToLog(state, `${auction.highestBidderName} won the auction for ${auction.tileName} at $${auction.highestBid}M.`);
  } else {
    sendToLog(state, `No bids for ${auction.tileName}; it stays unowned.`);
  }
  state.boardState.auction = null;
  nextTurn(state);
};
