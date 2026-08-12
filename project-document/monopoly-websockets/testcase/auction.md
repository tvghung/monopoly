# Checklist — PROPERTY/BUILDING auctions và BankPropertyAuctionQueue

## Common

- [ ] `[AUTO]` Both kinds have stable `auctionId`, valid kind-specific target,
  participants/pass/leader and absolute 30-second deadline.
- [ ] `[SOCKET]` Bid rejects invalid/non-increasing/over-balance amounts; valid bid
  clears pass and preserves at least 15 seconds; highest bidder cannot pass.
- [ ] `[AUTO]` Disconnect preserves; explicit leave reconciles; no bidder leaves
  property/unit correctly; active auction overrides turn grace.
- [ ] `[AUTO][PG]` Exact `auctionId/kind/endsAt` recovery, bid-expiry race and stale
  callback finalize at most once; save failure publishes nothing.

## PROPERTY/Bank queue

- [ ] `[AUTO]` Decline auction includes every active Player including decliner;
  highest funded bidder wins; no-bid leaves property unowned.
- [ ] `[AUTO]` Bank bankruptcy/forfeit enqueues properties in ascending board index;
  exactly queue head owns current auction.
- [ ] `[AUTO][PG]` Finalize/cancel pops once, opens next item once, survives restart
  with multiple properties and resumes payment/turn only after queue empty.
- [ ] `[AUTO]` Award uses `BANK_AUCTION_AWARD`; invalid/unfunded persisted leader
  creates no debt/ownership.

## BUILDING contention

- [ ] `[AUTO]` Last Nhà/Khách Sạn demand creates one contention + one
  `reservedUnit`; derived inventory subtracts it exactly once.
- [ ] `[AUTO]` Winner target/funds/legal build revalidated; consume or release
  reservation once; invalid target cannot duplicate building.
- [ ] `[PG]` Restart before/after deadline preserves contention/reservation and
  deterministic award/cancel.
