import type { PlayerId } from '@monopoly/shared';
import { isBotMember, memberKind, type RoomSnapshot } from '../rooms';
import type { ConnectionRegistry } from './connectionRegistry';

/**
 * Whether a seat is being played right now. A bot is played by this process and is always present; a human is present while
 * one of their connections is active. Use this wherever a rule asks "is the player here?" (start, turn recovery).
 */
export const isSeatPresent = (
  connections: ConnectionRegistry,
  snapshot: RoomSnapshot,
  playerId: PlayerId,
): boolean => isBotMember(snapshot, playerId) || connections.isConnected(playerId);

/** Whether any human member who has not left the room is connected. Bots never keep a room alive on their own. */
export const hasConnectedHuman = (connections: ConnectionRegistry, snapshot: RoomSnapshot): boolean => (
  Object.entries(snapshot.members).some(([playerId, member]) => (
    member.membershipStatus !== 'LEFT' && memberKind(member) === 'HUMAN' && connections.isConnected(playerId)
  ))
);
