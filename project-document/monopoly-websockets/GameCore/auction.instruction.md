# Durable auction

## State

Auction snapshot contains stable `auctionId`, tile ID/name/list price, high
bid/bidder, active/passed stable Player IDs and absolute ISO `endsAt`. Timer handles
and per-second countdown are runtime/client-derived only.

## Domain rules

- Current Player may start auction only while `canBuyProp` and no auction exists.
- Auction starts with all active Players and 30-second deadline.
- Bid must be positive integer up to `2_147_483_647`, exceed high bid and not exceed
  current balance.
- Valid bid resets passed and extends deadline to at least 15 seconds when needed.
- Highest bidder cannot pass; early finalize may occur once no other participant
  needs action.
- Finalize revalidates authoritative bidder/property/balance, creates unbuilt and
  unmortgaged ownership when valid, clears auction and advances turn.
- A bid does not reserve funds. If the leader no longer has enough balance at
  finalize, no invalid debt/ownership transfer is committed and the tile stays unowned.

## Disconnect/leave

Temporary disconnect preserves participant/pass/highest bid; it does not reopen or
cancel auction. Explicit leave/forfeit performs deterministic auction reconciliation
inside the same room transaction.

Current-turn reconnect grace is subordinate to active auction deadline.

## Recovery/idempotence

- Scheduler finds due auction rows from persisted `endsAt`/`next_action_at`.
- Recovery captures the due `auctionId/endsAt`, reloads locked current state and
  requires that exact marker before aggregate CAS.
- Startup/lazy load immediately finalizes expired auction before serving state.
- Start, bid, pass, extension and finalize persist before broadcast.
- A concurrent stale recovery rolls back with no revision/activity/broadcast; it
  cannot award, charge or advance the turn twice.

## Tests

- Start/bid/pass/extension/early close/finalize domain behavior.
- Invalid numeric values and insufficient funds.
- Disconnect preservation and explicit leave reconciliation.
- Active/expired auction restart; bid-expiry race and stale callbacks.
- Repository failure does not commit a revision or broadcast.
