import { dismissPendingCard, drawPendingCard } from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';

const cardOptions = (runtime: AppRuntime, now: Date) => ({
  now: now.getTime(),
  paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
  cardAwaitingDrawTimeoutMs: runtime.timing.cardAwaitingDrawTimeoutMs,
  cardRevealedTimeoutMs: runtime.timing.cardRevealedTimeoutMs,
});

export function registerCardHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('draw card', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        if (
          room.status !== 'IN_PROGRESS'
          || !state.players[actor.playerId]
        ) throw new CommandError('FORBIDDEN', 'Hiện không thể rút thẻ.');
        const result = drawPendingCard(
          state,
          actor.playerId,
          request.operationId,
          cardOptions(runtime, now),
        );
        if (result === 'STALE') {
          throw new CommandError('CONFLICT', 'Yêu cầu rút thẻ đã lỗi thời.');
        }
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('dismiss card', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        if (room.status !== 'IN_PROGRESS' || !state.players[actor.playerId]) {
          throw new CommandError('FORBIDDEN', 'Hiện không thể đóng thẻ.');
        }
        const result = dismissPendingCard(
          state,
          actor.playerId,
          request.operationId,
          cardOptions(runtime, now),
        );
        if (result === 'STALE') throw new CommandError('CONFLICT', 'Yêu cầu đóng thẻ đã lỗi thời.');
        if (result === 'NOT_REVEALED') {
          throw new CommandError('CONFLICT', 'Thẻ chưa được rút.');
        }
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
