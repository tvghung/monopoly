import type { PlayerId } from '@monopoly/shared';
import type { RoomRecord } from '../persistence';
import type { RoomSnapshot } from '../rooms';
import { projectPrivatePlayerState, projectPublicRoomState } from '../services/publicState';
import type { AppRuntime } from '../services/runtime';
import type { AppServer } from './types';

export const publicRoomName = (roomId: string): string => `room:${roomId}`;
export const privatePlayerRoomName = (playerId: PlayerId): string => `player:${playerId}`;

export function broadcastRoom(
  io: AppServer,
  runtime: AppRuntime,
  room: RoomRecord<RoomSnapshot>,
): void {
  io.to(publicRoomName(room.id)).emit(
    'update',
    projectPublicRoomState(room, runtime.connections),
  );
  for (const [playerId, member] of Object.entries(room.gameSnapshot.members)) {
    if (member.membershipStatus === 'LEFT') continue;
    io.to(privatePlayerRoomName(playerId)).emit(
      'private player state',
      projectPrivatePlayerState(room, playerId),
    );
  }
}

export async function broadcastRoomById(
  io: AppServer,
  runtime: AppRuntime,
  roomId: string,
): Promise<void> {
  const room = await runtime.persistence.rooms.findById(roomId);
  if (room) broadcastRoom(io, runtime, room);
}
