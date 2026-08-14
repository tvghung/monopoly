# TradeBundle Socket instruction

## Authority/validation

All actions require authenticated active Player. Zod validates bounded money, UUID
offer/card IDs and bilateral `TradeOfferRequest`; payload không mang trusted
buyer/seller/owner identity.

## Durable bilateral offer

- `make offer(TradeOfferRequest)` persists canonical `TradeBundle.offered/requested`,
  server-derived participants and 20-second `expiresAt`; ACK returns offer ID/deadline.
- `accept offer({offerId})`/`decline offer({offerId})` use only the stable offer ID.
  Accept reloads terms, checks ownership/money/card holders/debt and applies all
  transfers once.
- Private arrival/result/expiry/cancel only use relevant `player:<PlayerId>` rooms;
  resume restores pending relevant offers. Public update never contains offer terms.
- Explicit leave cancels unresolved offers unless they are consumed inside the same
  creditor-resolution transaction.

Room + offer + payment writes commit atomically before private/public emit and ACK.
Tests cover bundle validation/transfers, jail cards, spoof/replay/expiry/restart,
private routing and DB rollback.
