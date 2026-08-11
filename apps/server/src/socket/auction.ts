import { moneyAmountSchema } from '@monopoly/shared';
import {
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
        if (
          room.status !== 'IN_PROGRESS'
          || !player
          || state.boardState.currentPlayer.id !== playerId
          || !state.turnInfo.canBuyProp
          || state.boardState.auction
          || state.boardState.ownedProps[player.currentTile]
        ) {
          throw new CommandError('CONFLICT', 'This property cannot enter auction now.');
        }
        startAuction(state, player.currentTile, { now: now.getTime() });
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
          throw new CommandError('CONFLICT', 'There is no active auction.');
        }
        if (Date.parse(auction.endsAt) <= now.getTime()) {
          throw new CommandError('CONFLICT', 'The auction deadline has passed.');
        }
        if (!auction.active.includes(playerId)) {
          throw new CommandError('FORBIDDEN', 'You are not an auction participant.');
        }
        if (amount <= auction.highestBid || amount > player.accountBalance) {
          throw new CommandError('CONFLICT', 'The bid must exceed the current bid and fit your balance.');
        }

        auction.highestBid = amount;
        auction.highestBidder = playerId;
        auction.highestBidderName = player.name;
        auction.passed = [];
        extendAuctionDeadline(auction, now.getTime());
        sendToLog(state, `${player.name} bid $${amount}M for ${auction.tileName}.`);
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
          throw new CommandError('CONFLICT', 'There is no active auction.');
        }
        if (Date.parse(auction.endsAt) <= now.getTime()) {
          throw new CommandError('CONFLICT', 'The auction deadline has passed.');
        }
        if (!auction.active.includes(playerId) || auction.highestBidder === playerId) {
          throw new CommandError('FORBIDDEN', 'You cannot pass this auction now.');
        }
        if (!auction.passed.includes(playerId)) auction.passed.push(playerId);
        sendToLog(state, `${player.name} declined to bid on ${auction.tileName}.`);

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
