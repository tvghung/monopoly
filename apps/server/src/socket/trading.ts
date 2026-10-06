import { randomUUID } from 'node:crypto';
import {
  offerActionSchema,
  offerInfoSchema,
  type MakeOfferResult,
  type OfferResult,
  type TradeBundle,
} from '@monopoly/shared';
import {
  activeDebtClaim,
  executeVoluntaryTrade,
  progressPaymentQueue,
  resumePaymentContinuation,
  sendToLog,
} from '../game';
import { projectPrivateOffer } from '../services/privateOffers';
import { cancelPendingOffersForAssets, cancelPendingOffersForPlayer } from '../services/offerInvalidation';
import { paymentTimingOptions, type AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom, privatePlayerRoomName } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

const OFFER_TTL_MS = 20_000;

const ownsBundle = (
  state: Parameters<typeof executeVoluntaryTrade>[0],
  playerId: string,
  bundle: TradeBundle,
): boolean => (
  bundle.propertyIds.every((tileID) => state.boardState.ownedProps[tileID]?.id === playerId)
  && bundle.jailFreeCardIds.every((cardId) => state.players[playerId]?.heldJailFreeCardIds.includes(cardId))
);

const LOCKED_BY_SHORTFALL = 'Giao dịch thông thường bị khóa trong lúc thanh toán thiếu hụt.';
const DEBT_OFFER_ONLY = 'Trong lúc có người đang nợ, chỉ có thể đề nghị mua tài sản của người đó bằng tiền.';

/**
 * While a payment shortfall is open ordinary trading is locked, with one exception (V1.1): any other player may offer cash for
 * properties of the debtor, and the debtor may accept to raise money. That is the whole shape allowed: the proposer offers
 * cash only, the debtor gives properties only. Nothing here applies without a shortfall.
 */
const assertOfferAllowedDuringShortfall = (
  state: Parameters<typeof executeVoluntaryTrade>[0],
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

export function registerTradingHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('make offer', async (rawOffer, acknowledge) => {
    try {
      const request = parsePayload(offerInfoSchema, rawOffer);
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const offerId = randomUUID();
      const expiresAt = new Date(now.getTime() + OFFER_TTL_MS);
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        const proposer = state.players[actor.playerId];
        const recipient = state.players[request.recipientPlayerId];
        if (room.status !== 'IN_PROGRESS' || !proposer || !recipient || actor.playerId === request.recipientPlayerId) {
          throw new CommandError('CONFLICT', 'Không thể tạo đề nghị giao dịch này.');
        }
        if (request.requested.jailFreeCardIds.length > 0) {
          throw new CommandError(
            'INVALID_REQUEST',
            'Không thể yêu cầu ID Thẻ Thoát Tù riêng tư của người chơi khác; họ phải chủ động đề nghị thẻ.',
          );
        }
        assertOfferAllowedDuringShortfall(
          state,
          actor.playerId,
          request.recipientPlayerId,
          request.offered,
          request.requested,
        );
        if (!ownsBundle(state, actor.playerId, request.offered) || !ownsBundle(state, request.recipientPlayerId, request.requested)) {
          throw new CommandError('CONFLICT', 'Một bên không còn sở hữu tài sản trong gói giao dịch.');
        }
        if (state.boardState.paymentQueue && proposer.accountBalance < request.offered.cash) {
          throw new CommandError('CONFLICT', 'Bạn không đủ tiền cho đề nghị này.');
        }
        const lockedTile = state.turnInfo.pendingDevelopmentDecision?.tileID;
        if (
          lockedTile !== undefined
          && (request.offered.propertyIds.includes(lockedTile) || request.requested.propertyIds.includes(lockedTile))
        ) {
          throw new CommandError('CONFLICT', 'Tài sản đang chờ quyết định phát triển của lượt hiện tại.');
        }
        return transaction.tradeOffers.create({
          id: offerId,
          roomId: actor.roomId,
          proposerPlayerId: actor.playerId,
          recipientPlayerId: request.recipientPlayerId,
          offered: request.offered,
          requested: request.requested,
          expiresAt,
        });
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      const offer = projectPrivateOffer(committed.result, committed.room);
      io.to(privatePlayerRoomName(offer.recipientPlayerId)).emit('offer on prop', offer);
      const result: MakeOfferResult = { offerId: offer.offerId, expiresAt: offer.expiresAt };
      acknowledge(successAck(result, committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('decline offer', async (rawAction, acknowledge) => {
    try {
      const request = parsePayload(offerActionSchema, rawAction);
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ transaction }) => {
        const offer = await transaction.tradeOffers.findById(request.offerId);
        if (!offer || offer.roomId !== actor.roomId || offer.recipientPlayerId !== actor.playerId) {
          throw new CommandError('FORBIDDEN', 'Đề nghị này không thuộc về bạn.');
        }
        if (offer.expiresAt <= now) throw new CommandError('CONFLICT', 'Đề nghị đã hết hạn.');
        const resolved = await transaction.tradeOffers.resolve(offer.id, 'DECLINED', now);
        if (!resolved) throw new CommandError('CONFLICT', 'Đề nghị không còn chờ xử lý.');
        return resolved;
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      emitOfferResult(io, projectPrivateOffer(committed.result, committed.room), 'offer declined', now);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('accept offer', async (rawAction, acknowledge) => {
    try {
      const request = parsePayload(offerActionSchema, rawAction);
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        if (room.status !== 'IN_PROGRESS') throw new CommandError('CONFLICT', 'Ván chơi chưa diễn ra.');
        const offer = await transaction.tradeOffers.findById(request.offerId);
        if (!offer || offer.roomId !== actor.roomId || offer.recipientPlayerId !== actor.playerId) {
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
          actor.roomId,
          offer.id,
          [...offer.offered.propertyIds, ...offer.requested.propertyIds],
          [...offer.offered.jailFreeCardIds, ...offer.requested.jailFreeCardIds],
          now,
        );
        if (!state.players[offer.recipientPlayerId]) {
          // The debtor could not cover the debt even after this sale and was eliminated.
          cancelled.push(...await cancelPendingOffersForPlayer(
            transaction.tradeOffers,
            actor.roomId,
            offer.recipientPlayerId,
            now,
          ));
        }
        sendToLog(state, `${proposerName} và ${recipientName} đã hoàn tất giao dịch.`);
        return { resolved, cancelled };
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      const offer = projectPrivateOffer(committed.result.resolved, committed.room);
      emitOfferResult(io, offer, 'offer accepted', now);
      for (const record of committed.result.cancelled) {
        emitOfferResult(io, projectPrivateOffer(record, committed.room), 'offer cancelled', now);
      }
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
}

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

function emitOfferResult(
  io: AppServer,
  offer: ReturnType<typeof projectPrivateOffer>,
  event: 'offer declined' | 'offer accepted' | 'offer cancelled',
  now: Date,
): void {
  const result = offerResult(offer, now);
  io.to(privatePlayerRoomName(offer.proposerPlayerId)).emit(event, result);
  io.to(privatePlayerRoomName(offer.recipientPlayerId)).emit(event, result);
}
