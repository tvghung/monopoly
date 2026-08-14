import {
  acceptForcedSaleProposal,
  activeDebtClaim,
  createForcedSaleProposal,
  rejectForcedSaleProposal,
  progressPaymentQueue,
  resumePaymentContinuation,
  sellPropertyToBankForPayment,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom, privatePlayerRoomName } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import {
  cancelPendingOffersForAssets,
  cancelPendingOffersForPlayer,
  emitCancelledOffers,
} from '../services/offerInvalidation';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';

const emitForcedSaleCleared = (io: AppServer, playerIds: string[]): void => {
  for (const playerId of new Set(playerIds)) {
    io.to(privatePlayerRoomName(playerId)).emit('forced sale proposal', null);
  }
};

export function registerDebtHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('sell property to bank', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        const claim = activeDebtClaim(state);
        if (room.status !== 'IN_PROGRESS' || !claim || claim.debtorPlayerId !== actor.playerId) {
          throw new CommandError('FORBIDDEN', 'Bạn không có khoản thanh toán cần bán tài sản.');
        }
        if (Date.parse(state.boardState.paymentQueue?.actionDeadlineAt ?? '') <= now.getTime()) {
          throw new CommandError('CONFLICT', 'Thời hạn thanh toán đã hết; máy chủ đang tự xử lý.');
        }
        const sale = sellPropertyToBankForPayment(
          state,
          actor.playerId,
          request.paymentOperationId,
          request.claimId,
          request.tileID,
          { now: now.getTime(), paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs },
        );
        if (!sale.ok) throw new CommandError('CONFLICT', sale.reason);
        const progress = progressPaymentQueue(state, {
          now: now.getTime(),
          paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
        });
        if (progress.status === 'COMPLETED' && progress.continuation) {
          resumePaymentContinuation(state, progress.continuation, {
            now: now.getTime(),
            paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
          });
        }
        const cancelled = await cancelPendingOffersForAssets(
          transaction.tradeOffers,
          actor.roomId,
          null,
          [request.tileID],
          [],
          now,
        );
        if (!state.players[actor.playerId]) {
          cancelled.push(...await cancelPendingOffersForPlayer(
            transaction.tradeOffers,
            actor.roomId,
            actor.playerId,
            now,
          ));
        }
        return cancelled;
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      emitCancelledOffers(io, committed.room, committed.result, now);
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('propose forced sale', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        if (room.status !== 'IN_PROGRESS') throw new CommandError('CONFLICT', 'Phòng không còn hoạt động.');
        const proposal = createForcedSaleProposal(
          state,
          actor.playerId,
          request.paymentOperationId,
          request.claimId,
          request.tileID,
          request.buyerPlayerId,
          now.getTime(),
        );
        if (!proposal) throw new CommandError('CONFLICT', 'Không thể tạo đề nghị bán bắt buộc.');
        return proposal;
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      const proposal = committed.result;
      io.to(privatePlayerRoomName(proposal.sellerPlayerId)).emit('forced sale proposal', proposal);
      io.to(privatePlayerRoomName(proposal.buyerPlayerId)).emit('forced sale proposal', proposal);
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(
        { proposalId: proposal.proposalId, expiresAt: proposal.expiresAt },
        committed.room.aggregateVersion,
      ));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('accept forced sale', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      let proposalPlayers: string[] = [];
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        const proposal = state.privateState.forcedSaleProposal;
        proposalPlayers = proposal
          ? [proposal.sellerPlayerId, proposal.buyerPlayerId]
          : [];
        const sellerId = proposal?.sellerPlayerId;
        const sale = acceptForcedSaleProposal(state, actor.playerId, request.proposalId, {
          now: now.getTime(), paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
        });
        if (!sale.ok) throw new CommandError('CONFLICT', sale.reason);
        if (room.status !== 'IN_PROGRESS') throw new CommandError('CONFLICT', 'Phòng không còn hoạt động.');
        const progress = progressPaymentQueue(state, {
          now: now.getTime(),
          paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
        });
        if (progress.status === 'COMPLETED' && progress.continuation) {
          resumePaymentContinuation(state, progress.continuation, {
            now: now.getTime(),
            paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
          });
        }
        const cancelled = await cancelPendingOffersForAssets(
          transaction.tradeOffers,
          actor.roomId,
          null,
          [sale.tileID],
          [],
          now,
        );
        if (sellerId && !state.players[sellerId]) {
          cancelled.push(...await cancelPendingOffersForPlayer(
            transaction.tradeOffers,
            actor.roomId,
            sellerId,
            now,
          ));
        }
        return cancelled;
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      emitCancelledOffers(io, committed.room, committed.result, now);
      emitForcedSaleCleared(io, proposalPlayers);
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('reject forced sale', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      let proposalPlayers: string[] = [];
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        const proposal = state.privateState.forcedSaleProposal;
        proposalPlayers = proposal
          ? [proposal.sellerPlayerId, proposal.buyerPlayerId]
          : [];
        if (
          room.status !== 'IN_PROGRESS'
          || !rejectForcedSaleProposal(state, actor.playerId, request.proposalId, now.getTime())
        ) {
          throw new CommandError('CONFLICT', 'Đề nghị bán bắt buộc không còn hợp lệ.');
        }
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      emitForcedSaleCleared(io, proposalPlayers);
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
}
