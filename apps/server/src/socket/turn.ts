import {
  tileState,
  type AckCallback,
  type GameState,
  type PendingDevelopmentDecision,
} from '@monopoly/shared';
import {
  assertDebtActionAllowed,
  completeTurnResolution,
  continuationForRoll,
  handleJailRoll,
  isDouble,
  movePlayer,
  resolveTile,
  rollDice,
  sendToLog,
  transferProperty,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { cancelPendingOffersForAssets, emitCancelledOffers } from '../services/offerInvalidation';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';

const currentTurnContinuation = (state: Parameters<typeof continuationForRoll>[0], playerId: string) => (
  continuationForRoll(state, playerId)
);

const completeDevelopment = (state: GameState, decision: PendingDevelopmentDecision): void => {
  state.turnInfo = {};
  completeTurnResolution(state, decision.continuation);
};

export function registerTurnHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('roll dice', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        const player = state.players[actor.playerId];
        if (room.status !== 'IN_PROGRESS' || state.boardState.winner) {
          throw new CommandError('CONFLICT', 'Ván chơi hiện không nhận lượt mới.');
        }
        if (!player || state.boardState.currentPlayer.id !== actor.playerId) {
          throw new CommandError('FORBIDDEN', 'Chưa đến lượt của bạn.');
        }
        if (!assertDebtActionAllowed(state, actor.playerId, 'ROLL')) {
          throw new CommandError('CONFLICT', 'Phải xử lý khoản thanh toán đang chờ trước khi đổ xúc xắc.');
        }
        if (
          state.boardState.currentPlayer.hasMoved
          || state.turnInfo.pendingPropertyDecision
          || state.turnInfo.pendingDevelopmentDecision
        ) {
          throw new CommandError('CONFLICT', 'Lượt này chưa thể đổ xúc xắc tiếp.');
        }
        const dice = rollDice();
        const total = dice.dice1 + dice.dice2;
        const continuation = currentTurnContinuation(state, actor.playerId);
        if (player.isJail) {
          handleJailRoll(state, actor.playerId, dice, continuation, {
            now: now.getTime(),
            paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
          });
          return;
        }
        state.boardState.diceValue = dice;
        state.boardState.currentPlayer.hasMoved = true;
        sendToLog(state, `${player.name} đổ được ${total}${isDouble(dice) ? ' (đôi)' : ''}.`);
        movePlayer(state, actor.playerId, total);
        resolveTile(state, actor.playerId, total, continuation, {
          now: now.getTime(),
          paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
        });
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  const resolvePurchase = async (
    operationId: string,
    buy: boolean,
    acknowledge: AckCallback,
  ): Promise<void> => {
    try {
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        const decision = state.turnInfo.pendingPropertyDecision;
        const player = state.players[actor.playerId];
        if (
          room.status !== 'IN_PROGRESS' || state.boardState.winner || !player
          || !decision || decision.operationId !== operationId
          || decision.playerId !== actor.playerId
          || state.boardState.currentPlayer.id !== actor.playerId
        ) throw new CommandError('CONFLICT', 'Không có quyết định mua tài sản phù hợp.');
        if (state.boardState.paymentQueue) {
          throw new CommandError('CONFLICT', 'Không thể mua tài sản trong lúc thanh toán thiếu hụt.');
        }
        const tile = tileState[decision.tileID];
        const price = tile?.price ?? 0;
        if (buy) {
          if (!tile || price <= 0 || state.boardState.ownedProps[decision.tileID]) {
            throw new CommandError('CONFLICT', 'Tài sản này không còn khả dụng.');
          }
          if (player.accountBalance < price) {
            throw new CommandError('CONFLICT', `Bạn không đủ tiền mua ${tile.streetName}.`);
          }
          player.accountBalance -= price;
          if (!transferProperty(state, decision.tileID, null, actor.playerId, 'BANK_PURCHASE').ok) {
            throw new CommandError('CONFLICT', 'Không thể chuyển quyền sở hữu tài sản.');
          }
          sendToLog(state, `${player.name} đã mua ${tile.streetName}.`);
        }
        state.turnInfo = {};
        completeTurnResolution(state, decision.continuation);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  };

  socket.on('buy property', (request, acknowledge) => {
    void resolvePurchase(request.operationId, true, acknowledge);
  });
  socket.on('do not buy', (request, acknowledge) => {
    void resolvePurchase(request.operationId, false, acknowledge);
  });

  socket.on('resolve development', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction, now }) => {
        const decision = state.turnInfo.pendingDevelopmentDecision;
        const player = state.players[actor.playerId];
        if (
          room.status !== 'IN_PROGRESS' || state.boardState.winner || !player
          || !decision || decision.operationId !== request.operationId
          || decision.playerId !== actor.playerId
          || state.boardState.currentPlayer.id !== actor.playerId
        ) throw new CommandError('CONFLICT', 'Không có quyết định phát triển phù hợp.');
        if (state.boardState.paymentQueue) {
          throw new CommandError('CONFLICT', 'Không thể phát triển trong lúc thanh toán thiếu hụt.');
        }
        const property = state.boardState.ownedProps[decision.tileID];
        const tile = tileState[decision.tileID];
        if (
          !property || property.id !== actor.playerId || !tile?.houseCost || property.mortgaged
          || property.houses !== decision.levelAtLanding
        ) {
          throw new CommandError('CONFLICT', 'Tài sản không còn đủ điều kiện phát triển.');
        }
        if (request.action === 'BUILD_HOUSES') {
          if (decision.kind !== 'HOUSES' || request.quantity > 4 - decision.levelAtLanding) {
            throw new CommandError('CONFLICT', 'Số lượng Nhà vượt quá giới hạn của lần đổ này.');
          }
          const cost = request.quantity * tile.houseCost;
          if (player.accountBalance < cost) throw new CommandError('CONFLICT', 'Không đủ tiền xây Nhà.');
          player.accountBalance -= cost;
          property.houses += request.quantity;
        } else if (request.action === 'UPGRADE_HOTEL') {
          if (decision.kind !== 'HOTEL' || decision.levelAtLanding !== 4 || property.houses !== 4) {
            throw new CommandError('CONFLICT', 'Tài sản chưa đủ điều kiện nâng cấp Khách sạn.');
          }
          if (player.accountBalance < tile.houseCost) throw new CommandError('CONFLICT', 'Không đủ tiền nâng cấp.');
          player.accountBalance -= tile.houseCost;
          property.houses = 5;
        }
        if (request.action !== 'SKIP') {
          delete state.boardState.openMarket[decision.tileID];
          const cancelled = await cancelPendingOffersForAssets(
            transaction.tradeOffers,
            actor.roomId,
            null,
            [decision.tileID],
            [],
            now,
          );
          completeDevelopment(state, decision);
          return cancelled;
        }
        completeDevelopment(state, decision);
        return [];
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      emitCancelledOffers(io, committed.room, committed.result, new Date());
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('wait in jail', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        const player = state.players[actor.playerId];
        if (room.status !== 'IN_PROGRESS' || !player?.isJail
          || state.boardState.currentPlayer.id !== actor.playerId) {
          throw new CommandError('CONFLICT', 'Bạn không có lượt chờ trong tù.');
        }
        if (state.boardState.paymentQueue) {
          throw new CommandError('CONFLICT', 'Phải xử lý thanh toán trước khi chờ trong tù.');
        }
        completeTurnResolution(state, currentTurnContinuation(state, actor.playerId));
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
