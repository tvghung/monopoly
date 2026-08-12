import {
  activeDebtClaim,
  declareActiveDebtBankruptcy,
  resumePaymentContinuation,
  settleAffordableClaims,
  startNextBankPropertyAuction,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { projectPrivateOffer } from '../services/privateOffers';
import { requirePlayer } from './authority';
import { broadcastRoom, privatePlayerRoomName } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';

export function registerDebtHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('settle debt', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        const before = activeDebtClaim(state);
        if (room.status !== 'IN_PROGRESS' || !before || before.debtorPlayerId !== actor.playerId) {
          throw new CommandError('FORBIDDEN', 'Bạn không phải người đang cần thanh toán khoản nợ này.');
        }
        if ((state.players[actor.playerId]?.accountBalance ?? 0) < before.remainingAmount) {
          throw new CommandError('CONFLICT', 'Số dư vẫn chưa đủ để thanh toán khoản nợ đang chờ.');
        }
        const resolutionOptions = {
          now: now.getTime(),
          debtActionTimeoutMs: runtime.timing.debtActionTimeoutMs,
        };
        const continuation = settleAffordableClaims(state, resolutionOptions);
        if (continuation && state.boardState.bankPropertyAuctionQueue) {
          state.boardState.bankPropertyAuctionQueue.continuation = continuation;
          startNextBankPropertyAuction(state, { now: now.getTime() });
        } else if (continuation) {
          resumePaymentContinuation(state, continuation, resolutionOptions);
        }
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('declare bankruptcy', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        const claim = activeDebtClaim(state);
        if (room.status !== 'IN_PROGRESS' || !claim || claim.debtorPlayerId !== actor.playerId) {
          throw new CommandError('FORBIDDEN', 'Bạn không phải người đang xử lý khoản nợ này.');
        }
        if ((state.players[actor.playerId]?.accountBalance ?? 0) >= claim.remainingAmount) {
          throw new CommandError('CONFLICT', 'Số dư đã đủ; hãy thanh toán khoản nợ thay vì tuyên bố phá sản.');
        }
        const result = declareActiveDebtBankruptcy(state, actor.playerId, {
          now: now.getTime(),
          debtActionTimeoutMs: runtime.timing.debtActionTimeoutMs,
        });
        if (!result.changed) throw new CommandError('CONFLICT', 'Không thể tuyên bố phá sản lúc này.');
        const pending = await transaction.tradeOffers.listPendingForPlayer(actor.roomId, actor.playerId);
        const cancelled = await Promise.all(
          pending.map((offer) => transaction.tradeOffers.resolve(offer.id, 'CANCELLED', now)),
        );
        if (result.bankAuctionQueued && !state.boardState.paymentQueue) {
          startNextBankPropertyAuction(state, { now: now.getTime() });
        }
        if (result.continuation && state.boardState.bankPropertyAuctionQueue) {
          state.boardState.bankPropertyAuctionQueue.continuation = result.continuation;
          startNextBankPropertyAuction(state, { now: now.getTime() });
        } else if (result.continuation) {
          resumePaymentContinuation(state, result.continuation, {
            now: now.getTime(),
            debtActionTimeoutMs: runtime.timing.debtActionTimeoutMs,
          });
        }
        return cancelled.filter((offer) => offer !== null);
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      for (const record of committed.result) {
        const offer = projectPrivateOffer(record, committed.room);
        const result = {
          offerId: offer.offerId,
          status: 'CANCELLED' as const,
          proposerPlayerId: offer.proposerPlayerId,
          recipientPlayerId: offer.recipientPlayerId,
          proposerName: offer.proposerName,
          recipientName: offer.recipientName,
          offered: offer.offered,
          requested: offer.requested,
          resolvedAt: offer.resolvedAt ?? now.toISOString(),
        };
        io.to(privatePlayerRoomName(offer.proposerPlayerId)).emit('offer cancelled', result);
        io.to(privatePlayerRoomName(offer.recipientPlayerId)).emit('offer cancelled', result);
      }
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
}
