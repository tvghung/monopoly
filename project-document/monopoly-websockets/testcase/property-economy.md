# Checklist — rent, buildings, mortgage và transfer policies

## Rent

- [ ] `[AUTO]` Street base (no full-group multiplier), 1–4 Nhà/Khách Sạn tiers and mortgaged
  landed street zero rent.
- [ ] `[AUTO]` Ga rent 25/50/100/200 counts all Ga owner owns including mortgaged
  other Ga; landing the mortgaged Ga itself charges zero.
- [ ] `[AUTO]` Utility x4/x10 counts ownership of both utilities even if the other
  utility is mortgaged; landing mortgaged utility charges zero.
- [ ] `[AUTO]` Rent creates PLAYER `DebtClaim`, preserving creditor and source.

## Landing development/sell

- [ ] `[AUTO]` Landing stores the exact operation ID and level; SKIP, 1–4 house
  builds and level-4 hotel upgrade revalidate the persisted decision.
- [ ] `[AUTO]` Voluntary sell refunds half the tile build cost; no inventory,
  contention or even-building state is persisted.

## Mortgage/transfer

- [ ] `[AUTO]` Mortgage a property with no buildings; value half price; unmortgage
  principal +10%.
- [ ] `[AUTO]` `VOLUNTARY` preserves mortgage; recipient
  immediately owes 10% mortgage value, with normal later unmortgage still due.
- [ ] `[AUTO]` `FORCED_SALE` computes gross/net from authoritative tile data and
  transfers an unmortgaged property; `RETURN_TO_BANK` clears owner/building/listing.
- [ ] `[SOCKET][PG]` Stable owner/transfer/payment state survives reconnect/restart;
  invalid actor/tile/spectator and failed commit make no change.
