import {
  addBotRequestSchema,
  removeBotRequestSchema,
  type AddBotResult,
} from '@monopoly/shared';
import { addBotSeat, removeBotSeat } from '../bots/botSeats';
import { isBotMember } from '../rooms';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand, type DomainCommandContext } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

/** Bot seats are a host decision taken in the lobby; nobody else and nothing after the start can change them. */
function requireHostLobby(context: DomainCommandContext, actorPlayerId: string): void {
  if (context.room.status !== 'LOBBY') {
    throw new CommandError('GAME_ALREADY_STARTED', 'Chỉ có thể thêm hoặc xóa Bot trong phòng chờ.');
  }
  if (context.room.hostPlayerId !== actorPlayerId) {
    throw new CommandError('FORBIDDEN', 'Chỉ chủ phòng mới có thể thêm hoặc xóa Bot.');
  }
}

export function registerBotHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('add bot', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(addBotRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireHostLobby(context, actor.playerId);
        // A retried click: answer with the bot that request already created, if it is still seated.
        const earlier = runtime.botRequests.find(actor.roomId, request.requestId);
        if (earlier !== undefined) {
          if (isBotMember(context.room.gameSnapshot, earlier)) return { playerId: earlier, replayed: true };
          throw new CommandError('CONFLICT', 'Yêu cầu thêm Bot này đã được xử lý.');
        }
        const added = addBotSeat(context.room.gameSnapshot, context.state, request.seat);
        if (!added.ok) {
          throw added.reason === 'ROOM_FULL'
            ? new CommandError('ROOM_FULL', 'Phòng đã đủ 4 người chơi.')
            : new CommandError('CONFLICT', 'Không còn chỗ cho Bot mới.');
        }
        return { playerId: added.playerId, replayed: false };
      }, undefined, actor, {
        afterCommit: (done) => {
          if (done.room && !done.result.replayed) {
            runtime.botRequests.record(actor.roomId, request.requestId, done.result.playerId);
          }
        },
      });
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      const result: AddBotResult = { playerId: committed.result.playerId };
      acknowledge(successAck(result, committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('remove bot', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(removeBotRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireHostLobby(context, actor.playerId);
        const member = context.room.gameSnapshot.members[request.playerId];
        if (!member || member.membershipStatus !== 'ACTIVE' || !context.state.players[request.playerId]) {
          throw new CommandError('NOT_FOUND', 'Bot này không còn trong phòng.');
        }
        if (!isBotMember(context.room.gameSnapshot, request.playerId)) {
          throw new CommandError('CONFLICT', 'Chỉ có thể xóa ghế Bot.');
        }
        removeBotSeat(context.room.gameSnapshot, context.state, request.playerId);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
