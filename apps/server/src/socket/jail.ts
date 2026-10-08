import { payBailCommand, runGameCommand, useJailCardCommand } from '../commands/gameplay';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { acknowledgeFailure, successAck } from './errors';
import type { AppServer, AppSocket } from './types';

// The jail rules live in `commands/gameplay.ts`, shared with the bot driver.
export function registerJailHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('pay bail', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, payBailCommand, actor.roomId, actor.playerId, undefined, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('use jail card', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, useJailCardCommand, actor.roomId, actor.playerId, undefined, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
