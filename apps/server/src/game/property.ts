import {
  tileState,
  colorGroups,
  type GameState,
  type PlayerId,
} from '@monopoly/shared';
import { sendToLog } from './text';

export const BANK_HOUSES = 32;
export const BANK_HOTELS = 12;

export const bankBuildingInventory = (state: GameState): {
  housesAvailable: number;
  hotelsAvailable: number;
} => {
  let housesOnBoard = 0;
  let hotelsOnBoard = 0;
  Object.values(state.boardState.ownedProps).forEach(({ houses }) => {
    if (houses === 5) hotelsOnBoard += 1;
    else housesOnBoard += houses;
  });
  const reservation = state.boardState.buildingContention?.buildingType
    ?? (state.boardState.auction?.kind === 'BUILDING'
      ? state.boardState.auction.buildingType
      : undefined);
  return {
    housesAvailable: Math.max(0, BANK_HOUSES - housesOnBoard - (reservation === 'HOUSE' ? 1 : 0)),
    hotelsAvailable: Math.max(0, BANK_HOTELS - hotelsOnBoard - (reservation === 'HOTEL' ? 1 : 0)),
  };
};

export const propertyGroupHasBuildings = (state: GameState, tileID: number): boolean => {
  const tile = tileState[tileID];
  const group = tile?.color ? colorGroups[tile.color] : undefined;
  if (!group) return Boolean(state.boardState.ownedProps[tileID]?.houses);
  return group.some((id) => (state.boardState.ownedProps[id]?.houses ?? 0) > 0);
};

export const requestedBuildingType = (state: GameState, tileID: number): 'HOUSE' | 'HOTEL' => (
  state.boardState.ownedProps[tileID]?.houses === 4 ? 'HOTEL' : 'HOUSE'
);

const invalidateGroupListings = (state: GameState, tileID: number): void => {
  const tile = tileState[tileID];
  const group = tile?.color ? colorGroups[tile.color] : undefined;
  for (const groupTileID of group ?? [tileID]) {
    delete state.boardState.openMarket[groupTileID];
  }
};

export const canBuildHouse = (
  state: GameState,
  playerId: PlayerId,
  tileID: number,
  options: { ignoreInventory?: boolean } = {},
): boolean => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || owned.id !== playerId) return false;
  if (tile?.tileType !== 'normal' || !tile.houseCost || !tile.rentTiers) return false;
  if (!ownsFullGroup(state, playerId, tile.color ?? '') || owned.houses >= 5) return false;
  const group = colorGroups[tile.color ?? ''] ?? [];
  if (group.some((id) => state.boardState.ownedProps[id]?.mortgaged)) return false;
  const minimum = Math.min(...group.map((id) => state.boardState.ownedProps[id]?.houses ?? 0));
  if (owned.houses !== minimum || player.accountBalance < tile.houseCost) return false;
  if (options.ignoreInventory) return true;
  const inventory = bankBuildingInventory(state);
  return owned.houses === 4 ? inventory.hotelsAvailable > 0 : inventory.housesAvailable > 0;
};

// True when `ownerId` owns every tile in a colour group (a monopoly).
export const ownsFullGroup = (state: GameState, ownerId: PlayerId, color: string): boolean => {
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
export const buildHouse = (state: GameState, playerId: PlayerId, tileID: number): boolean => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || !tile?.houseCost || !canBuildHouse(state, playerId, tileID)) return false;
  player.accountBalance -= tile.houseCost;
  owned.houses += 1;
  invalidateGroupListings(state, tileID);
  const label = owned.houses === 5 ? 'một Khách Sạn' : `Nhà thứ ${owned.houses}`;
  sendToLog(state, `${player.name} đã xây ${label} tại ${tile.streetName}.`);
  return true;
};

// Sell one house back to the bank for half its build cost, keeping the group even.
export const sellHouse = (state: GameState, playerId: PlayerId, tileID: number): boolean => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || owned.id !== playerId) return false;
  if (!tile.houseCost || owned.houses <= 0) return false;
  const group = colorGroups[tile.color ?? ''] ?? [];
  // Even selling: only remove from a tile currently at the group's maximum.
  const maxHouses = Math.max(...group.map((t) => state.boardState.ownedProps[t]?.houses ?? 0));
  if (owned.houses !== maxHouses) return false;
  // Voluntary hotel downgrade needs four physical houses from the Bank. Full
  // bankruptcy liquidation uses `liquidateBuildings` and never takes this path.
  if (owned.houses === 5 && bankBuildingInventory(state).housesAvailable < 4) return false;
  owned.houses -= 1;
  invalidateGroupListings(state, tileID);
  const refund = Math.floor(tile.houseCost / 2);
  player.accountBalance += refund;
  sendToLog(state, `${player.name} đã bán một cấp công trình tại ${tile.streetName} với giá ${refund.toLocaleString('vi-VN')}.000 ₫.`);
  return true;
};

// Mortgage a property for half its price. Only allowed with no houses on it.
export const mortgageProperty = (state: GameState, playerId: PlayerId, tileID: number): boolean => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || owned.id !== playerId) return false;
  if (owned.mortgaged || propertyGroupHasBuildings(state, tileID)) return false;
  const value = Math.floor((tile.price ?? 0) / 2);
  if (value <= 0) return false;
  owned.mortgaged = true;
  player.accountBalance += value;
  sendToLog(state, `${player.name} đã cầm cố ${tile.streetName} với giá ${value.toLocaleString('vi-VN')}.000 ₫.`);
  return true;
};

// Lift a mortgage for half the price plus 10% interest.
export const unmortgageProperty = (state: GameState, playerId: PlayerId, tileID: number): boolean => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || owned.id !== playerId) return false;
  if (!owned.mortgaged) return false;
  const cost = Math.ceil(((tile.price ?? 0) / 2) * 1.1);
  if (player.accountBalance < cost) {
    sendToLog(state, `${player.name} không đủ tiền chuộc ${tile.streetName}.`);
    return false;
  }
  owned.mortgaged = false;
  player.accountBalance -= cost;
  sendToLog(state, `${player.name} đã chuộc ${tile.streetName} với giá ${cost.toLocaleString('vi-VN')}.000 ₫.`);
  return true;
};

/**
 * Full bankruptcy/Bank surrender liquidation. Hotels return directly and do
 * not need four Bank houses; every level refunds half of the current build cost.
 */
export const liquidateBuildings = (state: GameState, playerId: PlayerId): number => {
  const player = state.players[playerId];
  if (!player) return 0;
  let refund = 0;
  const tileIds = Object.keys(state.boardState.ownedProps)
    .map(Number)
    .filter((tileID) => state.boardState.ownedProps[tileID]?.id === playerId)
    .sort((a, b) => a - b);
  for (const tileID of tileIds) {
    const property = state.boardState.ownedProps[tileID];
    const houseCost = tileState[tileID]?.houseCost ?? 0;
    if (!property || property.houses <= 0 || houseCost <= 0) continue;
    refund += property.houses * Math.floor(houseCost / 2);
    property.houses = 0;
  }
  player.accountBalance += refund;
  if (refund > 0) {
    sendToLog(state, `${player.name} đã thanh lý toàn bộ công trình và nhận ${refund.toLocaleString('vi-VN')}.000 ₫.`);
  }
  return refund;
};
