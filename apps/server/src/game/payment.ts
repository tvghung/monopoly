import { randomUUID } from 'node:crypto';
import type {
  DebtClaim,
  DebtSource,
  GameState,
  PaymentQueue,
  PendingTurnContinuation,
  PlayerId,
  ForcedSaleProposal,
} from '@monopoly/shared';
import { sendToLog } from './text';
import {
  forcedSaleGrossPrice,
  isPropertyLockedByLandingDecision,
} from './property';
import { transferProperty } from './transfer';

export const DEFAULT_PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS = 120_000;
export const DEFAULT_FORCED_SALE_PROPOSAL_TIMEOUT_MS = 20_000;

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
  paymentShortfallActionTimeoutMs?: number;
  /** Only the deadline scheduler/leave transaction may use this internal flag. */
  allowExpired?: boolean;
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
      + (options.paymentShortfallActionTimeoutMs ?? DEFAULT_PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS),
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
  options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs'> = {},
): PendingTurnContinuation | null => {
  const queue = state.boardState.paymentQueue;
  if (!queue) return null;
  const startingIndex = queue.activeClaimIndex;
  while (queue.activeClaimIndex < queue.orderedClaims.length) {
    if (!settleCurrentClaim(state, queue)) {
      if (queue.activeClaimIndex !== startingIndex) {
        queue.actionDeadlineAt = new Date(
          (options.now ?? Date.now())
          + (options.paymentShortfallActionTimeoutMs ?? DEFAULT_PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS),
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
  timeoutMs = DEFAULT_PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS,
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
  action: 'ROLL' | 'BUY' | 'BUILD' | 'LIQUIDATE' | 'TRADE',
): boolean => {
  const claim = activeDebtClaim(state);
  if (!claim) return true;
  if (action === 'LIQUIDATE') return actorId === claim.debtorPlayerId;
  if (action === 'TRADE') return false;
  return false;
};

export const activePaymentClaim = activeDebtClaim;

export type ForcedSaleExecutionResult =
  | {
      ok: true;
      changed: true;
      tileID: number;
      grossPrice: number;
    }
  | {
      ok: false;
      changed: false;
      reason: string;
    };

/** Apply one authoritative Bank forced sale. Queue progression is centralized by paymentResolution. */
export const sellPropertyToBankForPayment = (
  state: GameState,
  sellerId: PlayerId,
  paymentOperationId: string,
  claimId: string,
  tileID: number,
  options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs' | 'allowExpired'> = {},
): ForcedSaleExecutionResult => {
  const queue = state.boardState.paymentQueue;
  const claim = activeDebtClaim(state);
  const owned = state.boardState.ownedProps[tileID];
  const now = options.now ?? Date.now();
  if (
    !queue || !claim || claim.debtorPlayerId !== sellerId
    || queue.operationId !== paymentOperationId || claim.claimId !== claimId
    || state.privateState.forcedSaleProposal
    || !owned || owned.id !== sellerId
    || isPropertyLockedByLandingDecision(state, tileID)
    || (!options.allowExpired && Date.parse(queue.actionDeadlineAt) <= now)
  ) return { ok: false, changed: false, reason: 'Yêu cầu bán tài sản đã hết hạn hoặc không còn hợp lệ.' };

  const gross = forcedSaleGrossPrice(tileID, owned.houses);
  const seller = state.players[sellerId];
  if (!seller || gross <= 0) {
    return { ok: false, changed: false, reason: 'Tài sản không có giá thanh lý hợp lệ.' };
  }
  const transfer = transferProperty(state, tileID, sellerId, null, 'RETURN_TO_BANK');
  if (!transfer.ok) return { ok: false, changed: false, reason: transfer.reason ?? 'Không thể chuyển tài sản về Ngân hàng.' };
  seller.accountBalance += gross;
  sendToLog(state, `${seller.name} đã bị buộc bán tài sản ${tileID} cho Ngân hàng.`);
  return { ok: true, changed: true, tileID, grossPrice: gross };
};

export const createForcedSaleProposal = (
  state: GameState,
  sellerId: PlayerId,
  paymentOperationId: string,
  claimId: string,
  tileID: number,
  buyerPlayerId: PlayerId,
  now = Date.now(),
): ForcedSaleProposal | null => {
  const queue = state.boardState.paymentQueue;
  const claim = activeDebtClaim(state);
  const property = state.boardState.ownedProps[tileID];
  const buyer = state.players[buyerPlayerId];
  if (
    !queue || !claim || claim.debtorPlayerId !== sellerId
    || queue.operationId !== paymentOperationId || claim.claimId !== claimId
    || !property || property.id !== sellerId || !buyer || buyerPlayerId === sellerId
    || isPropertyLockedByLandingDecision(state, tileID)
    || state.boardState.players.indexOf(buyerPlayerId) < 0
  ) return null;
  if (state.privateState.forcedSaleProposal) return null;
  const paymentDeadline = Date.parse(queue.actionDeadlineAt);
  if (!Number.isFinite(paymentDeadline) || paymentDeadline <= now) return null;
  const gross = forcedSaleGrossPrice(tileID, property.houses);
  if (gross <= 0 || buyer.accountBalance < gross) return null;
  const proposal: ForcedSaleProposal = {
    proposalId: randomUUID(),
    paymentOperationId,
    claimId,
    sellerPlayerId: sellerId,
    buyerPlayerId,
    tileID,
    grossPrice: gross,
    expectedHouses: property.houses,
    expiresAt: new Date(Math.min(
      now + DEFAULT_FORCED_SALE_PROPOSAL_TIMEOUT_MS,
      paymentDeadline,
    )).toISOString(),
  };
  state.privateState.forcedSaleProposal = proposal;
  return proposal;
};

export const rejectForcedSaleProposal = (
  state: GameState,
  actorId: PlayerId,
  proposalId: string,
  now = Date.now(),
): boolean => {
  const proposal = state.privateState.forcedSaleProposal;
  if (!proposal || proposal.proposalId !== proposalId
    || (actorId !== proposal.sellerPlayerId && actorId !== proposal.buyerPlayerId)
    || Date.parse(proposal.expiresAt) <= now) return false;
  state.privateState.forcedSaleProposal = null;
  return true;
};

export const acceptForcedSaleProposal = (
  state: GameState,
  actorId: PlayerId,
  proposalId: string,
  options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs'> = {},
): ForcedSaleExecutionResult => {
  void options;
  const proposal = state.privateState.forcedSaleProposal;
  const queue = state.boardState.paymentQueue;
  const claim = activeDebtClaim(state);
  const property = proposal && state.boardState.ownedProps[proposal.tileID];
  const buyer = proposal && state.players[proposal.buyerPlayerId];
  const seller = proposal && state.players[proposal.sellerPlayerId];
  if (
    !proposal || !queue || !claim || actorId !== proposal.buyerPlayerId
    || proposal.proposalId !== proposalId || queue.operationId !== proposal.paymentOperationId
    || claim.claimId !== proposal.claimId || claim.debtorPlayerId !== proposal.sellerPlayerId
    || !property || property.id !== proposal.sellerPlayerId
    || isPropertyLockedByLandingDecision(state, proposal.tileID)
    || property.houses !== proposal.expectedHouses
    || !buyer || !seller || buyer.accountBalance < proposal.grossPrice
    || Date.parse(proposal.expiresAt) <= (options.now ?? Date.now())
  ) return { ok: false, changed: false, reason: 'Đề nghị bán bắt buộc đã hết hạn hoặc không còn hợp lệ.' };
  const transfer = transferProperty(
    state,
    proposal.tileID,
    proposal.sellerPlayerId,
    proposal.buyerPlayerId,
    'FORCED_SALE',
  );
  if (!transfer.ok) return { ok: false, changed: false, reason: transfer.reason ?? 'Không thể chuyển tài sản.' };
  buyer.accountBalance -= proposal.grossPrice;
  seller.accountBalance += proposal.grossPrice;
  state.privateState.forcedSaleProposal = null;
  return {
    ok: true,
    changed: true,
    tileID: proposal.tileID,
    grossPrice: proposal.grossPrice,
  };
};
