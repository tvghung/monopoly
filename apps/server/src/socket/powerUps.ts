import {
  activatePowerUpCommand,
  continuePowerUpMovementCommand,
  resolvePowerUpTradeCommand,
  respondPowerUpCommand,
  selectPowerUpCommand,
  resolvePowerUpCommand,
  runGameCommand,
} from '../commands/gameplay';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { acknowledgeFailure, successAck } from './errors';
import type { AppServer, AppSocket } from './types';

export function registerPowerUpHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('activate power up', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, activatePowerUpCommand, actor.roomId, actor.playerId, request, { authority: actor });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
  socket.on('respond power up', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, respondPowerUpCommand, actor.roomId, actor.playerId, request, { authority: actor });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
  socket.on('resolve power up trade', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, resolvePowerUpTradeCommand, actor.roomId, actor.playerId, request, { authority: actor });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
  socket.on('continue power up movement', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, continuePowerUpMovementCommand, actor.roomId, actor.playerId, request, { authority: actor });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
  socket.on('select power up', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, selectPowerUpCommand, actor.roomId, actor.playerId, request, { authority: actor });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
  socket.on('resolve power up', async (request, acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { room } = await runGameCommand(io, runtime, resolvePowerUpCommand, actor.roomId, actor.playerId, request, { authority: actor });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) { acknowledgeFailure(acknowledge, error); }
  });
}
