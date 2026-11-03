# Power-up verification checklist — Phases 04–08

Status is specific to evidence: an automated handler test does not establish full integration, product UAT or Electron acceptance. Detailed card-by-card evidence is in [Phase 08 validation](../../powerups/08_FINAL_VALIDATION_REPORT.md).

## Automated evidence

- [x] Official registry/config, all 30 definitions, amounts/caps/durations and U04 mixed-rarity recipe validation — `apps/server/src/game/powerUps/catalog.test.ts`, `config.test.ts`.
- [x] START reward identity, cash preservation, private reveal, full hand, replacement/decline, bot/deadline/reconnect and save rollback — `foundation.test.ts`, `rewards.test.ts`, `socket.powerUps.integration.test.ts`.
- [x] Server Active handler success for all 22 Active definitions; targeted Reaction behavior for D01–D09 (D04 is Active), D03's approved five attacks, D05 direction, D07 shortfall and D08 rent support — `runtime.test.ts`.
- [x] Server-authoritative ownership/timing/target checks, movement pause, status lifecycle, rent modifiers and direct cash boundary tests — `runtime.test.ts`.
- [x] Authenticated socket activation, private targeted Reaction, timeout and bot auto-pass — `socket.powerUps.integration.test.ts`.
- [x] Inventory/reaction/countdown/action feedback UI — `apps/client/src/game/ui/powerUps/PowerUpPanel.test.tsx`.
- [x] Production-browser START flow and selected-card reconnect; capacity/replacement; bot and offline recovery; A01→D05 reflection restored during reconnect; U07 125% purchase; A02 owner-turn expiry — `scripts/powerUpAcceptance.check.mjs`.

## Remaining manual or partial coverage

- [ ] Native Electron full-match acceptance at supported desktop/landscape sizes, including keyboard/focus, contrast and physical device review.
- [ ] Dedicated Attack, shield/block and reflection motion effects; current custom Power-up animation is limited to card reveal/entry, with existing semantic presentation used for supported money/movement events.
- [ ] Combination matrix for every listed pairing, especially A02/A04/A08 with D01/D08/A07/A10, A05+U09, A06+D09, U01/U02/U05 timing, and U06 full-hand/disconnect.
- [ ] All-card invalid timing/target, numerical boundary, duplicate/replay and save-rollback permutations. Current automated tests have shared authorization/rollback assertions and per-card positive handlers, but do not run every negative case for each card.
- [ ] Teamplay, bankruptcy, auctions, mortgage, Chance/Chest, and long-running/stress match combinations with Power-ups.
- [ ] macOS native visual acceptance.

Run commands, versions, durations and failures are recorded in [the Phase 08 report](../../powerups/08_FINAL_VALIDATION_REPORT.md). This checklist does not claim release readiness by itself.

## 08B automated extensions

- `apps/server/src/socket.powerUps.allCards.integration.test.ts`: all 30 concrete outcomes, foreign owner, invalid request, injected save failure, replay, reconnect, projection privacy and elimination; each Reaction expiry; races and deadline rollback; actual purchase/build combinations; pending interaction removal.
- `apps/server/src/game/powerUps/stabilization.test.ts`: effect-specific cash/cap/rounding, 80 Attack/Reaction eligibility pairs, recipes, movement, durations, reflection, realized rent, liquidation and team rescue.
- `apps/server/src/game/powerUps/endurance.test.ts`: seeded complete matches with baseline scenarios, metrics and reconnect.
- `apps/client/src/game/presentation/events/powerUpFeedback.test.ts` and `apps/client/src/design-system/components/Modal/Modal.test.tsx`: queue reset/late ACK/reduced motion and rapid modal re-entry.
- `scripts/powerUpStabilizationAcceptance.check.mjs`: real browser/packaged Electron UI, shields, blocking, Legendary upgrade, consent/reload, targets, contrast and three viewport/focus checks.

Current results and remaining manual requirements supersede the earlier partial checklist only where supported by [08B evidence](../../powerups/08B_STABILIZATION_REPORT.md).

## Phase 09B–09C artwork verification

- Source/export checks: `apps/client/scripts/validatePowerUpArtwork.check.mjs` tests completeness, unique hashes, XML safety, PNG CRC/decode, missing/orphan/stale assets and build parity. `scripts/art/exportPowerUpArtwork.mjs --verify` rerenders all 33 pairs and compares pixels.
- Component boundaries: `apps/client/src/game/ui/powerUps/PowerUpArtwork.test.tsx` tests 30 ID mappings, three backs/four frames, identity-free hidden DOM, authorized reveal/reconnect, SVG→PNG→motif fallback and unknown/path-like IDs. `PowerUpPanel.test.tsx` covers read-only full detail and existing inventory/activation/Reaction decisions.
- Queued presentation: `apps/client/src/game/presentation/events/powerUpFeedback.test.ts` tests authorized acquisition/Legendary discovery and silent sync alongside existing reset/hidden/reduced-motion coverage.
- Production integration: run `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpStabilizationAcceptance.check.mjs --artwork`; add `--native` after packaging. The extension `scripts/art/powerUpArtworkAcceptance.mjs` checks hidden image requests/DOM, real reward selection/reconnect, all 30 inventory fronts, four actual frames, full details, reduced motion, modal bounds and three viewport captures. Existing stabilization scenarios still check activation, reactions, full-hand consent/reload, shield charges and keyboard focus.
- Packaged assets: `pnpm --filter @monopoly/desktop proof:packaged:powerups` compares all SVG/PNG source and packaged bytes. Build validation checks the same artwork set.
- Actual visual results and evidence: [09C visual QA](../../powerups/09C_VISUAL_QA_REPORT.md). Physical GPU/display, human full-match and macOS remain separate checks.

## Phase 09C.1 focused visual refinement

Run the existing stabilization harness with `--refinement` (and `--native` for packaged Electron). This includes the existing artwork acceptance plus `scripts/art/powerUpRefinementAcceptance.mjs`: all fifteen corrected fronts in inventory at 1440×900, 1280×720 and 900×500; full-card details and priority hand/coin detail views; deterministic authorized reward reveal; A01 activation and recipient D02 Reaction. Output is separate under `test-results/powerup-09c1/`. Visual findings, inspected before/after comparisons and actual results are recorded in [the refinement report](../../powerups/09C1_ARTWORK_REFINEMENT_REPORT.md). These are art-only changes; original acceptance scenarios remain enabled.


## OB-4 reward picker regression

- Component tests in `apps/client/src/game/ui/powerUps/PowerUpPanel.test.tsx` cover category-only hidden backs, one selection through the ACK/snapshot gap, rejected-selection cleanup/retry, authoritative reconnect without replay, and isolation from full-inventory replacement. Existing claim/decline/replacement, unauthorized/disconnected, peek and inventory/Reaction tests remain required.
- `scripts/powerUpPickerAcceptance.check.mjs` exercises the production renderer with two real browser clients and an authoritative local server. Capture hidden/revealed picker states at 1440×900, 900×500, 667×375 and 760×280; inspect scrolling, footer access, transformed card bounds, focus and pointer effects. Compare before/after frame intervals on the same machine and record rendering limitations.
- Verify OS and game reduced motion, no hidden front artwork requests, rapid clicks, reconnect without burst replay, full-hand replacement/decline, non-picker isolation and repeated decision open/close cleanup.
- Owner visual review/full-match UAT and physical GPU/macOS acceptance remain manual. Automated browser results do not mark these manual cases PASS. See [OB-4 evidence](../../powerups/OB4_PICKER_VALIDATION.md).

## OB-6 inventory and activation regression

- Run `scripts/powerUpInventoryAcceptance.check.mjs` through the server tsx loader against a production client build; `--native` uses the freshly packaged Electron application. Inventory 0/1/2/3, detail and activation cover 1440×900, 1280×720, 900×500, 667×375 and 760×280, scrolling, focus and dropdown stacking.
- Check Cancel/close/peek without consumption, changing/empty player targets, busy/disconnected/observer guards, rapid submit, unchanged reward claim/decline/replacement and no outcome line under Kho.
- Check VI/EN, OS and game reduced motion, keyboard navigation and opener restoration; verify language selection after the shared viewport correction.
- Compare frame samples on the same machine and report headless/native limitations; RAF intervals do not establish physical GPU FPS. Owner visual/full-match UAT remains NOT RUN until explicitly recorded.
- Evidence and commands: [OB-6 validation](../../powerups/OB6_UI_VALIDATION.md).

## OB-7 / OB-9 regression

- Verify ACK before/after inventory removal merges only that exact instance; two same-definition instances, theft, U04 ingredients, new status, shield charge and expiry retain independent meaning.
- Verify every text cue remains readable for at least 5 seconds at all speeds and with reduced motion, without holding gameplay; sync/hidden/viewer change cancels old text and delayed ACK does not replay it.
- Check VI/EN long text, success/denial/disconnect and actor/observer permissions in web and packaged Electron. Owner UAT is separate.
- Verify rarity boundaries 0,39,40,69,70,89,90,99 per category; reject invalid RNG; uniform definition selection and exactly three category candidates.
- Run seeded 100000-offer distribution per category (seed 0x0b900001; per-bin absolute tolerance 0.006 chosen in advance), preserve stored offers across reconnect, and regress U04/U10 special pools. Do not infer full-match balance.

## OB-8 movement regression

- N=12 Continue: 12 ordered hops, unchanged card/allowance/dice; U02: 14 ordered hops, one consumed instance, original dice=12.
- U01/U05/U08 legal targets/timing; U05 bounds 1–15, teleport stays SNAP even at a walk-equivalent destination; no card/used allowance adds no checkpoint.
- Verify exact path for actor/observer, corners/START, one landing and one reward, no early prompt, double submit/competing decisions, stale operation, rollback and reconnect pending/completed.
- Verify VI/EN, all supported sizes, keyboard/focus, speed/reduced-motion and packaged Electron separately from Owner UAT.
- Reject protocol-16/17 mismatch in both directions, LAN discovery mismatch and snapshot-14 envelope; validate current schema and update minimum 1.11.2. Existing published assets stay unchanged.

## OB-11 contextual decisions

Check U03 purchase and U09 house/hotel development with Use and Skip, no eligible card, wrong owner/spectator, spent allowance, stale operation and changed decision. Exactly one modal remains; opening/Skip never sends activation or consumes a card. Double-click Use and the original transaction each commit once. Verify server purchase price and total quotes (U09: base 200, quantities 1..4 yield 160/350/550/750, not 160 multiplied by quantity). Denial retains inventory and pending operation; reconnect restores pending decisions without replay. Check focus restoration with snapshot-before-ACK, Tab/Shift+Tab/Escape, VI/EN, reduced motion at 1440×900, 1280×720, 900×500 and 740×360. Owned cards remain complete/3D with no Power-up detail entry/modal.

Card × timing × surface × target matrix and actual automated/native coverage are in [OB-11 validation](../../powerups/OB11_CONTEXT_VALIDATION.md). Owner UAT must separately cover purchase/build/movement with and without eligible cards; automated PASS is not Owner sign-off.

## OB-12 Power-up activity regression

Check generic reward/REPLACE/automatic receipts with no card metadata in the payload; no receipt for offer/reveal/full-hand wait/decline/failure. Use U02 through checkpoint and Active/Reaction/contextual commands: exact actor/catalog name once, no phantom entry on rollback/skip/denial, no replay on reconnect. A06/reflection credits actual receiver; U04/U10 log activator use plus one unnamed output; U06 accepted logs initiator use and two generic receipts, pending/declined/expired logs neither. Verify 128-event/500-line bounds, two independent identical actions, Host/Guest/spectator, VI/EN text escaping, presentation gate and unchanged OB-7 feedback. Refuse protocol17/older and snapshot15/older under current18/16 contract.

## OB-13 reward footer regression

Check Decline | Claim visual and DOM order, primary Claim right when on one row, safe Claim autofocus for a restored revealed reward, Tab/Shift+Tab/Enter/Space tied to the focused action. Verify independent CLAIM/DECLINE commands, busy double-submit guard, VI/EN, reduced motion, reconnect, full inventory REPLACE/DECLINE and no Decline in owned activation. Viewports1440×900,1280×720,900×500,667×375,760×280; footer stays visible, wraps in DOM order without overflow.
