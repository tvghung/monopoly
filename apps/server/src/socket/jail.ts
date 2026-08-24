import { gameCardsById } from '@monopoly/shared';
import {
  assertDebtActionAllowed,
  sendToLog,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { recordPublicGameplayEvent } from '../game/semanticEvents';

export function registerJailHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('pay bail', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const now = new Date();
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const player = state.players[playerId];
        if (
          room.status !== 'IN_PROGRESS'
          || !player?.isJail
          || state.boardState.currentPlayer.id !== playerId
          || state.boardState.currentPlayer.hasMoved
        ) {
          throw new CommandError('FORBIDDEN', 'Hiện không thể trả tiền bảo lãnh.');
        }
        if (!assertDebtActionAllowed(state, playerId, 'BUY')) {
          throw new CommandError('CONFLICT', 'Phải xử lý khoản nợ đang chờ trước.');
        }
        if (player.accountBalance < 50) {
          throw new CommandError('CONFLICT', 'Không đủ 50 để trả tiền bảo lãnh.');
        }
        player.accountBalance -= 50;
        recordPublicGameplayEvent(state, {
          type: 'MONEY_TRANSFER',
          source: { kind: 'PLAYER', playerId },
          destination: { kind: 'BANK' },
          amount: 50,
          reason: 'BAIL',
        });
        player.isJail = false;
        player.jailOpponentRoundsElapsed = 0;
        recordPublicGameplayEvent(state, {
          type: 'JAIL_RELEASED',
          playerId,
          cause: 'BAIL',
        });
        sendToLog(state, `${player.name} đã trả tiền bảo lãnh và được ra tù.`);
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('use jail card', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const player = state.players[playerId];
        if (
          room.status !== 'IN_PROGRESS'
          || !player?.isJail
          || state.boardState.currentPlayer.id !== playerId
          || state.boardState.currentPlayer.hasMoved
          || player.heldJailFreeCardIds.length < 1
        ) {
          throw new CommandError('FORBIDDEN', 'Hiện không thể dùng Thẻ Thoát Tù Miễn Phí.');
        }
        if (!assertDebtActionAllowed(state, playerId, 'BUY')) {
          throw new CommandError('CONFLICT', 'Phải xử lý khoản nợ đang chờ trước.');
        }
        const cardId = player.heldJailFreeCardIds.shift();
        const card = cardId ? gameCardsById[cardId] : undefined;
        const deck = card?.sourceDeck;
        if (!cardId || !deck || !card.getOutOfJailFree) {
          throw new CommandError('CONFLICT', 'Thẻ ra tù không hợp lệ.');
        }
        state.privateState.decks[deck].drawPile.push(cardId);
        player.isJail = false;
        player.jailOpponentRoundsElapsed = 0;
        recordPublicGameplayEvent(state, {
          type: 'JAIL_RELEASED',
          playerId,
          cause: 'JAIL_FREE_CARD',
        });
        sendToLog(state, `${player.name} đã dùng Thẻ Thoát Tù Miễn Phí.`);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
