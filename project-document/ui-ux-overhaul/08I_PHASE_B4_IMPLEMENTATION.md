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
