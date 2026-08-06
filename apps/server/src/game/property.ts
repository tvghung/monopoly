import { tileState, colorGroups, type GameState } from '@monopoly/shared';
import { sendToLog } from './text';

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
