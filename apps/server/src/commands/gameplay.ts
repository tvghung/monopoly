import {
  areTeammates,
  BAIL_AMOUNT,
  formatMoney,
  gameCardsById,
  tileState,
  type GameState,
  type OfferResult,
  type PendingDevelopmentDecision,
  type PlayerId,
  type TradeBundle,
} from '@monopoly/shared';
import {
  acceptEmergencyRescue,
  acceptForcedSaleProposal,
  activeDebtClaim,
  assertDebtActionAllowed,
  completeTurnResolution,
  continuationForRoll,
  declineEmergencyRescue,
  dismissPendingCard,
  drawPendingCard,
  executeVoluntaryTrade,
  handleJailRoll,
  isDouble,
  movePlayer,
  progressPaymentQueue,
  rejectForcedSaleProposal,
  resolveTile,
  resumePaymentContinuation,
  reviveTeammate,
  rollDice,
  sellPropertyToBankForPayment,
  sendToLog,
  transferProperty,
  type RescueResolution,
} from '../game';
import { activityPlayerName, recordActivityEvent } from '../game/activity';
import { recordPublicGameplayEvent } from '../game/semanticEvents';
import type { RoomRecord, TradeOfferRecord } from '../persistence/types';
import type { RoomSnapshot } from '../rooms';
import {
  cancelPendingOffersForAssets,
  cancelPendingOffersForPlayer,
  emitCancelledOffers,
} from '../services/offerInvalidation';
import { projectPrivateOffer } from '../services/privateOffers';
import { paymentTimingOptions, type AppRuntime } from '../services/runtime';
import type { AuthenticatedActor } from '../socket/authority';
import { broadcastRoom, privatePlayerRoomName } from '../socket/broadcast';
import { CommandError } from '../socket/errors';
import { commitRoomCommand, type DomainCommandContext } from '../socket/roomCommands';
import type { AppServer } from '../socket/types';

/**
 * The gameplay commands a seat can issue, with their whole rule set, written once. A socket handler runs one for the
 * authenticated actor of its connection; the bot driver runs the same one for a bot seat. Nothing here knows who is calling,
 * so a bot can do exactly what a human in its seat could do and is refused exactly as that human would be.
 */
export interface GameCommandInput<TPayload> {
  runtime: AppRuntime;
  roomId: string;
  actorPlayerId: PlayerId;
  payload: TPayload;
  now: Date;
}

export interface GameCommand<TPayload, TResult> {
  readonly name: string;
  apply(context: DomainCommandContext, input: GameCommandInput<TPayload>): TResult | Promise<TResult>;
  /** Everything the handler sends after the commit: private results first, then the room broadcast. */
  publish(io: AppServer, room: RoomRecord<RoomSnapshot>, result: TResult, input: GameCommandInput<TPayload>): void;
}

export interface RunGameCommandOptions {
  /** The socket connection the command came from; a replaced connection is refused inside the room queue. */
  authority?: AuthenticatedActor;
  now?: Date;
  /** Checked inside the room queue before the command runs (the bot driver's stale-task check). */
  guard?: (context: DomainCommandContext) => void;
}

export async function runGameCommand<TPayload, TResult>(
  io: AppServer,
  runtime: AppRuntime,
  command: GameCommand<TPayload, TResult>,
  roomId: string,
  actorPlayerId: PlayerId,
  payload: TPayload,
  options: RunGameCommandOptions = {},
): Promise<{ room: RoomRecord<RoomSnapshot>; result: TResult }> {
  const now = options.now ?? new Date();
  const input: GameCommandInput<TPayload> = { runtime, roomId, actorPlayerId, payload, now };
  const committed = await commitRoomCommand(runtime, roomId, (context) => {
    options.guard?.(context);
    return command.apply(context, input);
  }, now, options.authority);
  if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
  command.publish(io, committed.room, committed.result, input);
  return { room: committed.room, result: committed.result };
}

const tileOptions = (runtime: AppRuntime, now: Date) => ({
  now: now.getTime(),
  ...paymentTimingOptions(runtime),
  cardAwaitingDrawTimeoutMs: runtime.timing.cardAwaitingDrawTimeoutMs,
  cardRevealedTimeoutMs: runtime.timing.cardRevealedTimeoutMs,
});

const publishRoom = (io: AppServer, room: RoomRecord<RoomSnapshot>, input: GameCommandInput<unknown>): void => {
  broadcastRoom(io, input.runtime, room);
};

const publishWithCancelledOffers = (
  io: AppServer,
  room: RoomRecord<RoomSnapshot>,
  cancelled: TradeOfferRecord[],
  input: GameCommandInput<unknown>,
): void => {
  emitCancelledOffers(io, room, cancelled, input.now);
  broadcastRoom(io, input.runtime, room);
};

const emitForcedSaleCleared = (io: AppServer, playerIds: string[]): void => {
  for (const playerId of new Set(playerIds)) {
    io.to(privatePlayerRoomName(playerId)).emit('forced sale proposal', null);
  }
};

// ---- Turn ----

export const rollDiceCommand: GameCommand<void, void> = {
  name: 'roll dice',
  apply({ room, state }, { runtime, actorPlayerId, now }) {
    const player = state.players[actorPlayerId];
    if (room.status !== 'IN_PROGRESS' || state.boardState.winner) {
      throw new CommandError('CONFLICT', 'Ván chơi hiện không nhận lượt mới.');
    }
    if (!player || state.boardState.currentPlayer.id !== actorPlayerId) {
      throw new CommandError('FORBIDDEN', 'Chưa đến lượt của bạn.');
    }
    if (!assertDebtActionAllowed(state, actorPlayerId, 'ROLL')) {
      throw new CommandError('CONFLICT', 'Phải xử lý khoản thanh toán đang chờ trước khi đổ xúc xắc.');
    }
    if (
      state.boardState.currentPlayer.hasMoved
      || state.turnInfo.pendingPropertyDecision
      || state.turnInfo.pendingDevelopmentDecision
      || state.turnInfo.pendingCardInteraction
    ) {
      throw new CommandError('CONFLICT', 'Lượt này chưa thể đổ xúc xắc tiếp.');
    }
    const dice = rollDice();
    if (state.boardState.rollSequence >= Number.MAX_SAFE_INTEGER) {
      throw new CommandError('CONFLICT', 'Ván chơi đã đạt giới hạn số lượt đổ xúc xắc.');
    }
    state.boardState.rollSequence += 1;
    const total = dice.dice1 + dice.dice2;
    recordActivityEvent(state, {
      type: 'DICE_ROLL',
      playerId: actorPlayerId,
      playerName: activityPlayerName(state, actorPlayerId),
      dice1: dice.dice1,
      dice2: dice.dice2,
      total,
      context: player.isJail ? 'JAIL' : 'TURN',
    });
    const continuation = continuationForRoll(state, actorPlayerId);
    if (player.isJail) {
      handleJailRoll(state, actorPlayerId, dice, continuation, tileOptions(runtime, now));
      return;
    }
    state.boardState.diceValue = dice;
    state.boardState.currentPlayer.hasMoved = true;
    sendToLog(state, `${player.name} đổ được ${total}${isDouble(dice) ? ' (đôi)' : ''}.`);
    movePlayer(state, actorPlayerId, total, {
      kind: 'DICE_WALK',
      rollSequence: state.boardState.rollSequence,
    });
    resolveTile(state, actorPlayerId, total, continuation, tileOptions(runtime, now));
  },
  publish: (io, room, _result, input) => publishRoom(io, room, input),
};

export const resolvePurchaseCommand: GameCommand<{ operationId: string; buy: boolean }, void> = {
  name: 'resolve purchase',
  apply({ room, state }, { actorPlayerId, payload: { operationId, buy } }) {
    const decision = state.turnInfo.pendingPropertyDecision;
    const player = state.players[actorPlayerId];
    if (
      room.status !== 'IN_PROGRESS' || state.boardState.winner || !player
      || !decision || decision.operationId !== operationId
      || decision.playerId !== actorPlayerId
      || state.boardState.currentPlayer.id !== actorPlayerId
    ) throw new CommandError('CONFLICT', 'Không có quyết định mua tài sản phù hợp.');
    if (state.boardState.paymentQueue) {
      throw new CommandError('CONFLICT', 'Không thể mua tài sản trong lúc thanh toán thiếu hụt.');
    }
    const tile = tileState[decision.tileID];
    const price = tile?.price ?? 0;
    if (buy) {
      if (!tile || price <= 0 || state.boardState.ownedProps[decision.tileID]) {
        throw new CommandError('CONFLICT', 'Tài sản này không còn khả dụng.');
      }
      if (player.accountBalance < price) {
        throw new CommandError('CONFLICT', `Bạn không đủ tiền mua ${tile.streetName}.`);
      }
      player.accountBalance -= price;
      recordPublicGameplayEvent(state, {
        type: 'MONEY_TRANSFER',
        source: { kind: 'PLAYER', playerId: actorPlayerId },
        destination: { kind: 'BANK' },
        amount: price,
        reason: 'PROPERTY_PURCHASE',
        operationId: decision.operationId,
      });
      if (!transferProperty(
        state,
        decision.tileID,
        null,
        actorPlayerId,
        'BANK_PURCHASE',
        { operationId: decision.operationId },
      ).ok) {
        throw new CommandError('CONFLICT', 'Không thể chuyển quyền sở hữu tài sản.');
      }
      sendToLog(state, `${player.name} đã mua ${tile.streetName}.`);
    }
    state.turnInfo = {};
    completeTurnResolution(state, decision.continuation);
  },
  publish: (io, room, _result, input) => publishRoom(io, room, input),
};

export type DevelopmentRequest =
  | { operationId: string; action: 'SKIP' }
  | { operationId: string; action: 'BUILD_HOUSES'; quantity: number }
  | { operationId: string; action: 'UPGRADE_HOTEL' };

const completeDevelopment = (state: GameState, decision: PendingDevelopmentDecision): void => {
  state.turnInfo = {};
  completeTurnResolution(state, decision.continuation);
};

export const resolveDevelopmentCommand: GameCommand<DevelopmentRequest, TradeOfferRecord[]> = {
  name: 'resolve development',
  async apply({ room, state, transaction }, { roomId, actorPlayerId, payload: request, now }) {
    const decision = state.turnInfo.pendingDevelopmentDecision;
    const player = state.players[actorPlayerId];
    if (
      room.status !== 'IN_PROGRESS' || state.boardState.winner || !player
      || !decision || decision.operationId !== request.operationId
      || decision.playerId !== actorPlayerId
      || state.boardState.currentPlayer.id !== actorPlayerId
    ) throw new CommandError('CONFLICT', 'Không có quyết định phát triển phù hợp.');
    if (state.boardState.paymentQueue) {
      throw new CommandError('CONFLICT', 'Không thể phát triển trong lúc thanh toán thiếu hụt.');
    }
    const property = state.boardState.ownedProps[decision.tileID];
    const tile = tileState[decision.tileID];
    // The owner develops their own street. In 2v2 the lander may fund a teammate's street (Team Investment): the actor
    // alone pays, the owner never changes and contributes nothing.
    const investsInTeammate = property !== undefined
      && property.id !== actorPlayerId
      && areTeammates(state, actorPlayerId, property.id);
    if (
      !property || (property.id !== actorPlayerId && !investsInTeammate) || !tile?.houseCost
      || property.houses !== decision.levelAtLanding
    ) {
      throw new CommandError('CONFLICT', 'Tài sản không còn đủ điều kiện phát triển.');
    }
    const investment = investsInTeammate
      ? { ownerPlayerId: property.id, ownerName: activityPlayerName(state, property.id) }
      : {};
    if (request.action === 'BUILD_HOUSES') {
      if (decision.kind !== 'HOUSES' || request.quantity > 4 - decision.levelAtLanding) {
        throw new CommandError('CONFLICT', 'Số lượng Nhà vượt quá giới hạn của lần đổ này.');
      }
      const cost = request.quantity * tile.houseCost;
      if (player.accountBalance < cost) throw new CommandError('CONFLICT', 'Không đủ tiền xây Nhà.');
      player.accountBalance -= cost;
      recordPublicGameplayEvent(state, {
        type: 'MONEY_TRANSFER',
        source: { kind: 'PLAYER', playerId: actorPlayerId },
        destination: { kind: 'BANK' },
        amount: cost,
        reason: 'DEVELOPMENT',
        operationId: decision.operationId,
      });
      property.houses += request.quantity;
      recordActivityEvent(state, {
        type: 'PROPERTY_DEVELOPMENT',
        playerId: actorPlayerId,
        playerName: activityPlayerName(state, actorPlayerId),
        tileID: decision.tileID,
        fromHouses: decision.levelAtLanding,
        toHouses: property.houses,
        action: 'BUILD',
        cost,
        ...investment,
      });
    } else if (request.action === 'UPGRADE_HOTEL') {
      if (decision.kind !== 'HOTEL' || decision.levelAtLanding !== 4 || property.houses !== 4) {
        throw new CommandError('CONFLICT', 'Tài sản chưa đủ điều kiện nâng cấp Khách sạn.');
      }
      if (player.accountBalance < tile.houseCost) throw new CommandError('CONFLICT', 'Không đủ tiền nâng cấp.');
      player.accountBalance -= tile.houseCost;
      recordPublicGameplayEvent(state, {
        type: 'MONEY_TRANSFER',
        source: { kind: 'PLAYER', playerId: actorPlayerId },
        destination: { kind: 'BANK' },
        amount: tile.houseCost,
        reason: 'DEVELOPMENT',
        operationId: decision.operationId,
      });
      property.houses = 5;
      recordActivityEvent(state, {
        type: 'PROPERTY_DEVELOPMENT',
        playerId: actorPlayerId,
        playerName: activityPlayerName(state, actorPlayerId),
        tileID: decision.tileID,
        fromHouses: 4,
        toHouses: 5,
        action: 'UPGRADE_HOTEL',
        cost: tile.houseCost,
        ...investment,
      });
    }
    if (request.action !== 'SKIP') {
      const cancelled = await cancelPendingOffersForAssets(
        transaction.tradeOffers,
        roomId,
        null,
        [decision.tileID],
        [],
        now,
      );
      completeDevelopment(state, decision);
      return cancelled;
    }
    completeDevelopment(state, decision);
    return [];
  },
  publish: (io, room, cancelled, input) => publishWithCancelledOffers(io, room, cancelled, input),
};

// ---- Jail ----

export const waitInJailCommand: GameCommand<void, void> = {
  name: 'wait in jail',
  apply({ room, state }, { actorPlayerId }) {
    const player = state.players[actorPlayerId];
    if (room.status !== 'IN_PROGRESS' || !player?.isJail
      || state.boardState.currentPlayer.id !== actorPlayerId) {
      throw new CommandError('CONFLICT', 'Bạn không có lượt chờ trong tù.');
    }
    if (state.boardState.paymentQueue) {
      throw new CommandError('CONFLICT', 'Phải xử lý thanh toán trước khi chờ trong tù.');
    }
    completeTurnResolution(state, continuationForRoll(state, actorPlayerId));
  },
  publish: (io, room, _result, input) => publishRoom(io, room, input),
};

export const payBailCommand: GameCommand<void, void> = {
  name: 'pay bail',
  apply({ room, state }, { actorPlayerId: playerId }) {
    const player = state.players[playerId];
    if (
      room.status !== 'IN_PROGRESS'
      || !player?.isJail
      || state.boardState.currentPlayer.id !== playerId
      || state.boardState.currentPlayer.hasMoved
    ) {
      throw new CommandError('FORBIDDEN', 'Hiện không thể trả tiền bảo lãnh.');
    }
    if (!assertDebtActionAllowed(state, playerId, 'BUY')) {
      throw new CommandError('CONFLICT', 'Phải xử lý khoản nợ đang chờ trước.');
    }
    if (player.accountBalance < BAIL_AMOUNT) {
      throw new CommandError('CONFLICT', `Không đủ ${formatMoney(BAIL_AMOUNT)} để trả tiền bảo lãnh.`);
    }
    player.accountBalance -= BAIL_AMOUNT;
    recordPublicGameplayEvent(state, {
      type: 'MONEY_TRANSFER',
      source: { kind: 'PLAYER', playerId },
      destination: { kind: 'BANK' },
      amount: BAIL_AMOUNT,
      reason: 'BAIL',
    });
    player.isJail = false;
    player.jailOpponentRoundsElapsed = 0;
    recordPublicGameplayEvent(state, {
      type: 'JAIL_RELEASED',
      playerId,
      cause: 'BAIL',
    });
    sendToLog(state, `${player.name} đã trả ${formatMoney(BAIL_AMOUNT)} tiền bảo lãnh và được ra tù.`);
  },
  publish: (io, room, _result, input) => publishRoom(io, room, input),
};

export const useJailCardCommand: GameCommand<void, void> = {
  name: 'use jail card',
  apply({ room, state }, { actorPlayerId: playerId }) {
    const player = state.players[playerId];
    if (
      room.status !== 'IN_PROGRESS'
      || !player?.isJail
      || state.boardState.currentPlayer.id !== playerId
      || state.boardState.currentPlayer.hasMoved
      || player.heldJailFreeCardIds.length < 1
    ) {
      throw new CommandError('FORBIDDEN', 'Hiện không thể dùng Thẻ Thoát Tù Miễn Phí.');
    }
    if (!assertDebtActionAllowed(state, playerId, 'BUY')) {
      throw new CommandError('CONFLICT', 'Phải xử lý khoản nợ đang chờ trước.');
    }
    const cardId = player.heldJailFreeCardIds.shift();
    const card = cardId ? gameCardsById[cardId] : undefined;
    const deck = card?.sourceDeck;
    if (!cardId || !deck || !card.getOutOfJailFree) {
      throw new CommandError('CONFLICT', 'Thẻ ra tù không hợp lệ.');
    }
    state.privateState.decks[deck].drawPile.push(cardId);
    player.isJail = false;
    player.jailOpponentRoundsElapsed = 0;
    recordPublicGameplayEvent(state, {
      type: 'JAIL_RELEASED',
      playerId,
      cause: 'JAIL_FREE_CARD',
    });
    sendToLog(state, `${player.name} đã dùng Thẻ Thoát Tù Miễn Phí.`);
  },
  publish: (io, room, _result, input) => publishRoom(io, room, input),
};

// ---- Cards ----

export const drawCardCommand: GameCommand<{ operationId: string }, void> = {
  name: 'draw card',
  apply({ room, state }, { runtime, actorPlayerId, payload, now }) {
    if (
      room.status !== 'IN_PROGRESS'
      || !state.players[actorPlayerId]
    ) throw new CommandError('FORBIDDEN', 'Hiện không thể rút thẻ.');
    const result = drawPendingCard(state, actorPlayerId, payload.operationId, tileOptions(runtime, now));
    if (result === 'STALE') {
      throw new CommandError('CONFLICT', 'Yêu cầu rút thẻ đã lỗi thời.');
    }
  },
  publish: (io, room, _result, input) => publishRoom(io, room, input),
};

export const dismissCardCommand: GameCommand<{ operationId: string }, void> = {
  name: 'dismiss card',
  apply({ room, state }, { runtime, actorPlayerId, payload, now }) {
    if (room.status !== 'IN_PROGRESS' || !state.players[actorPlayerId]) {
      throw new CommandError('FORBIDDEN', 'Hiện không thể đóng thẻ.');
    }
    const result = dismissPendingCard(state, actorPlayerId, payload.operationId, tileOptions(runtime, now));
    if (result === 'STALE') throw new CommandError('CONFLICT', 'Yêu cầu đóng thẻ đã lỗi thời.');
    if (result === 'NOT_REVEALED') {
      throw new CommandError('CONFLICT', 'Thẻ chưa được rút.');
    }
  },
  publish: (io, room, _result, input) => publishRoom(io, room, input),
};

// ---- Debt ----

export const sellPropertyToBankCommand: GameCommand<
  { paymentOperationId: string; claimId: string; tileID: number },
  TradeOfferRecord[]
> = {
  name: 'sell property to bank',
  async apply({ room, state, transaction }, { runtime, roomId, actorPlayerId, payload: request, now }) {
    const claim = activeDebtClaim(state);
    if (room.status !== 'IN_PROGRESS' || !claim || claim.debtorPlayerId !== actorPlayerId) {
      throw new CommandError('FORBIDDEN', 'Bạn không có khoản thanh toán cần bán tài sản.');
    }
    if (Date.parse(state.boardState.paymentQueue?.actionDeadlineAt ?? '') <= now.getTime()) {
      throw new CommandError('CONFLICT', 'Thời hạn thanh toán đã hết; máy chủ đang tự xử lý.');
    }
    const sale = sellPropertyToBankForPayment(
      state,
      actorPlayerId,
      request.paymentOperationId,
      request.claimId,
      request.tileID,
      { now: now.getTime(), ...paymentTimingOptions(runtime) },
    );
    if (!sale.ok) throw new CommandError('CONFLICT', sale.reason);
    const progress = progressPaymentQueue(state, {
      now: now.getTime(),
      ...paymentTimingOptions(runtime),
    });
    if (progress.status === 'COMPLETED' && progress.continuation) {
      resumePaymentContinuation(state, progress.continuation, {
        now: now.getTime(),
        ...paymentTimingOptions(runtime),
      });
    }
    const cancelled = await cancelPendingOffersForAssets(
      transaction.tradeOffers,
      roomId,
      null,
      [request.tileID],
      [],
      now,
    );
    if (!state.players[actorPlayerId]) {
      cancelled.push(...await cancelPendingOffersForPlayer(
        transaction.tradeOffers,
        roomId,
        actorPlayerId,
        now,
      ));
    }
    return cancelled;
  },
  publish: (io, room, cancelled, input) => publishWithCancelledOffers(io, room, cancelled, input),
};

export const acceptForcedSaleCommand: GameCommand<
  { proposalId: string },
  { cancelled: TradeOfferRecord[]; proposalPlayers: string[] }
> = {
  name: 'accept forced sale',
  async apply({ room, state, transaction }, { runtime, roomId, actorPlayerId, payload: request, now }) {
    const proposal = state.privateState.forcedSaleProposal;
    const proposalPlayers = proposal
      ? [proposal.sellerPlayerId, proposal.buyerPlayerId]
      : [];
    const sellerId = proposal?.sellerPlayerId;
    const sale = acceptForcedSaleProposal(state, actorPlayerId, request.proposalId, {
      now: now.getTime(), ...paymentTimingOptions(runtime),
    });
    if (!sale.ok) throw new CommandError('CONFLICT', sale.reason);
    if (room.status !== 'IN_PROGRESS') throw new CommandError('CONFLICT', 'Phòng không còn hoạt động.');
    const progress = progressPaymentQueue(state, {
      now: now.getTime(),
      ...paymentTimingOptions(runtime),
    });
    if (progress.status === 'COMPLETED' && progress.continuation) {
      resumePaymentContinuation(state, progress.continuation, {
        now: now.getTime(),
        ...paymentTimingOptions(runtime),
      });
    }
    const cancelled = await cancelPendingOffersForAssets(
      transaction.tradeOffers,
      roomId,
      null,
      [sale.tileID],
      [],
      now,
    );
    if (sellerId && !state.players[sellerId]) {
      cancelled.push(...await cancelPendingOffersForPlayer(
        transaction.tradeOffers,
        roomId,
        sellerId,
        now,
      ));
    }
    return { cancelled, proposalPlayers };
  },
  publish(io, room, result, input) {
    emitCancelledOffers(io, room, result.cancelled, input.now);
    emitForcedSaleCleared(io, result.proposalPlayers);
    broadcastRoom(io, input.runtime, room);
  },
};

export const rejectForcedSaleCommand: GameCommand<{ proposalId: string }, { proposalPlayers: string[] }> = {
  name: 'reject forced sale',
  apply({ room, state }, { actorPlayerId, payload: request, now }) {
    const proposal = state.privateState.forcedSaleProposal;
    const proposalPlayers = proposal
      ? [proposal.sellerPlayerId, proposal.buyerPlayerId]
      : [];
    if (
      room.status !== 'IN_PROGRESS'
      || !rejectForcedSaleProposal(state, actorPlayerId, request.proposalId, now.getTime())
    ) {
      throw new CommandError('CONFLICT', 'Đề nghị bán bắt buộc không còn hợp lệ.');
    }
    return { proposalPlayers };
  },
  publish(io, room, result, input) {
    emitForcedSaleCleared(io, result.proposalPlayers);
    broadcastRoom(io, input.runtime, room);
  },
};

// A 2v2 Emergency Rescue answer. Accepting pays the debtor's whole remaining shortfall from the rescuer's own balance straight
// to the creditors; declining eliminates the debtor as usual. Either may end the payment queue, so the turn continues.
const rescueAnswer = (
  name: 'accept rescue' | 'decline rescue',
  resolve: typeof acceptEmergencyRescue,
): GameCommand<{ rescueId: string }, TradeOfferRecord[]> => ({
  name,
  async apply({ room, state, transaction }, { runtime, roomId, actorPlayerId, payload: request, now }) {
    if (room.status !== 'IN_PROGRESS') throw new CommandError('CONFLICT', 'Phòng không còn hoạt động.');
    const playersBefore = Object.keys(state.players);
    const options = { now: now.getTime(), ...paymentTimingOptions(runtime) };
    const resolution: RescueResolution = resolve(state, actorPlayerId, request.rescueId, options);
    if (!resolution.ok) throw new CommandError('CONFLICT', resolution.reason);
    if (resolution.progress.status === 'COMPLETED' && resolution.progress.continuation) {
      resumePaymentContinuation(state, resolution.progress.continuation, options);
    }
    // Whoever the queue eliminated no longer trades: cancel their pending offers in the same transaction.
    const cancelled: TradeOfferRecord[] = [];
    for (const playerId of playersBefore) {
      if (!state.players[playerId]) {
        cancelled.push(...await cancelPendingOffersForPlayer(transaction.tradeOffers, roomId, playerId, now));
      }
    }
    return cancelled;
  },
  publish: (io, room, cancelled, input) => publishWithCancelledOffers(io, room, cancelled, input),
});

export const acceptRescueCommand = rescueAnswer('accept rescue', acceptEmergencyRescue);
export const declineRescueCommand = rescueAnswer('decline rescue', declineEmergencyRescue);

// ---- Trading responses ----

const LOCKED_BY_SHORTFALL = 'Giao dịch thông thường bị khóa trong lúc thanh toán thiếu hụt.';
const DEBT_OFFER_ONLY = 'Trong lúc có người đang nợ, chỉ có thể đề nghị mua tài sản của người đó bằng tiền.';

/**
 * While a payment shortfall is open ordinary trading is locked, with one exception (V1.1): any other player may offer cash for
 * properties of the debtor, and the debtor may accept to raise money. That is the whole shape allowed: the proposer offers
 * cash only, the debtor gives properties only. Nothing here applies without a shortfall.
 */
export const assertOfferAllowedDuringShortfall = (
  state: GameState,
  proposerId: string,
  recipientId: string,
  offered: TradeBundle,
  requested: TradeBundle,
): void => {
  if (!state.boardState.paymentQueue) return;
  const claim = activeDebtClaim(state);
  if (!claim) throw new CommandError('CONFLICT', LOCKED_BY_SHORTFALL);
  if (recipientId !== claim.debtorPlayerId || proposerId === claim.debtorPlayerId) {
    throw new CommandError('CONFLICT', LOCKED_BY_SHORTFALL);
  }
  const cashOnly = offered.cash > 0 && offered.propertyIds.length === 0 && offered.jailFreeCardIds.length === 0;
  const propertiesOnly = requested.cash === 0 && requested.propertyIds.length > 0 && requested.jailFreeCardIds.length === 0;
  if (!cashOnly || !propertiesOnly) throw new CommandError('CONFLICT', DEBT_OFFER_ONLY);
  const proposal = state.privateState.forcedSaleProposal;
  if (proposal && requested.propertyIds.includes(proposal.tileID)) {
    throw new CommandError('CONFLICT', 'Tài sản này đang có đề nghị bán bắt buộc.');
  }
};

function offerResult(offer: ReturnType<typeof projectPrivateOffer>, now: Date): OfferResult {
  if (offer.status === 'PENDING') throw new Error('Cannot emit a pending offer result');
  return {
    offerId: offer.offerId,
    status: offer.status,
    proposerPlayerId: offer.proposerPlayerId,
    recipientPlayerId: offer.recipientPlayerId,
    proposerName: offer.proposerName,
    recipientName: offer.recipientName,
    offered: offer.offered,
    requested: offer.requested,
    resolvedAt: offer.resolvedAt ?? now.toISOString(),
  };
}

export function emitOfferResult(
  io: AppServer,
  offer: ReturnType<typeof projectPrivateOffer>,
  event: 'offer declined' | 'offer accepted' | 'offer cancelled',
  now: Date,
): void {
  const result = offerResult(offer, now);
  io.to(privatePlayerRoomName(offer.proposerPlayerId)).emit(event, result);
  io.to(privatePlayerRoomName(offer.recipientPlayerId)).emit(event, result);
}

export const declineOfferCommand: GameCommand<{ offerId: string }, TradeOfferRecord> = {
  name: 'decline offer',
  async apply({ transaction }, { roomId, actorPlayerId, payload: request, now }) {
    const offer = await transaction.tradeOffers.findById(request.offerId);
    if (!offer || offer.roomId !== roomId || offer.recipientPlayerId !== actorPlayerId) {
      throw new CommandError('FORBIDDEN', 'Đề nghị này không thuộc về bạn.');
    }
    if (offer.expiresAt <= now) throw new CommandError('CONFLICT', 'Đề nghị đã hết hạn.');
    const resolved = await transaction.tradeOffers.resolve(offer.id, 'DECLINED', now);
    if (!resolved) throw new CommandError('CONFLICT', 'Đề nghị không còn chờ xử lý.');
    return resolved;
  },
  publish(io, room, resolved, input) {
    emitOfferResult(io, projectPrivateOffer(resolved, room), 'offer declined', input.now);
  },
};

export const acceptOfferCommand: GameCommand<
  { offerId: string },
  { resolved: TradeOfferRecord; cancelled: TradeOfferRecord[] }
> = {
  name: 'accept offer',
  async apply({ room, state, transaction }, { runtime, roomId, actorPlayerId, payload: request, now }) {
    if (room.status !== 'IN_PROGRESS') throw new CommandError('CONFLICT', 'Ván chơi chưa diễn ra.');
    const offer = await transaction.tradeOffers.findById(request.offerId);
    if (!offer || offer.roomId !== roomId || offer.recipientPlayerId !== actorPlayerId) {
      throw new CommandError('FORBIDDEN', 'Đề nghị này không thuộc về bạn.');
    }
    if (offer.expiresAt <= now) throw new CommandError('CONFLICT', 'Đề nghị đã hết hạn.');
    const shortfall = state.boardState.paymentQueue;
    assertOfferAllowedDuringShortfall(
      state,
      offer.proposerPlayerId,
      offer.recipientPlayerId,
      offer.offered,
      offer.requested,
    );
    if (shortfall && Date.parse(shortfall.actionDeadlineAt) <= now.getTime()) {
      throw new CommandError('CONFLICT', 'Thời hạn thanh toán đã hết; máy chủ đang tự xử lý.');
    }
    const tradeOptions = { allowDuringShortfall: Boolean(shortfall) };
    // Read before the trade: a debtor who cannot cover the debt even after this sale is eliminated by it.
    const proposerName = state.players[offer.proposerPlayerId]?.name;
    const recipientName = state.players[offer.recipientPlayerId]?.name;
    const previewState = structuredClone(state);
    const preview = executeVoluntaryTrade(
      previewState,
      offer.proposerPlayerId,
      offer.recipientPlayerId,
      offer.offered,
      offer.requested,
      offer.id,
      tradeOptions,
    );
    if (!preview.ok) throw new CommandError('CONFLICT', preview.reason ?? 'Giao dịch không còn hợp lệ.');
    const result = executeVoluntaryTrade(
      state,
      offer.proposerPlayerId,
      offer.recipientPlayerId,
      offer.offered,
      offer.requested,
      offer.id,
      tradeOptions,
    );
    if (!result.ok) throw new CommandError('CONFLICT', result.reason ?? 'Giao dịch không còn hợp lệ.');
    if (shortfall) {
      // The debtor was paid: settle what the new balance covers, exactly like a sale to the Bank or a forced sale.
      const progress = progressPaymentQueue(state, {
        now: now.getTime(),
        ...paymentTimingOptions(runtime),
      });
      if (progress.status === 'COMPLETED' && progress.continuation) {
        resumePaymentContinuation(state, progress.continuation, {
          now: now.getTime(),
          ...paymentTimingOptions(runtime),
        });
      }
    }
    const resolved = await transaction.tradeOffers.resolve(offer.id, 'ACCEPTED', now);
    if (!resolved) throw new CommandError('CONFLICT', 'Đề nghị không còn chờ xử lý.');
    const cancelled = await cancelPendingOffersForAssets(
      transaction.tradeOffers,
      roomId,
      offer.id,
      [...offer.offered.propertyIds, ...offer.requested.propertyIds],
      [...offer.offered.jailFreeCardIds, ...offer.requested.jailFreeCardIds],
      now,
    );
    if (!state.players[offer.recipientPlayerId]) {
      // The debtor could not cover the debt even after this sale and was eliminated.
      cancelled.push(...await cancelPendingOffersForPlayer(
        transaction.tradeOffers,
        roomId,
        offer.recipientPlayerId,
        now,
      ));
    }
    sendToLog(state, `${proposerName} và ${recipientName} đã hoàn tất giao dịch.`);
    return { resolved, cancelled };
  },
  publish(io, room, result, input) {
    emitOfferResult(io, projectPrivateOffer(result.resolved, room), 'offer accepted', input.now);
    for (const record of result.cancelled) {
      emitOfferResult(io, projectPrivateOffer(record, room), 'offer cancelled', input.now);
    }
    broadcastRoom(io, input.runtime, room);
  },
};

// ---- 2v2 ----

// The surviving teammate revives the bankrupt one during their own turn. Cost, windows, turn state and the teammate are all
// read from the server's own state; the request carries nothing.
export const reviveTeammateCommand: GameCommand<void, void> = {
  name: 'revive teammate',
  apply({ room, state }, { actorPlayerId }) {
    if (room.status !== 'IN_PROGRESS') {
      throw new CommandError('CONFLICT', 'Ván chơi hiện không nhận thao tác này.');
    }
    if (!state.players[actorPlayerId]) {
      throw new CommandError('FORBIDDEN', 'Chỉ người chơi còn trong ván mới có thể hồi sinh đồng đội.');
    }
    const result = reviveTeammate(state, actorPlayerId);
    if (!result.ok) throw new CommandError('CONFLICT', result.reason);
  },
  publish: (io, room, _result, input) => publishRoom(io, room, input),
};
