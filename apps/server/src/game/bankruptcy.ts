import { gameCardsById, type GameState, type PendingTurnContinuation, type PlayerId } from '@monopoly/shared';
import {
  activeDebtClaim,
  settleAffordableClaims,
  type QueuePaymentOptions,
  sellPropertyToBankForPayment,
} from './payment';
import { removePlayerFromGame, checkWinner } from './turn';

const ownedTileIds = (state: GameState, playerId: PlayerId): number[] => (
  Object.keys(state.boardState.ownedProps)
    .map(Number)
    .filter(tileID => state.boardState.ownedProps[tileID]?.id === playerId)
    .sort((a, b) => a - b)
);

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

export interface BankruptcyResult {
  changed: boolean;
  continuation: PendingTurnContinuation | null;
  /** v2 compatibility flag; v3 is always false because auctions are gone. */
  bankAuctionQueued: false;
}

const noChange = (): BankruptcyResult => ({ changed: false, continuation: null, bankAuctionQueued: false });

const finishElimination = (state: GameState, playerId: PlayerId, reason: 'BANKRUPT' | 'LEFT'): void => {
  const player = state.players[playerId];
  if (!player) return;
  player.accountBalance = 0;
  returnHeldCardsToDeck(state, playerId);
  state.privateState.forcedSaleProposal = null;
  removePlayerFromGame(state, playerId, reason, { deferWinner: true });
  checkWinner(state);
};

const rebasePaymentContinuationAfterRemoval = (state: GameState): void => {
  const queue = state.boardState.paymentQueue;
  if (!queue || state.players[queue.continuation.playerId]) return;
  const successorId = state.boardState.currentPlayer.id;
  if (!successorId || !state.players[successorId]) return;
  queue.continuation = {
    playerId: successorId,
    turnNumber: state.boardState.turnNumber,
    resume: { kind: 'NO_TURN_CHANGE' },
  };
};

/**
 * Close every queued claim owned by a debtor who has no remaining property,
 * remove that player, then continue the ordered queue. Claims for the removed
 * debtor may appear again later in a multi-claim card payment, so they are
 * marked terminal before the next claim is settled.
 */
export const bankruptActiveDebtor = (
  state: GameState,
  debtorPlayerId: PlayerId,
  reason: 'BANKRUPT' | 'LEFT' = 'BANKRUPT',
  options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs'> = {},
): PendingTurnContinuation | null => {
  const queue = state.boardState.paymentQueue;
  const active = activeDebtClaim(state);
  if (!queue || !active || active.debtorPlayerId !== debtorPlayerId || !state.players[debtorPlayerId]) {
    return null;
  }
  for (let index = queue.activeClaimIndex; index < queue.orderedClaims.length; index += 1) {
    const claim = queue.orderedClaims[index];
    if (claim.debtorPlayerId === debtorPlayerId) {
      claim.status = 'BANKRUPT';
      claim.remainingAmount = 0;
    }
  }
  while (
    queue.activeClaimIndex < queue.orderedClaims.length
    && queue.orderedClaims[queue.activeClaimIndex].status !== 'PENDING'
  ) {
    queue.activeClaimIndex += 1;
  }
  state.privateState.forcedSaleProposal = null;
  finishElimination(state, debtorPlayerId, reason);
  rebasePaymentContinuationAfterRemoval(state);
  return settleAffordableClaims(state, options);
};

/** Bankruptcy can only be reached after the active claim has exhausted all assets. */
export const declareActiveDebtBankruptcy = (
  state: GameState,
  debtorPlayerId: PlayerId,
  _options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs'> = {},
): BankruptcyResult => {
  const queue = state.boardState.paymentQueue;
  const claim = activeDebtClaim(state);
  const debtor = state.players[debtorPlayerId];
  if (!queue || !claim || claim.debtorPlayerId !== debtorPlayerId || !debtor) return noChange();
  settleAffordableClaims(state, _options);
  const afterCash = activeDebtClaim(state);
  if (!afterCash || afterCash.debtorPlayerId !== debtorPlayerId) return noChange();
  if (debtor.accountBalance >= afterCash.remainingAmount || ownedTileIds(state, debtorPlayerId).length > 0) {
    return noChange();
  }
  const continuation = bankruptActiveDebtor(state, debtorPlayerId, 'BANKRUPT', _options);
  return { changed: true, continuation, bankAuctionQueued: false };
};

/** Explicit leave: active payer is auto-liquidated first; others return assets. */
export const surrenderPlayerToBank = (
  state: GameState,
  playerId: PlayerId,
  options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs'> = {},
): BankruptcyResult => {
  const player = state.players[playerId];
  if (!player) return noChange();
  const active = activeDebtClaim(state);
  if (active?.debtorPlayerId === playerId && state.boardState.paymentQueue) {
    // Leaving cancels any outstanding bilateral forced-sale proposal before
    // the deterministic Bank liquidation below; the departing player cannot
    // leave a proposal blocking creditor settlement.
    if (state.privateState.forcedSaleProposal?.sellerPlayerId === playerId) {
      state.privateState.forcedSaleProposal = null;
    }
    settleAffordableClaims(state, options);
    let current = activeDebtClaim(state);
    let continuation: PendingTurnContinuation | null = null;
    for (const tileID of ownedTileIds(state, playerId)) {
      if (!current || current.debtorPlayerId !== playerId || !state.boardState.paymentQueue) break;
      const soldContinuation = sellPropertyToBankForPayment(
        state,
        playerId,
        state.boardState.paymentQueue?.operationId ?? '',
        current.claimId,
        tileID,
        options,
      );
      if (soldContinuation) {
        // The active payer has settled all claims; continue with leave cleanup.
        continuation = soldContinuation;
        break;
      }
      current = activeDebtClaim(state);
      if (!current || current.debtorPlayerId !== playerId) break;
    }
    const remaining = activeDebtClaim(state);
    if (remaining?.debtorPlayerId === playerId && state.boardState.paymentQueue) {
      continuation = bankruptActiveDebtor(state, playerId, 'LEFT', options);
    } else if (remaining) {
      continuation = null;
    }
    finishElimination(state, playerId, 'LEFT');
    rebasePaymentContinuationAfterRemoval(state);
    return { changed: true, continuation, bankAuctionQueued: false };
  }
  finishElimination(state, playerId, 'LEFT');
  rebasePaymentContinuationAfterRemoval(state);
  return { changed: true, continuation: null, bankAuctionQueued: false };
};
