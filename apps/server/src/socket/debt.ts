import {
  acceptForcedSaleProposal,
  activeDebtClaim,
  createForcedSaleProposal,
  rejectForcedSaleProposal,
  resumePaymentContinuation,
  sellPropertyToBankForPayment,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom, privatePlayerRoomName } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { cancelPendingOffersForAssets, emitCancelledOffers } from '../services/offerInvalidation';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';

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
          throw new CommandError('CONFLICT', 'Thoi han thanh toan da het; may chu dang tu xu ly.');
        }
        const continuation = sellPropertyToBankForPayment(
          state,
          actor.playerId,
          request.paymentOperationId,
          request.claimId,
          request.tileID,
          { now: now.getTime(), paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs },
        );
        if (!continuation && state.boardState.ownedProps[request.tileID]) {
          throw new CommandError('CONFLICT', 'Không thể bán tài sản theo khoản thanh toán hiện tại.');
        }
        if (continuation) resumePaymentContinuation(state, continuation, {
          now: now.getTime(), paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
        });
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
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        const before = state.privateState.forcedSaleProposal;
        const continuation = acceptForcedSaleProposal(state, actor.playerId, request.proposalId, {
          now: now.getTime(), paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
        });
        if (!continuation && state.privateState.forcedSaleProposal) {
          throw new CommandError('CONFLICT', 'Đề nghị bán bắt buộc đã hết hạn hoặc không còn hợp lệ.');
        }
        if (continuation) resumePaymentContinuation(state, continuation, {
          now: now.getTime(), paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
        });
        if (room.status !== 'IN_PROGRESS') throw new CommandError('CONFLICT', 'Phòng không còn hoạt động.');
        if (!before) throw new CommandError('CONFLICT', 'Đề nghị bán bắt buộc không còn hợp lệ.');
        return cancelPendingOffersForAssets(
          transaction.tradeOffers,
          actor.roomId,
          null,
          [before.tileID],
          [],
          now,
        );
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      emitCancelledOffers(io, committed.room, committed.result, now);
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('reject forced sale', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        if (
          room.status !== 'IN_PROGRESS'
          || !rejectForcedSaleProposal(state, actor.playerId, request.proposalId, now.getTime())
        ) {
          throw new CommandError('CONFLICT', 'Đề nghị bán bắt buộc không còn hợp lệ.');
        }
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
}
