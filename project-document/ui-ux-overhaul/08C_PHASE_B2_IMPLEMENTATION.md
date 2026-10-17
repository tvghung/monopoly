# 08C — Phase B2: React render fan-out

> **HISTORICAL** — Implementation record of performance program batch B2 (2026-10-17), built on the
> [Phase A audit](./08A_PERFORMANCE_AUDIT.md) (REFERENCE) and the [B0 + B1 record](./08B_PHASE_B0_B1_IMPLEMENTATION.md). It records what
> was changed, how it was measured and what the measurements showed; it is not a rule. Current rules:
> [game board instruction, "React render fan-out"](../monopoly-websockets/Client/game-board.instruction.md) and
> [settings instruction, "Reading settings"](../monopoly-websockets/Client/settings-and-audio.instruction.md); measurement tooling:
> [scripts/perf/README.md](../../scripts/perf/README.md).

Status: **PARTIAL.** Every render target is met and measured: a hover sweep, a volume-slider drag and a non-visual room update commit
the 3D scene **0** times and draw **0** extra frames, and the React task P95 is 1.1–4.4 ms in every scenario at every tier (target
≤ 8 ms). One target is **not met as the benchmark measures it**: heap growth over 30 replays is 2.00 MB after the benchmark's fixed
3 warm-up replays (baseline 2.29 MB); it is 0.65 MB (baseline 0.92 MB) after 30 warm-up replays, and the residual is compiled-code
growth, not retained objects ([§6.4](#64-heap-growth-after-30-replays)). Raw reports: [08C_evidence/](./08C_evidence/README.md).
The final review before merge ([§14](#14-final-review-2026-10-17)) re-measured on a second machine, strengthened the context-isolation
tests and kept the verdict PARTIAL.

## Contents

- [1. Scope and what did not change](#1-scope-and-what-did-not-change)
- [2. Machine, baseline and method](#2-machine-baseline-and-method)
- [3. Root causes](#3-root-causes)
- [4. Implemented changes](#4-implemented-changes)
- [5. Which change fixed what](#5-which-change-fixed-what)
- [6. Measurements: baseline and after B2](#6-measurements-baseline-and-after-b2)
- [7. Targets and their results](#7-targets-and-their-results)
- [8. Visual and behavior equivalence](#8-visual-and-behavior-equivalence)
- [9. Tests](#9-tests)
- [10. Known limitations and remaining work](#10-known-limitations-and-remaining-work)
- [11. Acceptance checklist](#11-acceptance-checklist)
- [12. Recommendation for the next batch](#12-recommendation-for-the-next-batch)
- [13. Commits](#13-commits)
- [14. Final review (2026-10-17)](#14-final-review-2026-10-17)

## 1. Scope and what did not change

Batch B2 of the [Phase A roadmap](./08A_PERFORMANCE_AUDIT.md#j-phase-b-implementation-roadmap): narrow the React fan-out, client only. Not
changed: game rules, server authority, socket protocol, room snapshot schema, persistence, turn order, dice authority, money,
ownership, presentation event order, character movement, card contents, accessibility contracts, graphics tiers, the FPS scheduler,
the visual design. Batches B3–B8 (shader warm-up, scheduler pacing, Graphics 2.0 cost, adaptive `auto`, load path, animation timing)
are **not started**. Two of B1's open items are addressed here: B1-OPEN-1 (heap growth) and B1-OPEN-2 (React task P95); B1-OPEN-3
(one unexplained idle blip) is carried forward ([§10](#10-known-limitations-and-remaining-work)).

No file under `apps/server`, `packages/shared`, `apps/desktop`, `services`, `e2e` or `.github` changed.

## 2. Machine, baseline and method

Same machine, browser and display as [08B §2](./08B_PHASE_B0_B1_IMPLEMENTATION.md#2-test-machine-and-how-it-differs-from-the-phase-a-reference):
MSI Katana GF76 (Core i7-11800H), Chrome 155 on the Intel UHD Graphics iGPU (ANGLE Direct3D 11), 1920×1080 at 144 Hz (measured 142.9 Hz),
devicePixelRatio 1, viewport 1520×769, drawing buffer 1867×928, AC power, headed. All measurements are Chrome, unminified
production-React UAT bundles, diagnostics on, FPS cap 60, driven by `scripts/perf/runBenchmark.mjs` (five warm replays or sweeps per
scenario after a first one, soak of 3 warm-up replays then 30). Electron, the Phase A reference laptop, battery power and other GPUs
were not measured.

Baseline = `origin/main` `5c910fb` (B0 + B1 merged) plus one measurement-only commit (`7a76fd6`: a master-volume slider in the UAT
harness and a `volume` scenario in the benchmark; no render code). The `socket` scenario needed one more harness control, so its
baseline was taken on `7a76fd6` plus the measurement commit `3db7648` (cherry-picked on a scratch worktree; the two commits change no
scene code). Baseline and after were built, run and compared on the same machine in the same session.

Method additions in this batch: the `volume` and `socket` scenarios (20 changes per sweep, 50 ms apart; `socket` is a room update that
appends one log line, as a chat or presence update does), `--soak-warmup`, `captureHover.mjs` (hover and selection equivalence),
`cpuProfile.mjs` and `heapSample.mjs` (diagnosis). A `workingTreeDirty: true` flag in an after report means an untracked scratch
worktree directory sat in the checkout while it ran; the bundle was built from the clean commit named in the report.

## 3. Root causes

Measured on the baseline before any change (08C_evidence reports and a CPU profile of the dice scenario):

| ID | Root cause | Evidence |
| --- | --- | --- |
| B2-RC-1 | `Board` read the whole presentation state (`usePresentation()`), the room-state context and held the hovered tile in React state, and rebuilt the render model on each. Every presentation tick, socket update and hovered tile re-rendered `Board`, `GameScene` and the whole R3F tree with new object props, which commit on the scene and request a frame | hover sweep: 19 R3F commits, 19 DOM commits, 19 scene submissions (one frame per crossed tile boundary, all of them paying a full board render); walk replay: 14 R3F commits |
| B2-RC-2 | **react-three-fiber re-provides every ancestor context inside its tree** and does it by reading each one while `Canvas` renders (its-fine `useContextBridge`). Any context above the canvas that changes is therefore a React commit on the scene even when nothing under it reads the context. The settings context changed on every setting, the room-state context on every socket update | volume slider: 20 R3F commits and 20 scene submissions for 20 slider values; this kept happening after the first fix removed the prop-driven commits (§5) |
| B2-RC-3 | No scene component was `memo`ised and the model's parts were new objects on every build | `memo` alone could not help before the model was shared structurally |
| B2-RC-4 | Each `Die` built its own die-body geometry (rounded box, six face plates, a merge) and disposed it when the dice hid, on every first roll, replay and reset | CPU profile of three warm dice replays (`cpuProfile.mjs`): baseline `Die` 53 ms inclusive, of which `SelectiveRoundedBoxGeometry` 47.5 ms, about 16 ms per roll; absent from the final profile. The dice React task P95 stayed at 22.1 ms until this was fixed (§5) |
| B2-RC-5 | DOM readers (`Dashboard`, `BuyPrompt`, `DevelopmentPrompt`, `CardInteractionOverlay`) used `usePresentation()` and re-rendered on every tick for one field each | read from the code; `usePresentation()` has no caller left outside tests |

## 4. Implemented changes

| ID | Change | Files |
| --- | --- | --- |
| B2-1 | **Settings as a store.** `SettingsStore` holds the settings; the context value is a stable handle `{ available, store, updateSettings, resetSettings }` that never changes while a provider is mounted and the provider does not re-render for a setting. `useSettings()` subscribes to the whole store (same result as before); new `useSettingsSelector(selector)` subscribes to one primitive. `GameScene` reads `fpsLimit` and `graphicsQuality`, `useEffectiveReducedMotion` reads `reducedMotion`. `updateSettings` is a no-op when the normalised result equals the current settings | `apps/client/src/settings/settingsStore.ts`, `SettingsContext.ts`, `SettingsProvider.tsx`, `selectors.ts`, `apps/client/src/game/scene/GameScene.tsx` |
| B2-2 | **Hover as a store.** `createTileHoverStore` holds the hovered tile; `TileBodyBatch` subscribes in a layout effect and rewrites instance colours itself; the tile batches and `BoardAccessibilityControls` write it; `TileOwnerHoverCard` subscribes only in a 2v2 game. `GameScene` and `Board3D` take the store, not a hovered id or callback | `apps/client/src/game/scene/board/tileHoverStore.ts`, `tiles/TileBodyBatch.tsx`, `board/Board3D.tsx`, `apps/client/src/components/Board.tsx` |
| B2-3 | **`Board` split.** `Board` is `memo`ised, prop-less and reads no game state; `BoardFrame` (reads `connected`), `TradePromptProvider` (reads `canMutate`, memoised value) and `BoardRenderSurface` (the only model builder) are separate components. The walking positions are provided around the legacy board only | `apps/client/src/components/Board.tsx`, `BoardRenderSurface.tsx` |
| B2-4 | **Scene slice and structural sharing.** `BoardRenderSurface` reads the presentation state through `selectScenePresentation` / `sameScenePresentation` (the 22 fields the model reads) and passes the built model through `shareStructurally`, so equal parts keep their identity | `apps/client/src/game/scene/board/boardRenderModel.ts`, `shareStructurally.ts` |
| B2-5 | **`memo` on the scene.** `GameScene`, `TileAssembly`, `TileBodyBatch`, `TileSurfaceBatch`, `TileImpactHighlightBatch`, `TubeHouseInstances`, `LandmarkShadowProxy`, `CenterAirport`, `BoardFoundation`, `DiceLayer`, `PhysicalCardDecks`, `PlayerStationLayer`, `MoneyTransferLayer` (now takes `moneyTransfers` and `stations`, not the model), `CharactersLayer`, `CameraAutoFocus`. `Board3D` passes module constants for an absent model and a stable fallback callback | `apps/client/src/game/scene/**` |
| B2-6 | **DOM readers use selectors** | `components/Dashboard.tsx`, `components/dashboard/BuyPrompt.tsx`, `DevelopmentPrompt.tsx`, `game/ui/events/CardInteractionOverlay.tsx`, `game/presentation/store/selectors.ts` |
| B2-7 | **Shadow the room-state context above the canvas.** `GameScene` wraps `Canvas` in `stateContext.Provider` with a constant, so a socket update does not commit the scene. Sound only while nothing under `game/scene` imports the app state context; a source scan test keeps it so, and a component that did would fail on the first read of `state` | `apps/client/src/game/scene/GameScene.tsx`, `sceneStateIsolation.test.ts` |
| B2-8 | **One die body geometry.** `DiceLayer` builds one geometry for both dice the first time the dice are shown and keeps it until the layer unmounts; the dice and trails borrow it | `apps/client/src/game/scene/dice/DiceLayer.tsx` |
| B2-9 | **Tooling.** `volume` and `socket` scenarios, per-sweep commit rows and column labels in the comparison, `--soak-warmup`, `perf:hover-compare`, `perf:cpu-profile`, `perf:heap-sample`; a UAT volume slider and a "Cập nhật phòng" control in the harness | `scripts/perf/*`, `apps/client/src/dev/phase4-uat/Phase4UatHarness.tsx` |

Design notes. State that changes often and is read by few (hover, settings) lives in a store that its readers subscribe to, which
moves the cost from "re-render everything, let `memo` sort it out" to "write the colours, request one frame". Structural sharing
(rather than hand-written comparisons per consumer) makes `memo` effective for every layer at once and cannot change what the scene
shows: the shared value is always equal by content to the one built. The context shadow is deliberately narrow: it is applied to the
one context that changes at every socket update; the others above the canvas (`roomExitContext`, i18n, toast, audio, update) change
rarely, and a future one that changes often must be shadowed or made stable the same way. The die geometry is created lazily so that
the load path (batch B7) is not made longer.

## 5. Which change fixed what

Three builds of the same tree, Balanced, per unit (sweep or replay): R3F commits / scene submissions / React task P95.

| Scenario | Baseline `7a76fd6` | After B2-1…B2-6 (`ffdd291`) | After + stable settings context and die geometry (`10e6513`) | Final (B2-7 added, `09b7253`) |
| --- | --- | --- | --- | --- |
| hover (per sweep of 18 tiles) | 19 / 19 / 7.9 ms | **0** / 19 / – (DOM commits still 19) | 0 / 19 / – (DOM commits 0) | 0 / 20.2 / – |
| volume (20 changes) | 20 / 20 / 7.6 ms | **20 / 0** / 0.5 ms (a commit per change remained: B2-RC-2) | **0 / 0** | 0 / 0 |
| socket (20 room updates) | 20 / 20 / 0.4 ms | not run | not run | **0 / 0** / 0.3 ms |
| walk (per replay) | 14 / 87 / 10.6 ms | 12 / 84 / 4.8 ms | 12 / 86 / 3.1 ms | 11 / 84 / 4.0 ms |
| dice (per replay) | 8 / 60 / 23.0 ms | 5 / 55 / **22.1 ms** (die geometry, B2-RC-4) | 5 / 56 / **3.7 ms** | 5 / 56 / 2.8 ms |

## 6. Measurements: baseline and after B2

Conditions: [§2](#2-machine-baseline-and-method). Reports and comparison tables: [08C_evidence/](./08C_evidence/README.md).

### 6.1 Required comparison (Balanced, cap 60, diagnostics on)

| Metric | Baseline | After B2 | Change |
| --- | --- | --- | --- |
| Hover sweep (18 tiles): R3F commits | 19 | **0** | −19 |
| Hover sweep: DOM commits | 19 | **0** | −19 |
| Hover sweep: scene submissions (one per hover change, plus the pointer leaving) | 19 | 20.2 | each hover is still painted, once |
| Volume slider (20 changes): R3F commits | 20 | **0** | −20 |
| Volume slider: scene submissions | 20 | **0** | −20 |
| Volume slider: DOM commits (the slider's own readout) | 20 | 20 | unchanged |
| Non-visual room update (20): R3F commits | 20 | **0** | −20 |
| Non-visual room update: scene submissions | 20 | **0** | −20 |
| Walk replay: R3F commits | 14 | 11 | −3 |
| Dice replay: R3F commits | 8 | 5 | −3 |
| React task P95, walk | 10.6 ms | 4.0 ms | −62 % |
| React task P95, dice | 23.0 ms | 2.8 ms | −88 % |
| React task P95, purchase / rent / build | 7.2 / 6.9 / 7.3 ms | 1.3 / 1.1 / 1.5 ms | −79 … −84 % |
| React task P95, soak (30 walk replays) | 11.2 ms | 1.8 ms | −84 % |
| Warm replay program links, geometry growth over 30 replays | 0, 0 | 0, 0 | B1's results hold (geometries 118 → 117: one die geometry instead of two) |
| Heap growth over 30 replays, 3 warm-up replays | +2.29 MB | +2.00 MB | −13 % ([§6.4](#64-heap-growth-after-30-replays)) |
| Heap growth over 30 replays, 30 warm-up replays | +0.92 MB | **+0.65 MB** | −29 % |
| Idle, 10 s | 0 scene submissions | 0 | (an intermediate build's idle window saw 1: [§10](#10-known-limitations-and-remaining-work)) |

The remaining walk R3F commits are real scene changes: a replay changes the dice, the destination preview, the movement signals of
five hops and the active player, plus the context bridge's commits for the room snapshots it receives. The test
`Board.renderIsolation.test.tsx` checks the bound for a roll and a walk: the scene renders at most once per change of the slice it
draws.

Frame pacing is **not** claimed as an improvement. Interval P95 27.9 → 28.0 ms, P99 34.7 → 41.6 ms, maximum 41.7 → 48.5 ms and effective
FPS 41.3 → 40.4 in the walk scenario are one-vsync steps of the 144 Hz display at cap 60 ([08B §2](./08B_PHASE_B0_B1_IMPLEMENTATION.md#2-test-machine-and-how-it-differs-from-the-phase-a-reference),
PERF-06): the same code moved between 41 and 48 FPS between runs (the 30-warm-up baseline soak ran at 47.6 FPS, the baseline's own
Balanced soak at 41.1), and the walk frame CPU P95 read 5.5 ms on the baseline and 8.1, 5.7 and 8.3 ms on the three later builds, whose frame
callbacks were not changed; over the 2,600-frame soak it is 5.7 → 3.8 ms. GPU frame time median is 11.3 → 11.2 ms.
Nothing here reduces GPU work, as B1 stated for itself; that is batch B5.

### 6.2 Per-scenario results (Balanced, per replay or sweep)

| Scenario | R3F commits | DOM commits | Scene submissions | React task P95 |
| --- | --- | --- | --- | --- |
| dice | 8 → 5 | 16.6 → 16.0 | 59.6 → 55.6 | 23.0 → 2.8 ms |
| walk | 14 → 11 | 24.4 → 25.0 | 86.6 → 83.8 | 10.6 → 4.0 ms |
| purchase | 8.4 → 6.2 | 68.6 → 73.0 | 59.8 → 66.2 | 7.2 → 1.3 ms |
| rent | 7.0 → 5.0 | 86.0 → 89.4 | 53.0 → 58.4 | 6.9 → 1.1 ms |
| build (`house-2`) | 11.0 → 9.0 | 72.6 → 75.0 | 71.0 → 77.0 | 7.3 → 1.5 ms |
| hover (per sweep) | 19 → 0 | 19 → 0 | 19 → 20.2 | 7.9 ms → no React task |
| volume (per sweep) | 20 → 0 | 20 → 20 | 20 → 0 | 7.6 ms → no React task |
| socket (per sweep) | 20 → 0 | 40 → 40 | 20 → 0 | 0.4 → 0.3 ms |

The DOM commits of purchase, rent and build (70–90 per replay) are the HUD money counters counting up for 480 ms (a visible
animation by design, `useAnimatedNumber`); they are small tasks (median 0.6 ms) and were left alone. The socket scenario's 40 DOM
commits per sweep are the room-state readers of the DOM (harness readout, HUD, accessibility buttons) and are outside the scene.

### 6.3 Low and High tiers (cap 60, diagnostics on; walk, hover, volume, socket)

| Tier | Hover R3F / DOM | Volume R3F / scene submissions | Socket R3F / scene submissions | Walk R3F per replay | Walk React task P95 | GPU median, walk |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 19 / 19 → **0 / 0** | 20 / 20 → **0 / 0** | 20 / 20 → **0 / 0** | 14 → 11 | 6.4 → 1.4 ms | 6.3 → 6.3 ms |
| High | 38 / 19 → **0 / 0** | 40 / 20 → **0 / 0** | 40 / 20 → **0 / 0** | 29 → 23 | 18.9 → 4.4 ms | 47.3 → 48.1 ms |

The High tier counts about twice the R3F commits of the other tiers before and after (the cause was not investigated); the hover,
settings and room-update effects are the same. Its frame interval (P95 83.3 ms) and GPU time are
unchanged, as expected: B2 removes no GPU work.

### 6.4 Heap growth after 30 replays

`Runtime.getHeapUsage` after two forced collections, balanced, diagnostics on, walk replays (soak):

| Run | After B2 | Baseline |
| --- | --- | --- |
| 3 warm-up replays (the benchmark default), replays 0 → 10 → 20 → 30 | 19.44 → 20.67 → 21.15 → 21.43 MB: **+2.00 MB** | 19.98 → 21.37 → 21.82 → 22.27 MB: +2.29 MB |
| 30 warm-up replays, then 30 more | 21.29 → 21.33 → 21.82 → 21.94 MB: **+0.65 MB** | 22.10 → 22.55 → 22.86 → 23.02 MB: +0.92 MB |

Diagnosis with the V8 allocation sampler (`heapSample.mjs`, final bundle, diagnostics off, walk):

| Condition | Heap growth over 30 replays |
| --- | --- |
| 3 warm-up replays | +1.89 MB |
| 30 warm-up replays | +0.45 MB |
| 3 warm-up replays, JIT tiers off (`--no-opt --no-sparkplug --no-maglev`) | **+0.11 MB** (and the heap itself is 5 MB smaller) |

The growth is therefore the JavaScript engine tiering functions up (compiled code and feedback vectors live in the measured heap and
keep growing for dozens of replays after load); with the JIT off the same 30 replays retain 0.11 MB. The allocation sampler finds no
site in the application's own React, R3F or scene code that holds a growing share: the largest sampled-alive entries are the frame
scheduler's callbacks, framer-motion's frame batch and three.js uniform bookkeeping, each 0.04–0.16 MB and, for the scheduler, smaller
after a long warm-up (0.145 MB) than after a short one (0.25 MB).
B2 lowers the number (−13 % and −29 %) by allocating less per render, not by freeing a leak: there was none in scope after B1. The
criterion "≤ 1 MB after warm-up" is met when the warm-up is long enough to reach the steady state (and was already met by the baseline
then), and not met with the benchmark's fixed 3-replay warm-up. The benchmark default was **not** changed to make the number pass; use
`--soak-warmup 30` for the steady-state reading.

## 7. Targets and their results

| Target (task of this batch) | Result | Verdict |
| --- | --- | --- |
| Hover sweep across 18 tiles: 0 unnecessary R3F commits | 0 R3F commits, 0 DOM commits at Low, Balanced and High; one frame per hover change | **PASS** |
| Volume slider changes: 0 unnecessary R3F commits | 0 R3F commits and 0 scene submissions at all three tiers | **PASS** |
| React task P95 ≤ 8 ms, especially during walk, dice and repeated gameplay | Balanced: walk 4.0, dice 2.8, purchase 1.3, rent 1.1, build 1.5, soak 1.8 ms; Low walk 1.4 ms; High walk 4.4 ms. Across the three builds measured the walk read 4.8, 3.1 and 4.0 ms | **PASS** |
| Heap growth after 30 replays ≤ 1 MB, after warm-up and GC | 2.00 MB with the benchmark's 3 warm-up replays; 0.65 MB with 30 warm-up replays; JIT-off control 0.11 MB ([§6.4](#64-heap-growth-after-30-replays)) | **PARTIAL** (not met under the fixed protocol; met under a steady-state warm-up; the baseline met it there too) |
| Preserve B1's 0 unnecessary shader re-links and 0 geometry growth | 0 links, 0 geometry growth over 30 replays at all tiers; the ownership check passes (final review: held in 7 of 8 soaks on a second machine; one soak showed an unexplained one-off program burst with no program linked twice, [§14](#14-final-review-2026-10-17)) | **PASS** |
| No visual or gameplay regressions | 18 of 19 settled states bit-identical, the 19th equals the capture's own noise; hover, click, dialog and 2v2 owner card the same ([§8](#8-visual-and-behavior-equivalence)); the full test suite passes | **PASS** with the limits of §8 |
| Do not change graphics quality, FPS scheduling or visual design | No file of the renderer quality, scheduler or materials changed | **PASS** |

Overall: **PARTIAL**, because of the heap row alone.

## 8. Visual and behavior equivalence

All comparisons: baseline bundle against after bundle, same Chrome and GPU, 1280×720, devicePixelRatio 1 (`scripts/perf/README.md`).

| Check | Result |
| --- | --- |
| `perf:visual-compare`, 19 settled states (complete board at three tiers, Jail, both Tax tiles, a property tile, landmarks, maximum houses, standees, stations, end states of walk, purchase, rent, house, hotel, jail, Low walk) | **18 identical.** Dice settled differs in 1,730 pixels (0.188 %), maximum channel delta 74, all inside a 107 × 85 px box around the dice; the baseline captured against itself differs in 1,112 pixels (maximum 62) in the same state, as in [08B §7](./08B_PHASE_B0_B1_IMPLEMENTATION.md#7-visual-regression): that state is not reproducible between captures, so the difference is not attributed to B2 |
| `perf:hover-compare`: canvas at rest, five hovered tiles (1, 3, 12, 25, 30), after the pointer left | **7 of 7 bit-identical**; inspection dialog opens on a click and closes on Escape in both builds |
| The canvas plus modal after a click | differs by up to 2 levels in 24,560 pixels, and equally between the baseline and itself (the modal's entrance animation): not attributed |
| 2v2 owner hover card on tiles 1, 3, 6, 8, 2 and after leaving | identical text in both builds (owner, team, relation; no card on an unowned tile or after leaving) |
| `perf:lifecycle-check --expect-persistent` on the final bundle | all checks passed: one highlight, contact-shadow, preview, trail (per die) and puff material for the whole session; effects drawn during rolls, walks and builds; live tier cycle; a forced context loss falls back to the legacy board with no page error |

Not checked pixel by pixel: dice roll, hops, destination preview and construction bursts in progress (no reproducible frame method, as
in 08B §7.1; their resources are checked structurally by the lifecycle check, and the presentation and component tests cover their
behavior). Reduced motion, the legacy fallback board and reconnect snapping have unchanged tests that pass; they were not captured
pixel by pixel.

## 9. Tests

| Subject | Tests |
| --- | --- |
| The scene is not rendered by what it does not draw | `components/Board.renderIsolation.test.tsx`: no scene render for a sweep of hovered tiles, for settings changes (volume, mute, music, SFX), for a log-only presentation tick, for a queue-status tick and for a log-only room update; exactly one for a token move and one for an owner change, which keeps every other tile object; at most one per change of the drawn slice during a roll and a walk; the callbacks passed to the scene are stable |
| Settings store and selectors | `settingsStore.test.ts`, `useSettingsSelector.test.tsx` (selector readers re-render only for their value, the settings context value never changes, no-op updates notify nobody, defaults without a provider) |
| Hover store | `tileHoverStore.test.tsx` |
| Structural sharing | `shareStructurally.test.ts` (equal contents keep identity, a changed part replaces only itself, never differs by content, non-plain values by identity) |
| Room state is not read by the scene | `sceneStateIsolation.test.ts` (only `GameScene.tsx` imports the app state context; since the final review also over the whole import closure of the scene, [§14](#14-final-review-2026-10-17)) |
| The context shadow, with the real `Canvas` | `game/scene/GameScene.contextIsolation.test.tsx` (final review): the real `GameScene` and react-three-fiber `Canvas` with a stand-in renderer; a component under the canvas sees none of the room state, a room-state change does not render it, and every other context is still bridged in |
| 2v2 owner card through the hover store | `components/Board.renderIsolation.test.tsx` (final review): the card appears for the hovered owned tile with owner, team and relation, disappears for another tile and for the pointer leaving, is never drawn in Solo, and a hover in a team game still does not render the scene |
| Die geometry | `diceLayerMaterialLifetime.test.tsx` (not built before the dice show, built once for both dice, kept across roll, hide and show, released once with the layer) |
| Tooling | `scripts/perf/compareResults.check.mjs` (per-sweep rows, labels, every row names a runnable scenario) |

Pre-fix check: the isolation test, adapted only to the baseline's API (hover passed as a prop, no slice helper) and run on the baseline
tree, **fails 5 of its 6 tests**: a sweep of 18 hovered tiles renders the scene 20 times instead of 1, a log-only presentation tick 3
times and a log-only room update 2 times instead of 1, and an unchanged token move or owner change replaces every tile object. Its
settings assertion passes on the baseline because the stand-in scene cannot read settings; that behavior is what `useSettingsSelector.test.tsx`
(selector readers, stable context) and the benchmark's `volume` scenario (20 → 0 R3F commits) cover. Real-GPU behavior (R3F commits, scene
submissions, heap) is verified by the benchmark counters above: jsdom has no WebGL. (The scene stand-in of `Board.renderIsolation.test.tsx`
cannot show the context bridge; `GameScene.contextIsolation.test.tsx` does, by mounting the real `Canvas` with a stand-in renderer.)

## 10. Known limitations and remaining work

- **The context bridge is only partly closed.** The settings context and the room-state context no longer commit the scene; other
  ancestor contexts (`roomExitContext`, i18n, toast, audio, app update) do whenever they change, which is rare. A context that starts changing
  often above the canvas must be shadowed or made stable. The scene still commits for every **real** scene change: 11 per walk
  replay.
- **High tier counts about twice the R3F commits** of the other tiers (not investigated); the ratio is unchanged by B2 and these
  commits request no frame by themselves.
- **DOM-side per-update work remains**: `BoardAccessibilityControls` rebuilds 40 button labels per room update, the HUD money counters
  render per animation frame, `Board` re-renders on a language change. None showed in the React task P95 (≤ 4.4 ms).
- **First roll of a session** builds the die geometry once (about 20 ms) at the first show, as before, instead of at each show.
- **Heap**: [§6.4](#64-heap-growth-after-30-replays). A 30–60 minute packaged session is still **NOT RUN**.
- **Idle** (carried B1-OPEN-3): of the five Balanced idle windows measured (baseline, two intermediate builds, one more intermediate
  build and the final build) four saw 0 scene submissions and one saw 1: an intermediate build, the first scenario of a fresh
  profile, as in B1. The final build's window saw 0. Not explained, not reproduced.
- **One unexplained program burst in a soak** (final review, [§14](#14-final-review-2026-10-17)): 1 of 8 soaks of the final bundle on the
  review machine compiled 57 new programs (0 repeats), kept 53 of them and added 2 geometries between replays 20 and 30, with one 2 s
  stall. It did not recur in 7 further runs and was not seen in 4 baseline runs. Not explained; the structural guarantee that no
  program is linked twice held in it.
- **Frame pacing** is dominated by the vsync divisor of PERF-06 (batch B4) and by GPU time (batch B5): B2 does not change either.
- **Not measured**: the Phase A reference laptop, Electron, battery power, other GPUs and refresh rates, long sessions, multiplayer over
  a network, audio, compositor-level presentation.
- `useSharedRenderModel` reads its previous value from a ref committed in a layout effect, the same pattern as `useBoardTiles`: under
  concurrent rendering an abandoned render cannot corrupt it (it only ever compares for equality), but it is not a pure function of
  props.
- Development builds (React StrictMode) build the die geometry twice at the first show and drop one; production builds do not.

## 11. Acceptance checklist

| Item | Status |
| --- | --- |
| Baseline measured before any change on the same device and settings | PASS ([§2](#2-machine-baseline-and-method), [08C_evidence](./08C_evidence/README.md)) |
| Hover sweep: 0 unnecessary R3F commits | PASS (19 → 0) |
| Volume slider: 0 unnecessary R3F commits | PASS (20 → 0) |
| React task P95 ≤ 8 ms (walk, dice, repeated gameplay) | PASS (4.0 / 2.8 / 1.8 ms) |
| Heap growth after 30 replays ≤ 1 MB | PARTIAL (2.00 MB fixed protocol; 0.65 MB steady state) |
| B1's 0 shader re-links and 0 geometry growth preserved | PASS |
| Visual equivalence | PASS (18 of 19 identical; the 19th is capture noise); hover and selection identical |
| Gameplay contracts unchanged (protocol, schema, rules, server) | PASS (no server, shared or desktop file changed) |
| Animations (dice, movement, tile highlights, cards) keep working | PASS by tests and the lifecycle check; mid-animation pixels not compared |
| Accessibility, fallback rendering, reduced motion preserved | PASS (unchanged tests pass; the 40 accessibility buttons and the legacy board are intact; legacy positions provided around the legacy board) |
| `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm validate:docs` | PASS at the final commit: client 246 files / 2,461 tests, server 29 / 559, desktop 35 / 519 (6 skipped), perf tools included in `pnpm test`; the build runs the client typecheck, Vite build and the asset validators. `pnpm db:status` and `pnpm desktop:package` were not run (no persistence, schema or desktop file changed) |
| GitHub Actions on the pull request | recorded in the pull request |

## 12. Recommendation for the next batch

B3 (shader warm-up) is the next batch on the roadmap and is independent of B2. Before B5 (GPU cost), B4 (scheduler pacing) should be
taken first: every frame-time number in this record is quantised by PERF-06 on a 144 Hz display, so neither B2 nor B5 can be read
cleanly in FPS until it is fixed. If another change adds a context above the canvas, add it to the list in the
[game board instruction](../monopoly-websockets/Client/game-board.instruction.md) and measure `socket` and `volume` first: they catch a
context that commits the scene in under two minutes.

## 13. Commits

Branch `perf/phase-b2-react-rendering`, started from `origin/main` `5c910fb`.

| Commit | Content |
| --- | --- |
| `7a76fd6` | Measurement only: UAT volume slider and the `volume` scenario (the baseline build) |
| `ffdd291` | B2-1…B2-6: settings store, hover store, `Board` split, slice and sharing, `memo`, selectors |
| `10e6513` | Stable settings context, legacy-only positions, team-only hover card, shared die geometry |
| `3db7648` | Measurement only: `socket` scenario, `--soak-warmup` |
| `09b7253` | B2-7: room-state context shadow, lint fixes in the new tests |
| (the following commits) | Diagnosis tools and hover comparison, documentation, canonical rules, evidence |
| `7cb246b` | The head the final review started from |
| (the final review commit) | Review: stronger context-isolation tests, 2v2 hover card test, benchmark exit-code fix, review evidence, this section |

## 14. Final review (2026-10-17)

Review of the pull request head `7cb246b` before it leaves draft. It changed no render, scheduler, quality, gameplay, server, protocol or
persistence code; it added tests, one benchmark-tool fix, evidence and this section. **The overall verdict stays PARTIAL**, for the
heap row alone ([§6.4](#64-heap-growth-after-30-replays)); the review adds one open item ([§14.5](#145-outstanding-risks)).

### 14.1 CI

Both workflows passed on `7cb246b`: `CI` / `build` (V1 contract, music, artwork validators, typecheck, lint, test, build; run 39002936777) and
`Docs` / `validate-docs` (run 39002936819). Local gates at the review commit: `pnpm typecheck`, `pnpm lint`, `pnpm build`,
`pnpm validate:docs` and `pnpm validate:v1-contract` PASS; `pnpm test` PASS (client 247 files / 2,468 tests, server 29 / 559, desktop
35 / 525, perf tools included). The checks of the head after the review commit are recorded in the pull request.

### 14.2 React context safety of the `GameScene` shadow

| Finding | Detail | Action |
| --- | --- | --- |
| The shadow is sound today | The import closure of `GameScene.tsx` is 199 files; the only one that imports the app state context is `GameScene.tsx`. The files reachable from outside `game/scene` (settings selectors, i18n, presentation selectors, the dev rect publishers, formatters, character registry) read other contexts or stores, which are still bridged | none |
| The guard was weaker than the claim | `sceneStateIsolation.test.ts` looked only at files under `game/scene`; a scene file that imported a hook or component from elsewhere which reads `stateContext` would have passed it and then failed in production at its first read of `state`. Every behavior test replaced `GameScene` with a stand-in, so the real shadow was not run by any test | the scan now walks the whole import closure (static and dynamic, relative imports) and asserts the resolver found the scene (more than 100 files, `settings/selectors.ts` among them) |
| No test showed the shadow working | | `GameScene.contextIsolation.test.tsx` mounts the real `GameScene` inside the real react-three-fiber `Canvas`, with only the renderer, the measured size and the drawn layers replaced. A probe under the canvas sees none of the room state; two room-state changes do not render it; another context (a stand-in for settings, language, trade prompt) is still bridged in and its change reaches it. Checked by mutation: with the shadow removed, 2 of its 3 tests fail (the probe sees the room state, and it renders twice instead of once) |
| The 2v2 owner card had no test through the hover store | `TileOwnerHoverCard.test.tsx` renders the card with a tile id; nothing rendered `Board`'s `HoveredTileOwnerCard` and `TeamHoverCard` wiring | two tests in `Board.renderIsolation.test.tsx` (owner, team and relation for the hovered tile; gone for another tile and for the pointer leaving; no card in Solo; a team-game hover still does not render the scene). Checked by mutation: breaking the wiring fails the first |

### 14.3 Functional regression

| Area | Evidence at the reviewed head |
| --- | --- |
| Property ownership updates | `Board.renderIsolation.test.tsx` (an owner change renders the scene and replaces only that tile), ownership-hold and presentation tests; model fields are guarded by type: `buildBoardRenderModel` accepts only the 22 keys of `SCENE_PRESENTATION_KEYS`, so a field the model reads and the slice omits does not compile |
| Dice rolling, player movement | `Board.renderIsolation.test.tsx` (a token move renders once; a roll and a walk render at most once per change of the drawn slice), `diceLayerMaterialLifetime.test.tsx`; benchmark walk, dice and purchase replays complete on the real GPU with no page error |
| Tile selection and hover | `Board.test.tsx` (40 tiles as controls, inspection opens and closes), `tileHoverStore.test.tsx`; the hover scenario draws one frame per hover change |
| 2v2 hover cards | `TileOwnerHoverCard.test.tsx` and the new store-wiring tests ([§14.2](#142-react-context-safety-of-the-gamescene-shadow)); the byte-identical card text is in [§8](#8-visual-and-behavior-equivalence) |
| Settings changes | `settingsStore.test.ts`, `useSettingsSelector.test.tsx`; the `volume` scenario commits the scene 0 times |
| Reconnect | `PresentationController`, `PresentationProvider`, `PresentationFreezeChain` and `Board.test.tsx` reconnect cases (`SESSION_SYNC` snaps, no replay, roll lock cleared on disconnect and on reset epoch) pass unchanged |
| Reduced motion | `useEffectiveReducedMotion` reads `reducedMotion` through the selector; presentation and board tests for reduced motion pass unchanged. Not run by hand on a real display |
| Legacy renderer fallback | `Board.test.tsx` (legacy board when WebGL is unavailable, selection visible); `pnpm perf:lifecycle-check --expect-persistent` on the review bundle forces a WebGL context loss in real Chrome: the board falls back to the legacy board, no page error |

This is automated and scripted evidence plus the real-GPU benchmark; no one played a game by hand for this review.

### 14.4 Resource stability and performance, measured again

Machine of the review: Core i5-10210U, Intel UHD Graphics (ANGLE Direct3D 11), Chrome 155, 59.9 Hz, devicePixelRatio 1.25, viewport
1522 × 770. It is **not** the machine of [§2](#2-machine-baseline-and-method), so no absolute number below is compared with the earlier
tables; the baseline was rebuilt (`7a76fd6` plus `3db7648`) and measured here in the same session. Balanced, cap 60, five warm replays or
sweeps per scenario. Reports: `review_*` files in [08C_evidence](./08C_evidence/README.md).

| Scenario (per replay or sweep) | R3F commits, baseline → after | React task P95, baseline → after |
| --- | --- | --- |
| hover (18 tiles) | 19 → **0** | 18.4 ms → no React task |
| volume (20 changes) | 20 → **0** | 20.2 ms → no React task |
| socket (20 room updates) | 20 → **0** | 0.5 → 0.4 ms |
| walk | 16 → 11 | 21.9 → 5.3 ms (6.1 ms in a second run) |
| dice | 8 → 5 | 35.3 → 4.5 ms |
| purchase | 9 → 6.4 | 16.8 → 2.9 ms |
| soak (30 walk replays), 4 baseline runs, 6 clean after runs | 14 → 11 | 10.1–19.9 ms → 2.6–2.9 ms |

The React task P95 target (≤ 8 ms) is met in every scenario on this slower machine. Scene submissions in `volume` and `socket`: 0. Heap growth
over 30 replays after the fixed 3 warm-up replays: baseline +2.19 to +2.30 MB (4 runs), after +1.87 to +2.02 MB (7 of 8 runs): **the
≤ 1 MB target is still not met, so the heap row stays PARTIAL**, as in [§6.4](#64-heap-growth-after-30-replays); nothing in this review
changes the diagnosis there. The benchmark was not run with `--soak-warmup 30` here.

B1's guarantees, 8 soaks of the final bundle ([`review_soak-repeats.md`](./08C_evidence/review_soak-repeats.md)): 0 program links in the
warm window, 0 geometry, program and texture growth in 7; in all 8, 0 repeat links (no program linked twice). The 8th soak is
[§14.5](#145-outstanding-risks). The structural lifecycle check passes (one highlight, shadow, preview, trail and puff material for the
session; live tier cycle; context loss falls back to the legacy board with no page error). The `idle` scenario was not run in this
review; the hover scenario drew 19 frames per sweep of 18 tiles, one per hover change.

Frame pacing is not claimed (59.9 Hz here, so the vsync-divisor effect of PERF-06 differs from [§6.1](#61-required-comparison-balanced-cap-60-diagnostics-on)):
walk 37.5 → 40.7 FPS and dice 41.2 → 43.3 FPS are inside the run-to-run spread seen between runs of the same bundle (soaks: 37.0 to 44.1 FPS).

### 14.5 Outstanding risks

1. **Heap growth, PARTIAL** — unchanged ([§6.4](#64-heap-growth-after-30-replays)); a 30–60 minute packaged session is still NOT RUN.
2. **One unexplained program burst (new)** — soak run 3 of the review: between replays 20 and 30 the page compiled 57 programs for the first
   time (0 repeats), kept 53, added 2 geometries and stalled once for 2,015 ms; heap growth +3.23 MB. It did not recur in 7 further
   runs of the same bundle and was not seen in 4 baseline runs (1 in 8 against 0 in 4: no statement about the baseline's rate). A
   stalled soak (run 1: a third of the intervals at 1 s with flat resource counters) shows the machine can throttle the page, which
   explains run 1 but not the burst. Not attributed to B2, not ruled out. It is a first-use compile (a new shader variant appeared), not a
   re-link, so B1's guarantee as defined (no program linked twice) holds. If it shows up again, run the soak with a probe that keeps the
   names of first-use programs (the probe records them, the report aggregates them) before B3 relies on a stable program set.
3. **Context bridge** — as in [§10](#10-known-limitations-and-remaining-work): a context that starts changing often above the canvas commits the scene; the
   `volume` and `socket` scenarios and the new tests catch the two that matter today.
4. **Not measured**: Electron, the Phase A reference laptop, battery power, other GPUs, long sessions, multiplayer over a network; reduced
   motion and reconnect were not exercised by hand.

### 14.6 Tooling fix

`runBenchmark.mjs` exited with code 1 ("the probe observed no rendered scheduler frames") for any run that included `volume` or `socket`,
whose pass condition is zero rendered frames. The check now ignores zero frames in those two scenarios while another run in the same
report saw frames, so a blind probe is still reported. Verified: the same bundle with `--scenarios volume,socket,walk` exits 0 where it
exited 1 before. No measurement changed.
