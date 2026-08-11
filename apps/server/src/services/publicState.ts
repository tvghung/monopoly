import {
  SOCKET_PROTOCOL_VERSION,
  type PublicRoomState,
  type RoomPlayerMeta,
} from '@monopoly/shared';
import type { RoomRecord } from '../persistence/types';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  assertSupportedRoomSnapshot,
  hydrateGameState,
  type RoomSnapshot,
} from '../rooms';
import type { ConnectionRegistry } from './connectionRegistry';

export function projectPublicRoomState(
  room: RoomRecord<RoomSnapshot>,
  connections: ConnectionRegistry,
  now = new Date(),
): PublicRoomState {
  assertSupportedRoomSnapshot(room);
  const gameState = hydrateGameState(room.gameSnapshot, room.status);
  const auction = gameState.boardState.auction;
  if (auction) {
    auction.timer = Math.max(
      0,
      Math.ceil((new Date(auction.endsAt).getTime() - now.getTime()) / 1_000),
    );
  }

  const players: RoomPlayerMeta[] = Object.entries(room.gameSnapshot.members)
    .sort(([, left], [, right]) => left.joinOrder - right.joinOrder)
    .map(([playerId, member]) => {
      const identity = gameState.players[playerId]
        ?? gameState.boardState.finishedPlayers[playerId];
      if (!identity) {
        throw new Error(`Room member ${playerId} is missing player display data`);
      }
      return {
        playerId,
        name: identity.name,
        color: identity.color,
        joinOrder: member.joinOrder,
        membershipStatus: member.membershipStatus,
        ready: member.ready,
        connected: member.membershipStatus === 'ACTIVE'
          && connections.isConnected(playerId),
      };
    });

  return {
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    version: room.aggregateVersion,
    roomId: room.id,
    roomCode: room.code,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    players,
    gameState,
  };
}
