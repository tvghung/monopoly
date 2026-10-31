# Phase 08B — Final stabilization and development acceptance

CURRENT DEVELOPMENT — 2026-10-27. **STATUS: COMPLETE for development stabilization. DEVELOPMENT ACCEPTANCE: GO. PRODUCTION RELEASE: NO-GO.** This verdict applies to the tested mixed worktree, not a published release. No new cards or approved gameplay values were introduced.

## Baseline and recovery safety

Verified branch: codex/v1.10.0-refactor. HEAD: 4c878d67072de6fdfb82457203bfa1d3054fed56. At entry there were 47 modified tracked files and 74 untracked files, all unstaged (121 actual files; historical grouped status counts are not a file inventory). No commit, stash, reset, clean, merge, force-push or publication was performed. Existing unrelated user/audit work remains present.

Recovery locations, relative to the repository parent C:/Users/hungtran/Documents/ChatGPT/Own the block (monopoly):

| Checkpoint | Exact directory name | Verification |
| --- | --- | --- |
| Original pre-Phase-06 | powerup-pre-phase06-checkpoint-2026-10-27-4c878d6 | All 115 recorded artifacts and manifest digest match; fresh detached restore drill again reproduced the tracked diff, untracked inventory and clean index |
| Incremental entry to Phase 08B | powerup-phase08b-checkpoint-2026-10-27-4c878d6 | All 130 recorded artifacts match: 121 file copies plus 9 metadata artifacts; detached restore drill reproduced the complete tracked diff, untracked inventory and clean index |

Original manifest SHA-256: 3c71afad921b49bb0fbe02974c65fa5bfcfe243efad243168594d49e1b54ba3f. Incremental manifest SHA-256: c7d923f79fe6a18ff207d43996d69d02fa311d04a76a406460029f5ae92db94a. The incremental folder contains RESTORE.md, manifest.json, manifest.sha256, exact Git index bytes, staged/index listings, binary diffs and restore-drill-result.json. Git's index is in the managed-worktree common repository, not under a guessed .git directory. Checkpoint verification was repeated after the work.

Final preservation audit compares each captured baseline file against its entry hash and reviews each intentional difference. No captured file was removed; unchanged unrelated files retain exact bytes. Final task delta and index evidence are retained externally. The final inventory is 72 modified tracked files plus 88 untracked files (160 total), all unstaged. Of the 121 captured entry files, 97 retain exact bytes and 24 have reviewed task changes; none are missing. The NUL-delimited index-stage listing is identical. The work remains mixed and unstaged.

## Fixed defects and architecture

1. U05 rejected out-of-range integers, fractional values and NaN before card consumption in the domain handler, including callers that bypass socket parsing.
2. D10 removes only its user from a global A08 effect, preserving other affected players. Current-player elimination starts the successor's Power-up turn, so source-start expirations run on direct handoff.
3. D05 reflection now accounts for the inventory slot freed by consuming D05. A04 reflection requires a valid attacker-owned property; a reflected A04 meets an existing D04 shield without opening another Reaction chain. Reactions verify card ownership.
4. U10 excludes the consumed source definition and Legendary output; it no longer wrongly excludes a fresh U10 when transforming another Rare card. The balance sampler excludes U04 itself as an upgrade ingredient.
5. A07 allocates the approved share from each **actual rent receipt**, with cumulative floor rounding and the cap across partial payments. Landlord-first split claims previously starved the beneficiary during shortfall/bankruptcy and misallocated D08 Bank contributions. D07, D08, liquidation progression and team rescue now use the same receipt credit path. Self-beneficiary payments and rescue use the affordable net cost, preventing last-unit rounding insolvency. Eliminated beneficiaries/creditors clear stale allocation references. A10 remains a separate Bank surcharge.
6. Bots make bounded legal pre-roll Active decisions using only public state and their own private projection. They use the same authoritative command and suspend ordinary tasks during human Reaction/consent. Bot reactions still auto-pass; no strategic all-card bot claim is made.
7. The shared Modal re-registers on reopening during an unfinished exit animation. The browser acceptance exposed lost focus trapping in that sequence; a failing-before regression now passes.
8. Client feedback uses the existing PresentationController / AnimationQueue / PresentationStore. Successful ACKs prove Attack, block, reflection and Legendary action feedback. Inventory removals generate neutral consumption feedback, avoiding a false activation for theft or recipes. Reconnect epoch changes, hidden documents, queue reset and reduced-motion bypass remain authoritative presentation guards.

The socket protocol stays **16** because no network DTO changed. Private realized-rent metadata requires **RAM snapshot schema 14** (previously 13). The current process-local loader rejects older envelopes; no durable database/migration or cross-process recovery was introduced. Product version stays 1.10.0 and update-policy review stays protocol 16. Private claims, held cards and reward candidates are absent from public projection.

## All-card and interaction evidence

- [30-card coverage matrix](./08B_CARD_TEST_COVERAGE_MATRIX.md): 30/30 official registry definitions have concrete effect assertions through authenticated socket commands, invalid/foreign-owner rejection, complete-room save rollback, replay rejection, reconnect preservation, public confidentiality and real leave cleanup.
- [Interaction matrix](./08B_INTERACTION_MATRIX.md): 80 explicit Attack × Reaction eligibility cases; all 20 requested interaction groups plus reflected-shield and realized-rent/rescue groups pass (22/22). Illegal timing/second Active sequences reject. No claim of separately testing all 900 ordered pairs in all game states.
- 237 stabilization cases cover card-specific integer boundaries, mixed recipes, durations/charges, reflection and financial allocation. The 47-case all-card socket suite includes exact-deadline recovery, React/Pass races, timeout rollback, target-selection disconnect, consent reconnect, concurrent commands and pending-interaction leave with a bot seat. Existing 90 runtime, 71 catalog, 34 reward, 17 foundation and 4 config cases remain green.
- Existing dice, jail, purchase/build, payment/bankruptcy, trade, team and reconnect suites passed as part of the complete package runs. Transaction failures log expected injected exceptions; those tests assert rollback rather than hide the errors.

## UI/UX acceptance

Implemented themed Attack, shield activation/charge reduction, successful block, reflection, Legendary, active status, expiration and card consumption cues. Board target states distinguish valid, invalid and selected tiles using existing WebGL tile instances and legacy-board presentation. Select options are disabled when invalid; text legends supplement color. The gameplay state never waits on animation.

Production Chromium and the real packaged sandboxed app:// Electron renderer each passed the eight grouped scenarios in scripts/powerUpStabilizationAcceptance.check.mjs. These exercise two real clients, D04 + two A04 attacks, A05 + D03, mixed-rarity U04, full-hand U06 consent/reload, D09 voluntary-swap semantics, Legendary presentation, board peek and modal keyboard behavior. Existing Phase 04–05/browser scenarios remain 10/10 passing, including A01 + D05 reflection and U07 remote purchase.

Screenshots and assertions cover 1440×900, 1280×720 and 900×500: dialog bounds, document overflow, scrollable long content, twelve Tab steps, Escape, opener focus restoration and disabled control states. Existing two mobile E2E flows also passed, including HUD control non-overlap. Sampled card-text contrast, including composited gradient stops, is at least 4.85:1; this is sampled evidence, not a claim of every pixel/color on every device. Seven PNGs per expanded renderer mode and machine-readable evidence are preserved. Native Electron 43.4.0 / Chrome 150.0.7871.224 runs with WebGL enabled; the browser fallback uses legacy rendering. Native screenshots were inspected. Automated native validation is PASS; physical display/GPU and listening UAT are **MANUAL UAT REQUIRED**.

## Stress and balance

[Detailed balance and stress report](./08B_BALANCE_AND_STRESS_REPORT.md) preserves seeds, configuration, per-match results and limitations. Eight complete integration matches (four baseline and four Power-up, seeds 80801–80804, one human-policy seat plus three bots) completed all 3,091 commands without deadlock, rejected policy choice or command-limit exhaustion. Final workload wall time was 101.572 seconds. Command latency p50/p95/max was 18.157/42.537/373.927 ms on a host running other validation jobs. Completed games cleared pending interactions and statuses. Peak sampled match snapshot was 106,396 bytes.

A separate 3,000-reward retained-history workload kept the public/owner projection and semantic tail bounded, with exact START cash and inventory capacity. The private snapshot grew to 1,381,019 bytes; five clone/schema checks at that size ranged 36.93–50.78 ms. Retained occurrence identities grow linearly by design. Measured Vitest heap includes retained finished rooms and uncollected garbage, so no leak-freedom claim is made.

Natural Legendary rarity was 1.018% in 600,000 candidates. A separate 200,000 legal-recipe scenario produced 19.789% Legendary U04 output. Inventory was full in 55.77% of command-state hand samples under this limited bot policy. Mean match length was 256.25 baseline versus 224.25 Power-up turns across four seeds each; shared entropy diverges, so this is not a causal or statistically significant result. Defense auto-pass understates strategic defensive value. Approved values remain unchanged; all balance recommendations require Product Owner review.

## Final quality gates and exact counts

These commands were actually executed using the bundled Node runtime and pnpm CLI; logs and exit codes are preserved in the evidence directory. Package tests were rerun in full after relevant implementation fixes. Shared has no standalone test script; its contracts are exercised by package and root suites and its own typecheck.

| Command / gate | Final result |
| --- | --- |
| pnpm --filter @monopoly/server test | 45 files; 1,161 pass, 0 fail, 2 pre-existing skip |
| pnpm --filter @monopoly/client test | 270 files; 2,713 pass, 0 fail, 0 skip |
| pnpm --filter @monopoly/desktop test | 41 files; 629 pass, 0 fail, 0 skip |
| pnpm test:v1-contract | 34 pass |
| pnpm test:perf-tools | 27 pass |
| pnpm test:registry | 5 pass |
| pnpm test:music-validator | 1 pass |
| pnpm test:card-art | 1 pass |
| pnpm test:landmark-art | 2 pass |
| pnpm test:docs | 10 pass |
| pnpm typecheck | All four package typechecks pass |
| pnpm lint | PASS after correcting browser global declarations in the new acceptance script |
| pnpm validate:docs / pnpm validate:v1-contract | PASS |
| pnpm build | PASS; 26 audio assets, 28 card artworks, 22 landmark artworks verified |
| pnpm --filter @monopoly/desktop compile | PASS (also repeated in packaging) |
| pnpm desktop:make | Windows x64 Squirrel package/installer PASS |
| pnpm desktop:proof:host / pnpm proof:packaged | PASS: real-interface HTTP, LAN discovery, four seats, reconnect/newest connection and process-loss semantics |
| pnpm --filter @monopoly/desktop proof:packaged:cards | 28 packaged card artworks PASS |
| pnpm --filter @monopoly/desktop proof:packaged:landmarks | 22 packaged landmark artworks PASS |
| pnpm --filter @monopoly/desktop proof:packaged:budget | PASS: unpacked 366.1 MiB, installer 147.6 MiB |
| node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpAcceptance.check.mjs | 10 existing real-browser scenarios PASS |
| node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpStabilizationAcceptance.check.mjs | 8 expanded Chromium groups PASS |
| Same command with --native | 8 packaged Electron groups PASS |
| pnpm exec playwright test -c playwright.powerups.config.ts | 2 existing mobile flows PASS |
| node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpHistoryStress.mjs | 3,000 reward-history workload PASS |
| node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpsBalance.mjs | Seeded sampling complete |
| git diff --check | PASS |

Package-suite total: **4,503 pass / 0 fail / 2 existing skips**. Root tooling/documentation tests: **80 pass / 0 fail / 0 skip**. Browser/native/mobile acceptance is reported separately above. The aggregate pnpm test command also passed earlier in this task; the final counts above come from the later complete package/root reruns rather than stale aggregate counts.

The two skips are unchanged placeholders in apps/server/src/hostAdmission.integration.test.ts at lines 238 and 410: isolated non-loopback peers are excluded from that fixture. No Power-up test was skipped and no assertion was weakened. Separate packaged runtime/host proofs pass real-interface checks, but do not certify a physically isolated remote device.

Initial failures were investigated: genuine payment/reflection/handoff/modal defects received regression cases; acceptance harness fixes included continuing a pending move before reward assertions, non-loopback native invitation, actual installed Chrome path, dedicated Playwright output directory, correct initial native viewport and explicit test-app teardown. A previous native run passed functional checks but waited on the normal active-game quit prompt; the harness now exits its own test app cleanly. Final native processes exit zero. Build retains the existing >500 kB chunk advisory; packaged size budget passes.

## Evidence, verdicts and remaining release gates

Evidence is preserved outside disposable Playwright output at C:/Users/hungtran/Documents/ChatGPT/Own the block (monopoly)/powerup-phase08b-evidence. It contains full logs with real exit codes, run arguments, checkpoint/hash verification, worktree preservation review, raw endurance/history JSON, browser/native screenshots, release diagnostics and Windows artifact hashes. Generated test-results/powerup-08b also contains the current raw outputs. The evidence integrity manifest enumerates saved artifacts by SHA-256.

**Development GO:** all 30 cards have effect-specific evidence; required interactions and illegal sequences pass; no known critical/high gameplay defect remains in the reviewed scope; bot/recovery, real UI integration, automation, builds and Windows packaging pass.

**Production NO-GO:** release diagnostics show endpointConfigured=false, unsigned-validation mode, signing BLOCKED, notarization NOT RUN and artifactsValidated=false. Locally generated hashes and successful unpacked application proofs do not validate signed production installer/update artifacts. No credentials, fake endpoints, disabled security checks or publication were introduced.

Manual UAT/release checklist (unverified):

- Physical Windows GPU/display review at all three required sizes and representative scaling/refresh rates: target visibility, HUD/board layout, long VI/EN text, rapid modal stacking, focus, keyboard, reduced motion and reconnect while a cue is showing.
- Human listening/audio mix and a full human-paced multiplayer match; strategic Attack/Defense/Utility choice, defensive reaction value and early/mid/late balance review.
- Cross-device LAN/Online host acceptance and real isolated peers, disconnect/reconnect and exact-deadline user experience.
- Clean-machine Windows install/uninstall/update and signed installer/publication verification once real release configuration and signing credentials exist.
- macOS build/install, native WebGL/input/layout, signing/notarization/update and platform-specific networking/quit acceptance.

These are explicitly unverified release/platform/physical requirements, not silently counted as automated PASS. The historical Phase 07 and 08 reports remain intact with the dated follow-up below.
