import { randomInt, randomUUID } from 'node:crypto';
import {
  POWER_UP_CONFIG,
  areTeammates,
  tileState,
  type GameState,
  type PendingPowerUpReaction,
  type PlayerId,
  type PowerUpActivationRequest,
  type PowerUpInstance,
  type PowerUpReactionRequest,
  type PowerUpStatus,
  type ResolvePowerUpTradeRequest,
} from '@monopoly/shared';
import { CommandError } from '../../socket/errors';
import { activityPlayerName, recordActivityEvent } from '../activity';
import { continuationForRoll, completeTurnResolution } from '../turn';
import { rollDice, moveBy, moveToTile } from '../dice';
import { resolveTile } from '../tiles';
import { creditPaymentReceipt, enqueuePayments } from '../payment';
import { progressPaymentQueue } from '../paymentResolution';
import { recordPublicGameplayEvent } from '../semanticEvents';
import { sendToLog } from '../text';
import { transferProperty } from '../transfer';
import { OFFICIAL_POWER_UP_DEFINITIONS, OFFICIAL_POWER_UP_REGISTRY } from './catalog';
import { canD03BlockAttack, planU04Upgrade } from './validation';
import {
  activeDefinition,
  consumePowerUpBuildDiscount,
  consumePowerUpPurchaseStatuses,
  isEligibleUnownedProperty,
  powerUpBuildPrice,
  powerUpPurchasePrice,
  purchaseBasePrice,
  removeInstance,
  resolvePowerUpRent,
} from './economy';
import { createPowerUpState } from './foundation';

const REACTION_WINDOW_MS = POWER_UP_CONFIG.reactionWindowSeconds * 1_000;
const activeIds = new Set(['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'D04', 'D10', 'U01', 'U02', 'U03', 'U04', 'U05', 'U06', 'U07', 'U08', 'U09', 'U10']);
const targetedAttackIds = new Set(['A01', 'A03', 'A04', 'A05', 'A06', 'A07', 'A09', 'A10']);

const powerUpsOf = (state: GameState) => {
  const powerUps = state.privateState.powerUps ??= createPowerUpState();
  powerUps.statuses ??= [];
  powerUps.activeUsage ??= {};
  powerUps.resolvedReactionEventIds ??= [];
  return powerUps;
};
const inventoryOf = (state: GameState, owner: PlayerId) => state.privateState.powerUps?.inventories[owner];
const cardsOf = (state: GameState, owner: PlayerId) => inventoryOf(state, owner)?.cards ?? [];
const ownsTile = (state: GameState, owner: PlayerId, tileID: number): boolean => (
  state.boardState.ownedProps[tileID]?.id === owner
);
const assertOpponent = (state: GameState, actor: PlayerId, target: PlayerId): void => {
  if (!target || target === actor || !state.players[target] || !state.boardState.players.includes(target)
    || areTeammates(state, actor, target)) {
    throw new CommandError('CONFLICT', 'Hãy chọn một đối thủ còn trong ván.');
  }
};

const activationFields: Readonly<Record<string, readonly (keyof PowerUpActivationRequest)[]>> = {
  A01: ['targetPlayerId'], A02: ['targetTileID'], A03: ['targetPlayerId'],
  A04: ['targetPlayerId', 'targetTileID'], A05: ['targetPlayerId'], A06: ['targetPlayerId'],
  A07: ['targetPlayerId'], A08: [], A09: ['targetPlayerId'], A10: ['targetPlayerId'],
  D04: ['targetTileID'], D10: ['statusId'],
  U01: [], U02: [], U03: ['targetTileID'], U04: ['ingredientInstanceIds'],
  U05: ['movementDelta'], U06: ['targetPlayerId'], U07: ['targetTileID'],
  U08: ['targetTileID'], U09: [], U10: ['transformedInstanceId', 'category'],
};

function assertActivationRequestMatchesEffect(
  definitionId: string,
  request: PowerUpActivationRequest,
): void {
  const allowed = activationFields[definitionId];
  if (!allowed) throw new CommandError('CONFLICT', 'Hiệu ứng thẻ này chưa có bộ xử lý.');
  const fields: (keyof PowerUpActivationRequest)[] = [
    'targetPlayerId', 'targetTileID', 'ingredientInstanceIds', 'transformedInstanceId',
    'category', 'movementDelta', 'statusId',
  ];
  if (fields.some(field => request[field] !== undefined && !allowed.includes(field))) {
    throw new CommandError('INVALID_REQUEST', 'Dữ liệu mục tiêu không khớp với hiệu ứng thẻ.');
  }
}
const pushStatus = (state: GameState, status: PowerUpStatus): void => {
  powerUpsOf(state).statuses!.push(status);
};
const newStatus = (
  definitionId: string,
  kind: PowerUpStatus['kind'],
  source: PowerUpInstance,
  sourcePlayerId: PlayerId,
  values: Omit<Partial<PowerUpStatus>, 'statusId' | 'kind' | 'definitionId' | 'sourceInstanceId' | 'sourcePlayerId'> = {},
): PowerUpStatus => ({
  statusId: randomUUID(), kind, definitionId: definitionId as PowerUpStatus['definitionId'],
  sourceInstanceId: source.instanceId, sourcePlayerId, ...values,
});

function markActiveUsed(state: GameState, actor: PlayerId): void {
  powerUpsOf(state).activeUsage![actor] = state.boardState.turnNumber;
}
function assertActiveUnused(state: GameState, actor: PlayerId): void {
  if (state.privateState.powerUps?.activeUsage?.[actor] === state.boardState.turnNumber) {
    throw new CommandError('CONFLICT', 'Bạn đã dùng một thẻ Active trong lượt này.');
  }
}
function consumeActive(state: GameState, actor: PlayerId, instance: PowerUpInstance): void {
  markActiveUsed(state, actor);
  removeInstance(state, actor, instance.instanceId);
}
function assertNoConflictingInteraction(state: GameState): void {
  if (state.boardState.paymentQueue || state.turnInfo.pendingCardInteraction
    || state.privateState.forcedSaleProposal || state.privateState.powerUps?.pendingReaction
    || state.privateState.powerUps?.pendingTrade) {
    throw new CommandError('CONFLICT', 'Hoàn tất quyết định đang chờ trước khi dùng thẻ.');
  }
}
function assertCurrentActivePoint(state: GameState, actor: PlayerId): void {
  const player = state.players[actor];
  if (!player || state.boardState.currentPlayer.id !== actor || player.isJail) {
    throw new CommandError('FORBIDDEN', 'Thẻ này chỉ dùng được trong lượt của bạn khi không ở tù.');
  }
  if (state.boardState.winner) throw new CommandError('CONFLICT', 'Ván chơi đã kết thúc.');
}
const directTransfer = (state: GameState, from: PlayerId, to: PlayerId, amount: number, reason: 'OTHER', operationId: string): void => {
  if (amount <= 0) return;
  const payer = state.players[from];
  const recipient = state.players[to];
  if (!payer || !recipient) throw new CommandError('CONFLICT', 'Người chơi không còn hợp lệ.');
  const paid = Math.min(Math.max(0, payer.accountBalance), amount);
  payer.accountBalance -= paid;
  recipient.accountBalance += paid;
  if (paid > 0) recordPublicGameplayEvent(state, {
    type: 'MONEY_TRANSFER', source: { kind: 'PLAYER', playerId: from },
    destination: { kind: 'PLAYER', playerId: to }, amount: paid, reason, operationId,
  });
};

function activeTiming(state: GameState, actor: PlayerId, definitionId: string, request: PowerUpActivationRequest): void {
  const pendingMovement = state.privateState.powerUps?.pendingMovement;
  if (['U01', 'U02', 'U05', 'U08'].includes(definitionId)) {
    if (!pendingMovement || pendingMovement.playerId !== actor
      || pendingMovement.turnNumber !== state.boardState.turnNumber
      || pendingMovement.rollSequence !== state.boardState.rollSequence) {
      throw new CommandError('CONFLICT', 'Thẻ này chỉ dùng sau khi đổ xúc xắc và trước khi di chuyển.');
    }
    return;
  }
  if (definitionId === 'U03') {
    if (!state.turnInfo.pendingPropertyDecision || state.turnInfo.pendingPropertyDecision.playerId !== actor
      || state.turnInfo.pendingPropertyDecision.tileID !== request.targetTileID) {
      throw new CommandError('CONFLICT', 'Phiếu giảm giá chỉ dùng cho tài sản đang chờ quyết định mua.');
    }
    return;
  }
  if (definitionId === 'U09') {
    if (!state.turnInfo.pendingDevelopmentDecision || state.turnInfo.pendingDevelopmentDecision.playerId !== actor) {
      throw new CommandError('CONFLICT', 'Phiếu xây dựng chỉ dùng trước quyết định phát triển đang chờ.');
    }
    return;
  }
  if (state.boardState.currentPlayer.hasMoved || state.turnInfo.pendingPropertyDecision
    || state.turnInfo.pendingDevelopmentDecision) {
    throw new CommandError('CONFLICT', 'Thẻ Active này phải được dùng trước khi di chuyển hoặc mở quyết định ô đất.');
  }
}

export function shouldPauseBeforeMovement(state: GameState, actor: PlayerId): boolean {
  if (state.privateState.powerUps?.activeUsage?.[actor] === state.boardState.turnNumber) return false;
  return cardsOf(state, actor).some(card => ['U01', 'U02', 'U05', 'U08'].includes(card.definitionId));
}

export function finishPowerUpMovement(
  state: GameState,
  actor: PlayerId,
  movementSteps: number,
  diceTotal: number,
  now = Date.now(),
  destinationTile?: number,
): void {
  const pending = state.privateState.powerUps?.pendingMovement;
  if (!pending || pending.playerId !== actor || pending.turnNumber !== state.boardState.turnNumber
    || pending.rollSequence !== state.boardState.rollSequence) {
    throw new CommandError('CONFLICT', 'Kết quả di chuyển đã hết hạn hoặc đã được xử lý.');
  }
  state.privateState.powerUps!.pendingMovement = null;
  const continuation = continuationForRoll(state, actor);
  const operationId = pending.operationId;
  if (destinationTile === undefined) {
    if (!moveBy(state, actor, movementSteps, { kind: 'DICE_WALK', rollSequence: pending.rollSequence }, operationId)) {
      throw new CommandError('CONFLICT', 'Không thể hoàn tất bước di chuyển.');
    }
  } else if (!moveToTile(
    state, actor, destinationTile, { kind: 'DICE_WALK', rollSequence: pending.rollSequence }, operationId,
  )) {
    throw new CommandError('CONFLICT', 'Ô đích không hợp lệ.');
  }
  resolveTile(state, actor, diceTotal, continuation, { now });
}

export function continuePowerUpMovement(state: GameState, actor: PlayerId, operationId: string, now = Date.now()): void {
  const pending = state.privateState.powerUps?.pendingMovement;
  if (!pending || pending.playerId !== actor || pending.operationId !== operationId
    || state.boardState.currentPlayer.id !== actor || pending.turnNumber !== state.boardState.turnNumber) {
    throw new CommandError('CONFLICT', 'Không có bước di chuyển phù hợp để tiếp tục.');
  }
  finishPowerUpMovement(state, actor, pending.dice.dice1 + pending.dice.dice2,
    pending.dice.dice1 + pending.dice.dice2, now);
}

function reactionIds(state: GameState, event: Extract<PendingPowerUpReaction, { kind: 'ATTACK' }>): string[] {
  const defenderCards = cardsOf(state, event.defenderPlayerId);
  return defenderCards.filter(card => {
    if (event.attackDefinitionId === 'A01' && card.definitionId === 'D02') return true;
    if (event.attackDefinitionId === 'A06' && card.definitionId === 'D09') return true;
    if (card.definitionId === 'D05') {
      if (event.attackDefinitionId === 'A04') return Object.values(state.boardState.ownedProps).some(property => property.id === event.attackerPlayerId);
      if (event.attackDefinitionId !== 'A06') return true;
      const source = inventoryOf(state, event.attackerPlayerId);
      const receiver = inventoryOf(state, event.defenderPlayerId);
      return Boolean(source?.cards.some(item => item.instanceId !== event.attackInstanceId)
        && receiver && (receiver.capacity === null || receiver.cards.length - 1 < receiver.capacity));
    }
    if (card.definitionId === 'D06') return true;
    if (card.definitionId !== 'D03') return false;
    return ['A03', 'A04', 'A05', 'A07', 'A10'].includes(event.attackDefinitionId);
  }).map(card => card.instanceId);
}

export function createAttackReaction(
  state: GameState,
  attackerPlayerId: PlayerId,
  attack: PowerUpInstance,
  definitionId: string,
  targetPlayerId: PlayerId,
  targetTileID: number | undefined,
  now = Date.now(),
): boolean {
  if (!targetedAttackIds.has(definitionId)) return false;
  const defenderPlayerId = targetPlayerId;
  if (!defenderPlayerId) return false;
  const event: PendingPowerUpReaction = {
    kind: 'ATTACK', eventId: randomUUID(), attackerPlayerId, defenderPlayerId,
    attackInstanceId: attack.instanceId,
    attackDefinitionId: definitionId as Extract<PendingPowerUpReaction, { kind: 'ATTACK' }>['attackDefinitionId'],
    ...(targetPlayerId ? { targetPlayerId } : {}),
    ...(targetTileID === undefined ? {} : { targetTileID }),
    deadlineAt: new Date(now + REACTION_WINDOW_MS).toISOString(),
  };
  if (reactionIds(state, event).length === 0) return false;
  powerUpsOf(state).pendingReaction = event;
  return true;
}

const reactionCardAllowed = (attackId: string, reactionId: string): boolean => (
  reactionId === 'D05' || reactionId === 'D06'
  || (attackId === 'A01' && reactionId === 'D02')
  || (attackId === 'A06' && reactionId === 'D09')
  || (reactionId === 'D03' && ['A03', 'A04', 'A05', 'A07', 'A10'].includes(attackId))
);

function addAttackStatus(
  state: GameState,
  actor: PlayerId,
  instance: PowerUpInstance,
  definitionId: string,
  targetPlayerId?: PlayerId,
  targetTileID?: number,
): void {
  const targetProperty = targetTileID === undefined ? undefined : state.boardState.ownedProps[targetTileID];
  switch (definitionId) {
    case 'A02':
      pushStatus(state, newStatus('A02', 'RENT_MODIFIER', instance, actor, {
        targetTileID, percent: 25, ownerTurnPlayerId: actor, remainingOwnerTurns: 2, remainingUses: 1,
      }));
      break;
    case 'A03':
      pushStatus(state, newStatus('A03', 'PURCHASE_SURCHARGE', instance, actor, {
        targetPlayerId, percent: 20, capUnits: 50, ownerTurnPlayerId: targetPlayerId, remainingOwnerTurns: 2, remainingUses: 1,
      }));
      break;
    case 'A04':
      if (!targetProperty) throw new CommandError('CONFLICT', 'Tài sản mục tiêu đã đổi chủ.');
      pushStatus(state, newStatus('A04', 'RENT_MODIFIER', instance, actor, {
        targetPlayerId: targetProperty.id, targetTileID, percent: -25,
        ownerTurnPlayerId: targetProperty.id, remainingOwnerTurns: 3, remainingUses: 2,
      }));
      break;
    case 'A05':
      pushStatus(state, newStatus('A05', 'BUILD_RESTRICTION', instance, actor, {
        targetPlayerId, ownerTurnPlayerId: targetPlayerId, remainingOwnerTurns: 1,
      }));
      break;
    case 'A07':
      pushStatus(state, newStatus('A07', 'RENT_SHARE', instance, actor, {
        targetPlayerId, percent: 50, capUnits: 100, ownerTurnPlayerId: targetPlayerId,
        remainingOwnerTurns: 2, remainingUses: 1,
      }));
      break;
    case 'A08':
      pushStatus(state, newStatus('A08', 'RENT_MODIFIER', instance, actor, {
        affectedPlayerIds: Object.keys(state.players).filter(id => id !== actor && !areTeammates(state, actor, id)),
        percent: -50, expiresAtStartPlayerId: actor,
      }));
      break;
    case 'A10':
      pushStatus(state, newStatus('A10', 'RENT_SURCHARGE', instance, actor, {
        targetPlayerId, percent: 50, capUnits: 100, ownerTurnPlayerId: targetPlayerId,
        remainingOwnerTurns: 2, remainingUses: 1,
      }));
      break;
    default:
      throw new CommandError('CONFLICT', 'Thẻ này không tạo hiệu ứng duy trì.');
  }
}

function collectBuildings(state: GameState, owner: PlayerId): number {
  return Object.values(state.boardState.ownedProps).reduce((sum, property) => {
    if (property.id !== owner) return sum;
    return sum + (property.houses === 5 ? 5 : property.houses);
  }, 0);
}

function levyBuildings(state: GameState, payerId: PlayerId, operationId: string, now: number): void {
  const amount = Math.min(50, collectBuildings(state, payerId) * 10);
  if (amount <= 0) return;
  const continuation = { playerId: state.boardState.currentPlayer.id, turnNumber: state.boardState.turnNumber, resume: { kind: 'NO_TURN_CHANGE' as const } };
  enqueuePayments(state, [{ debtorPlayerId: payerId, creditor: 'BANK', amount, source: { kind: 'CARD', cardId: 'A09' } }], continuation, { now, operationId });
  progressPaymentQueue(state, { now });
}

function applyAttack(
  state: GameState,
  actor: PlayerId,
  instance: PowerUpInstance,
  definitionId: string,
  targetPlayerId: PlayerId | undefined,
  targetTileID: number | undefined,
  now: number,
): void {
  const op = randomUUID();
  if (definitionId === 'A01') {
    const target = targetPlayerId && state.players[targetPlayerId];
    const amount = target ? Math.min(50, Math.floor(Math.max(0, target.accountBalance) * 10 / 100)) : 0;
    if (targetPlayerId) directTransfer(state, targetPlayerId, actor, amount, 'OTHER', op);
    sendToLog(state, `${activityPlayerName(state, actor)} đã dùng Móc Túi.`);
  } else if (definitionId === 'A06') {
    const inventory = targetPlayerId && inventoryOf(state, targetPlayerId);
    const own = inventoryOf(state, actor);
    if (!targetPlayerId || !inventory || !own || inventory.cards.length === 0 || own.capacity !== null && own.cards.length >= own.capacity) {
      throw new CommandError('CONFLICT', 'Không còn thẻ hợp lệ để đánh cắp.');
    }
    const stolen = inventory.cards.splice(randomInt(inventory.cards.length), 1)[0];
    stolen.ownerPlayerId = actor;
    own.cards.push(stolen);
  } else if (definitionId === 'A09') {
    if (targetPlayerId) levyBuildings(state, targetPlayerId, op, now);
  } else if (definitionId !== 'A08') {
    addAttackStatus(state, actor, instance, definitionId, targetPlayerId, targetTileID);
  } else {
    addAttackStatus(state, actor, instance, definitionId);
  }
  removeInstance(state, actor, instance.instanceId);
}

function shieldIntercepts(state: GameState, tileID: number | undefined): PowerUpStatus | undefined {
  if (tileID === undefined) return undefined;
  const owner = state.boardState.ownedProps[tileID]?.id;
  return statusesOf(state).find(status => status.kind === 'PROPERTY_SHIELD' && status.targetTileID === tileID
    && status.targetPlayerId === owner && status.remainingUses !== undefined && status.remainingUses > 0);
}
function statusesOf(state: GameState): PowerUpStatus[] {
  return state.privateState.powerUps?.statuses ?? [];
}
function consumeStatusCharge(state: GameState, status: PowerUpStatus): void {
  status.remainingUses = Math.max(0, (status.remainingUses ?? 1) - 1);
  if (status.remainingUses === 0) {
    state.privateState.powerUps!.statuses = statusesOf(state).filter(item => item.statusId !== status.statusId);
  }
}

export function activatePowerUp(
  state: GameState,
  actor: PlayerId,
  request: PowerUpActivationRequest,
  now = Date.now(),
  targetIsBot = false,
): void {
  const found = activeDefinition(request.instanceId, actor, state);
  if (!found) throw new CommandError('FORBIDDEN', 'Thẻ này không thuộc kho của bạn.');
  const { instance, definition } = found;
  if (!activeIds.has(definition.definitionId) || definition.activation !== 'ACTIVE') {
    throw new CommandError('CONFLICT', 'Thẻ này không phải thẻ Active.');
  }
  assertCurrentActivePoint(state, actor);
  assertActiveUnused(state, actor);
  assertNoConflictingInteraction(state);
  activeTiming(state, actor, definition.definitionId, request);

  const target = request.targetPlayerId;
  const tileID = request.targetTileID;
  const id = definition.definitionId;
  assertActivationRequestMatchesEffect(id, request);
  if (['A01', 'A03', 'A05', 'A06', 'A07', 'A09', 'A10'].includes(id)) {
    if (!target) throw new CommandError('INVALID_REQUEST', 'Thẻ cần một người chơi mục tiêu.');
    assertOpponent(state, actor, target);
  }
  if (id === 'A01' && (state.players[target!]?.accountBalance ?? 0) <= 0) {
    throw new CommandError('CONFLICT', 'Đối thủ không có tiền khả dụng để lấy.');
  }
  if (id === 'A02' && (tileID === undefined || !ownsTile(state, actor, tileID))) {
    throw new CommandError('CONFLICT', 'Hãy chọn tài sản thuộc quyền sở hữu của bạn.');
  }
  if (id === 'A04' && (tileID === undefined || !target || !ownsTile(state, target, tileID))) {
    throw new CommandError('CONFLICT', 'Hãy chọn tài sản của đối thủ đã chọn.');
  }
  if (id === 'A04') assertOpponent(state, actor, target!);
  if (id === 'A06' && (!target || cardsOf(state, target).length === 0
    || (inventoryOf(state, actor)?.capacity !== null
      && (inventoryOf(state, actor)?.cards.length ?? 0) >= (inventoryOf(state, actor)?.capacity ?? 0)))) {
    throw new CommandError('CONFLICT', 'Bạn cần chỗ trống và đối thủ cần có ít nhất một thẻ.');
  }
  if (id === 'A09' && (!target || collectBuildings(state, target) === 0)) {
    throw new CommandError('CONFLICT', 'Đối thủ chưa có Nhà hoặc Khách sạn để thu phí.');
  }
  if (id === 'D04' && (tileID === undefined || !ownsTile(state, actor, tileID))) {
    throw new CommandError('CONFLICT', 'Lá chắn cần một tài sản bạn đang sở hữu.');
  }
  if (id === 'D10') {
    const removable = statusesOf(state).find(status => status.statusId === request.statusId
      && ['A03', 'A04', 'A05', 'A07', 'A08', 'A10'].includes(status.definitionId)
      && (status.targetPlayerId === actor || status.affectedPlayerIds?.includes(actor)
        || (status.targetTileID !== undefined && ownsTile(state, actor, status.targetTileID))));
    if (!removable) throw new CommandError('CONFLICT', 'Không tìm thấy hiệu ứng tiêu cực có thể gỡ.');
  }
  if (id === 'U03' && (tileID === undefined || !isEligibleUnownedProperty(tileID)
    || state.boardState.ownedProps[tileID] || state.turnInfo.pendingPropertyDecision?.tileID !== tileID)) {
    throw new CommandError('CONFLICT', 'Phiếu chỉ áp dụng cho tài sản chưa có chủ đang chờ mua.');
  }
  if (id === 'U04' && (!request.ingredientInstanceIds || request.ingredientInstanceIds.length !== 2)) {
    throw new CommandError('INVALID_REQUEST', 'Hiến Tế Nâng Cấp cần chọn đúng hai thẻ nguyên liệu.');
  }
  if (id === 'U05' && (!Number.isSafeInteger(request.movementDelta) || request.movementDelta! < -3 || request.movementDelta! > 3)) {
    throw new CommandError('INVALID_REQUEST', 'Định Hướng cần chọn số bước điều chỉnh.');
  }
  if (id === 'U06') {
    if (!target) throw new CommandError('INVALID_REQUEST', 'Trao Đổi Vận May cần chọn người chơi.');
    assertOpponent(state, actor, target);
    const others = cardsOf(state, actor).filter(card => card.instanceId !== instance.instanceId);
    if (!others.length || !cardsOf(state, target).length) throw new CommandError('CONFLICT', 'Cả hai kho cần có thẻ để trao đổi.');
  }
  if (id === 'U07' && (tileID === undefined || !isEligibleUnownedProperty(tileID)
    || state.boardState.ownedProps[tileID] || !tileState[tileID])) {
    throw new CommandError('CONFLICT', 'Hãy chọn tài sản hợp lệ chưa có chủ.');
  }
  if (id === 'U08' && (tileID === undefined || !isEligibleUnownedProperty(tileID))) {
    throw new CommandError('CONFLICT', 'Hãy chọn một ô tài sản hợp lệ để dịch chuyển.');
  }
  if (id === 'U10') {
    if (!request.transformedInstanceId || !request.category) throw new CommandError('INVALID_REQUEST', 'Tái Cấu Trúc cần chọn thẻ và nhóm mới.');
    const transformed = cardsOf(state, actor).find(card => card.instanceId === request.transformedInstanceId);
    if (!transformed || transformed.instanceId === instance.instanceId
      || OFFICIAL_POWER_UP_REGISTRY.get(transformed.definitionId).rarity === 'LEGENDARY') {
      throw new CommandError('CONFLICT', 'Chỉ được đổi một thẻ khác không phải Legendary.');
    }
    const rarity = OFFICIAL_POWER_UP_REGISTRY.get(transformed.definitionId).rarity;
    if (!OFFICIAL_POWER_UP_DEFINITIONS.some(card => card.category === request.category
      && card.rarity === rarity && card.definitionId !== transformed.definitionId)) {
      throw new CommandError('CONFLICT', 'Nhóm đã chọn không có thẻ hợp lệ ở cùng độ hiếm.');
    }
  }

  if (id === 'U04') {
    try {
      const plan = planU04Upgrade({
        actorPlayerId: actor,
        inventory: inventoryOf(state, actor)!,
        activatorInstanceId: instance.instanceId,
        ingredientInstanceIds: request.ingredientInstanceIds!,
      });
      for (const cardId of plan.consumedInstanceIds) removeInstance(state, actor, cardId);
      const inventory = inventoryOf(state, actor)!;
      inventory.cards.push({
        instanceId: randomUUID(), ownerPlayerId: actor, obtainedFromOfferId: randomUUID(),
        definitionId: plan.outputDefinition.definitionId,
      });
    } catch (error) {
      throw new CommandError('CONFLICT', error instanceof Error ? error.message : 'Công thức thẻ không hợp lệ.');
    }
    markActiveUsed(state, actor);
    return;
  }

  if (id === 'U06') {
    markActiveUsed(state, actor);
    const trade = {
      requestId: randomUUID(), initiatorPlayerId: actor, targetPlayerId: target!,
      activatorInstanceId: instance.instanceId, deadlineAt: new Date(now + REACTION_WINDOW_MS).toISOString(),
    };
    powerUpsOf(state).pendingTrade = trade;
    if (targetIsBot) resolvePowerUpTrade(state, target!, { requestId: trade.requestId, accept: false }, now);
    return;
  }

  if (id === 'U01' || id === 'U02' || id === 'U05' || id === 'U08') {
    const pending = state.privateState.powerUps?.pendingMovement;
    if (!pending) throw new CommandError('CONFLICT', 'Không có kết quả đổ xúc xắc để thay đổi.');
    const originalTotal = pending.dice.dice1 + pending.dice.dice2;
    if (id === 'U01') {
      const rerolled = rollDice();
      state.boardState.diceValue = rerolled;
      recordActivityEvent(state, {
        type: 'DICE_ROLL', playerId: actor, playerName: activityPlayerName(state, actor),
        dice1: rerolled.dice1, dice2: rerolled.dice2,
        total: rerolled.dice1 + rerolled.dice2, context: 'TURN',
      });
      sendToLog(state, `${activityPlayerName(state, actor)} dùng Xúc Xắc May Mắn.`);
      consumeActive(state, actor, instance);
      finishPowerUpMovement(state, actor, rerolled.dice1 + rerolled.dice2,
        rerolled.dice1 + rerolled.dice2, now);
      return;
    }
    if (id === 'U02') {
      consumeActive(state, actor, instance);
      finishPowerUpMovement(state, actor, originalTotal + 2, originalTotal, now);
      return;
    }
    if (id === 'U05') {
      consumeActive(state, actor, instance);
      finishPowerUpMovement(state, actor, Math.max(1, originalTotal + request.movementDelta!), originalTotal, now);
      return;
    }
    consumeActive(state, actor, instance);
    finishPowerUpMovement(state, actor, originalTotal, originalTotal, now, tileID);
    return;
  }

  if (id.startsWith('A')) {
    if (id === 'A02' && tileID === undefined) throw new CommandError('INVALID_REQUEST', 'Hãy chọn tài sản mục tiêu.');
    if (id === 'A04' && tileID === undefined) throw new CommandError('INVALID_REQUEST', 'Hãy chọn tài sản mục tiêu.');
    if (id !== 'A08' && id !== 'A02' && id !== 'A04' && !target) throw new CommandError('INVALID_REQUEST', 'Hãy chọn người chơi mục tiêu.');
    markActiveUsed(state, actor);
    if (id === 'A04') {
      const shield = shieldIntercepts(state, tileID);
      if (shield) {
        consumeStatusCharge(state, shield);
        removeInstance(state, actor, instance.instanceId);
        sendToLog(state, 'Lá Chắn Bất Động Sản đã chặn Phong Tỏa lên tài sản.');
        return;
      }
    }
    if (target && createAttackReaction(state, actor, instance, id, target, tileID, now)) {
      if (targetIsBot) respondPowerUpReaction(state, target, { eventId: state.privateState.powerUps!.pendingReaction!.eventId, action: 'PASS' }, now);
      return;
    }
    applyAttack(state, actor, instance, id, target, tileID, now);
    return;
  }

  if (id === 'D04') {
    markActiveUsed(state, actor);
    pushStatus(state, newStatus('D04', 'PROPERTY_SHIELD', instance, actor, {
      targetTileID: tileID, targetPlayerId: actor, ownerTurnPlayerId: actor,
      remainingOwnerTurns: 3, remainingUses: 2,
    }));
    removeInstance(state, actor, instance.instanceId);
    return;
  }
  if (id === 'D10') {
    markActiveUsed(state, actor);
    state.privateState.powerUps!.statuses = statusesOf(state).flatMap(status => {
      if (status.statusId !== request.statusId) return [status];
      if (!status.affectedPlayerIds) return [];
      const affectedPlayerIds = status.affectedPlayerIds.filter(playerId => playerId !== actor);
      return affectedPlayerIds.length ? [{ ...status, affectedPlayerIds }] : [];
    });
    removeInstance(state, actor, instance.instanceId);
    return;
  }
  if (id === 'U03') {
    markActiveUsed(state, actor);
    pushStatus(state, newStatus('U03', 'PURCHASE_DISCOUNT', instance, actor, {
      targetTileID: tileID, percent: 15, capUnits: 50, expiresAtTurnNumber: state.boardState.turnNumber,
    }));
    removeInstance(state, actor, instance.instanceId);
    return;
  }
  if (id === 'U07') {
    const basePrice = purchaseBasePrice(tileID!);
    const price = powerUpPurchasePrice(state, actor, tileID!, Math.ceil(basePrice * 125 / 100));
    if (state.players[actor].accountBalance < price) throw new CommandError('CONFLICT', 'Không đủ tiền cho giao dịch Đầu Tư Từ Xa.');
    state.players[actor].accountBalance -= price;
    const operationId = randomUUID();
    recordPublicGameplayEvent(state, {
      type: 'MONEY_TRANSFER', source: { kind: 'PLAYER', playerId: actor },
      destination: { kind: 'BANK' }, amount: price, reason: 'PROPERTY_PURCHASE', operationId,
    });
    if (!transferProperty(state, tileID!, null, actor, 'BANK_PURCHASE', { operationId }).ok) {
      throw new CommandError('CONFLICT', 'Tài sản không còn khả dụng.');
    }
    consumePowerUpPurchaseStatuses(state, actor, tileID!);
    consumeActive(state, actor, instance);
    return;
  }
  if (id === 'U09') {
    markActiveUsed(state, actor);
    pushStatus(state, newStatus('U09', 'BUILD_DISCOUNT', instance, actor, {
      percent: 20, capUnits: 50, ownerTurnPlayerId: actor, remainingOwnerTurns: 2, remainingUses: 1,
    }));
    removeInstance(state, actor, instance.instanceId);
    return;
  }
  if (id === 'U10') {
    const transformedIndex = inventoryOf(state, actor)!.cards.findIndex(card => card.instanceId === request.transformedInstanceId);
    const transformed = inventoryOf(state, actor)!.cards[transformedIndex];
    const rarity = OFFICIAL_POWER_UP_REGISTRY.get(transformed.definitionId).rarity;
    const pool = OFFICIAL_POWER_UP_DEFINITIONS.filter(card => card.category === request.category
      && card.rarity === rarity && card.definitionId !== transformed.definitionId);
    const replacement = pool[randomInt(pool.length)];
    if (!replacement) throw new CommandError('CONFLICT', 'Không có thẻ thay thế hợp lệ.');
    removeInstance(state, actor, instance.instanceId);
    removeInstance(state, actor, transformed.instanceId);
    inventoryOf(state, actor)!.cards.push({
      instanceId: randomUUID(), ownerPlayerId: actor, obtainedFromOfferId: randomUUID(),
      definitionId: replacement.definitionId,
    });
    markActiveUsed(state, actor);
    return;
  }
  throw new CommandError('CONFLICT', 'Hiệu ứng thẻ này chưa có bộ xử lý.');
}

function canD03Block(state: GameState, event: Extract<PendingPowerUpReaction, { kind: 'ATTACK' }>): boolean {
  const target = event.targetTileID === undefined
    ? event.targetPlayerId ? { kind: 'PLAYER' as const, playerId: event.targetPlayerId } : { kind: 'GLOBAL' as const }
    : { kind: 'TILE' as const, tileID: event.targetTileID, ownerPlayerId: state.boardState.ownedProps[event.targetTileID]?.id ?? '' };
  return event.attackDefinitionId !== 'A01' && event.attackDefinitionId !== 'A06'
    && event.attackDefinitionId !== 'A09'
    && canD03BlockAttack({ attackId: event.attackDefinitionId, defenderPlayerId: event.defenderPlayerId,
      stage: 'BEFORE_STATUS_CREATION', target });
}

function reflectAttack(
  state: GameState,
  event: Extract<PendingPowerUpReaction, { kind: 'ATTACK' }>,
  redirectPlayerId?: PlayerId,
  redirectTileID?: number,
  now = Date.now(),
): void {
  const attacker = state.players[event.attackerPlayerId];
  const defender = state.players[event.defenderPlayerId];
  const attackInstance = cardsOf(state, event.attackerPlayerId).find(card => card.instanceId === event.attackInstanceId);
  if (!attacker || !defender || !attackInstance) throw new CommandError('CONFLICT', 'Đòn tấn công không còn hiệu lực.');
  const id = event.attackDefinitionId;
  if (id === 'A01') {
    const amount = Math.min(50, Math.floor(Math.max(0, attacker.accountBalance) * 10 / 100));
    directTransfer(state, event.attackerPlayerId, event.defenderPlayerId, amount, 'OTHER', event.eventId);
    removeInstance(state, event.attackerPlayerId, attackInstance.instanceId);
    return;
  }
  if (id === 'A04') {
    if (redirectTileID === undefined || !ownsTile(state, event.attackerPlayerId, redirectTileID)) {
      throw new CommandError('CONFLICT', 'Phản Đòn cần chọn tài sản của người tấn công.');
    }
    const shield = shieldIntercepts(state, redirectTileID);
    if (shield) consumeStatusCharge(state, shield);
    else addAttackStatus(state, event.defenderPlayerId, attackInstance, id, event.attackerPlayerId, redirectTileID);
    removeInstance(state, event.attackerPlayerId, attackInstance.instanceId);
    return;
  }
  if (id === 'A06') {
    const source = inventoryOf(state, event.attackerPlayerId);
    const receiver = inventoryOf(state, event.defenderPlayerId);
    const eligible = source?.cards.filter(item => item.instanceId !== attackInstance.instanceId) ?? [];
    if (!eligible.length || !receiver || receiver.capacity !== null && receiver.cards.length >= receiver.capacity) {
      throw new CommandError('CONFLICT', 'Không thể đổi hướng Trộm Thẻ vì kho không đủ điều kiện.');
    }
    const stolen = eligible[randomInt(eligible.length)];
    removeInstance(state, event.attackerPlayerId, stolen.instanceId);
    stolen.ownerPlayerId = event.defenderPlayerId;
    receiver.cards.push(stolen);
    removeInstance(state, event.attackerPlayerId, attackInstance.instanceId);
    return;
  }
  if (id === 'A09') {
    levyBuildings(state, event.attackerPlayerId, event.eventId, now);
    removeInstance(state, event.attackerPlayerId, attackInstance.instanceId);
    return;
  }
  if (['A03', 'A05', 'A07', 'A10'].includes(id)) {
    addAttackStatus(state, event.defenderPlayerId, attackInstance, id, event.attackerPlayerId);
    removeInstance(state, event.attackerPlayerId, attackInstance.instanceId);
    return;
  }
  if (redirectPlayerId || redirectTileID !== undefined) throw new CommandError('INVALID_REQUEST', 'Đích phản đòn không hợp lệ.');
  applyAttack(state, event.attackerPlayerId, attackInstance, id, event.targetPlayerId, event.targetTileID, now);
}

function resolveAttackEvent(
  state: GameState,
  event: Extract<PendingPowerUpReaction, { kind: 'ATTACK' }>,
  now = Date.now(),
): void {
  const attackInstance = cardsOf(state, event.attackerPlayerId).find(card => card.instanceId === event.attackInstanceId);
  if (!attackInstance) return;
  applyAttack(state, event.attackerPlayerId, attackInstance, event.attackDefinitionId,
    event.targetPlayerId, event.targetTileID, now);
}

export function respondPowerUpReaction(
  state: GameState,
  actor: PlayerId,
  request: PowerUpReactionRequest,
  now = Date.now(),
  automatic = false,
): void {
  const event = state.privateState.powerUps?.pendingReaction;
  if (!event || event.eventId !== request.eventId) throw new CommandError('CONFLICT', 'Cửa sổ phản ứng đã kết thúc.');
  const defender = event.kind === 'ATTACK' ? event.defenderPlayerId : event.debtorPlayerId;
  if (actor !== defender || !state.players[actor]) throw new CommandError('FORBIDDEN', 'Bạn không được phản ứng với sự kiện này.');
  if (!automatic && Date.parse(event.deadlineAt) <= now) throw new CommandError('CONFLICT', 'Thời gian phản ứng đã hết.');
  state.privateState.powerUps!.pendingReaction = null;
  const resolvedEvents = powerUpsOf(state).resolvedReactionEventIds!;
  if (!resolvedEvents.includes(event.eventId)) {
    resolvedEvents.push(event.eventId);
    if (resolvedEvents.length > 256) resolvedEvents.splice(0, resolvedEvents.length - 256);
  }
  if (event.kind === 'SHORTFALL' && !resolvedEvents.includes(event.paymentOperationId)) {
    resolvedEvents.push(event.paymentOperationId);
    if (resolvedEvents.length > 256) resolvedEvents.splice(0, resolvedEvents.length - 256);
  }
  if (event.kind === 'RENT') {
    let defenseId: string | null = null;
    let defenseInstanceId: string | null = null;
    if (request.action === 'REACT') {
      const defense = cardsOf(state, actor).find(card => card.instanceId === request.instanceId);
      if (!defense || !['D01', 'D08'].includes(defense.definitionId)) {
        throw new CommandError('FORBIDDEN', 'Thẻ phản ứng này không hợp lệ cho khoản thuê.');
      }
      defenseId = defense.definitionId;
      defenseInstanceId = defense.instanceId;
    }
    resolvePowerUpRent(state, event, defenseId, defenseInstanceId, now);
    return;
  }
  if (event.kind === 'SHORTFALL') {
    resolveShortfallReaction(state, event, request, now);
    return;
  }
  if (request.action === 'PASS') {
    resolveAttackEvent(state, event, now);
    return;
  }
  const card = cardsOf(state, actor).find(item => item.instanceId === request.instanceId);
  if (!card || !reactionCardAllowed(event.attackDefinitionId, card.definitionId)) {
    throw new CommandError('FORBIDDEN', 'Thẻ phản ứng không tương thích với đòn này.');
  }
  if (card.definitionId === 'D03') {
    if (!canD03Block(state, event)) throw new CommandError('CONFLICT', 'Phá Mưu không chặn được đòn này.');
    removeInstance(state, actor, card.instanceId);
    removeInstance(state, event.attackerPlayerId, event.attackInstanceId);
    return;
  }
  if (card.definitionId === 'D06' || card.definitionId === 'D02' || card.definitionId === 'D09') {
    removeInstance(state, actor, card.instanceId);
    removeInstance(state, event.attackerPlayerId, event.attackInstanceId);
    return;
  }
  if (card.definitionId === 'D05') {
    // Reserve the consumed Reaction slot before an A06 reflection receives a card.
    removeInstance(state, actor, card.instanceId);
    reflectAttack(state, event, request.redirectPlayerId, request.redirectTileID, now);
    return;
  }
  throw new CommandError('CONFLICT', 'Thẻ phản ứng này chưa có bộ xử lý.');
}

function resolveShortfallReaction(
  state: GameState,
  event: Extract<PendingPowerUpReaction, { kind: 'SHORTFALL' }>,
  request: PowerUpReactionRequest,
  now: number,
): void {
  if (request.action === 'PASS') {
    const progress = progressPaymentQueue(state, { now });
    if (progress.status === 'COMPLETED' && progress.continuation) completeTurnResolution(state, progress.continuation);
    return;
  }
  const card = cardsOf(state, event.debtorPlayerId).find(item => item.instanceId === request.instanceId);
  const queue = state.boardState.paymentQueue;
  const claim = queue?.orderedClaims[queue.activeClaimIndex];
  if (!card || card.definitionId !== 'D07' || !queue || !claim || claim.claimId !== event.claimId
    || queue.operationId !== event.paymentOperationId) {
    throw new CommandError('CONFLICT', 'Quỹ Cứu Trợ không còn phù hợp với khoản thiếu hụt.');
  }
  const debtor = state.players[event.debtorPlayerId];
  if (!debtor) throw new CommandError('CONFLICT', 'Người nợ không còn trong ván.');
  const paid = Math.min(Math.max(0, debtor.accountBalance), claim.remainingAmount);
  const contribution = Math.min(100, Math.max(0, claim.remainingAmount - paid));
  debtor.accountBalance -= paid;
  creditPaymentReceipt(state, claim, paid, { kind: 'PLAYER', playerId: event.debtorPlayerId }, queue.operationId);
  creditPaymentReceipt(state, claim, contribution, { kind: 'BANK' }, queue.operationId);
  claim.remainingAmount -= paid + contribution;
  if (claim.remainingAmount <= 0) { claim.remainingAmount = 0; claim.status = 'SETTLED'; queue.activeClaimIndex += 1; }
  removeInstance(state, event.debtorPlayerId, card.instanceId);
  const progress = progressPaymentQueue(state, { now });
  if (progress.status === 'COMPLETED' && progress.continuation) completeTurnResolution(state, progress.continuation);
}

export function beginPowerUpShortfallReaction(state: GameState, now = Date.now()): boolean {
  const powerUps = powerUpsOf(state);
  const queue = state.boardState.paymentQueue;
  const claim = queue?.orderedClaims[queue.activeClaimIndex];
  if (!queue || !claim || powerUps.pendingReaction
    || powerUps.resolvedReactionEventIds!.includes(claim.claimId)
    || powerUps.resolvedReactionEventIds!.includes(queue.operationId)
    || !state.players[claim.debtorPlayerId]
    || !cardsOf(state, claim.debtorPlayerId).some(card => card.definitionId === 'D07')) return false;
  powerUps.pendingReaction = {
    kind: 'SHORTFALL', eventId: claim.claimId, debtorPlayerId: claim.debtorPlayerId,
    claimId: claim.claimId, paymentOperationId: queue.operationId,
    deadlineAt: new Date(now + REACTION_WINDOW_MS).toISOString(),
  };
  return true;
}

export function resolvePowerUpTrade(state: GameState, actor: PlayerId, request: ResolvePowerUpTradeRequest, now = Date.now()): void {
  const trade = state.privateState.powerUps?.pendingTrade;
  if (!trade || trade.requestId !== request.requestId) throw new CommandError('CONFLICT', 'Yêu cầu trao đổi đã kết thúc.');
  if (actor !== trade.targetPlayerId) throw new CommandError('FORBIDDEN', 'Bạn không được trả lời yêu cầu này.');
  if (Date.parse(trade.deadlineAt) <= now) request = { ...request, accept: false };
  state.privateState.powerUps!.pendingTrade = null;
  if (!request.accept) return; // Declining keeps U06 but retains the initiator's Active use for this turn.
  const initiator = inventoryOf(state, trade.initiatorPlayerId);
  const target = inventoryOf(state, trade.targetPlayerId);
  const activator = initiator?.cards.find(card => card.instanceId === trade.activatorInstanceId);
  const initiatorPool = initiator?.cards.filter(card => card.instanceId !== trade.activatorInstanceId) ?? [];
  const targetPool = target?.cards ?? [];
  if (!initiator || !target || !activator || !initiatorPool.length || !targetPool.length) {
    throw new CommandError('CONFLICT', 'Kho thẻ đã đổi; yêu cầu trao đổi bị hủy.');
  }
  const firstIndex = randomInt(initiatorPool.length);
  const secondIndex = randomInt(targetPool.length);
  const first = initiatorPool[firstIndex];
  const second = targetPool[secondIndex];
  removeInstance(state, trade.initiatorPlayerId, activator.instanceId);
  removeInstance(state, trade.initiatorPlayerId, first.instanceId);
  removeInstance(state, trade.targetPlayerId, second.instanceId);
  first.ownerPlayerId = trade.targetPlayerId;
  second.ownerPlayerId = trade.initiatorPlayerId;
  inventoryOf(state, trade.initiatorPlayerId)!.cards.push(second);
  inventoryOf(state, trade.targetPlayerId)!.cards.push(first);
}

export function expirePowerUpInteraction(state: GameState, now = Date.now()): boolean {
  const powerUps = state.privateState.powerUps;
  const reaction = powerUps?.pendingReaction;
  if (reaction && Date.parse(reaction.deadlineAt) <= now) {
    respondPowerUpReaction(state,
      reaction.kind === 'ATTACK' ? reaction.defenderPlayerId : reaction.debtorPlayerId,
      { eventId: reaction.eventId, action: 'PASS' }, now, true);
    return true;
  }
  const trade = powerUps?.pendingTrade;
  if (trade && Date.parse(trade.deadlineAt) <= now) {
    resolvePowerUpTrade(state, trade.targetPlayerId, { requestId: trade.requestId, accept: false }, now);
    return true;
  }
  return false;
}

export function eligiblePowerUpReactionIds(state: GameState, owner: PlayerId): string[] {
  const event = state.privateState.powerUps?.pendingReaction;
  if (!event || owner !== (event.kind === 'ATTACK' ? event.defenderPlayerId : event.debtorPlayerId)) return [];
  if (event.kind === 'RENT') {
    const inventory = inventoryOf(state, owner);
    return (inventory?.cards ?? []).filter(card => card.definitionId === 'D01' || card.definitionId === 'D08')
      .map(card => card.instanceId);
  }
  if (event.kind === 'SHORTFALL') return cardsOf(state, owner).filter(card => card.definitionId === 'D07').map(card => card.instanceId);
  return reactionIds(state, event);
}

export function autoPassBotReaction(state: GameState, now = Date.now()): boolean {
  const event = state.privateState.powerUps?.pendingReaction;
  if (!event) return false;
  const actor = event.kind === 'ATTACK' ? event.defenderPlayerId : event.debtorPlayerId;
  return respondPowerUpReaction(state, actor, { eventId: event.eventId, action: 'PASS' }, now), true;
}

export function powerUpStatusSnapshot(state: GameState): readonly PowerUpStatus[] {
  return state.privateState.powerUps?.statuses ?? [];
}

export function attackName(definitionId: string): string {
  return OFFICIAL_POWER_UP_REGISTRY.get(definitionId).name;
}

export function assertPurchasePrice(state: GameState, buyerId: PlayerId, tileID: number, basePrice: number): number {
  return powerUpPurchasePrice(state, buyerId, tileID, basePrice);
}

export function completePurchasePowerUpStatuses(state: GameState, buyerId: PlayerId, tileID: number): void {
  consumePowerUpPurchaseStatuses(state, buyerId, tileID);
}

export function assertBuildPrice(state: GameState, builderId: PlayerId, basePrice: number): number {
  return powerUpBuildPrice(state, builderId, basePrice);
}

export function playerBuildRestricted(state: GameState, playerId: PlayerId): boolean {
  return statusesOf(state).some(status => status.kind === 'BUILD_RESTRICTION'
    && status.targetPlayerId === playerId);
}

export function completeBuildPowerUpStatuses(state: GameState, builderId: PlayerId): void {
  consumePowerUpBuildDiscount(state, builderId);
}
