# Checklist — rent, buildings và transfer policies

## Rent

- [ ] `[AUTO]` Street base, 1–4 Nhà/Khách Sạn tiers and rent on every owned landed street; owning the full colour set
  multiplies that rent (tiers included) by `colorSetRentPercent` in `packages/shared/src/teams.ts` — Solo ×1,5, 2v2 team-owned set ×2,
  `Math.floor` — and never gates building ([GameCore/property-economy](../GameCore/property-economy.instruction.md)).
- [ ] `[AUTO]` Ga rent 25/50/100/200 counts all Ga owned by the same player.
- [ ] `[AUTO]` Utility x4/x10 counts ownership of one or both utilities.
- [ ] `[AUTO]` Rent creates PLAYER `DebtClaim`, preserving creditor and source.

## Landing development/sell

- [ ] `[AUTO]` Landing stores the exact operation ID and level; SKIP, 1–4 house
  builds and level-4 hotel upgrade revalidate the stored decision in the RAM aggregate.
- [ ] `[AUTO]` Voluntary sell refunds half the tile build cost; no inventory,
  contention or even-building state is stored.

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
- [x] `[AUTO][SOCKET]` CURRENT DEVELOPMENT (protocol 13): `sell house` carries `{tileID, requestId}`; one sale, a retransmitted and a concurrent duplicate sell once, a new
  request sells another house, a refused request is not remembered, another actor's id is not a replay, bare tile number / missing id are `INVALID_REQUEST`
  (`apps/server/src/socket.hardening.integration.test.ts`).
