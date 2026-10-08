import type { AckCallback } from '@monopoly/shared';
import {
  resolveDevelopmentCommand,
  resolvePurchaseCommand,
  rollDiceCommand,
  runGameCommand,
  waitInJailCommand,
} from '../commands/gameplay';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { acknowledgeFailure, successAck } from './errors';
import type { AppServer, AppSocket } from './types';

// The rules of every turn command live in `commands/gameplay.ts`, shared with the bot driver; these handlers only bind a
// connection's authenticated actor to them and acknowledge.
export function registerTurnHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('roll dice', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, rollDiceCommand, actor.roomId, actor.playerId, undefined, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  const resolvePurchase = (buy: boolean) => async (
    request: { operationId: string },
    acknowledge: AckCallback,
  ): Promise<void> => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, resolvePurchaseCommand, actor.roomId, actor.playerId, {
        operationId: request.operationId,
        buy,
      }, { authority: actor });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  };

  socket.on('buy property', (request, acknowledge) => {
    void resolvePurchase(true)(request, acknowledge);
  });
  socket.on('do not buy', (request, acknowledge) => {
    void resolvePurchase(false)(request, acknowledge);
  });

  socket.on('resolve development', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, resolveDevelopmentCommand, actor.roomId, actor.playerId, request, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('wait in jail', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, waitInJailCommand, actor.roomId, actor.playerId, undefined, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
