# Checklist — property economy

## Automated evidence

`[AUTO]` Property/rent/build/sell/mortgage unit assertions live in
`apps/server/src/game.test.ts`, including direct insufficient-funds and non-buildable
build branches. Socket ownership/restart boundaries remain separate requirements.

## Checklist

- [ ] Base rent, monopoly double rent, houses/hotel tiers and mortgage zero rent.
- [ ] Build requires owner/full group/no mortgage/build-even/below level 5/enough funds.
- [ ] Explicit tests reach non-buildable tile and insufficient-funds branches directly.
- [ ] Sell-house follows sell-even and half-cost refund.
- [ ] Mortgage/unmortgage ownership/building/balance/cost guards.
- [ ] Stable owner IDs survive reconnect/restart.
- [ ] Spectator/non-owner/cross-room/invalid tile command fails.
- [ ] Save failure leaves balance/building/mortgage/ownership/revision unchanged.
- [ ] Trading/forfeit transfer semantics preserve or clear buildings/mortgage exactly as
  domain rule specifies and leave no dangling listing/reference.
