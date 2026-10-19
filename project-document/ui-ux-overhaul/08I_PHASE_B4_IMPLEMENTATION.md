# 08I — Phase B4: FPS stability and frame pacing

> **HISTORICAL implementation record** — Work started from `origin/main` commit `08d66e13a1f29c3f65363b795c9547d0f55d5a4d` on 2026-10-19. Current behavior is specified in [game board](../monopoly-websockets/Client/game-board.instruction.md) and [settings](../monopoly-websockets/Client/settings-and-audio.instruction.md).

## Scope and cause

The scene uses a demand scheduler (`apps/client/src/game/scene/render/demandFrameScheduler.ts`) and elapsed-time animation controllers. Before B4, the scheduler waited until one millisecond before a deadline using `setTimeout`, then registered a RAF. The browser could deliver that RAF one refresh later. Each rendered frame also reset the deadline to its actual vsync timestamp. On refresh rates that do not divide the cap, this rounded the effective rate down: the Phase A simulation found 60 FPS settings yielding 37.5 on 75 Hz, 48 on 144 Hz and 55 on 165 Hz. Those were scheduling losses, separate from GPU overload. The Phase B2/B3 scene isolation and shader warm-up remained in place.

## Decision

The scheduler now keeps a RAF pending while an animation has invalidated the scene. It draws only when a fractional deadline is due, advances that deadline by one configured period, and rebases after a long stall. It cancels RAF when idle, hidden, held for shader warm-up, or disposed. Visibility recovery resets the deadline. Settings changes recalculate the next deadline immediately. The selected FPS remains an upper bound on scene submissions; hardware and display refresh can produce a lower rate.

Alternatives considered: shortening the timeout margin remains sensitive to timer and vsync jitter; permanently running RAF would waste idle CPU; an unrestricted R3F render loop would undo demand rendering. The chosen design changes only the active scheduling path and retains the existing time-based animation system and visual assets.

## Changed systems

- `apps/client/src/game/scene/render/demandFrameScheduler.ts`: active cadence, fractional deadlines and interruption recovery.
- `apps/client/src/game/scene/render/demandFrameScheduler.test.ts`: 35 cap/refresh combinations, idle, hold, visibility, cap change, animation timing and long-frame recovery.
- Canonical client board and settings instructions, plus the client motion checklist, describe the current behavior and evidence.

No wire contract, room state, gameplay authority, graphics tier or shader warm-up protocol changed. Protocol and snapshot versions stay at their current values.

## Measurement

The reproducible headed Chrome probe samples **actual WebGL scene submissions**, not browser RAF callbacks. Raw reports are in [before-results.json](./08I_evidence/before-results.json) and [after-results.json](./08I_evidence/after-results.json). Both used Chrome 155 on Intel UHD Graphics, DPR 1.25, approximately 60 Hz, Low quality, 60 FPS cap, 1522×770 viewport, production React UAT bundles, two warm walk replays and a three-second idle window. The first baseline attempt with `--lite` produced no captured walk frames and is invalid; it was rerun with the same normal probe configuration as the changed build.

| Actual scene metric | Before | After |
| --- | ---: | ---: |
| Walk achieved FPS | 45.5 | 46.5 |
| Walk frame interval P95 | 33.5 ms | 33.5 ms |
| Walk frame interval P99 | 50.0 ms | 49.9 ms |
| Walk median GPU time | 18.7 ms | 18.1 ms |
| Walk program links | 0 | 0 |
| Idle scene submissions / scheduler callbacks | 0 / 0 | 0 / 0 |

The 1 FPS difference on this GPU-limited 60 Hz run is not evidence of a meaningful real-device gain. Median GPU time exceeds the 16.7 ms 60 Hz frame budget; B4 does not change GPU cost. The targeted pacing improvement is supported by deterministic tests of 30/60/120/180/240 FPS caps against 60/75/90/120/144/165/240 Hz refreshes. Each achieved rate is within 1 FPS of the minimum of cap and refresh over a ten-second ideal-refresh simulation. This is scheduler evidence, not a substitute for measurements on those displays.

## Validation and remaining limits

The automated scheduler gate passes (48 tests, including one-second effect completion at 30/60/120/240 FPS). Full repository typecheck, lint, test, build and documentation validation pass. Scene idle and program-link observations above show no regression in those measured scenarios. The resource lifecycle check passed across walk, dice, construction, tier switching and WebGL context loss with zero page errors ([lifecycle.json](./08I_evidence/lifecycle.json)). The B3 warm-up check passed for cold Balanced [walk](./08I_evidence/warmup-walk.json) and [hotel](./08I_evidence/warmup-hotel.json): 0 program links after warm-up, worst subsequent callback 46 and 62 ms, respectively.

Visual capture: [18 of 19 settled states](./08I_evidence/visual-report.json) were pixel-identical between builds. `dice-settled-balanced` differed by 1,372 pixels (0.149% of 1280×720); the changed build [compared against itself](./08I_evidence/visual-self-report.json) also differed by 1,666 pixels (0.181%). This demonstrates that this dice capture has baseline nondeterminism; it does not establish a B4 visual regression, but does not prove dice pixel parity either. Raw screenshots and differences are under `C:\Users\Hungtran\monopoly-b4-evidence\visual` and `visual-self`. The cross-build `--assert-identical` check is **FAIL** for that state; the same-build control also **FAIL**. A separate [fixed-time motion comparison](./08I_evidence/motion-report.json) **PASS**: all 30 captured tile-impact frames were pixel-identical across builds, and the same-build control was identical.

Commands: `pnpm perf:benchmark --dist <before-or-after-uat-dist> --tiers low --scenarios idle,walk --cap 60 --replays 2 --idle-seconds 3 --out <report-dir>`; `pnpm perf:lifecycle-check --dist <after-uat-dist> --out <report.json> --expect-persistent`; `pnpm perf:warmup-check --dist <after-uat-dist> --out <dir> --scenarios walk,hotel --tiers balanced --skip-switch`. The UAT bundles were built by `pnpm perf:benchmark --build` from the respective commits.

**Verdict: PARTIAL.** The original non-divisor scheduling defect is fixed and simulated, and the available 60 Hz device shows no frame-pacing or idle regression. A higher-refresh physical display and broader human gameplay validation are still needed to establish player-perceived improvement across the full B4 target. The measured 60 Hz walk remains GPU-limited.

## Final acceptance review of draft PR #21

The owner accepted the scheduling approach and requested a real multiplayer and diagnostics review. The PR remained draft throughout. This review used `e2e/b4-real-session.spec.ts` against a built production client and the real authoritative server in headed Chrome 155. Two independent browser contexts joined the same room, selected mascots and Ready, and started the game. The test changed the host's FPS preference from 60 to 30 to 120, rolled dice, asserted that the acting character landed on a non-start tile in the board's accessibility view, exercised wheel zoom and pointer drag, switched the foreground tab, simulated document visibility loss and recovery, reloaded and resumed the host, handled a purchase decision when present, forfeited the guest and used Play Again to return the same room to its lobby. These actions and zero page errors are in the four `real-session-*.json` reports under [08I_evidence](./08I_evidence/).

The first real-session measurements were invalid for comparison: the Playwright project initially supplied phone DPR despite a desktop-sized viewport, and a later probe initially retained frames from board setup. The final runs explicitly use desktop contexts at DPR 1.25 and drain the probe immediately before the roll. The probe counts actual scene submissions and contiguous active-animation intervals, not browser RAF callbacks. Each row is one roll with random dice, so differences between rows are observational, not controlled performance improvements. Both WebGL contexts in the first two rows share the same Intel UHD GPU. In the other two rows the guest uses the application's supported WebGL fallback, leaving one WebGL board on the GPU. Every row used a **120 FPS cap** after changing settings in-game.

Reproduce after `pnpm build`: set `B4_REAL_SESSION=1` and `B4_EVIDENCE_OUT=<report.json>`, then run `pnpm exec playwright test e2e/b4-real-session.spec.ts --project=mobile-chromium --headed`. Set `B4_QUALITY=low` for Low; omit it for Auto. Set `B4_GUEST_FALLBACK=1` for one WebGL board; omit it for two. The test's explicit desktop contexts override the Playwright mobile project's viewport, DPR and touch emulation. The authoritative server is started by `playwright.global-setup.ts`. Do not compare FPS from a run that did not complete and write its final `pageErrors` field.

| Real multiplayer roll | Achieved scene FPS | Interval P50 / P95 | Median GPU time | Links during roll | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| [Auto, two WebGL tabs](./08I_evidence/real-session-two-webgl-auto.json) | 16.3 | 66.5 / 83.3 ms | 25.0 ms | 0 | Flow PASS; pacing below target |
| [Low, two WebGL tabs](./08I_evidence/real-session-two-webgl-low.json) | 19.1 | 50.0 / 66.8 ms | 21.2 ms | 0 | Flow PASS; pacing below target |
| [Auto, one WebGL tab](./08I_evidence/real-session-one-webgl-auto.json) | 27.7 | 33.3 / 66.5 ms | 24.8 ms | 0 | Flow PASS; pacing below target |
| [Low, one WebGL tab](./08I_evidence/real-session-one-webgl-low.json) | 31.5 | 33.3 / 50.0 ms | 21.4 ms | 0 | Flow PASS; pacing below target |
| [Final gated rerun, Low, one WebGL tab](./08I_evidence/real-session-final-gated.json) | 27.9 | 33.3 / 50.1 ms | 22.8 ms | 0 | Flow PASS; pacing below target |

The GPU median exceeds the 16.7 ms budget of this 60 Hz display in every run. Two tabs on one GPU add contention, but the single-WebGL runs also remain below 60 FPS. The original UAT walk comparison used Low quality and one fixture page (45.5 before / 46.5 after), so it must not be presented as a prediction for a real room with the complete HUD and two clients. No new shader links appeared during these real rolls. The evidence supports a **hardware/rendering-capacity limit on this device**; it does not establish that every long interval is unavoidable or that players perceive the current result as smooth. B4 changes the scheduling ceiling and does not reduce the scene's GPU workload or alter the approved graphics design.

### Correction from this review

`apps/client/src/game/ui/FpsBadge.tsx` had shown browser RAF callback frequency even though the player-facing label said FPS. This could imply that the 3D scene achieved the selected cap while the GPU drew fewer frames. The dev-only badge now displays **actual main-scene submissions / configured FPS cap**. `apps/client/src/game/scene/GameScene.tsx` emits a dev/UAT-only frame event from the existing `FrameCounter` after a real main-scene render; the badge samples those events with a timer, reports 0 while idle, resets on visibility changes, and is hidden when local diagnostics are off. `FpsBadge.test.tsx` verifies scene counting, zero idle cost, cleanup and visibility reset. The production renderer and the external benchmark probe are unchanged.

The first full test run after this correction failed one `App.test.tsx` assertion that still expected the old badge text; the assertion now checks the actual-scene/configured-cap format, and its focused rerun passed. In the real-session script, a landing purchase modal and, in a separate random roll, a revealed card blocked the guest's Forfeit toolbar button as designed. The script now resolves “Không mua” through the normal UI when present and lets the acting player dismiss a revealed card. The final gated rerun passed after this correction. Neither was a gameplay or rendering regression. The settled dice comparison remains inconclusive for the reason documented above.

### Acceptance status

| Gap | Status | Evidence / limit |
| --- | --- | --- |
| Real multiplayer join, dice, landed character, property decision, camera input, reconnect, Play Again | **PASS** automated on headed Chrome | `e2e/b4-real-session.spec.ts`; real-session JSON; no page errors |
| FPS preference changes and wall-clock animation timing | **PASS** automated | Real session changes 60 → 30 → 120; `demandFrameScheduler.test.ts` covers one-second completion at 30/60/120/240; fixed-time tile-impact motion comparison is pixel-identical |
| Focus and visibility recovery | **PASS** for tested paths | Real tab focus switch and synthetic `visibilitychange`; scheduler unit tests cover hidden cancellation/recovery. Physical desktop minimize/restore remains **NOT RUN** |
| Actual scene FPS diagnostics | **PASS** for the dev badge and benchmark | `FpsBadge.test.tsx`, `FrameCounter`, external probe; configured cap is displayed separately |
| Visual regression | **PARTIAL** | 18/19 settled captures identical; dice settled differs in both cross-build and same-build control, so that capture cannot decide dice parity. Fixed-time motion frames match |
| B2/B3 idle, warm-up and resource lifecycle | **PASS** for existing automated probes | Final-branch [idle](./08I_evidence/final-idle-results.json): zero scene submissions and scheduler callbacks; final-branch [warm-up walk](./08I_evidence/final-warmup-walk.json), [hotel](./08I_evidence/final-warmup-hotel.json) and [lifecycle](./08I_evidence/final-lifecycle.json) checks passed; real rolls linked zero programs |
| Physical 75/90/120/144/165/240 Hz validation | **BLOCKED** by available hardware | This device reports approximately 60 Hz. The 35 cap/refresh combinations are simulated only |
| Human judgement of smoothness through a complete match | **NOT RUN** | The automated real session reached a roll and Play Again; construction, money effects and a full multi-turn human playthrough were not visually accepted by an owner. Measured frame intervals on this GPU remain uneven |

**Final recommendation: PARTIAL; keep PR #21 DRAFT and do not merge yet.** The scheduler defect and misleading dev diagnostic are fixed. The available physical device still delivers 16–32 actual scene FPS in the tested real-session conditions, and high-refresh and full human-experience acceptance are outstanding. Those findings do not justify an unrelated GPU/visual redesign inside B4. The final PR head SHA and current CI statuses are reported in the PR review handoff, because recording a commit's own SHA inside that same commit is not possible.

## Owner closeout decision — 2026-10-19

**Phase B4: PARTIAL — CLOSED.** The owner accepted the FPS scheduler correction, simulated pacing improvement, actual-scene FPS diagnostic and existing regression evidence, and approved PR #21 for a merge commit into `main`. This decision supersedes the earlier draft/hold recommendation above; it does not turn the partial performance result into a full pass. Physical high-refresh-rate validation and a full-match owner gameplay UAT are deferred. Actual scene FPS remains dependent on hardware and GPU workload, and the historical nondeterministic settled-dice screenshot comparison remains inconclusive. No additional B4 implementation is required before Phase B7.

PR #21 merged into `main` as `37961bf1b093b30a7b89f99279dd2dcb94a50f76` (merge commit, 2026-10-19). CI and Docs both passed on that merge commit: [CI](https://github.com/tvghung/monopoly/actions/runs/39258304921), [Docs](https://github.com/tvghung/monopoly/actions/runs/39258304856). The merged file set matches the B4 scheduler, diagnostics, tests, canonical docs and preserved evidence.
