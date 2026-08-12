# PROPERTY/BUILDING auction Socket instruction

## Events

- `decline property`: current landed buy wait only; starts `PROPERTY` auction.
- `place bid(amount)`: authenticated participant in current auction kind; integer
  positive, higher than high bid, within balance.
- `pass bid`: participant except current highest bidder.

No payload chooses `Auction.kind`, property, building target, creditor or owner;
server reads authoritative auction/contention/Bank queue.

## Durable state/recovery

- Both kinds persist stable `auctionId`, participants/pass/bid and absolute `endsAt`.
- PROPERTY may originate decline or `BankPropertyAuctionQueue`; every active Player,
  including decliner, participates. Queue head advances only after finalize.
- BUILDING consumes/releases exactly one `BuildingContention.reservedUnit`; target
  and inventory are revalidated at award.
- Valid late bid guarantees 15 seconds; start is 30 seconds. Disconnect preserves
  state, leave reconciles atomically, active auction dominates turn grace.
- Scheduler capture requires exact `auctionId/kind/endsAt`; CAS/stale callback/save
  failure cannot finalize/charge/award/advance twice.

Tests cover both kinds, no-bid, Bank queue, reservation, invalid target, bid/pass,
leave/disconnect, deadline extension/restart and no-broadcast failure.
