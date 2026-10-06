import {
  formatMoney,
  planEmergencyRescue,
  type EmergencyRescueOffer,
  type GameState,
  type PlayerId,
} from '@monopoly/shared';
import { activityPlayerName, recordActivityEvent } from './activity';
import { activeDebtClaim, type QueuePaymentOptions } from './payment';
import {
  bankruptActiveDebtor,
  progressPaymentQueue,
  type PaymentProgressResult,
} from './paymentResolution';
import { recordPublicGameplayEvent } from './semanticEvents';
import { sendToLog } from './text';

export type RescueResolution =
  | { ok: true; progress: PaymentProgressResult }
  | { ok: false; reason: string };

type RescueOptions = Pick<
  QueuePaymentOptions,
  'now' | 'paymentShortfallActionTimeoutMs' | 'emergencyRescueTimeoutMs' | 'allowExpired'
>;

const STALE = 'Đề nghị hỗ trợ đã hết hạn hoặc không còn hợp lệ.';

const recordRescueOutcome = (
  state: GameState,
  offer: EmergencyRescueOffer,
  action: 'ACCEPTED' | 'DECLINED' | 'EXPIRED',
): void => {
  recordActivityEvent(state, {
    type: 'EMERGENCY_RESCUE',
    action,
    debtorPlayerId: offer.debtorPlayerId,
    debtorName: activityPlayerName(state, offer.debtorPlayerId),
    rescuerPlayerId: offer.rescuerPlayerId,
    rescuerName: activityPlayerName(state, offer.rescuerPlayerId),
    amount: offer.amount,
  });
};

/**
 * The active teammate accepts: the whole remaining shortfall of the debtor is paid from the rescuer's own balance straight to
 * each creditor (the Bank or a player), never to the debtor, and every open claim of the debtor is settled. A claim owed to the
 * rescuer themselves moves no money. Everything is validated against the server's own queue before anything changes, so an
 * amount, creditor or debtor can never come from the client; a refused acceptance leaves the state untouched.
 */
export const acceptEmergencyRescue = (
  state: GameState,
  actorId: PlayerId,
  rescueId: string,
  options: RescueOptions = {},
): RescueResolution => {
  const queue = state.boardState.paymentQueue;
  const offer = queue?.rescue;
  const claim = activeDebtClaim(state);
  if (
    !queue || !offer || !claim
    || offer.rescueId !== rescueId
    || offer.rescuerPlayerId !== actorId
    || claim.debtorPlayerId !== offer.debtorPlayerId
    || (!options.allowExpired && Date.parse(offer.expiresAt) <= (options.now ?? Date.now()))
  ) return { ok: false, reason: STALE };

  const debtor = state.players[offer.debtorPlayerId];
  const rescuer = state.players[actorId];
  if (!debtor || !rescuer) return { ok: false, reason: STALE };
  const plan = planEmergencyRescue(queue.orderedClaims, queue.activeClaimIndex, offer.debtorPlayerId, actorId);
  if (plan.payable <= 0 || plan.payable !== offer.amount) return { ok: false, reason: STALE };
  if (rescuer.accountBalance < plan.payable) {
    return { ok: false, reason: `Bạn không đủ ${formatMoney(plan.payable)} để hỗ trợ đồng đội.` };
  }

  for (const open of queue.orderedClaims) {
    if (!plan.claimIds.includes(open.claimId)) continue;
    const amount = open.remainingAmount;
    const ownedByRescuer = open.creditor === 'PLAYER' && open.creditorPlayerId === actorId;
    if (!ownedByRescuer) {
      const creditor = open.creditor === 'PLAYER' && open.creditorPlayerId
        ? state.players[open.creditorPlayerId]
        : undefined;
      rescuer.accountBalance -= amount;
      if (creditor) creditor.accountBalance += amount;
      recordPublicGameplayEvent(state, {
        type: 'MONEY_TRANSFER',
        source: { kind: 'PLAYER', playerId: actorId },
        destination: creditor && open.creditorPlayerId
          ? { kind: 'PLAYER', playerId: open.creditorPlayerId }
          : { kind: 'BANK' },
        amount,
        reason: 'RESCUE',
        operationId: queue.operationId,
      });
    }
    open.remainingAmount = 0;
    open.status = 'SETTLED';
  }

  queue.rescue = null;
  recordRescueOutcome(state, offer, 'ACCEPTED');
  sendToLog(state, `${rescuer.name} đã hỗ trợ ${formatMoney(plan.payable)} để cứu ${debtor.name} khỏi phá sản.`);
  return { ok: true, progress: progressPaymentQueue(state, options) };
};

/**
 * The rescue ends without a payment (the teammate declined, the offer expired, or the teammate left): the debtor, who has
 * nothing left to sell, is eliminated exactly as if no rescue had been possible, and the queue carries on with any other claims.
 */
export const resolveRescueWithoutPayment = (
  state: GameState,
  offer: EmergencyRescueOffer,
  outcome: 'DECLINED' | 'EXPIRED',
  options: RescueOptions = {},
): RescueResolution => {
  const queue = state.boardState.paymentQueue;
  if (!queue || activeDebtClaim(state)?.debtorPlayerId !== offer.debtorPlayerId) {
    return { ok: false, reason: STALE };
  }
  queue.rescue = null;
  recordRescueOutcome(state, offer, outcome);
  if (!bankruptActiveDebtor(state, offer.debtorPlayerId, 'BANKRUPT')) return { ok: false, reason: STALE };
  return { ok: true, progress: progressPaymentQueue(state, options) };
};

/** The rescuer answers "no". Only the offered teammate may, and only for the offer that is currently open. */
export const declineEmergencyRescue = (
  state: GameState,
  actorId: PlayerId,
  rescueId: string,
  options: RescueOptions = {},
): RescueResolution => {
  const offer = state.boardState.paymentQueue?.rescue;
  if (!offer || offer.rescueId !== rescueId || offer.rescuerPlayerId !== actorId) {
    return { ok: false, reason: STALE };
  }
  return resolveRescueWithoutPayment(state, offer, 'DECLINED', options);
};
