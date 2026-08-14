import type { OfferResult } from '@monopoly/shared';
import type { RoomRecord, TradeOfferRecord, TradeOfferRepository } from '../persistence/types';
import type { RoomSnapshot } from '../rooms';
import { privatePlayerRoomName } from '../socket/broadcast';
import type { AppServer } from '../socket/types';
import { projectPrivateOffer } from './privateOffers';

const touchesAssets = (
  offer: TradeOfferRecord,
  tileIds: Set<number>,
  cardIds: Set<string>,
): boolean => (
  [...offer.offered.propertyIds, ...offer.requested.propertyIds].some((id) => tileIds.has(id))
  || [...offer.offered.jailFreeCardIds, ...offer.requested.jailFreeCardIds]
    .some((id) => cardIds.has(id))
);

/** Cancel stale offers in the same transaction as an ownership/building mutation. */
export async function cancelPendingOffersForAssets(
  repository: TradeOfferRepository,
  roomId: string,
  acceptedOfferId: string | null,
  tileIds: number[],
  cardIds: string[],
  now: Date,
): Promise<TradeOfferRecord[]> {
  const tiles = new Set(tileIds);
  const cards = new Set(cardIds);
  if (tiles.size === 0 && cards.size === 0) return [];
  const pending = await repository.listPendingForRoom(roomId);
  const cancelled = await Promise.all(pending
    .filter((offer) => offer.id !== acceptedOfferId && touchesAssets(offer, tiles, cards))
    .map((offer) => repository.resolve(offer.id, 'CANCELLED', now)));
  return cancelled.filter((offer): offer is TradeOfferRecord => offer !== null);
}

/** Cancel every pending offer involving a player in the same transaction. */
export async function cancelPendingOffersForPlayer(
  repository: TradeOfferRepository,
  roomId: string,
  playerId: string,
  now: Date,
): Promise<TradeOfferRecord[]> {
  const pending = await repository.listPendingForPlayer(roomId, playerId);
  const cancelled = await Promise.all(
    pending.map((offer) => repository.resolve(offer.id, 'CANCELLED', now)),
  );
  return cancelled.filter((offer): offer is TradeOfferRecord => offer !== null);
}

export function emitCancelledOffers(
  io: AppServer,
  room: RoomRecord<RoomSnapshot>,
  records: TradeOfferRecord[],
  now: Date,
): void {
  for (const record of records) {
    const offer = projectPrivateOffer(record, room);
    const result: OfferResult = {
      offerId: offer.offerId,
      status: 'CANCELLED',
      proposerPlayerId: offer.proposerPlayerId,
      recipientPlayerId: offer.recipientPlayerId,
      proposerName: offer.proposerName,
      recipientName: offer.recipientName,
      offered: offer.offered,
      requested: offer.requested,
      resolvedAt: offer.resolvedAt ?? now.toISOString(),
    };
    io.to(privatePlayerRoomName(offer.proposerPlayerId)).emit('offer cancelled', result);
    io.to(privatePlayerRoomName(offer.recipientPlayerId)).emit('offer cancelled', result);
  }
}
