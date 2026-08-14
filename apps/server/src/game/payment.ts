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
import { forcedSaleGrossPrice, forcedSaleNetProceeds, mortgagePrincipal } from './property';
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
export const continueDebtAfterLiquidity = (
  state: GameState,
  debtorPlayerId: PlayerId,
  options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs'> = {},
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
      options.paymentShortfallActionTimeoutMs ?? DEFAULT_PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS,
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
  if (action === 'TRADE') return false;
  // The removed auction action remains a compatibility discriminator for old
  // pure-game callers; v3 socket commands expose only forced-sale actions.
  if (action === 'BID') return actorId !== claim.debtorPlayerId;
  return false;
};

export const activePaymentClaim = activeDebtClaim;

/** Apply one authoritative Bank forced sale and immediately retry the claim. */
export const sellPropertyToBankForPayment = (
  state: GameState,
  sellerId: PlayerId,
  paymentOperationId: string,
  claimId: string,
  tileID: number,
  options: Pick<QueuePaymentOptions, 'now' | 'paymentShortfallActionTimeoutMs'> = {},
): PendingTurnContinuation | null => {
  const queue = state.boardState.paymentQueue;
  const claim = activeDebtClaim(state);
  const owned = state.boardState.ownedProps[tileID];
  if (
    !queue || !claim || claim.debtorPlayerId !== sellerId
    || queue.operationId !== paymentOperationId || claim.claimId !== claimId
    || state.privateState.forcedSaleProposal
    || !owned || owned.id !== sellerId
  ) return null;

  const gross = forcedSaleGrossPrice(tileID, owned.houses);
  const net = forcedSaleNetProceeds(tileID, owned.houses, owned.mortgaged);
  const principal = owned.mortgaged ? mortgagePrincipal(tileID) : 0;
  const seller = state.players[sellerId];
  if (!seller || gross <= 0 || net < 0) return null;
  delete state.boardState.openMarket[tileID];
  delete state.boardState.ownedProps[tileID];
  seller.accountBalance += net;
  // The principal is paid to the Bank as part of the gross consideration;
  // deleting the property also clears its mortgage and development.
  if (principal > gross) return null;
  sendToLog(state, `${seller.name} đã bị buộc bán tài sản ${tileID} cho Ngân hàng.`);
  return continueDebtAfterLiquidity(state, sellerId, options);
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
    || state.boardState.players.indexOf(buyerPlayerId) < 0
  ) return null;
  if (state.privateState.forcedSaleProposal) return null;
  const paymentDeadline = Date.parse(queue.actionDeadlineAt);
  if (!Number.isFinite(paymentDeadline) || paymentDeadline <= now) return null;
  const gross = forcedSaleGrossPrice(tileID, property.houses);
  const net = forcedSaleNetProceeds(tileID, property.houses, property.mortgaged);
  if (gross <= 0 || buyer.accountBalance < gross) return null;
  const proposal: ForcedSaleProposal = {
    proposalId: randomUUID(),
    paymentOperationId,
    claimId,
    sellerPlayerId: sellerId,
    buyerPlayerId,
    tileID,
    grossPrice: gross,
    sellerNetProceeds: net,
    expectedHouses: property.houses,
    expectedMortgaged: property.mortgaged,
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
): PendingTurnContinuation | null => {
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
    || property.houses !== proposal.expectedHouses || property.mortgaged !== proposal.expectedMortgaged
    || !buyer || !seller || buyer.accountBalance < proposal.grossPrice
    || Date.parse(proposal.expiresAt) <= (options.now ?? Date.now())
  ) return null;
  const transfer = transferProperty(
    state,
    proposal.tileID,
    proposal.sellerPlayerId,
    proposal.buyerPlayerId,
    'FORCED_SALE',
  );
  if (!transfer.ok) return null;
  buyer.accountBalance -= proposal.grossPrice;
  seller.accountBalance += proposal.sellerNetProceeds;
  state.privateState.forcedSaleProposal = null;
  return continueDebtAfterLiquidity(state, proposal.sellerPlayerId, options);
};
