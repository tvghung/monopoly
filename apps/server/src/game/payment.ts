import { randomUUID } from 'node:crypto';
import type {
  DebtClaim,
  DebtSource,
  GameState,
  PaymentQueue,
  PendingTurnContinuation,
  PlayerId,
} from '@monopoly/shared';
import { sendToLog } from './text';

export const DEFAULT_DEBT_ACTION_TIMEOUT_MS = 120_000;

export interface CompulsoryPayment {
  debtorPlayerId: PlayerId;
  creditor: 'PLAYER' | 'BANK';
  creditorPlayerId?: PlayerId;
  amount: number;
  source: DebtSource;
}

export interface QueuePaymentOptions {
  operationId?: string;
  now?: number;
  debtActionTimeoutMs?: number;
}

export const activeDebtClaim = (state: GameState): DebtClaim | null => {
  const queue = state.boardState.paymentQueue;
  return queue?.orderedClaims[queue.activeClaimIndex] ?? null;
};

export const activeDebtorId = (state: GameState): PlayerId | null => (
  activeDebtClaim(state)?.debtorPlayerId ?? null
);

export const hasPendingDebt = (state: GameState): boolean => Boolean(activeDebtClaim(state));

export const createPaymentQueue = (
  payments: CompulsoryPayment[],
  continuation: PendingTurnContinuation,
  options: QueuePaymentOptions = {},
): PaymentQueue => {
  if (payments.length === 0) throw new RangeError('Hàng đợi thanh toán phải có ít nhất một khoản nợ.');
  const operationId = options.operationId ?? randomUUID();
  const orderedClaims: DebtClaim[] = payments.map((payment) => ({
    claimId: randomUUID(),
    debtorPlayerId: payment.debtorPlayerId,
    creditor: payment.creditor,
    creditorPlayerId: payment.creditorPlayerId,
    amount: payment.amount,
    remainingAmount: payment.amount,
    source: payment.source,
    status: 'PENDING',
  }));
  return {
    operationId,
    orderedClaims,
    activeClaimIndex: 0,
    continuation,
    actionDeadlineAt: new Date(
      (options.now ?? Date.now())
      + (options.debtActionTimeoutMs ?? DEFAULT_DEBT_ACTION_TIMEOUT_MS),
    ).toISOString(),
  };
};

export const enqueuePayments = (
  state: GameState,
  payments: CompulsoryPayment[],
  continuation: PendingTurnContinuation,
  options: QueuePaymentOptions = {},
): PaymentQueue => {
  if (state.boardState.paymentQueue) {
    throw new Error('Không thể mở hai hàng đợi thanh toán cùng lúc.');
  }
  const queue = createPaymentQueue(payments, continuation, options);
  state.boardState.paymentQueue = queue;
  state.boardState.turnRecovery = null;
  return queue;
};

const settleCurrentClaim = (state: GameState, queue: PaymentQueue): boolean => {
  const claim = queue.orderedClaims[queue.activeClaimIndex];
  if (!claim) return false;
  if (claim.status === 'SETTLED' || claim.status === 'BANKRUPT' || claim.remainingAmount <= 0) {
    claim.remainingAmount = 0;
    if (claim.status !== 'BANKRUPT') claim.status = 'SETTLED';
    queue.activeClaimIndex += 1;
    return true;
  }
  const debtor = state.players[claim.debtorPlayerId];
  const creditor = claim.creditor === 'PLAYER' && claim.creditorPlayerId
    ? state.players[claim.creditorPlayerId]
    : undefined;
  if (!debtor) throw new Error('Khoản nợ đang chờ không có debtor hợp lệ.');
  const paid = Math.min(debtor.accountBalance, claim.remainingAmount);
  debtor.accountBalance -= paid;
  if (creditor) creditor.accountBalance += paid;
  claim.remainingAmount -= paid;
  if (claim.remainingAmount > 0) return false;
  claim.status = 'SETTLED';
  queue.activeClaimIndex += 1;
  return true;
};

/**
 * Commits affordable claims in stable queue order. It never makes a balance
 * negative and stops exactly at the first debtor who needs a liquidity action.
 */
export const settleAffordableClaims = (
  state: GameState,
  options: Pick<QueuePaymentOptions, 'now' | 'debtActionTimeoutMs'> = {},
): PendingTurnContinuation | null => {
  const queue = state.boardState.paymentQueue;
  if (!queue) return null;
  const startingIndex = queue.activeClaimIndex;
  while (queue.activeClaimIndex < queue.orderedClaims.length) {
    if (!settleCurrentClaim(state, queue)) {
      if (queue.activeClaimIndex !== startingIndex) {
        queue.actionDeadlineAt = new Date(
          (options.now ?? Date.now())
          + (options.debtActionTimeoutMs ?? DEFAULT_DEBT_ACTION_TIMEOUT_MS),
        ).toISOString();
      }
      return null;
    }
  }
  const continuation = queue.continuation;
  state.boardState.paymentQueue = null;
  return continuation;
};

export const refreshDebtDeadline = (
  state: GameState,
  debtorPlayerId: PlayerId,
  now = Date.now(),
  timeoutMs = DEFAULT_DEBT_ACTION_TIMEOUT_MS,
): boolean => {
  const queue = state.boardState.paymentQueue;
  const active = queue?.orderedClaims[queue.activeClaimIndex];
  if (!queue || active?.debtorPlayerId !== debtorPlayerId) return false;
  queue.actionDeadlineAt = new Date(now + timeoutMs).toISOString();
  return true;
};

/**
 * After a meaningful liquidity action, commit any newly affordable amount and
 * return a continuation only when the whole deterministic queue is complete.
 * A still-open claim receives a fresh independent action deadline.
 */
export const continueDebtAfterLiquidity = (
  state: GameState,
  debtorPlayerId: PlayerId,
  options: Pick<QueuePaymentOptions, 'now' | 'debtActionTimeoutMs'> = {},
): PendingTurnContinuation | null => {
  const before = activeDebtClaim(state);
  if (!before || before.debtorPlayerId !== debtorPlayerId) return null;
  const continuation = settleAffordableClaims(state, options);
  const after = activeDebtClaim(state);
  if (after) {
    refreshDebtDeadline(
      state,
      after.debtorPlayerId,
      options.now ?? Date.now(),
      options.debtActionTimeoutMs ?? DEFAULT_DEBT_ACTION_TIMEOUT_MS,
    );
  }
  return continuation;
};

export const logPausedDebt = (state: GameState): void => {
  const claim = activeDebtClaim(state);
  const debtor = claim && state.players[claim.debtorPlayerId];
  if (!claim || !debtor) return;
  sendToLog(
    state,
    `${debtor.name} cần huy động thêm ${claim.remainingAmount.toLocaleString('vi-VN')}.000 ₫ để thanh toán bắt buộc.`,
  );
};

export const assertDebtActionAllowed = (
  state: GameState,
  actorId: PlayerId,
  action: 'ROLL' | 'BUY' | 'BUILD' | 'UNMORTGAGE' | 'BID' | 'LIQUIDATE' | 'TRADE',
): boolean => {
  const claim = activeDebtClaim(state);
  if (!claim) return true;
  if (action === 'LIQUIDATE') return actorId === claim.debtorPlayerId;
  if (action === 'TRADE') return true;
  // A Bank-property auction is a required debt-recovery interaction. Other
  // players may bid there, while the active debtor remains blocked.
  if (action === 'BID') return actorId !== claim.debtorPlayerId;
  return false;
};
