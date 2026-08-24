import {
  gameCardsById,
  type FinishedPlayerReason,
  type GameState,
  type PendingTurnContinuation,
  type PlayerId,
} from '@monopoly/shared';
import {
  activeDebtClaim,
  refreshDebtDeadline,
  settleAffordableClaims,
  type QueuePaymentOptions,
} from './payment';
import { checkWinner, removePlayerFromGame } from './turn';

export type PaymentProgressStatus = 'COMPLETED' | 'WAITING_FOR_LIQUIDATION';

export interface PaymentProgressResult {
  status: PaymentProgressStatus;
  continuation: PendingTurnContinuation | null;
  changed: boolean;
  debtorPlayerId: PlayerId | null;
}

const ownedTileIds = (state: GameState, playerId: PlayerId): number[] => (
  Object.keys(state.boardState.ownedProps)
    .map(Number)
    .filter((tileID) => state.boardState.ownedProps[tileID]?.id === playerId)
    .sort((left, right) => left - right)
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

const finishElimination = (state: GameState, playerId: PlayerId, reason: FinishedPlayerReason): void => {
  const player = state.players[playerId];
  if (!player) return;
  returnHeldCardsToDeck(state, playerId);
  removePlayerFromGame(state, playerId, reason, { deferWinner: true });
  checkWinner(state);
};

export const bankruptActiveDebtor = (
  state: GameState,
  debtorPlayerId: PlayerId,
  reason: 'BANKRUPT' | 'LEFT' = 'BANKRUPT',
): boolean => {
  const queue = state.boardState.paymentQueue;
  const active = activeDebtClaim(state);
  if (!queue || !active || active.debtorPlayerId !== debtorPlayerId || !state.players[debtorPlayerId]) {
    return false;
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
  finishElimination(state, debtorPlayerId, reason);
  return true;
};

const completed = (
  continuation: PendingTurnContinuation | null,
  changed: boolean,
): PaymentProgressResult => ({
  status: 'COMPLETED',
  continuation,
  changed,
  debtorPlayerId: null,
});

/**
 * The one authoritative payment progression loop. It applies available cash,
 * waits only when the active debtor still owns a sellable property, and
 * eliminates a debtor immediately once no sellable property remains.
 */
export const progressPaymentQueue = (
  state: GameState,
  options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs'> = {},
): PaymentProgressResult => {
  let changed = false;
  while (state.boardState.paymentQueue) {
    const queue = state.boardState.paymentQueue;
    const claim = activeDebtClaim(state);
    if (!claim) {
      const continuation = queue.continuation;
      state.boardState.paymentQueue = null;
      return completed(continuation, true);
    }

    const debtor = state.players[claim.debtorPlayerId];
    if (!debtor) {
      claim.status = 'BANKRUPT';
      claim.remainingAmount = 0;
      queue.activeClaimIndex += 1;
      changed = true;
      continue;
    }

    const beforeIndex = queue.activeClaimIndex;
    const continuation = settleAffordableClaims(state, options);
    changed ||= queue.activeClaimIndex !== beforeIndex || continuation !== null;
    if (!state.boardState.paymentQueue) return completed(continuation, true);

    const active = activeDebtClaim(state);
    if (!active) continue;
    const activeDebtor = state.players[active.debtorPlayerId];
    if (!activeDebtor) {
      active.status = 'BANKRUPT';
      active.remainingAmount = 0;
      state.boardState.paymentQueue.activeClaimIndex += 1;
      changed = true;
      continue;
    }
    if (active.remainingAmount <= 0) {
      active.status = 'SETTLED';
      state.boardState.paymentQueue.activeClaimIndex += 1;
      changed = true;
      continue;
    }

    if (ownedTileIds(state, active.debtorPlayerId).length > 0) {
      refreshDebtDeadline(
        state,
        active.debtorPlayerId,
        options.now ?? Date.now(),
        options.paymentShortfallActionTimeoutMs ?? 120_000,
      );
      return {
        status: 'WAITING_FOR_LIQUIDATION',
        continuation: null,
        changed: true,
        debtorPlayerId: active.debtorPlayerId,
      };
    }

    bankruptActiveDebtor(state, active.debtorPlayerId, 'BANKRUPT');
    changed = true;
  }

  return completed(null, changed);
};

export const sellablePropertyIds = ownedTileIds;
