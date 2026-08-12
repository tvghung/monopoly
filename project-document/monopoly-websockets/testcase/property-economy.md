# Checklist — rent, buildings, mortgage và transfer policies

## Rent

- [ ] `[AUTO]` Street base, full-group x2, 1–4 Nhà/Khách Sạn tiers and mortgaged
  landed street zero rent.
- [ ] `[AUTO]` Ga rent 25/50/100/200 counts all Ga owner owns including mortgaged
  other Ga; landing the mortgaged Ga itself charges zero.
- [ ] `[AUTO]` Utility x4/x10 counts ownership of both utilities even if the other
  utility is mortgaged; landing mortgaged utility charges zero.
- [ ] `[AUTO]` Rent creates PLAYER `DebtClaim`, preserving creditor and source.

## Build/sell/inventory

- [ ] `[AUTO]` Full group/no mortgage/funded/even build; 4 houses on every group
  property before one target upgrades to hotel.
- [ ] `[AUTO]` Reverse-even sell/refund half; hotel downgrade requires four Bank
  houses and returns hotel stock.
- [ ] `[AUTO]` Derived Bank inventory starts 32/12, counts board levels correctly,
  excludes one reserved contention unit and never becomes negative.
- [ ] `[AUTO][SOCKET]` Scarce `build house` creates/joins contention; normal stock
  build does not open auction; save failure cannot reserve/consume twice.

## Mortgage/transfer

- [ ] `[AUTO]` Mortgage any color-group property requires zero buildings across
  whole group; value half price; unmortgage principal +10%.
- [ ] `[AUTO]` `VOLUNTARY` rejects group building and preserves mortgage; recipient
  immediately owes 10% mortgage value, with normal later unmortgage still due.
- [ ] `[AUTO]` `BANKRUPTCY_TO_PLAYER` transfers mortgaged asset/card to creditor;
  `RETURN_TO_BANK` clears owner/mortgage/building/listing;
  `BANK_AUCTION_AWARD` creates clean ownership.
- [ ] `[SOCKET][PG]` Stable owner/transfer/payment state survives reconnect/restart;
  invalid actor/tile/spectator and failed commit make no change.
