import { createForcedSaleProposal } from '../game';
import {
  acceptForcedSaleCommand,
  acceptRescueCommand,
  declineRescueCommand,
  rejectForcedSaleCommand,
  runGameCommand,
  sellPropertyToBankCommand,
} from '../commands/gameplay';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom, privatePlayerRoomName } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';

// The debt rules a bot also needs (bank sales, forced-sale and rescue answers) live in `commands/gameplay.ts`; proposing a
// forced sale is a human-only negotiation and stays here.
export function registerDebtHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('accept rescue', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, acceptRescueCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('decline rescue', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, declineRescueCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('sell property to bank', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, sellPropertyToBankCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('accept forced sale', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, acceptForcedSaleCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });

  socket.on('reject forced sale', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, rejectForcedSaleCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
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
          request.price,
        );
        if (!proposal) {
          const buyer = state.players[request.buyerPlayerId];
          if (request.price !== undefined && buyer && buyer.accountBalance < request.price) {
            throw new CommandError('CONFLICT', 'Người mua không đủ tiền để trả mức giá này.');
          }
          throw new CommandError('CONFLICT', 'Không thể tạo đề nghị bán bắt buộc.');
        }
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
}
