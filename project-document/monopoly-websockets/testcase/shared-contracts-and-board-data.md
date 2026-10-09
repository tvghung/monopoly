# Checklist — protocol/snapshot contracts, board Việt Nam và decks

Current versions are `SOCKET_PROTOCOL_VERSION` (`packages/shared/src/types.ts`) and `ROOM_SNAPSHOT_SCHEMA_VERSION`
(`apps/server/src/rooms.ts`); history: [Version history](../Shared/socket-and-state-contracts.instruction.md#version-history).
Items below were first written against protocol/snapshot v7; the wording now refers to the current versions.

## Protocol/contracts/privacy

- [ ] `[AUTO][SOCKET]` Current-protocol client/server works; older/mismatch gets
  `UPGRADE_REQUIRED`; every mutation has typed ACK and strict payload shape.
- [ ] `[AUTO][SOCKET]` `set appearance` accepts strict character/color combinations,
  allows duplicate characters and colors, rejects conflicting exact combinations,
  and preserves
  committed appearance through public projection/reconnect.
- [ ] `[AUTO]` Runtime schemas cover `TurnInfo.pendingPropertyDecision`,
  `PendingTurnContinuation`, `DebtClaim/PaymentQueue`, landing decisions,
  `TradeOfferRequest/TradeBundle`, transfer policies and IDs.
- [ ] `[AUTO]` Continuation schema accepts only the supported card/jail/payment
  resume kinds; stale operation IDs cannot advance another Player.
- [ ] `[AUTO][SOCKET]` Operation-scoped `PendingCardInteraction` (RAM aggregate) accepts only
  `AWAITING_DRAW` without `revealedCardId` or `REVEALED` with a valid card ID;
  operation-scoped `draw card` and `dismiss card` commit/ACK exactly once.
- [ ] `[AUTO]` Public semantic event lanes validate contiguous bounded tails for
  `MONEY_TRANSFER`, `PROPERTY_TRANSFER`, `PASS_GO`, `SENT_TO_JAIL`,
  `JAIL_ROLL_FAILED` and `JAIL_RELEASED`; private lanes stay participant-scoped.
- [ ] `[AUTO]` Public projection contains no raw/hash token, session row, private
  offer terms or exact `DeckState`/next card; snapshot omits presence/socket/timer.
- [ ] `[AUTO]` Snapshot deep validation (current schema) rejects dangling player/card/creditor,
  invalid claim index, duplicate card, two landing decisions, malformed proposal
  binding and any removed auction/contention/Bank queue state; HISTORICAL: SQL migration 008
  (never loaded by the RAM runtime) upgraded V6 to empty V7 semantic baselines and a completed-card ledger without
  inventing history.

## Board/card data

- [ ] `[AUDIT]` Exactly 40 indices match canonical Vietnamese table; index 17 is
  Khí Vận/chest; all special indices, types and eight color groups valid.
- [ ] `[AUDIT]` All numeric price/rent tiers/house costs retained; no player-facing
  English board/card label or `$`/`$M`.
- [ ] `[AUDIT]` Client has no duplicate 40-row metadata; presentation derives shared
  names/economy.
- [ ] `[AUTO]` Money formatter maps 60→`60.000 ₫`, 200→`200.000 ₫`,
  1500→`1.500.000 ₫`.
- [x] `[AUTO]` The tax tiles keep their amounts: index 4 Thuế Thu Nhập `expenseAmount` 150 and index 38 Thuế Xa Xỉ 100, and
  each is charged to the Bank on landing (`apps/server/src/rulesContract.test.ts` "keeps the tax tiles at the amounts the
  guide reads", "charges each tax tile the amount in the tile data, to the Bank"). Scope: the 150 assertion is CURRENT
  DEVELOPMENT (vNext, unreleased, commit 1937a73; implemented on the vNext development branch; product approval/release decision not independently verified); the RELEASED v1.7.0
  value and assertion are 200. The 1.7.0 ↔ vNext display mismatch is an open release risk
  ([Version history](../Shared/socket-and-state-contracts.instruction.md#version-history)).
- [x] `[AUTO]` `packages/shared/src/rules.ts` (start cash, Xuất Phát reward, 2–4 players, 4 Nhà then Khách Sạn, half refund,
  Ga rent 25/50/100/200, Công Ty ×4/×10, 70% forced sale, jail round limit 2, offer and forced-sale proposal 20 s, default
  60 s reconnect wait and 120 s debt deadline) computes the documented values **and agrees with the real server**:
  `createFreshPlayer`, `MIN_PLAYERS`/`MAX_PLAYERS`, `START_REWARD` and `moveBy`, `railroadRent`, `utilityRent`,
  `forcedSaleGrossPrice`, `sellHouse`, the landing development decision, `nextTurn` jail release, `loadServerConfig` and
  `DEFAULT_*` timeouts, and the `expiresAt` of a real `make offer` over a socket (`apps/server/src/rulesContract.test.ts`).
  Every street has a build cost and five rent tiers and a district shares one build cost.
- [x] `[AUTO][CLIENT]` Every money amount the how-to-play guide prints exists in the shared board data, cards or
  `rules.ts` (`apps/client/src/howToPlay/model.test.ts` "only mentions amounts that exist in the shared board data, cards or
  rules"); the Ga ladder, Công Ty multipliers, bail, jail rounds, durations and the 28 cards come from the same sources.
  The deed text (`propertyDetails.ts`) reads the Ga ladder, Công Ty multipliers and Xuất Phát reward from `rules.ts`.
- [ ] `[AUTO]` Chance/Khí Vận Card IDs unique, Vietnamese content/effects/destinations
  valid; draw/rotate/jail-free source behavior deterministic with injected shuffle.

## v2 → v3 reset

- [ ] `[HISTORICAL]` v2 IN_PROGRESS room resets transactionally to a fresh v3
  `IN_PROGRESS` turn while preserving room/code, stable IDs, join order/name/color/
  ready, host and active session hashes; old gameplay/offers/deadlines clear.
- [ ] `[SOCKET][RAM]` Starting roll chooses only the first Player and rotates existing
  cyclic Seat order; existing tokens resume the same Seats with no session cascade.
- [ ] `[HISTORICAL]` Reset rerun is idempotent and malformed/mid-failure transaction cannot
  leave mixed v2/v3 state.

## Mascot labels (visual overhaul V2, plan 04)

- [x] `[AUTO][CLIENT]` `characterRegistry.test.ts`, `PlayerAvatar.test.tsx`: mascots have a Vietnamese `accessibleLabel` for assistive
  technology only; `displayName` no longer exists and no screen shows a mascot name (image only).

## Landmark plan (visual overhaul V2, plan 05)

- [x] `[AUTO][CLIENT]` `landmarks/landmarks.test.ts`: `LANDMARK_PLAN` names exactly the 22 street tiles of `colorGroups` once each, in tile order, on tiles with a price;
  the registry builds all 22, in the same order, and every street reports a landmark.
- [x] `[AUTO][CLIENT]` `landmarkVisuals.test.ts`: the 2D landmark registry covers exactly the 22 street tiles, takes its names from the plan and has an SVG file for each;
  `pnpm test:landmark-art` checks the same set from the shared `colorGroups` source.
