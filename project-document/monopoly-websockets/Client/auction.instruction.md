# Live durable property auction

## Code

- `apps/client/src/components/dashboard/AuctionPanel.tsx`
- `apps/client/src/components/dashboard/BuyPrompt.tsx`
- Shared `Auction`/ACK contracts

## State/UI

Public auction state includes stable `auctionId`, tile, active/passed stable Player IDs,
highest bid/bidder and absolute ISO `endsAt`. Client derives countdown from current
time and `endsAt`; no authoritative per-second tick is stored locally.

- Active Player can bid/pass according to public state; server remains authority.
- Spectator/non-participant sees read-only auction.
- Reconnecting disables bid/pass.
- Bid/pass carries ACK; committed auction state comes from public update and failure
  is surfaced without fabricating a bid. Stale state is resynced from the update.
- Modal closes only when committed update clears auction.

## Deadline behavior

- Auction starts with absolute 30-second deadline.
- A valid bid resets `passed` and, when less than 15 seconds remain, persists a new
  deadline at least 15 seconds ahead.
- Offline participants and highest bidder are not removed merely by disconnect.
- Server restart restores/finalizes from `endsAt`; client refresh resumes countdown.
- Current-turn reconnect grace does not override an active auction.

## Required tests

- Valid/invalid bid/pass and typed ACK errors.
- Client countdown from `endsAt`, extension and restart snapshot.
- Offline/highest bidder preserved.
- Expired auction finalizes once; stale callback/update cannot finalize twice.
- Spectator/reconnecting action gating.
