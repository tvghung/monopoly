# Trading: open market và durable private offers

## Code

- `MarketPlace.tsx`, `BackOfCard.tsx`, `dashboard/SellPrompts.tsx`
- `dashboard/useIncomingOffers.ts`, `dashboard/IncomingOffers.tsx`
- `App.tsx` typed command wrappers

## Open market

- Listing request is `{tileID, price}`; seller is authenticated actor.
- Buy/remove requests are `{tileID}`; buyer/seller are derived server-side.
- Price must be a positive integer no greater than `2_147_483_647`; the server revalidates ownership,
  listing, balance and room/player status at commit.
- Authoritative market state only changes on committed update. Local prompt may close
  after emit; ACK failure is surfaced rather than fabricating a transfer. Reconnecting/
  spectator disables or hides actions.

## Private offers

1. Buyer sends `{tileID, price}`.
2. Success ACK returns unique `offerId` and authoritative `expiresAt`.
3. Owner receives private `offer on prop(PrivateOffer)`.
4. Accept/decline sends only `{offerId}`.
5. Server revalidates pending status, expiry, room, buyer/owner, ownership, balance
   and price in the same transaction as property transfer.
6. Buyer/owner receive authoritative accepted/declined/expired/cancelled result.

Offer records and 20-second expiry are server/PostgreSQL authoritative. Client
derives countdown from `expiresAt`; it does not own an expiry timer that authorizes
acceptance. Resume ACK restores pending private offers. Multiple offers on one tile
are safe because UI keys by `offerId`, not tile index. Explicit player leave cancels
their pending offers and the client removes them on `offer cancelled`.

## Privacy/security

- Offer payload never accepts client-supplied player/owner/seller names or IDs.
- Private events use `player:<stablePlayerId>` Socket.IO rooms.
- Offers never appear in public `update`.
- Fabricated, replayed, expired and cross-room offer IDs fail through typed ACK.

## Required tests

- Listing ownership/balance/invalid tile/price and save-failure behavior.
- Private targeting, same-tile multiple offers and resume restoration.
- Spoof/replay/cross-room/expired/duplicate accept rejection.
- Accept transaction updates balances/ownership/listing exactly once.
- DB/server restart preserves pending offers and absolute expiry.
- StrictMode listeners/timers clean up without duplicate toast/actions.
