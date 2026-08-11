import { tileIdSchema, type AckCallback } from '@monopoly/shared';
import {
  buildHouse,
  mortgageProperty,
  sellHouse,
  unmortgageProperty,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

type PropertyAction = typeof buildHouse;

async function executePropertyAction(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
  rawTileID: unknown,
  acknowledge: AckCallback,
  action: PropertyAction,
): Promise<void> {
  try {
    const tileID = parsePayload(tileIdSchema, rawTileID);
    const actor = requirePlayer(socket, runtime);
    const { roomId, playerId } = actor;
    const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
      if (room.status !== 'IN_PROGRESS' || state.boardState.winner) {
        throw new CommandError('CONFLICT', 'Property management is not available.');
      }
      if (!action(state, playerId, tileID)) {
        throw new CommandError('CONFLICT', 'This property action is not allowed now.');
      }
    }, undefined, actor);
    if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
    broadcastRoom(io, runtime, committed.room);
    if (typeof acknowledge === 'function') {
      acknowledge(successAck(committed.room.aggregateVersion));
    }
  } catch (error) {
    if (typeof acknowledge === 'function') acknowledgeFailure(acknowledge, error);
  }
}

export function registerBuildingHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('build house', (tileID, acknowledge) => {
    void executePropertyAction(io, socket, runtime, tileID, acknowledge, buildHouse);
  });
  socket.on('sell house', (tileID, acknowledge) => {
    void executePropertyAction(io, socket, runtime, tileID, acknowledge, sellHouse);
  });
  socket.on('mortgage property', (tileID, acknowledge) => {
    void executePropertyAction(io, socket, runtime, tileID, acknowledge, mortgageProperty);
  });
  socket.on('unmortgage property', (tileID, acknowledge) => {
    void executePropertyAction(io, socket, runtime, tileID, acknowledge, unmortgageProperty);
  });
}
