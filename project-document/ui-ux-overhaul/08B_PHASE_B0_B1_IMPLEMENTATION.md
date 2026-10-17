# 08B — Phase B0 + B1: measurement baseline and GPU-resource stability

> **HISTORICAL** — Implementation record of performance program batches B0 and B1 (2026-10-16), built on the
> [Phase A audit](./08A_PERFORMANCE_AUDIT.md) (REFERENCE, commit `c2f9892`). It records what was changed, how it was measured and
> what the measurements showed; it is not a rule. Current rules: [game board instruction](../monopoly-websockets/Client/game-board.instruction.md);
> measurement tooling: [scripts/perf/README.md](../../scripts/perf/README.md).

Status: **B0 PASS. B1 PARTIAL**: the resource-churn targets are met and measured; the heap-growth target (≤ 1 MB over 30
replays) and the React-task P95 target (≤ 8 ms) are **not** met on every scenario and are reported as such in
[§6](#6-targets-from-phase-a-and-their-results). Raw reports: [08B_evidence/](./08B_evidence/).

## Contents

- [1. Scope and what did not change](#1-scope-and-what-did-not-change)
- [2. Test machine and how it differs from the Phase A reference](#2-test-machine-and-how-it-differs-from-the-phase-a-reference)
- [3. B0: harness fix, tooling and methodology](#3-b0-harness-fix-tooling-and-methodology)
- [4. B1: implemented changes and root causes](#4-b1-implemented-changes-and-root-causes)
- [5. Measurements: B0 baseline and after B1](#5-measurements-b0-baseline-and-after-b1)
- [6. Targets from Phase A and their results](#6-targets-from-phase-a-and-their-results)
- [7. Visual regression](#7-visual-regression)
- [8. Resource lifecycle verification and tests](#8-resource-lifecycle-verification-and-tests)
- [9. Known limitations and remaining work](#9-known-limitations-and-remaining-work)
- [10. Acceptance checklist](#10-acceptance-checklist)
- [11. Recommendation for the next batch](#11-recommendation-for-the-next-batch)
- [12. Commits](#12-commits)
- [13. Final review of pull request #15](#13-final-review-of-pull-request-15-2026-10-17)

## 1. Scope and what did not change

Batches B0 (harness hygiene and a trustworthy baseline) and B1 (stop GPU-resource churn on re-render) of the
[Phase A roadmap](./08A_PERFORMANCE_AUDIT.md#j-phase-b-implementation-roadmap). Client-only, render-performance only. Not
changed: game rules, server authority, socket protocol (v14), room snapshot schema (11), database, turn order, dice authority,
money, ownership, presentation event order, character movement, card contents, accessibility contracts. Batches B2–B8
(React fan-out, shader warm-up, scheduler pacing, Graphics 2.0 cost, adaptive `auto`, load path, animation timing) are
**not started** and every finding assigned to them stays open. One item goes beyond the audit's B1 file list but has the same root
cause and the same fix: the construction-puff and dice contact-shadow materials ([§4](#4-b1-implemented-changes-and-root-causes)).

## 2. Test machine and how it differs from the Phase A reference

Phase A measured a ThinkPad T14 Gen 1 (Core i5-10210U, Intel UHD Graphics 24 EU, 1920×1080 at 60 Hz with 125 % scaling,
Windows 10). That machine was **not available** for this work. All new numbers come from the machine below and are reported
separately; they are never merged with the Phase A historical numbers, and a Phase A value is quoted only to say whether a
mechanism reproduces, never as a before/after baseline.

| Item | This work | Phase A reference |
| --- | --- | --- |
| Machine | MSI Katana GF76 11UD | Lenovo ThinkPad T14 Gen 1 |
| CPU | Intel Core i7-11800H, 8 cores / 16 threads | Intel Core i5-10210U, 4 cores / 8 threads |
| GPU used by Chrome | Intel UHD Graphics (device 0x9A60, Tiger Lake-H) through ANGLE Direct3D 11; the machine also has an NVIDIA GeForce RTX 3050 Ti Laptop GPU that Chrome did not select | Intel UHD Graphics (Comet Lake GT2), ANGLE Direct3D 11 |
| Display | 1920×1080 at **144 Hz** (measured 143–145 Hz), Windows scaling 100 % (devicePixelRatio 1) | 1920×1080 at 60 Hz, scaling 125 % |
| OS / power | Windows 11 Home 10.0.26200, AC power | Windows 10 Pro, AC power |
| Browser | Chrome 155 (stable channel, headed, real GPU) | Chrome 155 and Electron 43 |
| Window | 1536×864 requested; viewport 1520×769 CSS; drawing buffer 1867×928 (Balanced/High), 1494×743 (Low) | 1522×714 CSS; 1871×860 |
| RAM | 15.7 GiB | 15.8 GiB |

Consequences for reading the numbers:

- The display runs at 144 Hz, so the scheduler pacing finding PERF-06 (the delivered rate falls to the largest whole-vsync
  divisor at or below the cap) is part of every frame-interval figure at cap 60: intervals cluster at 20.8 ms (3 vsyncs) and
  27.8 ms (4 vsyncs), and **effective FPS at cap 60 moves by ±4 % between runs for that reason alone**. The cap-240 runs remove
  the cap and are the cleaner view of frame cost.
- This iGPU needs about 11 ms per Balanced frame, not 18 ms, so the board is not GPU-bound at 60 FPS here and the Phase A
  "GPU saturation" finding is **not reproduced on this hardware**. B1 does not reduce GPU work and the Balanced GPU median is
  unchanged by it, as expected.
- Electron was not measured (Chrome only).
- The B1 mechanisms (program re-links, geometry rebuilds, resource growth) are hardware-independent counters and reproduce
  exactly: the baseline here shows 17 / 11 / 7 / 7 / 9 shader re-links per warm replay of walk / dice / purchase / rent / build and
  19 per hover sweep, the Phase A numbers.

## 3. B0: harness fix, tooling and methodology

### 3.1 The harness feedback loop (PERF-17)

Root cause, confirmed on this machine before any change (`c2f9892`, UAT harness in production React mode, 10 s idle window after
all load work): **62 scene submissions, 62 scheduler callbacks, 62 React DOM commits and 62 R3F commits**. The renderer
diagnostics published an event after every frame burst; `Phase4UatSurface` stored the event detail (a new object each time) in
React state, which re-rendered `<Board />` (a child of that component), which applied new props to the R3F tree, which
invalidated a frame, which published again.

Changes (commit `3790870`, [§12](#12-commits)):

| Change | File |
| --- | --- |
| Renderer metrics and the destination-preview alpha are shown by isolated readout components that keep only formatted text and skip `setState` when the text is unchanged; the harness holds no diagnostics state and registers no diagnostics listener | `apps/client/src/dev/phase4-uat/DiagnosticsReadouts.tsx`, `apps/client/src/dev/phase4-uat/Phase4UatHarness.tsx` |
| One gate for all dev instrumentation; `?renderDiagnostics=off` opts out of it so a production-style scene tree can be measured on the same page | `apps/client/src/game/scene/render/diagnostics/localDiagnostics.ts` |
| `RendererDiagnostics`, `TileScreenRectsPublisher` and `PropScreenRectsPublisher` are mounted only behind that gate, so a production page no longer mounts the diagnostics component or its per-frame `useFrame` subscription | `apps/client/src/game/scene/GameScene.tsx` |
| Diagnostics observe the scene and never drive it: `MeasurementScheduler` requests the mount measurement and one settled measurement, publishes later only after frames the scene rendered for its own reasons, and retries a "no frame counted yet" publish at most 5 times. A change of the scene inputs no longer forces a frame; the latest inputs are read through a ref | `apps/client/src/game/scene/render/diagnostics/measurementScheduler.ts`, `apps/client/src/game/scene/GameScene.tsx` |
| `TileDestinationPreview` uses the same gate instead of its own copy of the condition | `apps/client/src/game/scene/board/tiles/TileDestinationPreview.tsx` |

Result on the corrected harness, same page, same conditions: **0 / 0 / 0 / 0** (scene submissions, scheduler callbacks, DOM
commits, R3F commits) in 10 s. The idle check verifies that the probe could see frames (it must have observed the scene render
during load), so a blind probe cannot report a false zero. A production page needs no change to be idle (Phase A NI-01); the fix
removes the instrumentation from it. With the fix the harness walk links 17 programs per replay with the diagnostics on and 17
with them off (the production-style scene tree); Phase A recorded 52 per replay for the harness without the fix and 17 for its
"quiet" production-like run.

Idle evidence, all 10 s windows after load work, Chrome on the Intel iGPU:

| Build | Windows | Scene submissions |
| --- | --- | --- |
| `c2f9892` (before B0), Balanced | 1 | **62** |
| B0 (`3790870`), Low / Balanced / High, diagnostics on and off, cap 60 and 240 | 9 | 0 in all 9 |
| B1 (`fedbf49`), Low / Balanced / High, diagnostics on and off, cap 60 and 240 | 18 | 0 in 17; **1** in one Low window (1 scene submission, 1 DOM commit, 1 R3F commit) |

The single non-zero window was the first scenario of a run that had just started on a fresh Chrome profile; 9 reruns (three on
every tier) and 4 more Low-only reruns on the same bundle recorded 0, and 4 Low-only reruns of the B0 bundle recorded 0. The cause
of that one commit was **not identified**; it is recorded as an unexplained one-off, not as a pass of a stricter claim.

### 3.2 Tooling (`scripts/perf/`)

| Piece | Purpose |
| --- | --- |
| `runBenchmark.mjs` | Playwright driver: builds or serves an unminified production-React UAT bundle, headed Chrome on the real GPU, deterministic harness fixtures, `results.json` with the environment and one entry per tier × scenario |
| `probe-init.js` | In-page observation-only probe: scheduler frames (CPU time, callback lag, GPU timer query), WebGL draw calls and triangles, shader program links with a source hash, synchronous WebGL waits, React commits per renderer, React tasks (timed `MessageChannel` handlers), long animation frames, long tasks; `drain()` so its own arrays never inflate the heap measurements |
| `metrics.mjs` | Pure analysis |
| `compareResults.mjs` | Before/after table; flags reports taken under different conditions; prints `NOT RUN` for a missing side |
| `captureCompare.mjs`, `pngDiff.mjs`, `staticServer.mjs` | Before/after visual equivalence ([§7](#7-visual-regression)) |

Metric definitions (full table in [scripts/perf/README.md](../../scripts/perf/README.md)): FPS caps are never reported as
delivered FPS; **effective FPS** is `1000 / mean contiguous interval` where a contiguous interval is the rAF-timestamp gap
between two rendered frames of a running animation; CPU frame time, GPU frame time (`EXT_disjoint_timer_query_webgl2`) and
presentation cadence are reported separately; a **program link** is first-use or a **repeat** of an identical source hash, and
only repeats are avoidable; a **React task** is a scheduler macrotask that contained a React commit; heap is
`Runtime.getHeapUsage` after two forced collections.

Scenarios (deterministic harness fixtures; one first replay reported separately, then five warm replays): idle (10 s), dice
(`dice-contact-shadows`), walk, hover (18 tiles per sweep, five sweeps), purchase, rent, build (`house-2`), soak (3 warm-up
replays, then 30 replays of `walk`, GC and counters at 0/10/20/30).

### 3.3 Measurement overhead

| Question | Measurement | Result |
| --- | --- | --- |
| Do the probe's own wrappers perturb the run? | Long animation frame time over five warm walk replays, B0 bundle, Balanced, diagnostics off: full probe vs `--lite` (passive observers only) | 320 ms vs 331 ms: not distinguishable from run noise |
| What do the app's dev diagnostics cost? | Same walk replays, full probe, diagnostics on vs off, B0 bundle | 920 ms vs 320 ms of long animation frames, walk frame CPU P95 20.2 ms vs 13.0 ms. The cost is the dev-only `RendererDiagnostics` publish (scene traversal, JSON, `console.info`) and exists only in development and UAT builds |
| Does production pay for it? | Gate in code: `RendererDiagnostics` and the rect publishers mount only behind `isLocalDiagnosticsEnabled()`, both build flags are `false` in production | A production page mounts none of it and no longer runs the diagnostics `useFrame` subscription |

Consequence: before/after comparisons use the same mode on both sides (diagnostics on is the default; diagnostics off is the
production-style scene tree and is reported alongside).

### 3.4 Limits of the method

Compositor-level presentation timing is not measured (rAF timestamps are the proxy). GPU time is the elapsed time of the frame
callback's commands and can include interleaved work. The React-task metric is a different method from the Phase A CPU-profile
attribution, so absolute values are comparable only with other runs of this tool. The probe recognises the scheduler by source
text and therefore needs an unminified bundle; it fails loudly when it sees no frame. Five warm replays per scenario means
percentiles of a few hundred frames.

## 4. B1: implemented changes and root causes

Each change keeps the rendered output and the animation behavior; the equivalence evidence is in [§7](#7-visual-regression) and
[§8](#8-resource-lifecycle-verification-and-tests).

| ID | Root cause | Fix | Files |
| --- | --- | --- | --- |
| PERF-01 | `Board3D` built a new `tiles` array every render; `TileImpactHighlightBatch` memoized its entries, material and `InstancedMesh` on it, so each render created a `MeshBasicMaterial` and disposed the previous one, which released and re-linked the identical shader program (and left the old mesh's buffers undisposed) | The batch's entries depend only on the tile **ids** (keyed by a primitive id key). One `TileImpactHighlightResources` object owns the mesh, material and geometry, is created once per (tile ids, motion controller) and disposed on change or unmount. Per-tile last state lives in two fixed-size `Float64Array`s | `apps/client/src/game/scene/board/tiles/TileImpactHighlightBatch.tsx` |
| PERF-14 | The per-frame change detector used a `Map` keyed `${mesh.uuid}:${tileId}` (40 string allocations per frame) and a new mesh uuid per render added 40 keys that were never removed | Replaced by the fixed arrays above: state is bounded by the tile count and cannot grow | same file |
| PERF-02 | `getTilePanelLayout` returned a new object on every call, and `JailVisual`/`TaxVisual` and the text, ownership and fx layers memoize on it, so every board render rebuilt about 27 `RoundedBoxGeometry` parts per special tile, merged them and re-uploaded | (a) `getTilePanelLayout` is cached by value in a bounded LRU (64 entries; the board uses 9) and returns frozen objects; (b) `MergedRoundedBoxes` owns its geometry through `useMergedBoxGeometry`, keyed by a canonical content key of the specs, so a new but equal spec array reuses the geometry; it is deliberately **not** shared between components, so each owner disposes only what it built | `apps/client/src/game/scene/board/tiles/tilePanelLayout.ts`, `apps/client/src/game/scene/board/geometry/MergedRoundedBoxes.tsx` |
| PERF-01/02 (cause) | The unstable `tiles` array itself | `useBoardTiles`: derives the localized tiles, then shares unchanged tile objects and the whole array with the previous committed value by comparing every field; a changed owner, house count, name or language yields a new object and array, so consumers update exactly as before | `apps/client/src/game/scene/board/stableTiles.ts`, `apps/client/src/game/scene/board/Board3D.tsx` |
| PERF-15 | The destination-preview frame `ShapeGeometry` is built in a memo and passed to the mesh as a prop; R3F disposes only objects it created from JSX, so each move left one geometry behind | `useDestinationFrameGeometry` disposes it when its sizes change or the preview unmounts | `apps/client/src/game/scene/board/tiles/TileDestinationPreview.tsx` |
| PERF-05 (dice) | The dice-trail materials were created inside `DiceMotionTrail`, which exists only while a roll plays, and the contact-shadow `ShaderMaterial` inside `DiceContactShadowBatch`, which exists only while dice are visible; both were disposed with their component, releasing their program, so the next roll or reset linked it again | `DiceLayer`, which lives as long as the scene, owns both (`useDiceTrailMaterials`, `useDiceContactShadowMaterial`); the trail count follows the quality tier and the materials are replaced and disposed only when it changes | `apps/client/src/game/scene/dice/DiceLayer.tsx`, `apps/client/src/game/scene/dice/DiceContactShadowBatch.tsx` |
| PERF-05 (preview) | The two preview materials were JSX children of a preview that mounts once per move and unmounts right after | `Board3D` owns the pair (`useDestinationPreviewMaterialsOwner`) and provides it by context; a preview borrows it, sets its colors and drives its opacity, and falls back to a pair of its own, disposed with it, only when there is no board | `apps/client/src/game/scene/board/tiles/TileDestinationPreview.tsx`, `apps/client/src/game/scene/board/Board3D.tsx` |
| PERF-05 (puff) | Each construction burst created its own `MeshStandardMaterial` and disposed it with the puff (1 re-link per build in the post-fix trial run) | `TubeHouseInstances`, which lives as long as the houses layer, owns one puff material (`useConstructionPuffMaterial`); the owner color already travels in the instance colors | `apps/client/src/game/scene/buildings/ConstructionPuff.tsx`, `apps/client/src/game/scene/buildings/TubeHouseInstances.tsx` |

Design notes. The mesh, material and geometry of the highlight batch are one lifecycle because the audit's symptom (re-link) is
exactly "material disposed and recreated"; `dispose()` is safe to call repeatedly because three.js re-creates GPU resources on
the next render, which is what React's development double-mount relies on. Merged geometries are owned per component rather than
cached globally because ownership then stays one-to-one: there is no reference count to get wrong, no global state to bound and
no consumer that can be left holding a disposed geometry; the cost is one extra small geometry when two Tax tiles mount, once.
The panel layout cache holds only small immutable objects, so evicting an entry can lose identity stability but never
correctness. Effect materials are owned by the nearest component that is mounted for the whole scene, because a shader program
is released when its last material is disposed, and a transient effect that creates and disposes its own material pays the link
again on every use. The first use of each program in a session is still a first-use link; removing that cost is batch B3.

## 5. Measurements: B0 baseline and after B1

Conditions: [§2](#2-test-machine-and-how-it-differs-from-the-phase-a-reference). Both bundles are unminified production-React UAT
builds (`VITE_PHASE4_UAT=1`, `--minify false`) of clean commits: baseline from B0 `3790870`, after from B1 `fedbf49`; the same
driver, the same Chrome and the same machine in the same session. The baseline is the B0 code (harness fixed, B1 not applied), so
the difference is B1 alone. Raw reports, with the full environment of each run, are in [08B_evidence/](./08B_evidence/); a
stage of the baseline whose report says `workingTreeDirty` was run while uncommitted B1 edits sat in the working tree; the bundle
it measured was built beforehand from the clean B0 commit and does not contain them.

### 5.1 Required comparison (Balanced, FPS cap 60, diagnostics on, warm walk replay unless stated)

| Metric | B0 baseline | After B1 | Improvement |
| --- | --- | --- | --- |
| Warm replay program links (walk, per replay) | 17 | **0** | −17 (100 %) |
| React task P95 (walk) | 28.9 ms | 10.1 ms | −18.8 ms (65 %) |
| Warm walk frame interval P95 | 41.6 ms | 27.9 ms | −13.7 ms (33 %) |
| Warm walk frame interval P99 | 54.2 ms | 34.7 ms | −19.5 ms (36 %) |
| Maximum frame interval (walk) | 62.5 ms | 41.7 ms | −20.8 ms (33 %) |
| Geometry growth after 30 replays | +30 | **0** | −30 (100 %) |
| Heap growth after 30 replays (after GC) | +5.14 MB | +2.37 MB | −2.77 MB (54 %) |
| GPU frame time, median / P95 (walk) | 11.7 / 26.0 ms | 11.9 / 20.7 ms | median unchanged (+0.2 ms); P95 −5.3 ms |
| Effective FPS during animation (walk) | 40.3 | 41.4 | +3 %, **within the ±4 % noise of vsync-divisor pacing at 144 Hz** |

Same comparison with the cap removed (cap 240, so scheduler pacing no longer quantizes the cadence):

| Metric | B0 baseline | After B1 | Improvement |
| --- | --- | --- | --- |
| Warm walk frame interval P95 / P99 / max | 55.5 / 69.4 / 83.3 ms | 20.9 / 48.5 / 55.6 ms | −62 % / −30 % / −33 % |
| Walk intervals over 50 ms (five replays) | 39 | 2 | −95 % |
| Effective FPS during animation (walk) | 54.3 | 57.9 | +7 % |
| React task P95 / frame CPU P95 (walk) | 35.7 / 40.9 ms | 11.3 / 5.0 ms | −68 % / −88 % |
| GPU frame time median (walk) | 11.2 ms | 11.4 ms | unchanged |

### 5.2 Per-scenario results (Balanced, cap 60, diagnostics on; per warm replay, five replays)

| Scenario | Program re-links | React task P95 | Frame CPU P95 | Main-thread shader waits | Long animation frames | Interval P95 / max |
| --- | --- | --- | --- | --- | --- | --- |
| dice | 11 → **0** | 31.1 → 21.6 ms | 16.9 → 5.7 ms | 96 → 0 ms | 107 → 0 ms | 34.7 / 76.3 → 27.9 / 34.9 ms |
| walk | 17 → **0** | 28.9 → 10.1 ms | 20.2 → 5.6 ms | 169 → 0 ms | 184 → 12 ms | 41.6 / 62.5 → 27.9 / 41.7 ms |
| purchase | 7 → **0** | 18.3 → 6.3 ms | 11.6 → 5.1 ms | 70 → 0 ms | 38 → 0 ms | 27.7 / 48.6 → 27.9 / 48.6 ms |
| rent | 7 → **0** | 18.4 → 5.7 ms | 13.3 → 4.8 ms | 78 → 0 ms | 84 → 0 ms | 27.8 / 34.7 → 27.9 / 34.8 ms |
| build (`house-2`) | 9 → **0** | 20.0 → 7.1 ms | 21.1 → 5.7 ms | 143 → 0 ms | 216 → 0 ms | 34.7 / 55.5 → 27.8 / 34.7 ms |
| hover (18 tiles, per sweep) | 19 → **0** | 20.9 → 7.9 ms | 13.4 → 5.8 ms | 103 → 0 ms | 0 → 0 ms | isolated frames |

Over five warm walk replays the browser's long-animation-frame time fell from 920 ms (14 frames) to 59 ms (1 frame) with
diagnostics on, and from 320 ms to **0 ms** with diagnostics off (production-style scene tree: walk React task P95 24.1 → 9.7 ms,
frame CPU P95 13.0 → 5.5 ms, interval P99 48.6 → 34.8 ms, max 69.4 → 48.5 ms).

### 5.3 Low and High tiers (cap 60, diagnostics on)

| Tier | Walk re-links | Walk React task P95 | Walk interval P95 / P99 / max | Walk frame CPU P95 | GPU median | 30-replay geometry / heap |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 16 → **0** | 22.7 → 10.0 ms | 33.3 / 41.7 / 55.6 → 27.8 / 33.3 / 34.8 ms | 12.8 → 4.6 ms | 6.8 → 7.7 ms | +30 → 0 / +5.40 → +2.18 MB |
| High | 17 → **0** | 33.2 → 13.7 ms | 173.6 / 187.7 / 194.5 → 83.2 / 97.2 / 111.2 ms | 171.7 → 7.4 ms | 77.6 → 48.9 ms | +30 → 0 / +5.52 → +2.47 MB |

Observations that are not explained by B1's changes and are reported as observed: the High tier's GPU median fell from 77.6 to
48.9 ms and its frame interval roughly halved, although B1 removes no GPU work (the shader links and buffer uploads it removed
plausibly competed with GPU work on a shared-memory iGPU; the mechanism was not isolated). The High tier's count of intervals over
50 ms rose from 93 to 122 only because it now renders more frames in the same time (every interval is shorter). The Low tier's
median GPU time and effective FPS moved by amounts within run noise (6.8 → 7.7 ms, 45.0 → 43.1) and the one idle blip is described
in [§3.1](#31-the-harness-feedback-loop-perf-17). The Phase A "slow first frames of every animation burst" and tier-switch freeze
findings (PERF-11, PERF-12) were not measured here.

### 5.4 Memory and resources over repeated replays

| Run | Heap at replay 0 / 30 / 60 / 90 (after GC) | Geometries | Textures, programs |
| --- | --- | --- | --- |
| B0, Balanced, diagnostics on, 30 replays | 20.50 → 25.64 MB (+5.14; +2.1, +1.4, +1.7 per ten replays) | 122 → 152 (+30) | 52 → 52, 42 → 42 |
| B0, Balanced, diagnostics off, 30 replays | 20.39 → 25.24 MB (+4.86) | +30 | unchanged |
| After B1, Balanced, diagnostics on, 30 replays | 20.00 → 22.37 MB (+2.37; +1.5, +0.5, +0.4 per ten) | 118 → 118 (**0**) | 52 → 52, 43 → 43 |
| After B1, Balanced, diagnostics off, 30 replays | 19.93 → 21.92 MB (+1.99) | **0** | unchanged |
| After B1, Balanced, diagnostics off, **90** replays | 19.91 → 21.84 → 22.34 → 22.49 MB (+1.93, +0.50, +0.15) | 118 at every sample | unchanged |

The growth after B1 is a settling step in the first replays (JIT, caches) that levels off: 0.65 MB over replays 30–90. V8
allocation sampling of the objects still alive after 30 walk replays, same driver, explains what B1 removed: the baseline retains
5.0 MB, dominated by the audited sites (WebGL vertex-binding state of the 30 leaked geometries 1.16 MB, the string-keyed state map
and its frame callback 1.5 MB, rounded-box rebuild debris 0.2 MB); after B1 those sites are gone (binding state 43 KB) and 2.2 MB
remain, spread over many small React/R3F allocation sites with no dominant owner. The residual is therefore not attributable to
any B1-scope owner; the raw 30-replay figure still misses the ≤ 1 MB target ([§6](#6-targets-from-phase-a-and-their-results)).

## 6. Targets from Phase A and their results

| Target (Phase A K / task) | Result | Verdict |
| --- | --- | --- |
| Warm gameplay replay: 0 unnecessary program links | 0 in every scenario at Low, Balanced and High, cap 60 and 240, diagnostics on and off (dice, walk, purchase, rent, build, hover, soak) | **PASS** |
| Hover sweep: 0 program links | 0 per sweep at all three tiers | **PASS** (R3F commits per sweep are unchanged at 19: that is B2) |
| Geometry growth after 30 repeated replays: 0 | 0 at all three tiers; 0 over 90 replays | **PASS** |
| Heap growth after 30 replays ≤ 1 MB (after warm-up and GC) | +2.37 MB (diagnostics on), +1.99 MB (off) after 3 warm-up replays; +0.65 MB over the following 60 replays | **NOT MET** as measured (54–59 % lower than before; bounded, not a leak; residual spread over small React/R3F sites) |
| React task P95 ≤ 8 ms | purchase 6.3, rent 5.7, build 7.1, hover 7.9 ms: met; walk 10.1, soak 10.0, dice 21.6 ms (all Low/High walks 10.0 / 13.7): not met | **PARTIAL**; the method differs from Phase A's CPU-profile attribution |
| Avoid significant main-thread stalls from resource reconstruction | Main-thread synchronous shader waits 70–169 ms per replay → 0; long animation frames per walk replay 184 → 12 ms; walk frame CPU P95 20.2 → 5.6 ms | **PASS** |
| Idle: 0 scene submissions in 10 s | 0 in every window except one Low window with 1 submission (unexplained, not reproduced in 13 reruns) | **PASS with one recorded exception** |
| Do not claim B1 solves GPU time | GPU median unchanged on Balanced (11.7 → 11.9 ms) | Stated: GPU cost reductions belong to B5 |

## 7. Visual regression

Method: `scripts/perf/captureCompare.mjs` renders the same settled harness states from the B0 bundle and the B1 bundle in the
same Chrome on the same GPU (Intel UHD 0x9A60), 1280×720, devicePixelRatio 1, and compares every pixel
([scripts/perf/README.md](../../scripts/perf/README.md#visual-equivalence)). Tolerance 0: any differing pixel counts.

| State | Result |
| --- | --- |
| Complete board, Low / Balanced / High | identical |
| Jail tile, Tax tiles 4 and 38, property tile 1 (crops) | identical |
| Landmarks (all hotel-tier streets), maximum houses, four standees on one tile, four stations | identical |
| End states of walk (Balanced and Low), purchase, rent, two houses, hotel, jail fixtures | identical |
| Dice settled (two rolls) | **1910 differing pixels (0.207 %), maximum channel delta 109, all on the dice silhouette edges** |

18 of 19 states are bit-identical. The dice state is not deterministic between two captures of the *same* bundle: B0 against
itself differs in 1586 pixels and B1 against itself in 917, with the same edge-only pattern (the settled dice's sub-pixel pose is
not reproducible from run to run in this fixture), so the cross-bundle difference is of the same kind and size as the capture's
own noise and is **not attributed to B1**; it is reported, not classified as equal. The source of that run-to-run variation (a
pre-existing property of the `dice-contact-shadows` fixture or of the settled dice) was not investigated.

SwiftShader (software WebGL, not tied to the GPU) repeat of eight states (complete board, Jail, both Tax tiles, standees, hotel
end, walk end, dice settled): 7 of 8 bit-identical; dice settled again differs (1901 pixels, maximum channel delta 98), and again
equally between two captures of one bundle (B0 against itself 31,168 pixels, B1 against itself 2,141), so on both renderers that
state is not reproducible between captures and carries no B1 signal. Reports: `visual_*.json` in [08B_evidence/](./08B_evidence/).
Reduced motion, the legacy fallback board and reconnect snapping have unchanged tests and passed in the full suite; they were
not re-captured pixel by pixel.

### 7.1 Mid-animation checks (final review, 2026-10-17)

Mid-animation pixels depend on frame timing, so only what could be made reproducible is compared pixel by pixel, and the rest is
checked structurally. The determinism of each method was tested first (a control: the same bundle captured twice).

| Animation | Method | Result |
| --- | --- | --- |
| Tile impact: depression, rebound and the additive highlight (the `TileImpactHighlightBatch` output), landing on a property tile, a Tax tile and the Jail corner | `scripts/perf/captureMotion.mjs`: the harness's `?tile-impact-probe=1` freezes the tile-motion clock; the canvas is captured at fixed simulated times (0–300 ms) and compared pixel by pixel, tolerance 0 | **26 of 26 frames identical** (Balanced tiles 1, 4, 10: 10 + 6 + 6; Low tile 1: 4). The control (B0 against B0) is also 26 of 26 identical, and in every one of these scenes successive times show a different picture (9 of 9, 5 of 5, 5 of 5, 3 of 3), so the identical frames are frames of a moving animation. The High-tier scene captured 4 identical frames, but its frames do not change over time in this capture path (0 of 3), so they carry **no evidence** and are not counted |
| Dice roll with trails and contact shadows, hops, destination preview, construction bursts | Playwright fake clock (`page.clock`) stepped in 8–20 ms steps with up to 220 ms real settling | **Not reproducible**: the B0 bundle against itself, and the B1 bundle against itself, gave different frames at every checkpoint (about 6,000–7,000 differing pixels), as large as the B0-against-B1 difference. **No pixel-equivalence claim is made for these animations.** Settled end states of the same fixtures are bit-identical ([§7](#7-visual-regression)) apart from the dice-settled state noted there. An attempt to pin the destination preview in a steady state (Reduced Motion fixture) failed because the harness's preview diagnostics did not appear within 30 s, so no preview frame was captured |

Because pixels cannot settle those animations, they were checked structurally in a real browser
(`scripts/perf/lifecycleCheck.mjs`, which inspects the live three.js scene graph and materials while the harness plays them; run on
the B0 bundle, the B1 bundle and the Vite development server with React StrictMode; reports in [08B_evidence/](./08B_evidence/)):

| Fact observed over four replays per fixture (Balanced) | B0 bundle | B1 bundle |
| --- | --- | --- |
| Distinct highlight materials in the scene | 33–57 | **1** |
| Distinct dice contact-shadow materials | 5 | **1** |
| Distinct destination-preview material pairs | 4 | **1** |
| Distinct dice trail materials (expected 1 per die on Balanced) | 8–16 | **2** |
| Distinct construction-puff materials | 8 | **1** |
| Trails visible during rolls (dice fixture: scene samples, 25 ms apart, with a visible trail of opacity above 0) | 308 samples | 316 samples; maximum trail opacity 0.05 in both |
| Destination preview present during the walk, opacity range | 171 samples, surface 0.12–0.37, edge 0.42–0.88 | 193 samples, surface 0.12–0.37, edge 0.42–0.88 (the documented pulse range), mover color `f2384a/bd2033` |
| Construction puffs present during a build, material | 96 samples | 114 samples, `MeshStandardMaterial`, opacity 0.86, vertex colors on, 11 particles |
| Live tier switch low → balanced → high → balanced → low with replays at each step: trail materials | not asserted | 0 / 2 / 4 / 2 / 0 as designed; highlight material 1 at every tier; geometries 115 → 116 over the cycle (B0: 118 → 127) |
| Forced WebGL context loss (unmounts the whole board, legacy fallback takes over) | falls back, 0 page errors | falls back, **0 page errors** |
| Console warnings and errors | 6 distinct messages | the **same** 6 distinct messages with the same counts: three.js `Clock` deprecation, HLSL precision notes, `toNonIndexed`, and the deliberate context-loss error; nothing new, nothing about disposed or incomplete resources |

All persistence and effect-drawn assertions pass on the B1 bundle and on the development server (where React StrictMode mounts,
unmounts and remounts every component, the dispose-then-reuse path); run with the same assertions, the B0 bundle fails the
persistence ones, so the check does detect the old behavior. The hotel fixture draws no puffs in either build (its transition
scales the old houses). This is structural evidence of ownership and drawing, **not** pixel evidence.

## 8. Resource lifecycle verification and tests

Every new test below was run against the pre-fix code where that was possible and **fails there**: the Jail cell was merged 21
times across 20 re-renders and the Tax visual 42 times (2 and 1 after the fix); the harness re-rendered the board 43 times for 40
diagnostics events (0 after); the dice layer disposed the trail materials after a roll. Lifecycle tests assert creation count,
`dispose` events and identity across re-renders, unmount, mount/unmount cycles and tier changes.

| Subject | Tests |
| --- | --- |
| Diagnostics observe, never drive | `measurementScheduler.test.ts` (no frame request after mount, 10 s of nothing, bounded retries, dispose), `localDiagnostics.test.ts`, `DiagnosticsReadouts.test.tsx`, `Phase4UatHarness.diagnostics.test.tsx` (board render count) |
| Highlight resources | `TileImpactHighlightBatch.resources.test.ts`: one mesh/material/geometry across re-renders, disposal on unmount and on tile-set change, writes only changed tiles, state bounded after 2000 frames, output equals the previous builder's |
| Panel layout cache | `tilePanelLayout.cache.test.ts`: identity for equal inputs, frozen, board uses a handful of entries, bounded to 64, LRU eviction |
| Merged geometry | `MergedRoundedBoxes.hook.test.ts` (canonical key, reuse, dispose on change/unmount, no sharing between owners), `specialVisualRebuild.test.tsx` (Jail/Tax merge counts across 20 re-renders, also with a new panel object each render) |
| Stable tiles, language | `stableTiles.test.ts`: equal data keeps identity, a change gives a new object only for that tile, language switch updates names and returns |
| Preview geometry and materials | `TileDestinationPreview.geometry.test.ts` (30 moves release 30 geometries), `TileDestinationPreview.materials.test.tsx` (board-owned pair never disposed by a preview, fallback ownership) |
| Dice and puff materials | `diceTrailMaterials.test.ts`, `diceLayerMaterialLifetime.test.tsx` (the real `DiceLayer` through show/roll/settle/hide cycles and tier changes), `constructionPuffMaterial.test.ts` |
| Tooling | `scripts/perf/metrics.check.mjs`, `compareResults.check.mjs`, `pngDiff.check.mjs` (26 tests) |

Checks run at the final commit: see [§10](#10-acceptance-checklist). Real-GPU behavior (program-link counts, geometry/heap trends,
idle) is verified by the benchmark counters above; jsdom cannot link a shader, so the unit tests prove ownership and the
benchmark proves the effect.

## 9. Known limitations and remaining work

### 9.1 Open follow-up items (carried forward, criteria unchanged)

The two Phase A targets that B1 did not meet stay **open**. Their original criteria are repeated verbatim and are not weakened by
this record; the owning batch inherits them.

| ID | Original criterion | Measured after B1 | Status | Owner |
| --- | --- | --- | --- | --- |
| B1-OPEN-1 | Heap growth after 30 repeated replays ≤ 1 MB, evaluated after appropriate warm-up and garbage collection ([08A K](./08A_PERFORMANCE_AUDIT.md#k-acceptance-criteria): ≤ +1 MB) | +2.37 MB (diagnostics on), +1.99 MB (off), 3 warm-up replays; bounded (+0.65 MB over the next 60 replays); the audited leak sites are gone and the residual is spread over small React/R3F allocation sites | **OPEN** | B2 (React fan-out: fewer per-render allocations), re-measured with `pnpm perf:benchmark --scenarios soak`; a 30–60 minute packaged session is still **NOT RUN** |
| B1-OPEN-2 | React task P95 during walk ≤ 8 ms ([08A K](./08A_PERFORMANCE_AUDIT.md#k-acceptance-criteria); target of the B1 task) | walk 10.1, soak 10.0, dice 21.6 ms (purchase 6.3, rent 5.7, build 7.1, hover 7.9 ms meet it); measured with this tool's method, which differs from Phase A's CPU-profile attribution | **OPEN** | B2 (a board render per presentation tick, hover and socket update is the remaining cost) |
| B1-OPEN-3 | Idle: 0 scene submissions in a 10 s window (08A K) | 0 in 17 of 18 B1 windows; one Low window with 1 scene submission, unexplained, not reproduced in 13 reruns | **OPEN** (monitor) | whoever next changes scene mounting; re-run `pnpm perf:benchmark --scenarios idle --assert-idle` on a fresh profile |

**Follow-up (batch B2, [08C](./08C_PHASE_B2_IMPLEMENTATION.md)):** B1-OPEN-2 is met (React task P95 1.1–4.4 ms in every scenario at
every tier); B1-OPEN-1 is met after 30 warm-up replays (+0.65 MB) and not with the 3-warm-up protocol used here (+2.00 MB; the residual is
compiled-code growth); B1-OPEN-3 stays open.

These three rows are also in the pull request description. No verdict in [§6](#6-targets-from-phase-a-and-their-results) or
[§10](#10-acceptance-checklist) was changed by the final review.

### 9.2 Limitations

- **Remaining GPU cost** (batch B5): Balanced GPU median 11.9 ms on this iGPU (Phase A: 17.6–19 ms on the reference), image-based
  lighting on every PBR material, the PBR tabletop, DPR policy, the High tier's post chain (about 49 ms per frame here).
- **Remaining main-thread cost** (batch B2): hover still produces one R3F commit per tile change (19 per sweep) and a full board
  React render per presentation tick; React task P95 on walk/soak/dice is 10–22 ms.
- **First-use and cold-cache shader compilation** (batch B3): not measured here and unchanged; the first use of each program
  variant per session still links on the main thread.
- **Scheduler pacing** (batch B4): at cap 60 on this 144 Hz display the cadence quantizes to 3 or 4 vsyncs (PERF-06); effective FPS
  at cap 60 is not a reliable B1 metric on it. Owner decision on the pacing policy is still open.
- **Heap**: the ≤ 1 MB target after 30 replays is not met; the residual is bounded but not attributed to one owner.
- **Idle**: one unexplained non-zero Low-tier window ([§3.1](#31-the-harness-feedback-loop-perf-17)).
- **Not measured**: the Phase A reference laptop, Electron, battery power, other GPUs, other refresh rates, long (30–60 minute)
  sessions, multiplayer over a network, audio, compositor-level presentation.
- The diagnostics component is not mounted in production (both build flags are `false`), but its code is still present in the
  production `GameScene` chunk as unreachable-at-runtime code, because the gate is a function call the bundler does not fold. The
  runtime cost is gone (no mount, no per-frame subscription); the bytes are not.
- The dice-settled capture is not pixel-deterministic between runs of the same bundle ([§7](#7-visual-regression)).
- `e2e/visual/refinement.visual.ts` still contains the workaround that suppresses the diagnostics event before it measures idle
  submissions. The B0 fix makes it unnecessary, but the SwiftShader visual suite was not run here, so the workaround was left in place
  rather than removed unverified.
- The B0 success criterion "harness walk links per replay equal the production-like count" is met on the B0 code (17 with the
  diagnostics on, 17 with them off); the pre-fix harness walk count (52 in Phase A) was not re-measured here, only the idle loop was.

## 10. Acceptance checklist

| Item | Status |
| --- | --- |
| B0: harness idle behavior corrected (0 scene submissions in 10 s) | PASS (62 → 0) |
| B0: benchmark scripts runnable and documented | PASS (`scripts/perf/README.md`, 26 unit tests) |
| B0: baseline recorded before B1 code (Low / Balanced / High, all scenarios) | PASS ([08B_evidence/](./08B_evidence/)) |
| B0: measurement overhead evaluated | PASS ([§3.3](#33-measurement-overhead)) |
| B1: 0 unnecessary shader program links in warm replays and the hover sweep | PASS |
| B1: geometry rebuilds on re-render eliminated (Jail, Tax) | PASS (merge counts 21/42 → 1/2 across 20 re-renders) |
| B1: highlight state map bounded; preview geometry released | PASS |
| B1: dice, preview and puff materials persistent | PASS (re-links 0; lifecycle tests) |
| B1: heap growth after 30 replays ≤ 1 MB | **NOT MET** (+2.37 MB; +5.14 MB before) |
| B1: React task P95 ≤ 8 ms | **PARTIAL** (met in four of seven scenarios) |
| Visual equivalence | PASS for 18 of 19 states bit-identical; dice-settled differs only at the silhouette and equally between two captures of one bundle |
| Gameplay contracts unchanged (protocol, schema, rules, server) | PASS (no server, shared or protocol file changed) |
| `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm validate:docs` | PASS at the final commit, with one qualification: in the root `pnpm test` the server package reported one worker crash ("Worker exited unexpectedly", 28 of 29 files); `pnpm --filter @monopoly/server test` alone then passed 29 of 29 files and 559 tests. No server code changed. Client 240 files / 2429 tests, desktop 35 files / 519 tests (6 skipped), perf tools 26, docs validator PASS (139 files) |
| GitHub Actions on the pull request | recorded in the pull request |

## 11. Recommendation for the next batch

Run B2 (narrow the React fan-out) next: B1 removed the *cost* of each board re-render but not the re-render itself. Every
presentation tick, hover change and socket update still renders `Board` → `GameScene` → the whole R3F tree and applies new props
to R3F objects, which is what keeps React task P95 at 10–22 ms on walk and dice, produces 19 R3F commits per hover sweep and costs
the rest of the heap settling. B2 can now be measured against this baseline with the same tool (`pnpm perf:benchmark`), and
its success criteria (hover sweep: 0 R3F commits; volume slider drag: 0 R3F commits) are counters the probe already reports.
After B2, B3 (shader warm-up) is the right place for the first-use link of the persistent materials introduced here. Do not start
B5 (GPU cost) on this machine alone: its Balanced GPU time (11.9 ms) is already under the 16.7 ms budget; take the reference
laptop (or another GPU-bound device) measurement first and decide the pacing policy (B4/PERF-06) before judging FPS.

## 12. Commits

| Commit | Content |
| --- | --- |
| `3790870` | B0: diagnostics feedback loop fix, benchmark tooling and tests |
| `fedbf49` | B1: GPU-resource ownership fixes, regression tests, visual-compare tooling |
| (this record) | Documentation, canonical instruction and checklist updates, evidence reports |

Branch `perf/phase-b0-b1-render-stability`, started from `origin/main` `c2f989275527e94694dcf827ace296add1de4246`.

## 13. Final review of pull request #15 (2026-10-17)

Reviewed head `ee94dc1f9b3cf80d1eab4c7bf342370f96ef247e`: the `CI / build` and `Docs / validate-docs` checks were SUCCESS, the pull
request was mergeable and clean. No code was changed by the review; it added verification tooling, evidence and this section.

**Scope.** `git diff c2f9892..ee94dc1 --name-only` lists no file under `apps/server`, `packages/shared`, `apps/desktop`,
`services`, `e2e` or `.github`: no game rule, socket protocol (v14), snapshot schema (11), persistence or server logic changed. The
client changes are limited to `apps/client/src/game/scene/` (render ownership), `apps/client/src/dev/phase4-uat/` (dev harness),
their tests, `eslint.config.js` (browser globals for `scripts/perf/`) and `package.json` scripts.

**GPU resource ownership, one row per shared resource.**

| Resource | Owner (lifetime) | Borrowers | Disposed by | Checked by |
| --- | --- | --- | --- | --- |
| Highlight mesh, material, geometry | `TileImpactHighlightBatch` hook (tile-id set × motion controller) | none | owner effect cleanup | unit tests; live scene: 1 material across replays and tier switches |
| Merged Jail/Tax geometry | each `MergedRoundedBoxes` (spec content) | none (not shared) | owner effect cleanup | unit tests; merge counts 1 and 2 across 20 re-renders |
| Preview frame geometry | `TileDestinationPreview` | none | owner effect cleanup | unit tests (30 moves release 30) |
| Preview material pair | `Board3D` (scene) | every preview, through context | `Board3D` unmount; a preview disposes only a fallback pair it created itself | unit tests; live scene: 1 pair, mover color and pulse range correct |
| Dice trail materials | `DiceLayer` (scene), count from the tier | trail meshes | `DiceLayer` unmount or a tier change of the count | unit tests through the real layer; live scene and tier cycle |
| Contact-shadow material | `DiceLayer` (scene) | `DiceContactShadowBatch` | `DiceLayer` unmount | same |
| Construction-puff material | `TubeHouseInstances` (houses layer) | every `ConstructionPuff` of a build | houses-layer unmount | unit tests; live scene: 1 material, expected properties |

Risks looked for and the evidence: a borrower disposing a shared resource (borrowers use `dispose={null}`; the live scene shows
materials surviving every preview, roll and build); use after dispose on unmount/remount (hooks tolerate repeated `dispose`,
three.js re-creates GPU resources on the next draw; the check passes under React StrictMode on the development server and across
mount/unmount cycles in the unit tests); a stale value on a shared material (the preview sets its colors in a layout effect and
its opacity every frame before drawing; the live range and mover color are correct); a context loss unmounting the board (falls
back to the legacy board with no page error). Nothing was found that required a code change.
