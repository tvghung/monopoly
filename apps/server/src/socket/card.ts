import { dismissCardCommand, drawCardCommand, runGameCommand } from '../commands/gameplay';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { acknowledgeFailure, successAck } from './errors';
import type { AppServer, AppSocket } from './types';

// The card rules live in `commands/gameplay.ts`, shared with the bot driver.
export function registerCardHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('draw card', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, drawCardCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('dismiss card', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, dismissCardCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
