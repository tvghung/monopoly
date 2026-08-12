import { tileState } from '@monopoly/shared';
import {
  assertDebtActionAllowed,
  completeTurnResolution,
  continuationForRoll,
  handleJailRoll,
  isDouble,
  movePlayer,
  moveToJail,
  resolveTile,
  rollDice,
  sendToLog,
  transferProperty,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';

export function registerTurnHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('roll dice', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const now = new Date();
      const resolutionOptions = {
        now: now.getTime(),
        debtActionTimeoutMs: runtime.timing.debtActionTimeoutMs,
      };
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const player = state.players[playerId];
        if (room.status !== 'IN_PROGRESS' || state.boardState.winner) {
          throw new CommandError('CONFLICT', 'Ván chơi hiện không nhận lượt mới.');
        }
        if (!player || state.boardState.currentPlayer.id !== playerId) {
          throw new CommandError('FORBIDDEN', 'Chưa đến lượt của bạn.');
        }
        if (!assertDebtActionAllowed(state, playerId, 'ROLL')) {
          throw new CommandError('CONFLICT', 'Phải xử lý khoản nợ đang chờ trước khi đổ xúc xắc.');
        }
        if (
          state.boardState.currentPlayer.hasMoved
          || state.boardState.auction
          || state.boardState.buildingContention
          || state.boardState.bankPropertyAuctionQueue
          || state.turnInfo.pendingPropertyDecision
        ) {
          throw new CommandError('CONFLICT', 'Lượt này chưa thể đổ xúc xắc tiếp.');
        }

        const dice = rollDice();
        const total = dice.dice1 + dice.dice2;
        if (player.isJail) {
          handleJailRoll(state, playerId, dice, continuationForRoll(state, playerId, false, {
            forceAdvance: true,
          }), resolutionOptions);
          return;
        }

        state.boardState.diceValue = dice;
        state.boardState.currentPlayer.hasMoved = true;
        const rolledDoubles = isDouble(dice);
        sendToLog(state, `${player.name} đổ được ${total}${rolledDoubles ? ' (đôi)' : ''}.`);
        if (rolledDoubles && state.boardState.currentPlayer.doublesStreak === 2) {
          moveToJail(state, playerId);
          sendToLog(state, `${player.name} đổ đôi lần thứ ba liên tiếp và bị đưa thẳng vào tù.`);
          completeTurnResolution(
            state,
            continuationForRoll(state, playerId, false, { forceAdvance: true }),
          );
          return;
        }
        if (rolledDoubles) state.boardState.currentPlayer.doublesStreak += 1;
        const continuation = continuationForRoll(state, playerId, rolledDoubles);
        movePlayer(state, playerId, total);
        resolveTile(state, playerId, total, continuation, resolutionOptions);
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('buy property', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const player = state.players[playerId];
        const decision = state.turnInfo.pendingPropertyDecision;
        if (room.status !== 'IN_PROGRESS' || state.boardState.winner || !player) {
          throw new CommandError('CONFLICT', 'Hiện không thể mua tài sản.');
        }
        if (!assertDebtActionAllowed(state, playerId, 'BUY')) {
          throw new CommandError('CONFLICT', 'Không thể mua tài sản khi khoản nợ đang chờ.');
        }
        if (
          state.boardState.currentPlayer.id !== playerId
          || !decision
          || decision.playerId !== playerId
          || decision.tileID !== player.currentTile
          || state.boardState.auction
          || state.boardState.buildingContention
        ) {
          throw new CommandError('CONFLICT', 'Không có tài sản nào đang chờ bạn mua.');
        }
        const tile = tileState[decision.tileID];
        const price = tile?.price ?? 0;
        if (!tile || price <= 0 || state.boardState.ownedProps[decision.tileID]) {
          throw new CommandError('CONFLICT', 'Tài sản này không còn khả dụng.');
        }
        if (player.accountBalance < price) {
          throw new CommandError('CONFLICT', `Bạn không đủ tiền mua ${tile.streetName}.`);
        }
        player.accountBalance -= price;
        if (!transferProperty(state, decision.tileID, null, playerId, 'BANK_AUCTION_AWARD').ok) {
          throw new CommandError('CONFLICT', 'Không thể chuyển quyền sở hữu tài sản.');
        }
        const continuation = decision.continuation;
        state.turnInfo = {};
        sendToLog(state, `${player.name} đã mua ${tile.streetName}.`);
        completeTurnResolution(state, continuation);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
