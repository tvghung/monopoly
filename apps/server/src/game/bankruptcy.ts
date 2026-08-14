import { gameCardsById, type GameState, type PendingTurnContinuation, type PlayerId } from '@monopoly/shared';
import {
  activeDebtClaim,
  settleAffordableClaims,
  type QueuePaymentOptions,
  sellPropertyToBankForPayment,
} from './payment';
import {
  bankruptActiveDebtor,
  progressPaymentQueue,
  sellablePropertyIds,
} from './paymentResolution';
import { checkWinner, removePlayerFromGame } from './turn';

const returnHeldCardsToDeck = (state: GameState, playerId: PlayerId): void => {
  const player = state.players[playerId];
  if (!player) return;
  for (const cardId of player.heldJailFreeCardIds) {
    const deck = gameCardsById[cardId]?.sourceDeck;
    if (deck && !state.privateState.decks[deck].drawPile.includes(cardId)) {
      state.privateState.decks[deck].drawPile.push(cardId);
    }
  }
  player.heldJailFreeCardIds = [];
};

const finishElimination = (state: GameState, playerId: PlayerId, reason: 'BANKRUPT' | 'LEFT'): void => {
  const player = state.players[playerId];
  if (!player) return;
  player.accountBalance = 0;
  returnHeldCardsToDeck(state, playerId);
  removePlayerFromGame(state, playerId, reason, { deferWinner: true });
  checkWinner(state);
};

export interface BankruptcyResult {
  changed: boolean;
  continuation: PendingTurnContinuation | null;
}

const noChange = (): BankruptcyResult => ({ changed: false, continuation: null });

/** Explicit leave/forfeit: settle an active payer before removing the seat. */
export const surrenderPlayerToBank = (
  state: GameState,
  playerId: PlayerId,
  options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs'> = {},
): BankruptcyResult => {
  const player = state.players[playerId];
  if (!player) return noChange();
  const active = activeDebtClaim(state);
  let continuation: PendingTurnContinuation | null = null;

  if (active?.debtorPlayerId === playerId && state.boardState.paymentQueue) {
    if (state.privateState.forcedSaleProposal?.sellerPlayerId === playerId) {
      state.privateState.forcedSaleProposal = null;
    }
    settleAffordableClaims(state, options);
    for (const tileID of sellablePropertyIds(state, playerId)) {
      const current = activeDebtClaim(state);
      const queue = state.boardState.paymentQueue;
      if (!current || !queue || current.debtorPlayerId !== playerId) break;
      const sale = sellPropertyToBankForPayment(
        state,
        playerId,
        queue.operationId,
        current.claimId,
        tileID,
        { ...options, allowExpired: true },
      );
      if (!sale.ok) continue;
      const progress = progressPaymentQueue(state, options);
      if (progress.status === 'COMPLETED') {
        continuation = progress.continuation;
        break;
      }
    }
    const remaining = activeDebtClaim(state);
    if (remaining?.debtorPlayerId === playerId && state.boardState.paymentQueue) {
      bankruptActiveDebtor(state, playerId, 'LEFT');
      const progress = progressPaymentQueue(state, options);
      continuation = progress.continuation;
    }
    if (state.players[playerId]) finishElimination(state, playerId, 'LEFT');
    return { changed: true, continuation };
  }

  finishElimination(state, playerId, 'LEFT');
  return { changed: true, continuation: null };
};
