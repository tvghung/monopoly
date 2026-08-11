import { tileState, type PrivateOffer } from '@monopoly/shared';
import type { RoomRecord, TradeOfferRecord } from '../persistence';
import { assertSupportedRoomSnapshot, type RoomSnapshot } from '../rooms';

const playerName = (room: RoomRecord<RoomSnapshot>, playerId: string): string => (
  room.gameSnapshot.gameState.players[playerId]?.name
  ?? room.gameSnapshot.gameState.boardState.finishedPlayers[playerId]?.name
  ?? 'Player'
);

export function projectPrivateOffer(
  offer: TradeOfferRecord,
  room: RoomRecord<RoomSnapshot>,
): PrivateOffer {
  assertSupportedRoomSnapshot(room);
  return {
    offerId: offer.id,
    roomId: offer.roomId,
    buyerPlayerId: offer.buyerPlayerId,
    ownerPlayerId: offer.ownerPlayerId,
    tileID: offer.tileId,
    price: offer.price,
    buyerName: playerName(room, offer.buyerPlayerId),
    ownerName: playerName(room, offer.ownerPlayerId),
    tileName: tileState[offer.tileId]?.streetName ?? `Tile ${offer.tileId}`,
    status: offer.status,
    createdAt: offer.createdAt.toISOString(),
    expiresAt: offer.expiresAt.toISOString(),
    resolvedAt: offer.resolvedAt?.toISOString() ?? null,
  };
}
