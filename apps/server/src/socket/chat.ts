import { chatMessageSchema } from '@monopoly/shared';
import { escapeHtml, sendToLog } from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer, requireRoom } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

export function registerChatHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  let nextChatAt = 0;

  socket.on('send chat', async (rawMessage, acknowledge) => {
    try {
      const now = Date.now();
      if (now < nextChatAt) {
        throw new CommandError('CONFLICT', 'Please wait before sending another message.', true);
      }
      nextChatAt = now + 750;
      const actor = socket.data.role === 'PLAYER'
        ? requirePlayer(socket, runtime)
        : undefined;
      const roomId = actor?.roomId ?? requireRoom(socket);
      const message = parsePayload(chatMessageSchema, rawMessage);
      const committed = await commitRoomCommand(runtime, roomId, ({ state }) => {
        const identity = socket.data.playerId
          ? state.players[socket.data.playerId]
            ?? state.boardState.finishedPlayers[socket.data.playerId]
          : undefined;
        const safeMessage = escapeHtml(message);
        if (identity) {
          sendToLog(
            state,
            `<span style="color:${identity.color}" class="log-chat-name">${identity.name}</span> says: ${safeMessage}`,
          );
        } else {
          sendToLog(
            state,
            `<span style="color:grey" class="log-chat-name">Spectator</span> says: ${safeMessage}`,
          );
        }
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
