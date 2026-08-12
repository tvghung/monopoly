import { moneyAmountSchema } from '@monopoly/shared';
import {
  assertDebtActionAllowed,
  extendAuctionDeadline,
  finalizeAuction,
  sendToLog,
  startAuction,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

export function registerAuctionHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('decline property', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const now = new Date();
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const player = state.players[playerId];
        const decision = state.turnInfo.pendingPropertyDecision;
        if (
          room.status !== 'IN_PROGRESS'
          || !player
          || state.boardState.currentPlayer.id !== playerId
          || !decision
          || decision.playerId !== playerId
          || decision.tileID !== player.currentTile
          || state.boardState.auction
          || state.boardState.buildingContention
          || state.boardState.ownedProps[player.currentTile]
        ) {
          throw new CommandError('CONFLICT', 'Tài sản này chưa thể đưa ra đấu giá.');
        }
        if (!assertDebtActionAllowed(state, playerId, 'BUY')) {
          throw new CommandError('CONFLICT', 'Phải xử lý khoản nợ đang chờ trước.');
        }
        startAuction(state, player.currentTile, {
          now: now.getTime(),
          continuation: decision.continuation,
        });
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('place bid', async (rawAmount, acknowledge) => {
    try {
      const amount = parsePayload(moneyAmountSchema, rawAmount);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const now = new Date();
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const auction = state.boardState.auction;
        const player = state.players[playerId];
        if (room.status !== 'IN_PROGRESS' || !auction || !player) {
          throw new CommandError('CONFLICT', 'Không có phiên đấu giá đang diễn ra.');
        }
        if (Date.parse(auction.endsAt) <= now.getTime()) {
          throw new CommandError('CONFLICT', 'Phiên đấu giá đã hết hạn.');
        }
        if (!auction.active.includes(playerId)) {
          throw new CommandError('FORBIDDEN', 'Bạn không thuộc danh sách đấu giá.');
        }
        if (!assertDebtActionAllowed(state, playerId, 'BID')) {
          throw new CommandError('CONFLICT', 'Không thể đặt giá khi khoản nợ đang chờ.');
        }
        const minimum = auction.kind === 'BUILDING' ? auction.minimumBid : 1;
        if (amount < minimum || amount <= auction.highestBid || amount > player.accountBalance) {
          throw new CommandError('CONFLICT', 'Giá đặt phải hợp lệ, cao hơn giá hiện tại và không vượt số dư.');
        }

        auction.highestBid = amount;
        auction.highestBidder = playerId;
        auction.highestBidderName = player.name;
        auction.passed = [];
        extendAuctionDeadline(auction, now.getTime());
        const subject = auction.kind === 'PROPERTY'
          ? auction.tileName
          : auction.buildingType === 'HOUSE' ? 'Nhà' : 'Khách Sạn';
        sendToLog(state, `${player.name} đặt ${amount.toLocaleString('vi-VN')}.000 ₫ cho ${subject}.`);
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('pass bid', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const now = new Date();
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const auction = state.boardState.auction;
        const player = state.players[playerId];
        if (room.status !== 'IN_PROGRESS' || !auction || !player) {
          throw new CommandError('CONFLICT', 'Không có phiên đấu giá đang diễn ra.');
        }
        if (Date.parse(auction.endsAt) <= now.getTime()) {
          throw new CommandError('CONFLICT', 'Phiên đấu giá đã hết hạn.');
        }
        if (!auction.active.includes(playerId) || auction.highestBidder === playerId) {
          throw new CommandError('FORBIDDEN', 'Bạn không thể bỏ lượt đấu giá lúc này.');
        }
        if (!auction.passed.includes(playerId)) auction.passed.push(playerId);
        const subject = auction.kind === 'PROPERTY'
          ? auction.tileName
          : auction.buildingType === 'HOUSE' ? 'Nhà' : 'Khách Sạn';
        sendToLog(state, `${player.name} bỏ lượt đấu giá ${subject}.`);

        const stillToAct = auction.active.filter(
          (id) => id !== auction.highestBidder && !auction.passed.includes(id),
        );
        if (stillToAct.length === 0) finalizeAuction(state, auction.auctionId);
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
