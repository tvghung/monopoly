import { randomUUID } from 'node:crypto';
import {
  DEFAULT_EMERGENCY_RESCUE_SECONDS,
  formatMoney,
  getTeammateIds,
  isTeamMode,
  planEmergencyRescue,
  type GameState,
  type PlayerId,
} from '@monopoly/shared';
import { activityPlayerName, recordActivityEvent } from './activity';
import type { QueuePaymentOptions } from './payment';
import { sendToLog } from './text';

export const DEFAULT_EMERGENCY_RESCUE_TIMEOUT_MS = DEFAULT_EMERGENCY_RESCUE_SECONDS * 1000;

/** The debtor's teammate who is still in the game, the only player an Emergency Rescue can be offered to. */
export const findEmergencyRescuer = (state: GameState, debtorId: PlayerId): PlayerId | null => {
  if (!isTeamMode(state)) return null;
  return getTeammateIds(state, debtorId).find((playerId) => Boolean(state.players[playerId])) ?? null;
};

const ownsProperty = (state: GameState, playerId: PlayerId): boolean => (
  Object.values(state.boardState.ownedProps).some((property) => property.id === playerId)
);

/**
 * Offers the active teammate an Emergency Rescue for the active debtor, or returns `false` when none is possible. The caller
 * reaches this only after every self-rescue is exhausted: the debtor owns nothing left to sell and still owes money, which
 * is the moment bankruptcy would otherwise be declared. The offer covers the debtor's whole remaining shortfall in the queue
 * or nothing, and exists only when the teammate can pay all of it from their own balance; the amount and the creditors come
 * from the server's queue. It shares the queue's one durable deadline so a silent or disconnected teammate cannot stall the
 * game: at expiry the normal bankruptcy resolution runs.
 */
export const openEmergencyRescue = (
  state: GameState,
  debtorId: PlayerId,
  options: Pick<QueuePaymentOptions, 'now' | 'emergencyRescueTimeoutMs'> = {},
): boolean => {
  const queue = state.boardState.paymentQueue;
  if (!queue || queue.rescue || !state.players[debtorId] || ownsProperty(state, debtorId)) return false;
  const rescuerId = findEmergencyRescuer(state, debtorId);
  const rescuer = rescuerId ? state.players[rescuerId] : undefined;
  if (!rescuerId || !rescuer) return false;

  const plan = planEmergencyRescue(queue.orderedClaims, queue.activeClaimIndex, debtorId, rescuerId);
  if (plan.payable <= 0 || rescuer.accountBalance < plan.payable) return false;

  const expiresAt = new Date(
    (options.now ?? Date.now()) + (options.emergencyRescueTimeoutMs ?? DEFAULT_EMERGENCY_RESCUE_TIMEOUT_MS),
  ).toISOString();
  queue.rescue = {
    rescueId: randomUUID(),
    debtorPlayerId: debtorId,
    rescuerPlayerId: rescuerId,
    amount: plan.payable,
    expiresAt,
  };
  queue.actionDeadlineAt = expiresAt;
  const debtorName = activityPlayerName(state, debtorId);
  recordActivityEvent(state, {
    type: 'EMERGENCY_RESCUE',
    action: 'OFFERED',
    debtorPlayerId: debtorId,
    debtorName,
    rescuerPlayerId: rescuerId,
    rescuerName: rescuer.name,
    amount: plan.payable,
  });
  sendToLog(
    state,
    `${debtorName} không còn tài sản để bán. ${rescuer.name} có thể hỗ trợ ${formatMoney(plan.payable)} để cứu đồng đội.`,
  );
  return true;
};
