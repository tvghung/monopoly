# Auction Socket instruction

## Events/guards

- `decline property`: authenticated current Player with `canBuyProp`, no auction.
- `place bid(amount)`: authenticated active auction participant; positive integer bid
  up to `2_147_483_647`, above current high and within current balance.
- `pass bid`: authenticated participant who is not highest bidder.

All commands use runtime schema and typed ACK; actor is stable SocketData player ID.

## Durable state/deadline

Auction state persists `auctionId`, tile, active/passed stable IDs, high bid/bidder and
absolute `endsAt`. Start deadline is 30 seconds. Valid late bid persists extension to
at least 15 seconds and resets passed. No interval handle/tick belongs in snapshot.

Scheduler polls persisted due rows. Recovery captures the due `auctionId/endsAt`,
reloads/locks current state and requires that exact marker before aggregate CAS.
Concurrent stale recovery rolls back without revision/broadcast, so the auction
award/charge/turn effect applies once.

## Disconnect/reconnect

Temporary disconnect does not remove participant, passed state or highest bid. An
offline bidder can still win if authoritative state remains valid at finalize. Active
auction controls turn progression; configured current-turn grace (default 60 seconds)
cannot skip it.
Explicit leave/forfeit reconciles auction atomically through lifecycle command.

## Commit/public update

Start, bid, pass and finalize are durable room commands. Success broadcast/ACK occurs
after PostgreSQL commit. Client derives countdown from `endsAt`; server does not
broadcast whole state every second.

## Tests

- Start/bid/pass guards, `NaN`/fraction/low/over-balance rejection.
- Deadline extension, early completion and no-bid/winner finalization.
- Offline/highest bidder preservation and explicit-forfeit reconciliation.
- Restart before/after expiry; stale callback and duplicate finalize safety.
- Save failure commits no revision and emits no broadcast.
