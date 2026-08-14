# Checklist — bankruptcy, forfeit, forced liquidation và winner

## Payment creditor

- [ ] `[AUTO]` Affordable claims settle in ordered `PaymentQueue` order without a
  negative balance; a shortfall exposes deterministic sellable gross/net values.
- [ ] `[AUTO]` A debtor can sell to Bank in ascending tile order or create one
  snapshot-bound forced-sale proposal; stale/replayed markers are no-ops.
- [ ] `[SOCKET]` If active debtor explicitly leaves, auto-liquidation pays the
  creditor where possible and finished reason remains `LEFT`.

## Bank liquidation

- [ ] `[AUTO]` Forced Bank sale clears ownership, mortgage, listing and buildings;
  it stops once the active claim is affordable.
- [ ] `[AUTO][PG]` Payment deadline recovery repeats deterministic sales after a
  fresh runtime, then continues later claims or eliminates only after assets end.

## Multi-claim/winner/reference safety

- [ ] `[AUTO]` Multiple debtors/claims/eliminations do not recurse through stale
  IDs, skip active claim or advance turn twice.
- [ ] `[AUTO]` Cleanup reconciles current Player, payment, proposal, private offers
  and deck holders with no dangling stable-ID reference.
- [ ] `[AUTO][SOCKET]` Last active Player becomes stable winner once; room FINISHED,
  all live operation/deadline state clear; bankruptcy and leave reasons differ.
- [ ] `[PG]` Finished/winner history restores and obeys retention; reconnect identity
  and credential privacy remain intact.
