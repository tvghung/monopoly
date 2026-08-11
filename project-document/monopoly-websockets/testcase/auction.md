# Checklist — durable auction

## Automated evidence

`[AUTO]` Core finalize/start-related assertions live in `apps/server/src/game.test.ts`.
`[AUTO]` `apps/server/src/services/deadlineScheduler.test.ts` proves expired-auction
recovery once. `[SOCKET-INTEGRATION]` covers current-player leave/finalize and
two-player finish cleanup. These do not cover every bid/pass/restart race below.

## Checklist

- [ ] Decline by correct current Player creates unique `auctionId`, participants and `endsAt`.
- [ ] Unauthorized/spectator/stale decline fails through ACK.
- [ ] Bid rejects `NaN`, infinity, fraction, non-increase and over-balance values.
- [ ] Valid bid persists high bidder/value, clears passed and extends deadline to at least 15s.
- [ ] Pass/early finish/highest-bidder rules remain correct.
- [ ] Client countdown derives from `endsAt`; no persisted/broadcast per-second tick.
- [ ] Temporary disconnect preserves participant, passed state and highest bid.
- [ ] Explicit leave reconciles auction atomically.
- [ ] Active auction overrides generic current-turn grace.
- [ ] Restart before expiry restores auction; restart after expiry finalizes once.
- [ ] Bid-expiry and stale callback races cannot double-finalize.
- [ ] Save failure changes no auction/revision/public update.
