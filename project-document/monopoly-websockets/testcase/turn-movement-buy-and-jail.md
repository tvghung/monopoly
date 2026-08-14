# Checklist — start, movement, landing decisions, jail và payment shortfall

## Start/movement

- [ ] `[AUTO][SOCKET]` Start requires host + 2–7 connected/ready; all Players roll
  server-side 2d6, tied highest group rerolls, final stable-ID order persists once.
- [ ] `[AUTO]` Every Player starts index 0/1500; normal 2d6 movement and exact/pass
  Xuất Phát pay 200; direct-to-jail pays none.
- [ ] `[SOCKET]` Client cannot supply starting roll, dice, position or actor.

## Turn continuation

- [ ] `[AUTO]` Every completed roll resolves exactly once and advances to the next
  seat; doubles never grant an extra roll.
- [ ] `[AUTO]` Buy wait and same-landing development wait delay
  `completeTurnResolution` and handoff exactly once.
- [ ] `[SOCKET][PG]` Disconnect/restart restores the same pending operation ID and
  continuation and cannot roll/advance twice.

## Tile/cards/decks

- [ ] `[AUTO]` Buy/Do Not Buy revalidate operation ID, property and balance; Do Not
  Buy never starts an auction; Free Parking and tax/fee tiles are no-op.
- [ ] `[AUTO]` Chance/Khí Vận draw top in persisted order, normal card rotates bottom,
  movement resolves destination/pass-GO and go-to-jail direct semantics.
- [ ] `[AUTO][PG]` Jail-free card leaves source pile, holder identity persists,
  use/transfer/elimination returns card to correct deck; restart keeps exact piles.

## Jail

- [ ] `[AUTO][SOCKET]` Pay bail 50 then roll; use held card then roll; doubles escapes,
  moves/resolves and ends turn.
- [ ] `[AUTO]` Failed roll or explicit wait ends the jailed turn; the persisted
  opponent-round counter increments on handoff and releases before the second
  jailed turn.
- [ ] `[PG]` Restart preserves jail progress and card identities exactly.

## Multi-debtor PaymentQueue

- [ ] `[AUTO]` `DebtClaim` exact fields validate; PLAYER requires
  `creditorPlayerId`; `remainingAmount` never exceeds original positive amount.
- [ ] `[AUTO]` collect/pay-each-player creates stable cyclic claims and
  `activeClaimIndex`; multiple debtors settle in deterministic Player order.
- [ ] `[AUTO][SOCKET]` Only the active debtor can sell to Bank or propose a forced
  sale; ordinary listing/trade and roll remain blocked during shortfall.
- [ ] `[PG]` Reconnect/restart preserves claim order/index/remaining source and
  resumes exactly once.
- [ ] `[SOCKET]` Save failure causes no partial balance, claim removal, revision,
  ACK success or broadcast.
