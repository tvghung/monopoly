# Checklist — rent, buildings và transfer policies

## Rent

- [ ] `[AUTO]` Street base (no full-group multiplier), 1–4 Nhà/Khách Sạn tiers and
  normal rent on every owned landed street.
- [ ] `[AUTO]` Ga rent 25/50/100/200 counts all Ga owned by the same player.
- [ ] `[AUTO]` Utility x4/x10 counts ownership of one or both utilities.
- [ ] `[AUTO]` Rent creates PLAYER `DebtClaim`, preserving creditor and source.

## Landing development/sell

- [ ] `[AUTO]` Landing stores the exact operation ID and level; SKIP, 1–4 house
  builds and level-4 hotel upgrade revalidate the persisted decision.
- [ ] `[AUTO]` Voluntary sell refunds half the tile build cost; no inventory,
  contention or even-building state is persisted.

## Transfer

- [ ] `[AUTO]` `VOLUNTARY` applies only the explicit bilateral bundle terms and no
  hidden transfer fee.
- [ ] `[AUTO]` `FORCED_SALE` computes gross from authoritative tile data and transfers
  the property; `RETURN_TO_BANK` clears owner and buildings.
- [ ] `[SOCKET][PG]` Stable owner/transfer/payment state survives reconnect/restart;
  invalid actor/tile/spectator and failed commit make no change.
