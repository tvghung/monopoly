import { randomUUID } from 'node:crypto';
import {
  areTeammates,
  formatMoney,
  POWER_UP_CONFIG,
  tileState,
  type GameState,
  type PendingTurnContinuation,
  type PlayerId,
  type PowerUpStatus,
  type DebtClaim,
} from '@monopoly/shared';
import { completeTurnResolution } from '../turn';
import { creditPaymentReceipt, enqueuePayments, type CompulsoryPayment } from '../payment';
import { progressPaymentQueue } from '../paymentResolution';
import { sendToLog } from '../text';
import { OFFICIAL_POWER_UP_REGISTRY } from './catalog';
import { createPowerUpState } from './foundation';

const statusesOf = (state: GameState): PowerUpStatus[] => (
  state.privateState.powerUps?.statuses ?? []
);

const removeStatuses = (state: GameState, ids: ReadonlySet<string>): void => {
  const powerUps = state.privateState.powerUps;
  if (powerUps) powerUps.statuses = (powerUps.statuses ?? []).filter(status => !ids.has(status.statusId));
};

export function applyPowerUpRentModifiers(
  state: GameState,
  tileID: number,
  ownerPlayerId: PlayerId,
  baseRent: number,
): { amount: number; consumedStatusIds: string[] } {
  if (baseRent <= 0) return { amount: Math.max(0, baseRent), consumedStatusIds: [] };
  const matches = statusesOf(state).filter(status => (
    status.kind === 'RENT_MODIFIER'
    && (status.targetTileID === tileID || status.affectedPlayerIds?.includes(ownerPlayerId))
  ));
  const strongestIncrease = Math.max(0, ...matches.map(status => status.percent ?? 0));
  const strongestReduction = Math.max(0, ...matches.map(status => -(status.percent ?? 0)));
  const increase = Math.ceil(baseRent * strongestIncrease / 100);
  const reduction = Math.floor(baseRent * strongestReduction / 100);
  const consumedStatusIds: string[] = [];
  if (increase > 0) {
    const status = matches.find(item => item.definitionId === 'A02' && item.percent === strongestIncrease);
    if (status) consumedStatusIds.push(status.statusId);
  }
  if (reduction > 0) {
    const status = matches.find(item => item.definitionId === 'A04' && item.percent === -strongestReduction);
    if (status) consumedStatusIds.push(status.statusId);
  }
  return { amount: Math.max(0, baseRent + increase - reduction), consumedStatusIds };
}

const consumeStatusUses = (state: GameState, ids: readonly string[]): void => {
  const statuses = state.privateState.powerUps?.statuses;
  if (!statuses) return;
  for (const id of ids) {
    const status = statuses.find(item => item.statusId === id);
    if (!status) continue;
    if (status.remainingUses === undefined || status.remainingUses <= 1) {
      removeStatuses(state, new Set([id]));
    } else {
      status.remainingUses -= 1;
    }
  }
};

export function powerUpPurchasePrice(state: GameState, buyerId: PlayerId, _tileID: number, basePrice: number): number {
  const powerUps = state.privateState.powerUps;
  if (!powerUps) return basePrice;
  const statuses = statusesOf(state);
  const surcharge = statuses.find(status => status.kind === 'PURCHASE_SURCHARGE' && status.targetPlayerId === buyerId);
  const discount = statuses.find(status => status.kind === 'PURCHASE_DISCOUNT'
    && status.sourcePlayerId === buyerId && status.targetTileID === _tileID
    && status.expiresAtTurnNumber === state.boardState.turnNumber);
  const extra = surcharge ? Math.min(surcharge.capUnits ?? 0, Math.ceil(basePrice * (surcharge.percent ?? 0) / 100)) : 0;
  const reduced = discount ? Math.min(discount.capUnits ?? 0, Math.floor(basePrice * (discount.percent ?? 0) / 100)) : 0;
  return Math.max(0, basePrice + extra - reduced);
}

export function consumePowerUpPurchaseStatuses(state: GameState, buyerId: PlayerId, tileID: number): void {
  const surcharge = statusesOf(state).find(status => status.kind === 'PURCHASE_SURCHARGE' && status.targetPlayerId === buyerId);
  const discount = statusesOf(state).find(status => status.kind === 'PURCHASE_DISCOUNT'
    && status.sourcePlayerId === buyerId && status.targetTileID === tileID
    && status.expiresAtTurnNumber === state.boardState.turnNumber);
  removeStatuses(state, new Set([surcharge?.statusId, discount?.statusId].filter((id): id is string => Boolean(id))));
}

export function powerUpBuildPrice(state: GameState, builderId: PlayerId, basePrice: number): number {
  const discount = statusesOf(state).find(status => status.kind === 'BUILD_DISCOUNT'
    && status.sourcePlayerId === builderId);
  if (!discount) return basePrice;
  return Math.max(0, basePrice - Math.min(discount.capUnits ?? 0,
    Math.floor(basePrice * (discount.percent ?? 0) / 100)));
}

export function consumePowerUpBuildDiscount(state: GameState, builderId: PlayerId): void {
  const discount = statusesOf(state).find(status => status.kind === 'BUILD_DISCOUNT'
    && status.sourcePlayerId === builderId);
  if (discount) removeStatuses(state, new Set([discount.statusId]));
}

export function playerBuildRestricted(state: GameState, playerId: PlayerId): boolean {
  return statusesOf(state).some(status => status.kind === 'BUILD_RESTRICTION'
    && status.targetPlayerId === playerId);
}

export function beginPowerUpRentReaction(
  state: GameState,
  debtorPlayerId: PlayerId,
  landlordPlayerId: PlayerId,
  tileID: number,
  rentAmount: number,
  diceResult: number,
  cause: 'DICE' | 'CARD',
  continuation: PendingTurnContinuation,
  now = Date.now(),
): boolean {
  const event = createPowerUpRentEvent(
    state, debtorPlayerId, landlordPlayerId, tileID, rentAmount, diceResult, cause, continuation, now,
  );
  return event ? openPowerUpRentReaction(state, event, now) : false;
}

export function openPowerUpRentReaction(
  state: GameState,
  event: Extract<NonNullable<GameState['privateState']['powerUps']>['pendingReaction'], { kind: 'RENT' }>,
  now = Date.now(),
): boolean {
  const powerUps = state.privateState.powerUps;
  const inventory = powerUps?.inventories[event.debtorPlayerId];
  if (!inventory || powerUps?.pendingReaction) return false;
  const eligible = inventory.cards.some(card => ['D01', 'D08'].includes(card.definitionId));
  if (!eligible) return false;
  state.privateState.powerUps ??= createPowerUpState();
  state.privateState.powerUps.pendingReaction = {
    ...event,
    deadlineAt: new Date(now + POWER_UP_CONFIG.reactionWindowSeconds * 1_000).toISOString(),
  };
  return true;
}

export function createPowerUpRentEvent(
  state: GameState,
  debtorPlayerId: PlayerId,
  landlordPlayerId: PlayerId,
  tileID: number,
  rentAmount: number,
  diceResult: number,
  cause: 'DICE' | 'CARD',
  continuation: PendingTurnContinuation,
  now = Date.now(),
) {
  if (!state.players[debtorPlayerId] || !state.players[landlordPlayerId]
    || debtorPlayerId === landlordPlayerId || rentAmount <= 0) return null;
  return {
    kind: 'RENT' as const,
    eventId: randomUUID(),
    debtorPlayerId,
    landlordPlayerId,
    tileID,
    rentAmount,
    diceResult,
    cause,
    continuation: structuredClone(continuation),
    deadlineAt: new Date(now + 15_000).toISOString(),
  };
}

export function resolvePowerUpRent(
  state: GameState,
  event: Extract<NonNullable<GameState['privateState']['powerUps']>['pendingReaction'], { kind: 'RENT' }>,
  usedDefenseId: string | null,
  usedDefenseInstanceId: string | null,
  now = Date.now(),
  completeAfter = true,
): boolean {
  const debtor = state.players[event.debtorPlayerId];
  const property = state.boardState.ownedProps[event.tileID];
  const landlord = property && state.players[property.id];
  if (!debtor || !landlord || property.id !== event.landlordPlayerId
    || areTeammates(state, event.debtorPlayerId, event.landlordPlayerId)) {
    if (completeAfter) completeTurnResolution(state, event.continuation);
    return true;
  }

  const adjusted = applyPowerUpRentModifiers(state, event.tileID, event.landlordPlayerId, event.rentAmount);
  let rentDue = adjusted.amount;
  const originalModifiedRent = rentDue;
  if (usedDefenseId === 'D01') {
    rentDue -= Math.min(80, Math.floor(rentDue * 40 / 100));
  }
  if (usedDefenseInstanceId) removeInstance(state, event.debtorPlayerId, usedDefenseInstanceId);

  const rentShareStatus = statusesOf(state).find(status => status.kind === 'RENT_SHARE'
    && status.targetPlayerId === event.landlordPlayerId);
  const diverted = rentShareStatus
    ? Math.min(rentShareStatus.capUnits ?? 0, Math.floor(rentDue * (rentShareStatus.percent ?? 0) / 100))
    : 0;
  const surchargeStatus = statusesOf(state).find(status => status.kind === 'RENT_SURCHARGE'
    && status.targetPlayerId === event.debtorPlayerId);
  const surcharge = surchargeStatus
    ? Math.min(surchargeStatus.capUnits ?? 0,
      Math.ceil(originalModifiedRent * (surchargeStatus.percent ?? 0) / 100))
    : 0;

  let bankContribution = 0;
  if (usedDefenseId === 'D08') bankContribution = Math.min(200, rentDue);
  if (usedDefenseId === 'D07') {
    bankContribution = Math.min(100, Math.max(0, rentDue - Math.max(0, debtor.accountBalance)));
  }
  const rentRevenueShare: DebtClaim['rentRevenueShare'] = rentShareStatus ? {
    beneficiaryPlayerId: rentShareStatus.sourcePlayerId, percent: rentShareStatus.percent ?? 0,
    capUnits: rentShareStatus.capUnits ?? 0, grossCollected: 0, forwardedUnits: 0,
  } : undefined;
  const receipt = { creditor: 'PLAYER' as const, creditorPlayerId: event.landlordPlayerId,
    source: { kind: 'RENT' as const, tileID: event.tileID }, ...(rentRevenueShare ? { rentRevenueShare } : {}) };
  creditPaymentReceipt(state, receipt, bankContribution, { kind: 'BANK' }, event.eventId);
  const payments: CompulsoryPayment[] = [];
  if (rentDue > bankContribution) payments.push({
    debtorPlayerId: event.debtorPlayerId, ...receipt, amount: rentDue - bankContribution,
  });
  if (surcharge > 0) payments.push({
    debtorPlayerId: event.debtorPlayerId, creditor: 'BANK', amount: surcharge,
    source: { kind: 'RENT', tileID: event.tileID },
  });

  const consume = new Set(adjusted.consumedStatusIds);
  if (rentShareStatus && diverted > 0) consume.add(rentShareStatus.statusId);
  if (surchargeStatus && surcharge > 0) consume.add(surchargeStatus.statusId);
  consumeStatusUses(state, [...consume]);
  const tile = tileState[event.tileID];
  const propertyLabel = tile?.tileType === 'normal' && property.houses === 5
    ? `Khách sạn tại ${tile.streetName}`
    : tile?.tileType === 'normal' && property.houses > 0
      ? `${property.houses} Nhà tại ${tile.streetName}`
      : tile?.streetName ?? `ô ${event.tileID}`;
  const diceCopy = event.cause === 'DICE' ? `${debtor.name} đổ được ${event.diceResult} và ` : `${debtor.name} `;
  sendToLog(
    state,
    `${diceCopy}phải trả ${formatMoney(rentDue)} tiền thuê ${propertyLabel} cho ${landlord.name}.`,
  );

  if (payments.length === 0) {
    if (completeAfter) completeTurnResolution(state, event.continuation);
    return true;
  }
  enqueuePayments(state, payments, event.continuation, { now, operationId: event.eventId });
  const progress = progressPaymentQueue(state, { now });
  if (completeAfter && progress.status === 'COMPLETED' && progress.continuation) {
    completeTurnResolution(state, progress.continuation);
  }
  return progress.status === 'COMPLETED';
}

export function removeInstance(state: GameState, ownerId: PlayerId, instanceId: string): void {
  const inventory = state.privateState.powerUps?.inventories[ownerId];
  if (!inventory) throw new Error('Power-up inventory no longer exists');
  const index = inventory.cards.findIndex(card => card.instanceId === instanceId && card.ownerPlayerId === ownerId);
  if (index < 0) throw new Error('Power-up instance no longer belongs to the player');
  inventory.cards.splice(index, 1);
}

export function isEligibleUnownedProperty(tileID: number): boolean {
  const tile = tileState[tileID];
  return Boolean(tile && ['normal', 'railroad', 'company'].includes(tile.tileType) && (tile.price ?? 0) > 0);
}

export function purchaseBasePrice(tileID: number): number {
  const tile = tileState[tileID];
  return tile?.price ?? 0;
}

export function activeDefinition(instanceId: string, ownerId: PlayerId, state: GameState) {
  const instance = state.privateState.powerUps?.inventories[ownerId]?.cards.find(card => card.instanceId === instanceId);
  if (!instance || instance.ownerPlayerId !== ownerId) return null;
  return { instance, definition: OFFICIAL_POWER_UP_REGISTRY.get(instance.definitionId) };
}
