import {
  tileState,
  type GameState,
  type PlayerId,
} from '@monopoly/shared';
import { sendToLog } from './text';

export const isPropertyLockedByLandingDecision = (state: GameState, tileID: number): boolean => (
  state.turnInfo.pendingDevelopmentDecision?.tileID === tileID
);

// Rent owed for landing on an owned street: nothing if mortgaged, otherwise the
// canonical base/tier rent. Ownership of a colour group never changes it.
export const streetRent = (state: GameState, tileIndex: number): number => {
  const owned = state.boardState.ownedProps[tileIndex];
  const tile = tileState[tileIndex];
  if (!owned || owned.mortgaged) return 0;
  const base = tile.rent ?? 0;
  if (owned.houses > 0 && tile.rentTiers) return tile.rentTiers[owned.houses - 1];
  return base;
};

// Sell one development level back to the Bank for half its build cost.
export const sellHouse = (state: GameState, playerId: PlayerId, tileID: number): boolean => {
  const owned = state.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  const player = state.players[playerId];
  if (!player || !owned || owned.id !== playerId || isPropertyLockedByLandingDecision(state, tileID)) return false;
  if (!tile.houseCost || owned.houses <= 0) return false;
  owned.houses -= 1;
  delete state.boardState.openMarket[tileID];
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
  if (!player || !owned || owned.id !== playerId || isPropertyLockedByLandingDecision(state, tileID)) return false;
  if (owned.mortgaged || owned.houses > 0) return false;
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
  if (!player || !owned || owned.id !== playerId || isPropertyLockedByLandingDecision(state, tileID)) return false;
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

/** Fixed authoritative gross consideration for mandatory liquidation. */
export const forcedSaleGrossPrice = (tileID: number, houses: number): number => {
  const tile = tileState[tileID];
  const invested = tile?.tileType === 'normal' ? houses * (tile.houseCost ?? 0) : 0;
  return Math.floor(((tile?.price ?? 0) + invested) * 70 / 100);
};

/** Mortgage principal is exactly the amount advanced by the Bank originally. */
export const mortgagePrincipal = (tileID: number): number => (
  Math.floor((tileState[tileID]?.price ?? 0) / 2)
);

export const forcedSaleNetProceeds = (tileID: number, houses: number, mortgaged: boolean): number => (
  Math.max(0, forcedSaleGrossPrice(tileID, houses) - (mortgaged ? mortgagePrincipal(tileID) : 0))
);
