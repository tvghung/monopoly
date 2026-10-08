import { randomUUID } from 'node:crypto';
import {
  offerActionSchema,
  offerInfoSchema,
  type MakeOfferResult,
  type TradeBundle,
} from '@monopoly/shared';
import {
  acceptOfferCommand,
  assertOfferAllowedDuringShortfall,
  declineOfferCommand,
  runGameCommand,
} from '../commands/gameplay';
import type { GameState } from '@monopoly/shared';
import { projectPrivateOffer } from '../services/privateOffers';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { privatePlayerRoomName } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

const OFFER_TTL_MS = 20_000;

const ownsBundle = (
  state: GameState,
  playerId: string,
  bundle: TradeBundle,
): boolean => (
  bundle.propertyIds.every((tileID) => state.boardState.ownedProps[tileID]?.id === playerId)
  && bundle.jailFreeCardIds.every((cardId) => state.players[playerId]?.heldJailFreeCardIds.includes(cardId))
);

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
      const { room } = await runGameCommand(io, runtime, declineOfferCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('accept offer', async (rawAction, acknowledge) => {
    try {
      const request = parsePayload(offerActionSchema, rawAction);
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, acceptOfferCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
}
