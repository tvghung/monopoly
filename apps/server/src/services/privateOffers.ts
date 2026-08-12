import type { PrivateOffer } from '@monopoly/shared';
import type { RoomRecord, TradeOfferRecord } from '../persistence';
import { assertSupportedRoomSnapshot, type RoomSnapshot } from '../rooms';

const playerName = (room: RoomRecord<RoomSnapshot>, playerId: string): string => (
  room.gameSnapshot.gameState.players[playerId]?.name
  ?? room.gameSnapshot.gameState.boardState.finishedPlayers[playerId]?.name
  ?? 'Người chơi'
);

export function projectPrivateOffer(
  offer: TradeOfferRecord,
  room: RoomRecord<RoomSnapshot>,
): PrivateOffer {
  assertSupportedRoomSnapshot(room);
  return {
    offerId: offer.id,
    roomId: offer.roomId,
    proposerPlayerId: offer.proposerPlayerId,
    recipientPlayerId: offer.recipientPlayerId,
    proposerName: playerName(room, offer.proposerPlayerId),
    recipientName: playerName(room, offer.recipientPlayerId),
    offered: structuredClone(offer.offered),
    requested: structuredClone(offer.requested),
    status: offer.status,
    createdAt: offer.createdAt.toISOString(),
    expiresAt: offer.expiresAt.toISOString(),
    resolvedAt: offer.resolvedAt?.toISOString() ?? null,
  };
}
