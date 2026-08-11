# Trading Socket instruction

## Authority/validation

All actions require authenticated active Player and use stable server-side actor.
Zod validates tile `0..39`, positive integer price up to `2_147_483_647` and UUID
offer IDs. Payloads never supply buyer/seller/owner identity.

## Open market events

| Event | Payload | Transaction checks |
| --- | --- | --- |
| `put on open market` | `{tileID, price}` | Actor owns property; listing allowed; authoritative name/tile |
| `remove sale` | `{tileID}` | Actor is current seller |
| `make sale` | `{tileID}` | Listing pending, buyer != seller, buyer active and funded, ownership unchanged |

Transfer updates balances, stable owner/color and listing in same room transaction.

## Durable private offer events

| Event | Payload/result |
| --- | --- |
| `make offer` | `{tileID, price}`; creates DB offer and ACKs `{offerId, expiresAt}` |
| `accept offer` | `{offerId}` |
| `decline offer` | `{offerId}` |

Offer has server-authoritative buyer/owner/tile/price/status and 20-second absolute
expiry. Accept/decline locks/revalidates pending status, expiry, actor as owner,
current ownership, buyer activity/balance and original terms. Replays, fabricated or
cross-room IDs fail. Multiple offers on the same tile are independent.

## Private routing/recovery

Arrival/result/expiry/cancellation emits only to prefixed
`player:<stablePlayerId>` rooms. Offer rows never enter public state. Resume ACK
includes only unexpired pending offers relevant to Player. Startup/periodic scheduler
resolves due offers exactly once; explicit player leave cancels their pending offers.

## Transaction/ACK

All mutations commit room/offer rows before private/public emit and success ACK.
Database failure returns retryable ACK, discards draft and emits nothing.

## Tests

- Invalid tile/price, spoofed identity and owner/balance changes.
- Listing buy/remove atomicity and save-failure behavior.
- Private target isolation; same-tile offers; replay/cross-room/expired IDs.
- Accept once, correct balances/property/listing; restart/expiry/resume.
