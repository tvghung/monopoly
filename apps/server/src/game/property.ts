import {
  tileState,
  type GameState,
  type PlayerId,
} from '@monopoly/shared';
import { sendToLog } from './text';
import { recordPublicGameplayEvent } from './semanticEvents';

export const isPropertyLockedByLandingDecision = (state: GameState, tileID: number): boolean => (
  state.turnInfo.pendingDevelopmentDecision?.tileID === tileID
);

// Rent owed for landing on an owned street. Ownership of a colour group never
// changes the canonical base/tier rent.
export const streetRent = (state: GameState, tileIndex: number): number => {
  const owned = state.boardState.ownedProps[tileIndex];
  const tile = tileState[tileIndex];
  if (!owned) return 0;
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
  const refund = Math.floor(tile.houseCost / 2);
  player.accountBalance += refund;
  recordPublicGameplayEvent(state, {
    type: 'MONEY_TRANSFER',
    source: { kind: 'BANK' },
    destination: { kind: 'PLAYER', playerId },
    amount: refund,
    reason: 'PROPERTY_SALE',
  });
  sendToLog(state, `${player.name} đã bán một cấp công trình tại ${tile.streetName} với giá ${refund.toLocaleString('vi-VN')}.000 ₫.`);
  return true;
};

/** Fixed authoritative gross consideration for mandatory liquidation. */
export const forcedSaleGrossPrice = (tileID: number, houses: number): number => {
  const tile = tileState[tileID];
  const invested = tile?.tileType === 'normal' ? houses * (tile.houseCost ?? 0) : 0;
  return Math.floor(((tile?.price ?? 0) + invested) * 70 / 100);
};
