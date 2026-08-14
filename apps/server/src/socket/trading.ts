import { randomUUID } from 'node:crypto';
import {
  offerActionSchema,
  offerInfoSchema,
  saleInfoSchema,
  tileRequestSchema,
  tileState,
  type MakeOfferResult,
  type OfferResult,
  type TradeBundle,
} from '@monopoly/shared';
import {
  executeVoluntaryTrade,
  mortgageTransferInterest,
  sendToLog,
  transferProperty,
} from '../game';
import { projectPrivateOffer } from '../services/privateOffers';
import { cancelPendingOffersForAssets } from '../services/offerInvalidation';
import type { AppRuntime } from '../services/runtime';
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

const assertCommerceAvailable = (state: { boardState: { paymentQueue: unknown } }): void => {
  if (state.boardState.paymentQueue) {
    throw new CommandError('CONFLICT', 'Giao dịch thông thường bị khóa trong lúc thanh toán thiếu hụt.');
  }
};

export function registerTradingHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('put on open market', async (rawSale, acknowledge) => {
    try {
      const sale = parsePayload(saleInfoSchema, rawSale);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        assertCommerceAvailable(state);
        const player = state.players[actor.playerId];
        const owner = state.boardState.ownedProps[sale.tileID];
        const tile = tileState[sale.tileID];
        if (room.status !== 'IN_PROGRESS' || !player || !owner || owner.id !== actor.playerId || !tile) {
          throw new CommandError('FORBIDDEN', 'Chỉ chủ sở hữu mới được đăng bán tài sản.');
        }
        state.boardState.openMarket[sale.tileID] = {
          seller: actor.playerId,
          price: sale.price,
          sellerName: player.name,
          tileName: tile.streetName,
        };
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('remove sale', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(tileRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ state }) => {
        assertCommerceAvailable(state);
        const listing = state.boardState.openMarket[request.tileID];
        if (!listing || listing.seller !== actor.playerId) {
          throw new CommandError('FORBIDDEN', 'Chỉ người bán mới được gỡ tin đăng.');
        }
        delete state.boardState.openMarket[request.tileID];
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('make sale', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(tileRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        assertCommerceAvailable(state);
        const listing = state.boardState.openMarket[request.tileID];
        const buyer = state.players[actor.playerId];
        const property = state.boardState.ownedProps[request.tileID];
        const seller = listing ? state.players[listing.seller] : undefined;
        if (room.status !== 'IN_PROGRESS' || !listing || !buyer || !property || !seller || property.id !== listing.seller) {
          throw new CommandError('CONFLICT', 'Tin đăng không còn hợp lệ.');
        }
        if (listing.seller === actor.playerId) throw new CommandError('FORBIDDEN', 'Bạn không thể mua tài sản của chính mình.');
        const interest = property.mortgaged ? mortgageTransferInterest(request.tileID) : 0;
        if (buyer.accountBalance < listing.price + interest) {
          throw new CommandError('CONFLICT', 'Bạn không đủ tiền mua và trả lãi chuyển nhượng cầm cố.');
        }
        const transferred = transferProperty(
          state,
          request.tileID,
          listing.seller,
          actor.playerId,
          'VOLUNTARY',
        );
        if (!transferred.ok) throw new CommandError('CONFLICT', transferred.reason ?? 'Không thể chuyển tài sản.');
        buyer.accountBalance -= listing.price;
        seller.accountBalance += listing.price;
        sendToLog(state, `${buyer.name} đã mua ${listing.tileName} từ ${seller.name}.`);
        return cancelPendingOffersForAssets(
          transaction.tradeOffers,
          actor.roomId,
          null,
          [request.tileID],
          [],
          now,
        );
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      for (const record of committed.result) {
        emitOfferResult(io, projectPrivateOffer(record, committed.room), 'offer cancelled', now);
      }
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('make offer', async (rawOffer, acknowledge) => {
    try {
      const request = parsePayload(offerInfoSchema, rawOffer);
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const offerId = randomUUID();
      const expiresAt = new Date(now.getTime() + OFFER_TTL_MS);
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        assertCommerceAvailable(state);
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
        if (!ownsBundle(state, actor.playerId, request.offered) || !ownsBundle(state, request.recipientPlayerId, request.requested)) {
          throw new CommandError('CONFLICT', 'Một bên không còn sở hữu tài sản trong gói giao dịch.');
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
        assertCommerceAvailable(state);
        if (room.status !== 'IN_PROGRESS') throw new CommandError('CONFLICT', 'Ván chơi chưa diễn ra.');
        const offer = await transaction.tradeOffers.findById(request.offerId);
        if (!offer || offer.roomId !== actor.roomId || offer.recipientPlayerId !== actor.playerId) {
          throw new CommandError('FORBIDDEN', 'Đề nghị này không thuộc về bạn.');
        }
        if (offer.expiresAt <= now) throw new CommandError('CONFLICT', 'Đề nghị đã hết hạn.');
        const previewState = structuredClone(state);
        const preview = executeVoluntaryTrade(
          previewState,
          offer.proposerPlayerId,
          offer.recipientPlayerId,
          offer.offered,
          offer.requested,
        );
        if (!preview.ok) throw new CommandError('CONFLICT', preview.reason ?? 'Giao dịch không còn hợp lệ.');
        const result = executeVoluntaryTrade(
          state,
          offer.proposerPlayerId,
          offer.recipientPlayerId,
          offer.offered,
          offer.requested,
        );
        if (!result.ok) throw new CommandError('CONFLICT', result.reason ?? 'Giao dịch không còn hợp lệ.');
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
        sendToLog(state, `${state.players[offer.proposerPlayerId].name} và ${state.players[offer.recipientPlayerId].name} đã hoàn tất giao dịch.`);
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
