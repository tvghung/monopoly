# Checklist — start, movement, doubles, cards, jail và PaymentQueue

## Start/movement

- [ ] `[AUTO][SOCKET]` Start requires host + 2–7 connected/ready; all Players roll
  server-side 2d6, tied highest group rerolls, final stable-ID order persists once.
- [ ] `[AUTO]` Every Player starts index 0/1500; normal 2d6 movement and exact/pass
  Xuất Phát pay 200; direct-to-jail pays none.
- [ ] `[SOCKET]` Client cannot supply starting roll, dice, position or actor.

## Turn continuation/doubles

- [ ] `[AUTO]` Non-double full resolution → `ADVANCE_TURN`; doubles 1/2 full
  resolution → `EXTRA_ROLL`; third consecutive doubles → jail/no movement/reset.
- [ ] `[AUTO]` Buy wait, card destination, payment and both auction kinds delay
  `completeTurnResolution` and handoff/extra roll exactly once.
- [ ] `[SOCKET][PG]` Disconnect/restart after doubles resolution restores same
  Player/streak/pending decision/continuation and cannot roll/advance twice.
- [ ] `[AUTO]` Normal handoff/jail reset streak; jail doubles never extra-roll.

## Tile/cards/decks

- [ ] `[AUTO]` Buy revalidates property/balance; decline starts auction with every
  active Player including decliner; Free Parking no-op; taxes 200/75.
- [ ] `[AUTO]` Chance/Khí Vận draw top in persisted order, normal card rotates bottom,
  movement resolves destination/pass-GO and go-to-jail direct semantics.
- [ ] `[AUTO][PG]` Jail-free card leaves source pile, holder identity persists,
  use/transfer/elimination returns card to correct deck; restart keeps exact piles.

## Jail

- [ ] `[AUTO][SOCKET]` Pay bail 50 then roll; use held card then roll; doubles escapes,
  moves/resolves and ends turn.
- [ ] `[AUTO]` Failed attempts 1/2 stay jailed; third failure creates forced BANK
  claim, then moves with persisted dice after payment and resolves destination.
- [ ] `[PG]` Restart during third-fail debt preserves dice/attempt/card/payment state.

## Multi-debtor PaymentQueue

- [ ] `[AUTO]` `DebtClaim` exact fields validate; PLAYER requires
  `creditorPlayerId`; `remainingAmount` never exceeds original positive amount.
- [ ] `[AUTO]` collect/pay-each-player creates stable cyclic claims and
  `activeClaimIndex`; multiple debtors settle in deterministic Player order.
- [ ] `[AUTO][SOCKET]` Only active debtor can `settle debt`/`declare bankruptcy`;
  sell/mortgage/trade may fund claim while roll/handoff stays blocked.
- [ ] `[PG]` Reconnect/restart preserves claim order/index/remaining source and
  resumes exactly once.
- [ ] `[SOCKET]` Save failure causes no partial balance, claim removal, revision,
  ACK success or broadcast.
