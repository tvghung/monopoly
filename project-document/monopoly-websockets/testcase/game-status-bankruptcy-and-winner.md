# Checklist — bankruptcy, forfeit, Bank pipeline và winner

## PLAYER creditor

- [ ] `[AUTO]` Declared bankruptcy pays available cash then transfers remaining
  properties, mortgages and held jail-free cards to active `creditorPlayerId` using
  `BANKRUPTCY_TO_PLAYER`; nothing becomes unowned accidentally.
- [ ] `[AUTO]` Mortgage interest becomes correct follow-up BANK claim without losing
  cyclic `PaymentQueue` order/index.
- [ ] `[SOCKET]` If active debtor explicit leaves, same PLAYER-creditor transfer
  runs but finished reason remains `LEFT`.

## BANK/no-player-creditor

- [ ] `[AUTO]` Buildings return inventory, mortgage/listing clear, cards return to
  source deck and properties enqueue ascending index into `BankPropertyAuctionQueue`.
- [ ] `[AUTO][PG]` Multiple-property queue auctions sequentially and survives restart
  without skip/duplicate award.
- [ ] `[SOCKET]` Active BANK debtor leave uses Bank pipeline; no active
  player-creditor debt surrenders to Bank and records `LEFT`.
- [ ] `[AUTO][SOCKET]` A non-current forfeit Bank auction queue resumes through
  `NO_TURN_CHANGE`; it cannot hand off or alter the unrelated current Player.

## Multi-claim/winner/reference safety

- [ ] `[AUTO]` Multiple debtors/claims/eliminations do not recurse through stale
  IDs, skip active claim or advance turn twice.
- [ ] `[AUTO]` Cleanup reconciles current Player, payment, private offers, auction,
  contention, deck holders and Bank queue with no dangling stable-ID reference.
- [ ] `[AUTO][SOCKET]` Last active Player becomes stable winner once; room FINISHED,
  all live operation/deadline state clear; bankruptcy and leave reasons differ.
- [ ] `[PG]` Finished/winner history restores and obeys retention; reconnect identity
  and credential privacy remain intact.
