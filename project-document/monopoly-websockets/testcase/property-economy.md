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
- [ ] `[SOCKET][RAM]` Stable owner/transfer/payment state survives reconnect to the live host;
  invalid actor/tile/spectator and failed commit make no change.

## Deed card, inspection and portfolios (visual overhaul V2, plan 04)

- [x] `[AUTO][CLIENT]` `deedCardModel.test.ts`, `propertyDetails.test.ts`: the deed model is derived from canonical shared tile
  data and public ownership only (streets at 0–5 houses, railroad counts, utilities, unowned, owner, group progress); the
  current rent row is the same helper the economy uses; complete-group doubling stays a rule note, not a computed number.
- [x] `[AUTO][CLIENT]` `PropertyDeedCard.test.tsx`: the table has a caption and `aria-current` row, the "Sau khi xây" marker only
  with `showNext`, special tiles use the neutral header, chips are one line.
- [x] `[AUTO][CLIENT]` `PropertyInspectionModal.test.tsx`, `OwnedPropertiesControl.test.tsx`, `PlayerPortfolioModal.test.tsx`,
  `playerPortfolioFlow.test.tsx`, `portfolioModel.test.ts`: actions and their disabled reasons, authoritative balance, district
  grouping, read-only player portfolio opened from a HUD card button, focus return to that button.
- [ ] `[MANUAL-E2E]` G4: inspection, "Tài sản của tôi" and player portfolio at phone and desktop sizes.
