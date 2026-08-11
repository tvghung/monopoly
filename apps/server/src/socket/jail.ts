import { sendToLog } from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';

export function registerJailHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('pay bail', async (acknowledge) => {
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
        ) {
          throw new CommandError('FORBIDDEN', 'Bail is not available now.');
        }
        if (player.accountBalance < 50) {
          throw new CommandError('CONFLICT', "You can't afford the $50M bail.");
        }
        player.accountBalance -= 50;
        player.isJail = false;
        player.jailRounds = 0;
        sendToLog(state, `${player.name} paid $50M bail and is free to move.`);
      }, undefined, actor);
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
          || player.getOutOfJailCards < 1
        ) {
          throw new CommandError('FORBIDDEN', 'A jail card cannot be used now.');
        }
        player.getOutOfJailCards -= 1;
        player.isJail = false;
        player.jailRounds = 0;
        sendToLog(state, `${player.name} used a Get Out Of Jail Free card.`);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
