import type { PlayerId, PrivateOffer, PrivatePlayerState, PublicRoomState } from '@monopoly/shared';
import type { RoomRecord, TradeOfferRecord } from '../persistence/types';
import { activeBotIds, memberKind, type RoomSnapshot } from '../rooms';
import type { ConnectionRegistry } from '../services/connectionRegistry';
import { projectPrivateOffer } from '../services/privateOffers';
import { projectPrivatePlayerState, projectPublicRoomState } from '../services/publicState';

/**
 * Everything a bot may look at, and nothing more: the public room projection every client receives, the private projection
 * its own seat's browser would receive, and the pending offers addressed to it. Hidden deck order, other players' private
 * state, the raw room record and future dice are out of reach by construction.
 */
export interface BotView {
  botId: PlayerId;
  room: PublicRoomState;
  self: PrivatePlayerState;
  offers: PrivateOffer[];
}

/** Bots that still have a seat in the running game (eliminated bots never act). */
export const playingBotIds = (room: RoomRecord<RoomSnapshot>): PlayerId[] => (
  Object.entries(room.gameSnapshot.members)
    .filter(([playerId, member]) => (
      memberKind(member) === 'BOT'
      && member.membershipStatus === 'ACTIVE'
      && Boolean(room.gameSnapshot.gameState.players[playerId])
    ))
    .map(([playerId]) => playerId)
);

export const roomHasBots = (room: RoomRecord<RoomSnapshot>): boolean => (
  activeBotIds(room.gameSnapshot).length > 0
  || Object.values(room.gameSnapshot.members).some(member => memberKind(member) === 'BOT')
);

export function buildBotViews(
  room: RoomRecord<RoomSnapshot>,
  connections: ConnectionRegistry,
  pendingOffers: readonly TradeOfferRecord[],
  now: Date,
): BotView[] {
  const publicRoom = projectPublicRoomState(room, connections);
  return playingBotIds(room).map(botId => ({
    botId,
    room: publicRoom,
    self: projectPrivatePlayerState(room, botId),
    offers: pendingOffers
      .filter(offer => offer.recipientPlayerId === botId && offer.status === 'PENDING' && offer.expiresAt > now)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map(offer => projectPrivateOffer(offer, room)),
  }));
}
