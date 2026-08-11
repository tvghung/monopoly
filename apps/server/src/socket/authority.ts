import type { PlayerId } from '@monopoly/shared';
import type { AppRuntime } from '../services/runtime';
import { CommandError } from './errors';
import type { AppSocket } from './types';

export interface AuthenticatedActor {
  roomId: string;
  playerId: PlayerId;
  socketId: string;
  connectionGeneration: number;
}

export function requireRoom(socket: AppSocket): string {
  if (!socket.data.roomId || !socket.data.role) {
    throw new CommandError('UNAUTHENTICATED', 'Join or resume a room first.');
  }
  return socket.data.roomId;
}

export function requirePlayer(
  socket: AppSocket,
  runtime: AppRuntime,
): AuthenticatedActor {
  const { roomId, playerId, role, connectionGeneration } = socket.data;
  if (
    !roomId
    || !playerId
    || role !== 'PLAYER'
    || connectionGeneration === undefined
    || !runtime.connections.isCurrent(playerId, socket.id, connectionGeneration)
  ) {
    throw new CommandError('UNAUTHENTICATED', 'An active player session is required.');
  }
  return {
    roomId,
    playerId,
    socketId: socket.id,
    connectionGeneration,
  };
}
