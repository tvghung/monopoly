# TradeBundle/open-market Socket instruction

## Authority/validation

All actions require authenticated active Player. Zod validates tile, bounded integer
money, UUID offer/card IDs and bilateral `TradeOfferRequest`; payload không mang
trusted buyer/seller/owner identity.

## Open market

Existing put/remove/make-sale events keep simple price/property UX but execute
`VOLUNTARY` transfer. Server revalidates owner/listing/buyer/funds, zero buildings
across affected group and mortgage-interest payment atomically.

## Durable bilateral offer

- `make offer(TradeOfferRequest)` persists canonical `TradeBundle.offered/requested`,
  server-derived participants and 20-second `expiresAt`; ACK returns offer ID/deadline.
- `accept offer({offerId})`/`decline offer({offerId})` unchanged. Accept reloads terms,
  checks ownership/money/card holders/group buildings/mortgages/debt and applies all
  transfers once, including immediate mortgage-interest claims.
- Private arrival/result/expiry/cancel only use relevant `player:<PlayerId>` rooms;
  resume restores pending relevant offers. Public update never contains offer terms.
- Explicit leave cancels unresolved offers unless they are consumed inside the same
  creditor-resolution transaction.

Room + offer + payment writes commit atomically before private/public emit and ACK.
Tests cover bundle validation/transfers, mortgage interest, jail cards, spoof/replay/
expiry/restart/private routing and DB rollback.
