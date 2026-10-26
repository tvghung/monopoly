# Checklist — start, movement, landing decisions, jail và payment shortfall

## Start/movement

- [ ] `[AUTO][SOCKET]` Start requires host + 2–4 seats with at least one human, humans connected/ready (bots always are); all Players roll
  server-side 2d6, tied highest group rerolls, final stable-ID order is stored once in the RAM aggregate.
- [ ] `[AUTO]` Every Player starts index 0/1500; normal 2d6 movement and exact/pass
  Xuất Phát pay 200; direct-to-jail pays none.
- [ ] `[SOCKET]` Client cannot supply starting roll, dice, position or actor.

## Turn continuation

- [ ] `[AUTO]` Every completed roll resolves exactly once and advances to the next
  seat; doubles never grant an extra roll.
- [ ] `[AUTO]` Buy wait and same-landing development wait delay
  `completeTurnResolution` and handoff exactly once.
- [ ] `[SOCKET][RAM]` Disconnect and reconnect while the host is alive restores the same pending operation ID and
  continuation and cannot roll/advance twice.

## Tile/cards/decks

- [ ] `[AUTO]` Buy/Do Not Buy revalidate operation ID, property and balance; Do Not
  Buy never starts an auction; Free Parking is a no-op (tax tiles charge, see the tax row).
- [x] `[AUTO]` Income Tax index 4 charges `floor(max(0, currentCash) * 0.30)` to the Bank, with no minimum and no debt/event for a zero charge; Luxury Tax index 38 remains fixed at 100. Shortfalls still use the Bank payment pipeline (`apps/server/src/game.test.ts`, `apps/server/src/v3.simplifiedRules.test.ts`, `apps/server/src/rulesContract.test.ts`).
- [x] `[AUTO][CLIENT]` A revealed card cannot be dismissed before three seconds from server reveal; the human countdown starts on local reveal, stays disabled for the full visible time, and slow observers retain their own card after server clear. Bot `CARD` wait is movement estimate + 3 seconds (`apps/server/src/game.test.ts`, `apps/client/src/game/ui/events/CardInteractionOverlay.test.tsx`, `apps/client/src/game/presentation/executors/semanticExecutors.test.ts`, `apps/server/src/bots/policy.test.ts`, `apps/server/src/socket.botDriver.integration.test.ts`).
- [ ] `[AUTO]` Chance/Khí Vận draw top in the stored private order, normal card rotates bottom,
  movement resolves destination/pass-GO and go-to-jail direct semantics.
- [ ] `[AUTO][RAM]` Jail-free card leaves source pile, holder identity persists,
  use/transfer/elimination returns card to correct deck while the host runs.

## Jail

- [ ] `[AUTO][SOCKET]` Pay shared `BAIL_AMOUNT=25` then roll; exact funds succeed,
  insufficient/duplicate/stale attempts do not double-charge; use held card then
  roll; doubles escapes, moves/resolves and ends turn.
- [ ] `[AUTO]` Failed roll automatically ends the jailed turn; compatibility wait
  does the same without a visible client action. The authoritative
  opponent-round counter increments on handoff and releases before the second
  jailed turn.
- [x] `[CLIENT][AUTOMATED]` The roll call to action says "Đổ xúc xắc" ("Đang đổ…" while pending), its permission
  still comes from authoritative state (`canRollForState`), Space rolls only when that control is enabled and focus
  is not in an input, button, dialog or the activity drawer, and the turn change is spoken once from the roll
  control's live region (`rollControl.test.ts`, `Board.test.tsx`, `centerStage.test.tsx`, `useRollShortcut.test.tsx`,
  `useTurnAnnouncement.test.tsx`).
- [x] `[CLIENT]` The jail panel is rendered by the center stage under the roll button at every window size, one `RollControl` and
  one `JailPanel` (`centerStage.test.tsx` "CenterStage jail group").
- [ ] `[CLIENT][MANUAL-E2E]` While jailed, the jail group (roll button, then the panel; a compact strip on a phone) never hides the roll button: `hudOverlap.regionOverlaps` is empty in
  `evidence/03/g3/*jail*.json` at 1440×900, 1280×720, 1024×768, 812×375 and 667×375.
- [ ] `[RAM]` Host process exit (or restart) discards jail progress, card identities and the old room.

## Multi-debtor PaymentQueue

- [ ] `[AUTO]` `DebtClaim` exact fields validate; PLAYER requires
  `creditorPlayerId`; `remainingAmount` never exceeds original positive amount.
- [ ] `[AUTO]` collect/pay-each-player creates stable cyclic claims and
  `activeClaimIndex`; multiple debtors settle in deterministic Player order.
- [ ] `[AUTO][SOCKET]` Only the active debtor can sell to Bank or propose a forced
  sale; ordinary listing/trade and roll remain blocked during shortfall.
- [ ] `[RAM]` Reconnect to the same live host preserves claim order/index/remaining source and
  resumes exactly once.
- [ ] `[SOCKET]` Save failure causes no partial balance, claim removal, revision,
  ACK success or broadcast.

## Decision sheets, jail and card reveal (visual overhaul V2, plan 04)

- [x] `[AUTO][CLIENT]` `DecisionPrompts.test.tsx`, `DecisionSheets.test.tsx`: Buy and Development are bottom sheets with a clear
  backdrop, keep their request guards and authoritative gating, and say why "Mua tài sản" is disabled.
- [x] `[AUTO][CLIENT]` `JailPanel.test.tsx`: a named region without a live region around the buttons, one status line for the
  confirmation, one alert for an error, the bail button described by the balance warning.
- [x] `[AUTO][CLIENT]` `CardInteractionOverlay.test.tsx` (V1 card contract): immediate reveal, no Draw step (a legacy
  `AWAITING_DRAW` card renders nothing), one "Đóng" for the acting player only, no Escape/backdrop close, observers wait, reconnect
  keeps the card, the presentation must reach `REVEALED` first, all 28 cards (title from the manifest, badge, message, artwork file),
  focus returns to "Đóng" after a failed dismissal, a confirmation can open above the card.
- [ ] `[MANUAL-E2E]` G4 V1 card review (harness scenarios `chance`, `chest`, `reconnect-revealed`, `spectator-revealed`) and the
  jail strip against the roll button at 812×375 and 667×375.

## AUDIT-017 — automated socket assertions reviewed

The following assertions were verified by source inspection for documentation traceability. The suite was not rerun in Phase A1; these notes do not mark a manual/device checklist item complete.

- `[SOURCE REVIEW — NOT A FRESH RUN]` `apps/server/src/socket.hardening.integration.test.ts`, `do not buy`: clears the pending purchase, leaves the property unowned without charging, advances the turn and broadcasts the committed update to another player.
- `[SOURCE REVIEW — NOT A FRESH RUN]` `apps/server/src/socket.hardening.integration.test.ts`, `wait in jail`: keeps the actor jailed, advances the turn and turn number, and broadcasts the update to another player. No current UI caller for `wait in jail` was found; manual interaction remains NOT RUN.