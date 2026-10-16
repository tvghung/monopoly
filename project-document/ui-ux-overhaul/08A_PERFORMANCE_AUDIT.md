# 08A — Phase A: Performance and Graphics Audit

> **REFERENCE** — Phase A investigation of 2026-10-16 at commit `e410dee` (v1.9.1 + release record). It records
> measurements, findings and a proposed Phase B plan; nothing in it is an implemented rule, and every Phase B item is a
> proposal until the owner approves it. Current rendering rules: [game board instruction](../monopoly-websockets/Client/game-board.instruction.md);
> graphics/FPS settings: [settings and audio instruction](../monopoly-websockets/Client/settings-and-audio.instruction.md).

| Item | Value |
| --- | --- |
| Scope | Frame scheduling, frame-time stability, Three.js/GPU cost, React reconciliation, animation timing, graphics presets, load and memory behavior of the 3D board (client only) |
| Code inspected | `apps/client/src/game/scene/`, `apps/client/src/game/presentation/`, `apps/client/src/components/Board.tsx`, `apps/client/src/settings/`, `apps/client/src/audio/`, `apps/client/src/game/ui/`, `apps/client/src/dev/phase4-uat/`, `apps/desktop/src/desktopBootstrap.ts` |
| Runtime evidence | Real Chrome 155 and real Electron 43 on this machine's Intel GPU, production-mode React build of the UAT harness, external probes only (no application code changed) |
| Repository changes | This file only |
| Phase A status | **COMPLETE** for the audit on the available device; device-coverage measurements that need other hardware are **BLOCKED** and listed in [L. Remaining Unknowns](#l-remaining-unknowns) |

## Contents

- [A. Executive Summary](#a-executive-summary)
- [B. Current Rendering Architecture](#b-current-rendering-architecture)
- [C. FPS and Frame Scheduling Assessment](#c-fps-and-frame-scheduling-assessment)
- [D. Performance Findings](#d-performance-findings)
- [E. Graphics Quality Assessment](#e-graphics-quality-assessment)
- [F. Existing Strengths](#f-existing-strengths)
- [G. Benchmark Results](#g-benchmark-results)
- [H. Root Cause Analysis](#h-root-cause-analysis)
- [I. Proposed Performance Architecture](#i-proposed-performance-architecture)
- [J. Phase B Implementation Roadmap](#j-phase-b-implementation-roadmap)
- [K. Acceptance Criteria](#k-acceptance-criteria)
- [L. Remaining Unknowns](#l-remaining-unknowns)
- [Appendix 1: Reproduction protocol](#appendix-1-reproduction-protocol)
- [Appendix 2: Probe script](#appendix-2-probe-script)

---

## A. Executive Summary

The rendering architecture is sound in its foundations — demand rendering really does go idle in production, the scene is
heavily instanced (about 140 main-pass draw calls, under 82k triangles), camera motion bypasses React, and animations are
time-based. The stutter the owner sees is **not** caused by draw calls, by Three.js, or by the idea of a custom scheduler.
It comes from four measured causes that stack on top of each other, plus one confirmed scheduler pacing discrepancy that
only shows on displays whose refresh rate is not a multiple of the cap.

**Measured on the reference laptop** (ThinkPad T14 Gen 1, Intel Core i5-10210U, Intel UHD Graphics, 1920×1080 @ 60 Hz at
125 % scaling, Chrome 155 and Electron 43, AC power):

1. **The default experience is GPU-bound.** `auto` resolves to `balanced` on this machine. During animation the GPU needs a
   median **18–19 ms per frame** (budget 16.67 ms), so 22–43 % of frames miss a vsync and animation runs at **40–46 FPS**
   with intervals alternating between 16.7 and 33.3 ms. Even `low` needs 16.4–16.8 ms because, at this display's
   devicePixelRatio of 1.25, `low`, `balanced` and `high` all render at the same resolution. `high` needs 50–60 ms (15–19 FPS).
   Raising the FPS cap above 60 changes nothing on a 60 Hz panel (120/180/240 measured equal to 60 within noise).
2. **Every React re-render of the board needlessly recreates GPU resources.** `Board3D` builds a new `tiles` array on every
   render, so `TileImpactHighlightBatch` disposes and recreates its material (three.js then **re-links the identical shader
   program**) and `JailVisual`/`TaxVisual` rebuild their merged rounded-box geometry. A warm walk replay re-links that one
   program 14 times, blocking the main thread **17–58 ms per re-link while the GPU is busy**, and geometry rebuilding is
   **59 % of all React work**. These land at presentation ticks (hop boundaries, dice, cards, pass GO) and are a major
   contributor to the 50–117 ms interval spikes measured across the gameplay scenarios.
3. **The board re-renders far more often than anything visual changes.** `Board` subscribes to the whole presentation
   state, every socket `update`, hover change and settings change re-renders `Board` → `GameScene` → the whole R3F tree
   (only `GameHud` uses `memo` in the client). A hover sweep across 18 tiles produced 19 full scene re-renders and 19 shader
   re-links.
4. **Shaders compile synchronously on first use.** With an empty GPU shader cache (first launch, or after any update that
   changes Chromium or shader sources) Electron 43 — the packaged app's runtime, here loading the production bundle — spent
   **6.2 s** blocked in shader compilation and showed a **single 4.46 s frozen frame** before the board appeared. Each PBR
   program costs 150–220 ms cold. No warm-up (`compileAsync`) exists, although `KHR_parallel_shader_compile` is available.
5. **Scheduler pacing differs from its documented intent on non-divisor refresh rates (confirmed by deterministic
   simulation of the real class).** The next frame is due `lastFrameAt + 1000/cap`, where `lastFrameAt` is the vsync the
   frame actually landed on, so the delivered rate falls to the largest whole-vsync divisor at or below the cap: a 60 FPS
   cap delivers **48 FPS on 144 Hz, 55 on 165 Hz, 37.5 on 75 Hz**; a 120 cap delivers **72 FPS on 144 Hz**; a 180 cap
   delivers **120 on 240 Hz**. The canonical game-board instruction says the scheduler advances "at the selected FPS cap";
   which pacing policy is intended is an owner decision. On 60 Hz/120 Hz panels with precise timers it behaves as documented.

Secondary findings: image-based lighting (PMREM on every PBR material) costs **36 %** of balanced GPU time, the oak tabletop
**4–5 ms** on low/balanced (7.6 ms on high), the first 5–9 frames of every animation burst are 12–42 % slower (likely the
iGPU clocking up after idle), tier switches freeze the board for 0.2–0.6 s, a state map grows without bound (+40 entries per
board re-render) and one geometry leaks per move. The React development build multiplies long-frame time by about 3.8×, and the UAT harness has a diagnostics feedback
loop that keeps it from ever going idle — earlier benchmark conclusions ("`low` holds 60 FPS") were taken headless at
DPR 1.0 and partly from browser rAF cadence, so they do not describe this laptop's native experience.

**Recommendation:** enter Phase B. Fix first the GPU-resource churn on re-render (PERF-01/02, low risk, no visual change),
together with a measurement baseline that removes the harness artifacts (PERF-17/18); then shader warm-up (PERF-05), the
re-render fan-out (PERF-03), the scheduler pacing fix (PERF-06), and only then the Graphics 2.0 cost work (DPR, IBL,
tabletop, adaptive `auto`), which changes visuals and needs owner review.

---

## B. Current Rendering Architecture

### B.1 Stack (installed versions)

| Layer | Version / setting | Where |
| --- | --- | --- |
| Desktop shell | Electron 43.4.0 (Chromium 150.0.7871.224), no GPU or frame-rate switches, `contextIsolation`/`sandbox` on, window 1440×900 | `apps/desktop/src/desktopBootstrap.ts` |
| UI | React 19.2.8, Vite 8.2 | `apps/client/package.json` |
| 3D | three 0.185.1, @react-three/fiber 9.7.0 (`frameloop="never"`), troika-three-text 0.52.5 | `apps/client/src/game/scene/GameScene.tsx` |
| Post (high only, lazy chunk) | postprocessing 6.39.5, N8AO 2.0.1 (half-res), Bloom (mipmap), Vignette, Neutral tone mapping, composer `multisampling` 4 | `apps/client/src/game/scene/render/post/ScenePostEffects.tsx`, `apps/client/src/game/scene/render/post/postSettings.ts` |
| Context | WebGL2, `antialias: true`, `alpha: false`, `powerPreference: 'high-performance'`, PCF shadows (`shadows="percentage"`) in balanced/high | `apps/client/src/game/scene/GameScene.tsx:392-408` |
| Lighting | hemisphere fill + key (shadow caster) + rim directional; procedural studio PMREM assigned to `scene.environment` (all PBR materials) | `apps/client/src/game/scene/render/lighting/SceneLightRig.tsx`, `apps/client/src/game/scene/render/environment/StudioEnvironment.tsx:41-56` |

### B.2 From game state to a visible frame

```text
Socket.IO 'update' (full PublicRoomState)                  [App.tsx:542 onUpdate → applyRoom]
  ├─ setRoom → stateContext value (App.tsx:1091) ───────────────────────────────────┐
  └─ PresentationController.acceptRoomSnapshot                                        │
       derivePresentationEvents → AnimationQueue (executors await setTimeout waits)   │
       → presentationStore.notify() on every START/COMPLETE/impact/preview/transfer   │
            │                                                                          │
            ▼                                                                          ▼
  React DOM:  Board (usePresentation() = whole state; useContext(stateContext); hover/selection state)
              buildBoardRenderModel(...)  → new model, 40 new tile objects        [boardRenderModel.ts:103]
              → GameScene (no memo) → <Canvas frameloop="never">
  R3F reconciler: BoardSceneContents → Board3D (new `tiles` array) → 40 × TileAssembly, batches, layers
              useLayoutEffect: animations stamp start time with performance.now(); invalidate()
              any changed prop → applyProps → invalidateInstance → state.invalidate()   [R3F events chunk]
            │
            ▼
  DemandFrameScheduler.invalidate → schedule(): setTimeout until (lastFrameAt + 1000/cap − 1 ms), then rAF
  rAF(timestamp) → advance(timestamp/1000): flushGlobalEffects('before') → useFrame subscribers (priority −1000…0)
              → WebGLRenderer.render: shadow pass (balanced/high) → main pass → (high: composer passes)
              → flushGlobalEffects('after'); when no frame is pending: flushGlobalEffects('tail')
            │
            ▼
  Chromium: command buffer → GPU process (ANGLE → Direct3D 11) → compositor → vsync-locked present (60 Hz here)
```

The camera is a separate path: gestures and auto-focus write `boardViewStore`
(`apps/client/src/game/scene/camera/boardView.ts`), `FixedBoardCamera` applies the view to the camera and calls
`invalidate()` without a React render (`apps/client/src/game/scene/camera/FixedBoardCamera.tsx:309-314`). Camera animations
run their own `requestAnimationFrame` loop (`boardView.ts:197-208`).

### B.3 Frame scheduler (as implemented)

`apps/client/src/game/scene/render/demandFrameScheduler.ts`:

- `invalidate(frames)` raises `pendingFrames` (to at least 2 when called during a frame) and calls `schedule()`.
- `schedule()` computes `dueAt = lastFrameAt + 1000/fpsLimit` and, if that is more than 1 ms away, waits with `setTimeout`
  (lines 69-82); otherwise it requests an rAF.
- The rAF callback skips the frame if `timestamp + 0.5 < dueAt` (reschedules), else sets `lastFrameAt = timestamp`
  (line 94), calls `advance(timestamp / 1000)` and decrements `pendingFrames`; at zero it flushes R3F tail effects.
- Hidden documents cancel scheduled work; becoming visible reschedules. `setFpsLimit` cancels and reschedules.
- `GameScene` replaces the R3F store's `invalidate` with the scheduler's (`GameScene.tsx:351-371`), so R3F's
  `invalidateInstance` (every prop application) and every `useThree(s => s.invalidate)` caller feed one coalesced stream.
  No code imports R3F's global `invalidate`/`advance` (which would be no-ops under `frameloop="never"`).

### B.4 Quality tiers (as implemented)

`apps/client/src/game/scene/render/renderQuality.ts:30-70`. R3F clamps the device pixel ratio into the tier range
(`Math.min(Math.max(min, devicePixelRatio), max)`).

| Tier | DPR range | Shadows | Post | IBL intensity | Table texture | Other |
| --- | --- | --- | --- | --- | --- | --- |
| low | 1–1.25 | off (contact blobs) | off | 0.6 | 512, no roughness map | no table props, no paper grain, no dice trails |
| balanced | 1.25–1.5 | PCF 1024 | off | 0.7 | 1024 | 1 dice trail per die |
| high | 1.25–2 | PCF 2048 | N8AO + Bloom + Vignette + Neutral (composer MSAA 4) | 0.8 | 1024 + roughness map | 2 dice trails, dice cast shadows |
| auto | `low` if coarse pointer/small touch screen/maxTextureSize < 8192/≤ 4 logical cores, else `balanced`; never `high` | | | | | `renderQuality.ts:88-94` |

FPS limit options are 30/60/120/180/240, default 60, labelled "Giới hạn FPS" / "FPS Limit"
(`apps/client/src/settings/defaults.ts:8,21`).

---

## C. FPS and Frame Scheduling Assessment

### C.1 Terms used in this report

| Term | Meaning here | How it was measured |
| --- | --- | --- |
| FPS cap | The selected `fpsLimit` | Setting |
| Actual rendered FPS | Scene frames actually submitted per second **while an animation is running** | Scheduler rAF callbacks that produced a main render, see "contiguous intervals" in [G.2](#g2-methodology-and-metric-definitions) |
| Displayed FPS | Browser rAF cadence (what `FpsBadge` shows, dev/UAT only) | Not used for conclusions: it is 60 on this panel even when the scene renders at 26 |
| Animation update frequency | How often animated values are sampled = rendered frames (animations sample in `useFrame`) | Same as rendered FPS |
| Frame pacing | Distribution of intervals between consecutive rendered frames during an animation | p95/p99/max interval, late frames |
| CPU frame time | Duration of the scheduler's rAF callback (all `useFrame` work + `renderer.render` submission) | Wrapped callback |
| GPU frame time | GPU elapsed time of the frame's WebGL commands | `EXT_disjoint_timer_query_webgl2` `TIME_ELAPSED` around the scheduler callback |
| Presentation timing | When the compositor shows the frame | Approximated by the rAF timestamps of following frames (vsync-locked); not traced at compositor level |

### C.2 Answers to the scheduling questions

| # | Question | Answer (evidence) |
| --- | --- | --- |
| 1 | Is pacing stable at 30/60/120/180/240? | On this 60 Hz panel the scheduler itself paces correctly (precise timers), but the scene is GPU-bound so pacing is not stable at any cap ≥ 60: median 16.7 ms, p95 33–50 ms, 18–43 % late frames ([G.3](#g3-tier-and-fps-cap-matrix-walk-scenario)). At cap 30: median 33.3 ms, 5–6 % frames at 50 ms. 120/180/240 equal 60 on a 60 Hz panel. |
| 2 | Can setTimeout + rAF cause uneven intervals? | Not on 60 Hz/120 Hz with precise timers (timer lateness on an idle page: median 0.7–1.0 ms, p95 ~2 ms in Chrome and Electron). During gameplay, scheduler timers fire late (p95 12–35 ms) because the main thread is busy, which costs vsyncs; `low` at cap 240 (no timer path) had 21 % late frames vs 30 % at cap 60 (single runs, suggestive only). On non-divisor refresh rates the timer gate causes a deterministic rate loss (C.4). With a coarse 15.6 ms Windows timer tick the simulation predicts ~30 FPS at cap 60 on 60 Hz — **not measured** (battery mode unavailable here). |
| 3 | Is the manual R3F advancement correct? | Yes. `advance(timestampSeconds, false)` with explicit `before`/`after` global effects and `tail` on idle matches R3F's own loop; R3F sets `clock.elapsedTime` from the timestamp in `frameloop="never"` mode; the store's `invalidate` is replaced so `invalidateInstance` reaches the scheduler (verified in the installed R3F 9.7 source). |
| 4 | Are invalidations scheduled unnecessarily or missed? | **Unnecessarily, yes:** any React re-render that passes a new object/array/function prop to an R3F object triggers `invalidateInstance` → a full frame, even when nothing visible changed (every hover change, socket update, settings change; PERF-03). None were missed in the measured scenarios. |
| 5 | Can invalidations accumulate? | No. `pendingFrames` is coalesced (max(pending, 1 or 2); explicit counts capped at 60); one frame request is outstanding at a time. |
| 6 | Can animation updates / React state changes interfere with the frame loop? | **Yes, measured.** React tasks during a walk replay: median 9.0 ms, p95 23.5 ms, max 35.5 ms, 22 of 79 longer than a frame (production build). They run between frames and delay the next callback (callback start − rAF timestamp: median 1.2 ms, p95 14.8 ms, max 20.2 ms) and the scheduler's timers. |
| 7 | Are deltas handled correctly after delays? | R3F's `delta` spans the whole gap after idle (seconds); no animation integrates `delta` (only `CharacterBillboard` logs it for tracing), so no overshoot. Animations are wall-clock based, durations are honored at any cap. |
| 8 | Can long frames cause animation jumps? | Yes, by design: a 58 ms re-link stall makes a 180 ms hop skip a third of its arc in one step. Animation clocks also start at React commit/store emit (e.g. `apps/client/src/game/scene/dice/diceAnimationClock.tsx:40`, `apps/client/src/game/presentation/store/presentationStore.ts:325`), so a slow first frame (first-use shader compile) eats the beginning of an animation. |
| 9 | Do VSync/refresh rate influence observed FPS? | Yes. rAF is vsync-locked in Chrome and Electron (no flags change it in the shell), so caps above refresh are no-ops and GPU-bound frames quantize to 2× the vsync period. On non-divisor refresh rates the scheduler settles on the largest vsync divisor at or below the cap (C.4). |
| 10 | Are caps communicated as limits? | Label says "limit" (good). No indication of the display refresh rate, caps above refresh are offered without effect, and the only FPS readout (`FpsBadge`, dev/UAT) measures rAF cadence, not scene frames (`apps/client/src/game/ui/FpsBadge.tsx:78` says so). |
| 11 | Do animations keep invalidating when idle? | **Production-like: no** — 0 scene frames in 5–8 s idle windows in Chrome and in Electron. The destination preview invalidates every frame while mounted (by design, during movement). The UAT harness never goes idle (≈6 frames/s) because of a diagnostics feedback loop (PERF-17). |
| 12 | Focus loss/regain? | Scheduler stops when the document is hidden and restarts on visible; animations then jump to wall-clock state. The presentation queue has no visibility handling: its `setTimeout` waits are throttled while hidden/minimized (Electron `backgroundThrottling` default), so a backlog may play after restore — **hypothesis** (PERF-22). Blur without hiding does not throttle. |

### C.3 Measured pacing on this device

Walk scenario (dice roll → destination preview → 5 hops → landing), UAT harness, warm, Chrome 155, DPR 1.25, buffer
1871×860. "Late" = interval > 1.5× the expected interval.

| Tier / cap | Effective FPS during animation | Interval p95 / p99 / max (ms) | Late | GPU median / p95 (ms) |
| --- | --- | --- | --- | --- |
| low / 60 | 45.8 | 33.4 / 33.5 / 83.2 | 30 % | 16.8 / 21.7 |
| low / 240 | 49.2 | 33.4 / 50.0 / 50.0 | 21 % | 16.5 / 22.4 |
| balanced / 60 | 40.0 | 49.9 / 50.0 / 83.4 | 43 % | 19.0 / 25.7 |
| balanced / 60, production-like ("quiet") | 46.2 | 49.9 / 66.5 / 66.7 | 22 % | 18.0 / 23.0 |
| high / 60 | 15.2 | 133.1 / 183.1 / 299.4 | 84 % | 61.5 / 77.3 |

Full matrix in [G.3](#g3-tier-and-fps-cap-matrix-walk-scenario).

### C.4 Deterministic simulation of the real scheduler

The unmodified `DemandFrameScheduler` was driven through its injectable `FrameSchedulerHost` with a virtual clock (rAF at the
next vsync boundary, 4 ms frame CPU, a running animation that re-invalidates from inside the frame). Script in
[Appendix 1](#appendix-1-reproduction-protocol). Achieved FPS:

| Refresh \ cap (precise timers) | 30 | 60 | 120 | 180 | 240 |
| --- | --- | --- | --- | --- | --- |
| 60 Hz | 30 | 60 | 60 | 60 | 60 |
| 75 Hz | **25** | **37.5** | 75 | 75 | 75 |
| 90 Hz | 30 | **45** | 90 | 90 | 90 |
| 120 Hz | 30 | 60 | 120 | 120 | 120 |
| 144 Hz | **28.8** | **48** | **72** | 144 | 144 |
| 165 Hz | **27.5** | **55** | **82.5** | 165 | 165 |
| 240 Hz | 30 | 60 | 120 | **120** | 240 |

| Refresh \ cap (coarse 15.625 ms timer tick, hypothetical battery mode) | 30 | 60 | 120 | 180 | 240 |
| --- | --- | --- | --- | --- | --- |
| 60 Hz | 20 | **30.5** | 45.3 | 51.7 | 60 |
| 144 Hz | 21.3 | 32 | 64 | 64 | 144 |

Mechanism: the due time is anchored to the vsync a frame landed on (`lastFrameAt = timestamp`, line 94) instead of the
ideal schedule, so every frame inherits the previous rounding up; the interval becomes `ceil((1000/cap − 0.5)/vsync)`
vsyncs. Example 144 Hz, cap 60: due 16.67 ms → lands at 20.83 ms (3 vsyncs) → next due 37.5 → lands at 41.67 → steady
20.83 ms = 48 FPS. With precise timers, 10 of the 35 cells deliver less than a cap the display could reach.

**Recorded discrepancy (not resolved here, CLAUDE.md §7):** the effective policy is "the largest even-cadence vsync divisor
at or below the cap" (steady pacing, never above the cap). The canonical
[game board instruction](../monopoly-websockets/Client/game-board.instruction.md) says the scheduler calls `advance` "ở FPS
cap đã chọn" (at the selected FPS cap). Whether players should get an exact average (uneven 2/3-vsync cadence), the
nearest divisor (possibly above the cap), or the current floor behavior made visible in the menu is a product decision for
the owner; B4 implements the chosen policy and updates the canonical text.

### C.5 Verdict on the scheduler

**Retain and correct; do not redesign.** The coalescing, visibility handling, single-stream ownership of `invalidate` and
the manual `advance` are correct and are what makes idle cost zero. Required corrections (Phase B, B4), after the owner picks
the pacing policy above: vsync-locked pacing that renders on every n-th vsync with n derived from a measured refresh period
(no `setTimeout` pre-wait at caps ≥ refresh, so coarse timers cannot cost frames), an honest FPS menu (match display / half /
third, refresh shown), and a shared frame timestamp for animation sampling. Replacing the scheduler with R3F's
`frameloop="demand"` would not fix any measured problem (R3F's loop has no cap at all) and would lose the cap.

---

## D. Performance Findings

Status: CONFIRMED (reproduced/measured), LIKELY, HYPOTHESIS, NOT AN ISSUE, BLOCKED. Severity P0–P3. Line references are at
commit `e410dee`.

### D.1 Prioritized table

| ID | Finding | Subsystem | Status | Confidence | Severity |
| --- | --- | --- | --- | --- | --- |
| PERF-01 | Tile impact highlight material + mesh rebuilt on every board render; identical shader program re-linked (17–58 ms each while animating) | Scene / GPU resources | CONFIRMED | High | P1 |
| PERF-02 | Jail/Tax merged rounded-box geometry rebuilt on every board render (59 % of React task time) | Scene / React | CONFIRMED | High | P1 |
| PERF-03 | Whole board React tree re-renders on every presentation tick, socket update, hover change and settings change | React / presentation | CONFIRMED | High | P1 |
| PERF-04 | Default tier (auto → balanced) is GPU-bound on Intel UHD-class iGPUs at native DPR; no tier holds 60 FPS during animation there | GPU | CONFIRMED (this device) | High | P1 |
| PERF-05 | Synchronous first-use shader compilation: 4–6 s at cold start (one 4.46 s frame in Electron); per-use re-links of transient effects; no warm-up | GPU / load | CONFIRMED | High | P1 |
| PERF-06 | Delivered rate falls to the largest vsync divisor ≤ cap on non-divisor refresh rates (144 Hz: 60→48, 120→72) — differs from the documented "at the selected cap" | Scheduler | CONFIRMED (simulation of the real class); on-device BLOCKED; policy discrepancy open | High | P1 |
| PERF-07 | PMREM image-based lighting on every PBR material costs 36 % of balanced GPU time | GPU / lighting | CONFIRMED | High | P2 |
| PERF-08 | Oak tabletop costs 4–5 ms GPU per frame on low/balanced and 7.6 ms on high | GPU / table | CONFIRMED | High | P2 |
| PERF-09 | DPR policy: tiers collapse to one resolution on 125 % displays; balanced/high supersample on 100 % displays | Quality settings | CONFIRMED | High | P2 |
| PERF-10 | High tier: composer MSAA (~20 ms) and N8AO (~15 ms) on iGPU; canvas MSAA kept while the composer renders | Post | CONFIRMED (costs); double MSAA LIKELY | High / Medium | P2 |
| PERF-11 | First 5–9 frames of every animation burst are 12–42 % slower on the GPU; isolated frames ~2.5× slower | GPU / driver | CONFIRMED (measurement); cause LIKELY (clock ramp) | Medium | P2 |
| PERF-12 | Live tier switch freezes the board 0.2–0.6 s warm (longer cold) | Quality settings | CONFIRMED | High | P2 |
| PERF-13 | `auto` uses hardware heuristics only and picks balanced on iGPUs that cannot hold 60 FPS | Quality settings | CONFIRMED | High | P2 |
| PERF-14 | `TileImpactHighlightBatch` state map grows by 40 entries per board render, never cleared; JS heap +0.22 MB per walk replay | Memory | CONFIRMED | High | P2 |
| PERF-15 | Destination preview frame geometry is never disposed (+1 geometry per move) | Memory / GPU | CONFIRMED | High | P3 |
| PERF-16 | Load: ~430 ms of procedural texture generation and extra throwaway WebGL contexts on the main thread | Load | CONFIRMED | High | P2 |
| PERF-17 | UAT harness diagnostics feedback loop: scene never idle, extra re-renders and re-links; UAT numbers inflated | Tooling | CONFIRMED (harness only) | High | P2 |
| PERF-18 | Earlier benchmark method (headless DPR 1, rAF cadence, forced invalidation, SwiftShader counts) does not represent the native experience | Tooling / evidence | CONFIRMED | High | P2 |
| PERF-19 | React development build multiplies long-frame time ×3.8 | Process | CONFIRMED | High | P2 |
| PERF-20 | Coarse Windows timers (battery) would make the timer gate deliver ~30 FPS at cap 60 on 60 Hz | Scheduler | HYPOTHESIS (simulation) / BLOCKED on device | Medium | P2 |
| PERF-21 | Animation sampling uses `performance.now()` at callback time, clocks start at React commit, mixed time bases; hops chained by timer fire time | Animation | LIKELY (minor) | Medium | P3 |
| PERF-22 | Presentation queue has no visibility handling; throttled timers while hidden may build a backlog | Presentation | HYPOTHESIS | Low | P3 |
| PERF-23 | Shadow map re-rendered every frame, including camera-only frames | GPU | CONFIRMED (small, 0.7 ms) | High | P3 |
| PERF-24 | FPS menu offers caps above refresh without effect; no refresh or achieved FPS shown | Settings UX | CONFIRMED | High | P3 |
| PERF-25 | Whole-state presentation subscribers outside the board (Dashboard, BuyPrompt, DevelopmentPrompt, CardInteractionOverlay) and a 100 ms overlay interval | React (DOM) | CONFIRMED (cost small) | High | P3 |
| NI-01 | Idle rendering in production builds | Scheduler | NOT AN ISSUE (0 frames idle) | High | — |
| NI-02 | Draw calls / triangles / CPU submission | Renderer | NOT AN ISSUE (2.2–2.6 ms median submit) | High | — |
| NI-03 | Timer precision on AC power (Chrome, Electron) | Platform | NOT AN ISSUE (median < 1 ms) | High | — |
| NI-04 | Shadow-map pass cost; table texture anisotropy | GPU | NOT AN ISSUE (≤ 0.7 ms; 0 ms) | High | — |
| NI-05 | Camera zoom/pan path | Camera | NOT AN ISSUE (1 React commit per 24 wheel events) | High | — |
| NI-06 | DOM compositing over the canvas | UI | NOT AN ISSUE (one `backdrop-filter` in the client) | Medium | — |

### D.2 Detailed findings

#### PERF-01 — Highlight batch rebuilt on every board render; identical shader re-linked

- **Description:** `TileImpactHighlightBatch` memoizes its entries and its mesh bundle on `tiles`
  (`apps/client/src/game/scene/board/tiles/TileImpactHighlightBatch.tsx:110,113`). `Board3D` creates a new `tiles` array on
  every render (`apps/client/src/game/scene/board/Board3D.tsx:46`), so every render creates a new `MeshBasicMaterial`
  (line 54) and a new `InstancedMesh`, and the layout-effect cleanup disposes the previous material (line 161). three.js
  releases the program when its last user is disposed and links the same source again on the next frame. The old
  `InstancedMesh` is never disposed (its instance buffers are left to garbage collection).
- **Evidence:** program-labelled runs show the same source hash (`TileImpactHighlightMaterial`, `#9d34de30`) linked 14–15
  times per warm walk/roll replay and once per idle harness re-render. First-use wait per re-link: median 3.4 ms with an
  idle GPU, **17–20 ms average and up to 58 ms while the GPU is animating**; 250–390 ms of main-thread blocking per walk or
  roll+card replay. A hover sweep across 18 tiles produced 19 re-links.
- **Impact:** a 17–58 ms stall at every presentation tick (hop start/complete, preview, dice settle, card, money) — the
  largest single main-thread cost measured during animations (735 ms of first-use waits vs 459 ms of geometry rebuilding
  over three production-like walk replays); also a full GPU frame per render.
- **Root cause status:** CONFIRMED. **Confidence:** High. **Severity:** P1.
- **Next action:** create the material and mesh once (or key them on the tile *id set*, which never changes), update
  instance data in place; dispose the mesh with its material.
- **Regression risk:** Low (no visual change). Guard with a test that renders `Board3D` twice with equal input and asserts
  the same material/mesh instance, and a probe check of 0 program links during a warm replay.

#### PERF-02 — Merged rounded-box geometry rebuilt on every board render

- **Description:** `TileAssembly` computes `panel` with `getOrientedTilePanelLayoutForTileSize` on every render
  (`apps/client/src/game/scene/board/tiles/TileAssembly.tsx:50`), which returns a new object each call
  (`apps/client/src/game/scene/board/tiles/tilePanelLayout.ts:44,111`). `JailVisual`/`TaxVisual` memoize their box specs on
  `panel` (`apps/client/src/game/scene/special/JailVisual.tsx:50`, `apps/client/src/game/scene/special/TaxVisual.tsx:79`)
  and `MergedRoundedBoxes` memoizes the merged geometry on the specs
  (`apps/client/src/game/scene/board/geometry/MergedRoundedBoxes.tsx:73`). Every board render therefore builds about 27
  `RoundedBoxGeometry` parts, merges them, disposes the previous geometry and uploads new buffers (bounding spheres are
  recomputed at the next frame).
- **Evidence:** production-build CPU profile of 3 walk replays: `createMergedBoxGeometry` 459 ms of 779 ms React-scheduler
  time (59 %); 45 of 79 React tasks contain it; React task median 9.0 ms, p95 23.5 ms, max 35.5 ms. In the non-quiet harness
  run the same function took 1,286 ms over 3 replays.
- **Impact:** most of each board re-render's ~9–12 ms main-thread cost; together with PERF-01 a major contributor to the
  50–117 ms interval spikes (GPU-bound frames, PERF-04, contribute as well).
- **Root cause status:** CONFIRMED. **Confidence:** High. **Severity:** P1.
- **Next action:** cache `getTilePanelLayout` by `(size, side)` (pure function), or memoize specs on the panel's numeric
  fields; cache merged geometries by spec content at module level.
- **Regression risk:** Low. Same geometry; verify with existing capture pixel diffs.

#### PERF-03 — Whole-board React re-render fan-out

- **Description:** `Board` reads the whole presentation state with `usePresentation()`
  (`apps/client/src/components/Board.tsx:40`) and rebuilds the render model on every presentation change (line 52); every
  socket `update`, private-state or offer change re-creates the context value (`apps/client/src/App.tsx:1091`); hover is
  React state in `Board` (line 46) fed by R3F pointer handlers (lines 129, 146); settings are one context object, read by
  `GameScene` and many scene components. Only `GameHud` uses `memo` in the whole client. `Board3D`, `TileAssembly` (×40)
  and the batches re-render each time and pass new object/array/function props, so R3F applies props and invalidates a
  frame even when nothing visible changed.
- **Evidence:** a production-like walk replay produced 22 React DOM commits and 14 R3F commits; roll + Chance card 66 DOM
  and 15 R3F commits; hover sweep over 18 tile boundaries 36 DOM and 19 R3F commits, 35 frames. Each R3F commit carries the
  PERF-01/PERF-02 cost.
- **Impact:** multiplier for PERF-01/02; also turns non-visual updates (chat, presence, offers, volume slider) into full GPU
  frames.
- **Root cause status:** CONFIRMED (counts). **Confidence:** High. **Severity:** P1.
- **Next action:** selector subscriptions (`usePresentationSelector` already exists), stable render-model slices with
  structural sharing, `memo` on scene subtrees, hover/selection through an imperative store (like `boardViewStore`), split
  the settings context.
- **Regression risk:** Medium (UI update correctness). Mitigate with component tests and visual captures; add a
  commit-count probe test.

#### PERF-04 — Default tier is GPU-bound on Intel UHD-class iGPUs

- **Description:** On this laptop `auto` → `balanced`. At native DPR 1.25 the scene costs 17.6–19 ms GPU per frame at steady
  clocks (budget 16.67 ms); `low` 15.6–16.8 ms; `high` 50–60 ms.
- **Evidence:** [G.3](#g3-tier-and-fps-cap-matrix-walk-scenario), [G.6](#g6-gpu-cost-attribution-ab); all gameplay
  scenarios show 23–44 % late frames at balanced with GPU medians 17.8–21.9 ms ([G.4](#g4-gameplay-scenarios-production-like)).
  When GPU time falls (low at DPR 1.0: 11.0 ms) late frames drop from 25 % to 10 % and long-animation-frame time per walk
  replay from 353 ms to 44 ms — GPU saturation also back-pressures the main thread.
- **Impact:** the baseline 40–46 FPS with 16.7/33.3 ms alternation is the "not smooth even at high FPS settings" symptom on
  this class of device.
- **Root cause status:** CONFIRMED on this device; other GPUs BLOCKED. **Confidence:** High. **Severity:** P1.
- **Next action:** Graphics 2.0 (E.4): DPR policy, IBL scope, tabletop shading, measured `auto`.
- **Regression risk:** Medium–High (visual changes need owner review).

#### PERF-05 — Synchronous first-use shader compilation

- **Description:** three.js compiles a program at its first draw and, with the default `debug.checkShaderErrors`, blocks in
  `getProgramInfoLog`/`getProgramParameter` until ANGLE/D3D11 finishes. Nothing pre-compiles (`compileAsync`, `compile`
  are unused in the client) although `KHR_parallel_shader_compile` is available here. Transient effects create and dispose
  their materials per use (dice trails `apps/client/src/game/scene/dice/DiceLayer.tsx:107,114`; destination preview JSX
  materials), so their programs are released and re-linked each time.
- **Evidence:** fresh browser profile (empty GPU cache): 60–62 programs at load, **4.05 s** of main-thread compile waits in
  Chrome, first frame 2,086 ms; **Electron 43 first launch: 6.19 s of waits, 9.06 s of long-animation-frame time, one
  4,455 ms frame**. Cold cost per program: MeshStandard 150–165 ms, MeshPhysical (coins, dice) ~210 ms, PMREM convolution
  589 ms. Warm cache: 0.53 s at load. Per-use re-links of trail/preview/contact-shadow programs: 4–6 ms each warm.
- **Impact:** multi-second freeze on first launch and after every update that changes Chromium or shaders; 150–220 ms hitches
  at the first use of a PBR material variant with a cold cache (first dice roll, first house, first card).
- **Root cause status:** CONFIRMED. **Confidence:** High. **Severity:** P1.
- **Next action:** warm-up with `renderer.compileAsync(scene, camera)` behind the loading state, including hidden instances of
  transient effects; keep transient materials alive; prepare tier switches the same way.
- **Regression risk:** Medium (warm-up must cover variants; adds load-phase work that runs in parallel).

#### PERF-06 — Delivered rate falls to the largest vsync divisor at or below the cap

- **Description:** `lastFrameAt = timestamp` (`demandFrameScheduler.ts:94`) anchors the next due time to the landed vsync;
  `dueAt = lastFrameAt + 1000/fpsLimit` (lines 72, 89) then rounds up again every frame, so the rate settles on the largest
  whole-vsync divisor ≤ cap. The canonical game-board instruction describes the scheduler as advancing "at the selected FPS
  cap"; the code and the documented intent differ on non-divisor displays.
- **Evidence:** deterministic simulation of the unmodified class (C.4): 10 of 35 refresh × cap cells below a cap the
  display could reach. On-device verification BLOCKED: this machine has only a 60 Hz panel.
- **Impact:** gaming monitors (144/165 Hz) deliver 48/55 FPS at the default 60 cap and 72/82.5 at 120 — players who raise
  the cap can get far less than they chose, with no indication.
- **Root cause status:** CONFIRMED (logic); intended policy unresolved (owner decision, C.4). **Confidence:** High.
  **Severity:** P1.
- **Next action:** owner chooses the policy; B4 vsync-count pacing with a measured refresh period and simulation tests for
  60/75/90/120/144/165/240 Hz; canonical text updated to match.
- **Regression risk:** Low–Medium (isolated module with injectable host; existing tests).

#### PERF-07 — Image-based lighting on every PBR material

- **Description:** One PMREM is assigned to `scene.environment` (`apps/client/src/game/scene/render/environment/StudioEnvironment.tsx:45`),
  so every `MeshStandardMaterial`/`MeshPhysicalMaterial` (tiles, table, houses, props, cards, coins, dice) evaluates
  cube-UV irradiance and radiance per pixel at an intensity of only 0.6–0.8.
- **Evidence:** alternating A/B on `balanced`: GPU median 17.6 → **11.3 ms** with `scene.environment = null` (−36 %).
- **Impact:** largest single GPU cost; most of it buys a subtle ambient/specular lift on matte materials.
- **Root cause status:** CONFIRMED. **Confidence:** High. **Severity:** P2.
- **Next action:** keep PMREM for metals and glossy parts (coins, dice, glass) and replace it for matte materials in
  low/balanced with an SH light probe or hemisphere term; decide with side-by-side captures.
- **Regression risk:** Medium (look changes; owner review).

#### PERF-08 — Tabletop shading cost

- **Description:** a 120×120 `MeshStandardMaterial` plane with a procedural albedo, IBL, three lights and (balanced/high)
  shadow receiving fills most of the margin around the board (`apps/client/src/game/scene/render/table/Tabletop.tsx:31-48`).
- **Evidence:** A/B on balanced: hidden 17.4 → 12.5 ms; unlit (same texture) 17.6 → 13.6 ms; drawn last for early-Z only
  −0.8 ms; anisotropy 8→1 no change. Low: hidden 15.6 → 11.5 ms. High: hidden 51.8 → 44.2 ms.
- **Impact:** ~4–5 ms per frame on low/balanced and 7.6 ms on high, for a background.
- **Root cause status:** CONFIRMED. **Confidence:** High. **Severity:** P2.
- **Next action:** cheaper table shading on low/balanced (unlit/Lambert with baked lighting gradient and baked contact
  shadow), PBR only on high.
- **Regression risk:** Medium (look; owner review).

#### PERF-09 — DPR policy

- **Description:** ranges `low [1, 1.25]`, `balanced [1.25, 1.5]`, `high [1.25, 2]` clamp the device ratio. On 125 % Windows
  scaling (very common on laptops) all three tiers render at 1.25; on 100 % displays balanced and high always supersample
  1.56× pixels.
- **Evidence:** this laptop: all tiers 1871×860 at DPR 1.25. A/B balanced DPR 1.0: GPU 17.4 → 12.1 ms (−30 %); high
  50.0 → 33.7 ms. Walk at low/DPR 1.0 (forced device scale 1): 54.7 FPS, 10 % late vs 44.7 FPS, 25 % late at 1.25.
- **Impact:** presets do not differ in the dimension that costs most; DPR is the cheapest large lever.
- **Root cause status:** CONFIRMED. **Confidence:** High. **Severity:** P2.
- **Next action:** render-scale policy in Graphics 2.0 (E.4), adaptive render scale in `auto`.
- **Regression risk:** Medium (text sharpness; check the eight regression tile names).

#### PERF-10 — High tier post-processing on integrated GPUs

- **Description:** the composer renders with `multisampling={4}` (`apps/client/src/game/scene/render/post/ScenePostEffects.tsx:46`)
  while the canvas keeps `antialias: true` (`GameScene.tsx:400`); N8AO runs at half resolution.
- **Evidence:** alternating A/B on high (baseline 51.8 ms): composer multisampling 4 → 0 gives 31.4 ms; N8AO off gives
  37.0 ms. The cost of the canvas MSAA under
  the composer was not separable at runtime (it needs a new context).
- **Impact:** high is unusable on iGPUs (expected; `auto` never selects it) but is also more expensive than necessary on
  dGPUs.
- **Root cause status:** composer/N8AO costs CONFIRMED; double MSAA LIKELY. **Severity:** P2.
- **Next action:** canvas `antialias: false` whenever the composer is active (context recreation on tier change), consider
  SMAA instead of MSAA, measure on a dGPU.
- **Regression risk:** Medium (edge quality).

#### PERF-11 — Slow first frames of every animation burst

- **Description:** after the scene has been idle, the GPU runs its first frames slower; isolated frames (hover, wheel) are the
  slowest.
- **Evidence:** median GPU time by frame index inside bursts of ≥ 15 frames (balanced walk): #0 24.4, #1 24.1, #2 24.0,
  #3 23.3, #5 21.3, #9 18.6, steady (#10+) 17.9 ms; same pattern in low, purchase, rent, hotel. Isolated hover frames 44.8 ms,
  wheel frames 37.5 ms; idle-loop frames in the harness climbed from 25 to 43 ms.
- **Impact:** every animation starts with 5–9 slow frames — the moment players notice most.
- **Root cause status:** measurement CONFIRMED; cause LIKELY iGPU frequency ramp (DVFS), GPU clock not observed directly.
  **Severity:** P2.
- **Next action:** reduce GPU cost first; optionally render 2–3 warm-up frames when an animation is scheduled (power
  trade-off, measure).
- **Regression risk:** Low.

#### PERF-12 — Live tier switch freezes

- **Description:** a tier change toggles shadow defines (all lit programs recompile), drops the shadow map
  (`apps/client/src/game/scene/render/lighting/SceneLightRig.tsx:29-34`), regenerates table textures synchronously
  (`Tabletop.tsx:18-24`) and lazy-loads the post chunk for high.
- **Evidence (warm cache):** → high 586 ms of long frames (max 366 ms, 44 program links, frame CPU max 205 ms); → low 216 ms;
  → balanced 285 ms (max 233 ms). Cold cache would multiply by the 150–220 ms per program cost.
- **Root cause status:** CONFIRMED. **Severity:** P2.
- **Next action:** prepare the new tier off-screen (`compileAsync`, texture build) and swap; show a short "applying" state.
- **Regression risk:** Low–Medium.

#### PERF-13 — `auto` is heuristic-only

- **Description:** `resolveAutoTier` (`renderQuality.ts:88-94`) looks at pointer, screen size, `MAX_TEXTURE_SIZE` and logical
  cores; it never measures rendering.
- **Evidence:** this machine reports 16384 / 8 threads / fine pointer → `balanced`, which runs at 40–46 FPS here.
- **Root cause status:** CONFIRMED. **Severity:** P2.
- **Next action:** measured adaptive `auto` (E.4, B6).
- **Regression risk:** Medium (must not thrash; persist per GPU).

#### PERF-14 — Unbounded state map and heap growth

- **Description:** `previousStateRef` keys are `${mesh.uuid}:${tileId}` (`TileImpactHighlightBatch.tsx:137,149`); each new
  mesh (PERF-01) adds 40 keys; nothing removes them.
- **Evidence:** map size read from the component's hook state: 560 after load, 3,360 after 5 walk replays, 6,240 after 10.
  JS heap after forced GC over 30 walk replays: 21.5 → 24.6 → 26.3 → 28.2 MB (+0.22 MB per replay, linear).
- **Impact:** slow growth in long sessions plus per-frame string building for 40 keys.
- **Root cause status:** CONFIRMED. **Severity:** P2.
- **Next action:** key by tile id and reset with the mesh; fixed with PERF-01.
- **Regression risk:** Low.

#### PERF-15 — Destination preview geometry leak

- **Description:** `createDestinationFrameGeometry` is memoized (`apps/client/src/game/scene/board/tiles/TileDestinationPreview.tsx:73`)
  and passed as a prop (line 132); R3F only disposes JSX-created children, and the file never calls `dispose()`.
- **Evidence:** `renderer.info.memory.geometries` 121 → 131 → 141 → 151 over 30 walk replays (exactly +1 per move); textures
  and programs stable.
- **Root cause status:** CONFIRMED. **Severity:** P3 (small buffers, but three.js also keeps the objects referenced).
- **Next action:** dispose in an effect cleanup or make the geometry a JSX child.
- **Regression risk:** Low.

#### PERF-16 — Load-time main-thread work

- **Description:** procedural textures are generated synchronously: oak table (`apps/client/src/game/scene/render/table/tableTextures.ts:73-115`,
  1024² with per-pixel value noise), district and white-pebble surfaces (`apps/client/src/game/scene/board/materials/districtSurfaceMaterials.ts:194`,
  `apps/client/src/game/scene/board/materials/whitePebbleSurface.ts:109`, with a per-pixel linear search at line 123). Two
  capability probes create throwaway WebGL2 contexts that are never released (`apps/client/src/game/scene/fallback/webglSupport.ts:10-22`
  from `Board.tsx:42`, `renderQuality.ts:123-143` from `apps/client/src/settings/GraphicsQualityDocumentSync.tsx:15`);
  troika adds its own SDF generator context. Five contexts were created per page load in these runs.
- **Evidence:** load CPU profile (warm cache): table texture ~210 ms, district/pebble ~220 ms, `texSubImage2D` 65 ms,
  context creation ~30 ms, shader waits 613 ms. Warm load total long-animation-frame time 1.4–1.8 s (max 0.6–0.8 s).
- **Root cause status:** CONFIRMED. **Severity:** P2.
- **Next action:** pre-bake or worker-generate textures, reuse the renderer's capabilities, `loseContext()` probes, pre-bake
  the PMREM.
- **Regression risk:** Low–Medium.

#### PERF-17 — UAT harness feedback loop (harness only)

- **Description:** in UAT/localhost, `RendererDiagnostics` publishes 120 ms after each frame burst
  (`GameScene.tsx:240-241,261`); the harness turns the event into React state (`apps/client/src/dev/phase4-uat/Phase4UatHarness.tsx:1040,1045`),
  which re-renders `<Board />`, which applies new props, which invalidates a frame, which publishes again. The destination
  preview additionally dispatches an event every 100 ms that the harness stores (`TileDestinationPreview.tsx:119`,
  `Phase4UatHarness.tsx:1043,1046`).
- **Evidence:** harness idle: a frame every 150–167 ms with exactly one DOM and one R3F commit each, and one shader re-link
  each; 50 frames in 8 s. With those two listeners suppressed by the probe: 0 idle frames, program links per walk replay
  52 → 17. Matches the note in `e2e/visual/graphicsTierSwitch.visual.ts:15`.
- **Root cause status:** CONFIRMED (harness only; production does not listen to these events). **Severity:** P2 (evidence
  quality).
- **Next action:** throttle/compare-before-set in the harness or move metrics out of React state; make "quiet" the default
  for benchmarks.
- **Regression risk:** Low (dev-only code).

#### PERF-18 — Benchmark methodology gaps in earlier evidence

- **Description:** earlier G2/G5 frame times came from headless runs at a 1920×1080 viewport with DPR 1.0, forced
  invalidation every rAF, and a "median FPS" from the harness's own rAF loop; draw/triangle numbers from SwiftShader.
- **Evidence:** at native DPR 1.25 `low` is GPU-bound (16.4–16.8 ms); scene submissions, not rAF ticks, are what players see;
  the v1.8.1 investigation already measured 26–29 scene submissions/s while rAF ran at 60.
- **Root cause status:** CONFIRMED. **Severity:** P2.
- **Next action:** adopt the methodology in [G.2](#g2-methodology-and-metric-definitions) for every Phase B before/after claim.

#### PERF-19 — React development build amplifies stutter

- **Evidence:** walk, balanced/60, same machine: development build 36.4 FPS, 27 intervals > 50 ms, 1,207 ms of long frames per
  replay, React tasks p95 94 ms; production build 46.2 FPS, 5 intervals > 50 ms, 321 ms per replay.
- **Impact:** if gameplay is judged in `pnpm dev`/`dev:desktop`, stutter looks roughly 3–4× worse than in the packaged app.
- **Root cause status:** CONFIRMED. **Severity:** P2 (testing guidance).
- **Next action:** judge smoothness only on packaged/production builds; document it in the testcase checklist (Phase B).

#### PERF-20 — Coarse timers on battery (hypothesis)

- **Description:** the scheduler waits with `setTimeout` until 1 ms before the due time. If Chromium on battery runs timers
  at the 15.6 ms Windows tick, waits overshoot the next vsync.
- **Evidence:** simulation only (C.4: 30.5 FPS at cap 60 on 60 Hz). On AC power the measured timer lateness is < 1 ms
  median. Battery measurement BLOCKED here.
- **Next action:** run the timer test of [Appendix 1](#appendix-1-reproduction-protocol) on battery; B4 removes the
  dependency either way.

#### PERF-21 — Animation time bases (minor)

- **Description:** most animations sample `performance.now()` inside their `useFrame` (`CharacterBillboard.tsx:419`,
  `diceAnimationClock.tsx:55`, `apps/client/src/game/scene/animationTime.ts:1`, `TubeHouseInstances.tsx:99`), one uses
  `clock.elapsedTime` (`apps/client/src/game/scene/board/tiles/TileActionFeedback.tsx:118-125`); clocks start at commit or store
  emit; hops are chained by timer fire time (`apps/client/src/game/presentation/executors/movementExecutor.ts:78,86,88`).
- **Evidence:** callback start − rAF timestamp: median 1.2 ms, p95 14.8 ms, max 20.2 ms — each frame samples a slightly
  different moment than it is presented for; scheduler timer lateness during gameplay p95 12–35 ms.
- **Root cause status:** LIKELY minor contributor. **Severity:** P3.
- **Next action:** one shared frame time (the rAF timestamp) for all sampling; start animation clocks at the first rendered
  frame; chain hops by nominal end time.

#### PERF-22 — Hidden-window backlog (hypothesis)

- **Description:** `waitForDelay` uses `setTimeout` (`apps/client/src/game/presentation/queue/helpers.ts:1-15`); no
  `visibilitychange` handling in the queue/controller; snapshots only reset on sequence gaps.
- **Next action:** manual test — minimize Electron for 60 s during bot turns, restore, record whether old animations play.

#### PERF-23 — Shadow map updated on every frame

- **Evidence:** A/B "shadow pass frozen" −0.7 ms on balanced; wheel/hover frames re-render it although no caster moved.
- **Severity:** P3. **Next action:** `shadowMap.autoUpdate = false` with `needsUpdate` when casters move.

#### PERF-24 — FPS menu honesty

- **Evidence:** 120/180/240 are offered on 60 Hz panels and measured equal to 60; no achieved-FPS readout in production.
- **Severity:** P3. **Next action:** Graphics 2.0 FPS options (E.4).

#### PERF-25 — DOM-side whole-state subscribers

- **Evidence:** `Dashboard.tsx:16`, `BuyPrompt.tsx:53`, `DevelopmentPrompt.tsx:20`, `CardInteractionOverlay.tsx:99` read the
  whole presentation state; `CardInteractionOverlay.tsx:188` ticks every 100 ms (66 DOM commits per roll+card replay). The
  DOM React work measured small (~33 ms per walk replay), so this is hygiene, not a cause.
- **Severity:** P3.

---

## E. Graphics Quality Assessment

### E.1 What the presets really differ in

| Display scaling | low pixel ratio | balanced | high |
| --- | --- | --- | --- |
| 100 % (DPR 1.0) | 1.0 | 1.25 (supersampled) | 1.25 (supersampled) |
| 125 % (DPR 1.25, this laptop) | 1.25 | 1.25 | 1.25 |
| 150 % (DPR 1.5) | 1.25 | 1.5 | 1.5 |
| 200 % (DPR 2.0) | 1.25 | 1.5 | 2.0 |

On this laptop the visible difference between low and balanced is real shadows, slightly stronger IBL, a 1024 table
texture, table props, paper grain and one dice trail; between balanced and high: post chain, 2048 shadows, table roughness
map, dice shadows, a second trail. The cost difference is not proportional: low 15.6–16.8 ms, balanced 17.6–19 ms,
high 50–62 ms GPU.

### E.2 Measured cost per feature (this device, steady clocks, A/B from G.6)

| Feature (tier) | GPU cost | Visual contribution (assessment) |
| --- | --- | --- |
| Resolution 1.25 → 1.0 (balanced) | 5.3 ms (30 %) | Sharpness of text/edges; MSAA already on |
| PMREM IBL on all PBR materials (balanced) | 6.4 ms (36 %) | Subtle ambient/specular on matte surfaces; important on coins/dice |
| Tabletop PBR shading (balanced / low / high) | 4.0–4.9 / 4.1 / 7.6 ms | Wood plane behind the board |
| Real shadows: pass + sampling (balanced) | 2.0 ms (11 %) | Strong grounding of buildings, standees and dice — good value |
| Shadow pass alone (balanced 1024 / high 2048) | 0.7 / ~0 ms | — |
| Composer MSAA 4 (high) | 20.4 ms | Edge quality of the post chain |
| N8AO half-res (high) | 14.8 ms | Contact occlusion |
| Table anisotropy 8× | 0 ms | Grain at grazing angles |

Best quality per millisecond: shadows (2 ms). Worst: IBL on matte materials, composer MSAA, tabletop PBR.

### E.3 Assessment

- Presets are not differentiated where cost lives (resolution) and are differentiated where cost is small (shadow map size).
- `auto` chooses by hardware facts, not by measured frame time; on iGPU laptops it picks a tier that cannot hold 60 FPS.
- `high` is 3× the cost of balanced on an iGPU; correctly never auto-selected, but nothing tells the player that.
- Tier switching at runtime freezes the board (PERF-12).

### E.4 Graphics Settings 2.0 (proposed specification, not implemented)

**Separate the three controls:** Quality preset (fidelity), Render scale (resolution), Frame rate (pacing).

| | Low ("Hiệu năng") | Balanced ("Cân bằng") | High ("Cao") |
| --- | --- | --- | --- |
| Render scale | min(device DPR, 1.0), adaptive down to 0.85 | min(device DPR, 1.25), floor 1.0 (no supersampling) | device DPR up to 2.0 |
| Antialiasing | canvas MSAA (keep; re-measure 2× vs 4×) | canvas MSAA | composer MSAA or SMAA, canvas MSAA **off** |
| Shadows | baked contact blobs | PCF 1024, updated only when casters move | PCF 2048 soft, updated when casters move |
| Environment light | SH probe / hemisphere for matte; metals (coins, dice) a small static env map or matcap; no PMREM sampling on matte surfaces | PMREM only on metals/glossy (coins, dice, glass); SH for matte | full PMREM |
| Tabletop | unlit baked texture with baked lighting gradient | Lambert or unlit + baked contact shadow | PBR + roughness map |
| Post | none | none | N8AO (half-res) + bloom + vignette |
| Dice trails / props / grain | off / off / off | 1 / on / on | 2 / on / on |
| Target on the reference iGPU | ≥ 57 FPS during animation | ≥ 55 FPS during animation | no target on iGPU |

**Auto (adaptive):** start from the heuristic, then measure GPU time (`EXT_disjoint_timer_query_webgl2`, fallback: contiguous
frame intervals) over the first few seconds of real animation frames; step render scale first, then IBL/shadows; hysteresis
(for example 2 s above 15 ms to step down, 10 s below 10 ms to step up); apply changes only when the scene is idle; persist
per GPU renderer string; never auto-select High on integrated GPUs.

**Frame rate options:** "Match display" (default; render every vsync), "Half display rate", "30 FPS (battery saver)"; show
the detected refresh rate; hide caps above refresh. Optional on-screen "achieved FPS" readout in Settings for players.

All visual changes in this table need side-by-side captures and owner approval (the eight regression tile names at
1280×720 remain the readability gate).

---

## F. Existing Strengths

Keep these; Phase B must not regress them.

1. **Idle cost is zero in production.** Demand rendering with one coalesced invalidation stream: 0 frames in idle windows in
   Chrome and Electron; visibility-aware.
2. **Batching and instancing.** One instanced tile-body mesh, per-material instanced surfaces, all tube houses in three
   instanced meshes, instanced coins, trays, card decks, standee bases, dice pips, park furniture; landmarks ≤ 3 draws;
   139–148 main-pass draws and ≤ 81.3k triangles in every measured fixture; `renderer.render` submission median 2.2–2.6 ms.
3. **Time-based animations.** Durations do not depend on the FPS cap or frame drops; reduced motion snaps correctly.
4. **Camera outside React.** `boardViewStore` + direct camera application: 24 wheel events cost 1 React commit.
5. **Shared resources.** Module-level materials and geometries for most static parts; one PMREM shared by the scene and the
   coins; tier changes do not regenerate the PMREM; shadow-only proxy layer for landmarks.
6. **Imperative tile motion.** `TileMotionController` advances once per frame at priority −1 and stops invalidating at rest.
7. **Lazy high-tier post chain** (never downloaded for low/balanced), `OptionalSceneLayer` error isolation, context-loss
   handling and the legacy fallback board.
8. **Instrumentation base.** `FrameCounter` main/shadow/post split, UAT harness scenarios and benchmark mode, visual capture
   suite, `usePresentationSelector` for fine-grained subscriptions.
9. **No heavy DOM effects over the canvas** (a single `backdrop-filter` in the whole client).
10. **The manual R3F advance is correct** and needs no change.

---

## G. Benchmark Results

### G.1 Test environment

| Item | Value |
| --- | --- |
| Device | Lenovo ThinkPad T14 Gen 1 (20S1A03QCD) |
| CPU | Intel Core i5-10210U, 4 cores / 8 threads, 1.6 GHz base |
| GPU | Intel UHD Graphics (Comet Lake GT2, PCI 0x9B41), driver 31.0.101.2137, ANGLE Direct3D 11 |
| RAM | 15.8 GB |
| Display | internal 1920×1080 @ 60 Hz, Windows scaling 125 % (devicePixelRatio 1.25, 1536×864 DIP) |
| OS / power | Windows 10 Pro 19044, AC power (`PowerOnline: True`) |
| Browsers | Chrome 155.0.8059.80; Electron 43.4.0 (Chromium 150.0.7871.224) via a minimal measurement shell with the app's `webPreferences` |
| Application | commit `e410dee`, clean tree; UAT harness built in **production React mode** (`VITE_PHASE4_UAT=1 vite build --mode phase4-uat --minify false`) and served by `vite preview`; development runs from `vite --mode phase4-uat` |
| Window / buffer | Chrome window 1536×864 DIP → viewport 1522×714 CSS → drawing buffer 1871×860 (1.61 MP) at DPR 1.25 (a few runs 1888×868/938); Electron 1440×900 window → buffer 1751×970 (1.70 MP) |
| Capabilities | `MAX_TEXTURE_SIZE` 16384, `MAX_SAMPLES` 16, max anisotropy 16, `KHR_parallel_shader_compile` yes, `EXT_disjoint_timer_query_webgl2` yes |

### G.2 Methodology and metric definitions

- **Probe:** an init script injected before page scripts ([Appendix 2](#appendix-2-probe-script)) wraps
  `requestAnimationFrame`/`setTimeout` calls made by the scheduler (identified by source text in the unminified build),
  wraps WebGL program/texture/sync calls, records Long Animation Frames (with script attribution), counts React commits
  through a minimal DevTools hook and, for A/B experiments, reaches the R3F store through that hook. No application code was
  changed.
- **Scenarios:** UAT harness fixtures replayed with its own "Chạy lại" button; 1 warm-up replay, then 3–5 measured replays.
  "Cold" = the first replay after load. "Production-like (quiet)" = the harness's two diagnostics listeners are dropped by
  the probe so the harness feedback loop (PERF-17) does not re-render the board; the diagnostics `publish` itself still runs
  (UAT-only overhead, ~60 ms per walk replay).
- **Contiguous interval:** time between two rendered scheduler frames where the earlier frame scheduled a continuation (an
  animation was running). Idle gaps of demand rendering are excluded.
- **Effective FPS:** 1000 / mean contiguous interval. **Late frame:** contiguous interval > 1.5 × max(1000/cap, vsync).
  **Percentiles:** nearest rank. **1 % low:** 1000 / mean of the worst 1 % of contiguous intervals, reported only with
  ≥ 100 intervals.
- **GPU time:** `TIME_ELAPSED_EXT` query around the scheduler's frame callback, results polled later; disjoint results
  discarded. It is GPU elapsed time and can include interleaved work of other contexts.
- **First-use waits:** time spent in synchronous WebGL calls (`getProgramInfoLog`, `getProgramParameter`, …) > 0.3 ms.
- **A/B GPU experiments:** static `board-readability` fixture, forced invalidation every rAF (steady clocks), one variable
  toggled at runtime, alternating baseline/variant 3 rounds (2 s each after 30 settle frames) to cancel drift.
- **Not compared across conditions:** runs with different buffer sizes or builds are reported separately.

### G.3 Tier and FPS cap matrix (walk scenario)

Harness (non-quiet), warm, Chrome 155, DPR 1.25, buffer 1871×860 unless noted.

| Tier / cap | Rendered frames | Effective FPS | Median / p95 / p99 / max interval (ms) | 1 % low FPS | Late | GPU median / p95 (ms) | Frame CPU p99 (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| low / 30 (1888×938) | 326 | 26.7 | 33.3 / 50.1 / 50.2 / 83.3 | 15.0 | 6 % | 22.6 / 31.9 | 24.9 |
| low / 60 (1888×868) | 474 | 45.8 | 16.7 / 33.4 / 33.5 / 83.2 | 20.0 | 30 % | 16.8 / 21.7 | 48.0 |
| low / 120 | 484 | 46.7 | 16.7 / 33.5 / 50.0 / 66.7 | 16.0 | 25 % | 16.4 / 22.3 | 39.4 |
| low / 180 | 496 | 49.2 | 16.7 / 33.4 / 50.1 / 66.5 | 17.2 | 18 % | 16.7 / 21.9 | 55.1 |
| low / 240 | 502 | 49.2 | 16.7 / 33.4 / 50.0 / 50.0 | 20.0 | 21 % | 16.5 / 22.4 | 39.9 |
| balanced / 30 | 316 | 26.4 | 33.4 / 50.1 / 50.1 / 50.4 | 19.9 | 5 % | 22.8 / 31.7 | 22.2 |
| balanced / 60 | 428 | 40.0 | 16.8 / 49.9 / 50.0 / 83.4 | 15.0 | 43 % | 19.0 / 25.7 | 42.2 |
| balanced / 120 | 442 | 40.1 | 16.8 / 49.9 / 50.1 / 66.8 | 17.1 | 42 % | 20.5 / 26.6 | 50.8 |
| high / 30 | 228 | 15.1 | 66.5 / 116.5 / 150.2 / 166.3 | 6.3 | 63 % | 60.6 / 81.3 | 119.6 |
| high / 60 | 231 | 15.2 | 66.6 / 133.1 / 183.1 / 299.4 | 4.1 | 84 % | 61.5 / 77.3 | 192.7 |
| high / 120 | 255 | 17.5 | 50.1 / 133.3 / 150.0 / 166.5 | 6.3 | 64 % | 58.4 / 67.7 | 163.3 |

Observations: caps 120–240 equal 60 on this panel; at cap 30 GPU time per frame rises (22.6 vs 16.8 ms) because the GPU
clocks lower at lower duty — the frame budget is not a fixed cost.

### G.4 Gameplay scenarios (production-like)

Balanced unless noted, cap 60, quiet, warm, 3–4 measured replays each.

| Scenario | Effective FPS | p95 / p99 / max interval (ms) | Late | GPU median (ms) | Frame CPU max (ms) | Program links / replay | First-use waits / replay | Long frames / replay |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| walk (dice, preview, 5 hops) | 46.2 | 49.9 / 66.5 / 66.7 | 22 % | 18.0 | 66.9 | 17 | ~260 ms | 321 ms |
| roll + Chance card | 40.9 | 50.0 / 83.1 / 99.9 | 33 % | 18.5 | 84.8 | 18 | 391 ms | 545 ms |
| pass GO | 42.1 | 50.0 / 83.3 / 116.7 | 29 % | 18.3 | 104.0 | 19 | 396 ms | 581 ms |
| dice only | 41.4 | 33.5 / 49.9 / 49.9 | 44 % | 21.9 | 104.3 | 11 | 167 ms | 456 ms |
| stress (concurrent effects) | 42.5 | 50.0 / 83.1 / 116.5 | 27 % | 19.1 | 69.0 | 6.7 | 100 ms | 328 ms |
| build 2 houses | 45.8 | 33.5 / 50.0 / 66.8 | 29 % | 18.5 | 80.3 | 9 | 91 ms | 218 ms |
| hotel | 46.5 | 33.5 / 50.0 / 50.0 | 27 % | 18.5 | 65.9 | 9 | 96 ms | 209 ms |
| purchase | 45.9 | 33.5 / 50.2 / 66.4 | 28 % | 18.8 | 34.4 | 7 | 40 ms | 108 ms |
| rent (money transfer) | 48.1 | 33.4 / 49.9 / 50.0 | 23 % | 17.8 | 22.8 | 7 | 29 ms | 126 ms |
| walk, low tier | 44.7 | 49.8 / 66.8 / 99.9 | 25 % | 16.6 | 85.5 | 16 | — | 353 ms |
| walk, low tier at DPR 1.0 (buffer 1494×687) | 54.7 | 33.3 / 33.4 / 49.8 | 10 % | 11.0 | 36.1 | 16 | — | 44 ms |

Idle (5–8 s after settling): **0 scene frames** in production-like runs (balanced and low, Chrome; balanced, Electron).

### G.5 Build and runtime comparison (walk, balanced, cap 60, quiet)

| Runtime | Effective FPS | p95 / p99 / max (ms) | Intervals > 50 ms | GPU median | Long frames / replay | React task p95 |
| --- | --- | --- | --- | --- | --- | --- |
| Chrome 155, production React | 46.2 | 49.9 / 66.5 / 66.7 | 5 | 18.0 ms | 321 ms | 23.5 ms |
| Chrome 155, development React | 36.4 | 83.3 / 100 / 116.7 | 27 | 18.4 ms | 1,207 ms | 94.2 ms |
| Electron 43, production React (larger buffer 1751×970) | 38.5 | 66.6 / 99.9 / 100 | 22 | 22.2 ms | 630 ms | — |

### G.6 GPU cost attribution (A/B)

Static `board-readability`, forced continuous rendering, Chrome, DPR 1.25 unless the variant changes it. Single-pass runs
(first block) and alternating ABAB runs (second block).

| Tier | Variant | GPU median (ms) | Δ |
| --- | --- | --- | --- |
| balanced | baseline | 17.4 | — |
| balanced | pixel ratio 1.0 | 12.1 | −5.3 |
| balanced | tabletop hidden | 12.5 | −4.9 |
| balanced | tabletop drawn last (early-Z) | 16.6 | −0.8 |
| low | baseline / tabletop hidden | 15.6 / 11.5 | −4.1 |
| high | baseline / pixel ratio 1.0 | 50.0 / 33.7 | −16.3 |
| balanced (ABAB) | baseline | 17.6 | — |
| balanced (ABAB) | table anisotropy 1 | 17.6 | 0 |
| balanced (ABAB) | table unlit (same texture) | 13.6 | −4.0 |
| balanced (ABAB) | `scene.environment = null` | 11.3 | −6.4 |
| balanced (ABAB) | all shadows off | 15.6 | −2.0 |
| balanced (ABAB) | shadow pass frozen | 17.0 | −0.7 |
| high (ABAB) | baseline | 51.8 | — |
| high (ABAB) | N8AO pass off | 37.0 | −14.8 |
| high (ABAB) | composer multisampling 0 | 31.4 | −20.4 |
| high (ABAB) | tabletop hidden | 44.2 | −7.6 |

A single-pass high run showed later measurements drifting upward by ~10 ms (frame CPU tripled), consistent with power/thermal
limits on a 15 W part under sustained load — which is why the ABAB design was used.

### G.7 Load, first use and memory

| Measurement | Result |
| --- | --- |
| Load, warm GPU cache (Chrome) | 63 program links, 530 ms compile waits, long frames 1.78 s total (max 0.80 s), harness ready 5.7 s after navigation |
| Load, cold GPU cache (fresh profile, Chrome) | 62 links, **4.05 s** compile waits, long frames 5.89 s (max 2.86 s), first frame CPU 2,086 ms, ready 7.7 s |
| Load, cold (first launch, Electron 43) | 62 links, **6.19 s** compile waits, long frames 9.06 s (**max 4.46 s**), ready 10.9 s |
| Load CPU attribution (warm) | shader waits 613 ms, procedural textures ~430 ms, texture uploads 65 ms, context creation ~30 ms |
| Program re-links per warm replay (quiet) | walk 17, roll+card 18, pass GO 19 (14–15 of them the highlight program in the labelled walk and roll+card runs) |
| Hover sweep (18 tile boundaries) | 19 R3F commits, 36 DOM commits, 19 program links, 35 frames, frame CPU median 7.9 ms (max 24.3), GPU 44.8 ms per isolated frame |
| Wheel zoom (24 events) | 27 frames, 1 R3F commit, frame CPU median 2.5 ms |
| Tile → property modal → Escape | 4 R3F commits, 4 links, one 50 ms long frame |
| Live tier switch (warm) | → high 586 ms long frames (max 366, 44 links), → low 216 ms, → balanced 285 ms |
| Soak, 30 walk replays (~3 min) | JS heap after GC 21.5 → 28.2 MB; geometries 121 → 151; programs 99 → 97; textures 52 → 52 |
| Timers, idle page, AC power | `setTimeout` lateness median 0.7–1.0 ms, p95 ~2 ms (Chrome and Electron); rAF 16.7 ms |

### G.8 Unmeasured scenarios

| Scenario | Status | Why / how to measure |
| --- | --- | --- |
| High-refresh monitors (75–240 Hz) | BLOCKED | No such panel here; simulation in C.4; measure with Appendix 1 on a 144 Hz monitor |
| Battery power | BLOCKED | Machine on AC during the audit; run the timer test and walk probe unplugged |
| Discrete / dual GPU, other iGPUs (Iris Xe, Ryzen), macOS (Metal), Apple Silicon | BLOCKED | Hardware not available |
| Mobile LAN clients | BLOCKED | No device; `auto` selects `low` on touch devices |
| Real multiplayer over a network with bots | NOT RUN | The harness applies the same LIVE_UPDATE path (`stateContext` + presentation controller) without sockets; client applies `update` payloads without runtime parsing |
| 30–60 min session in the packaged app | NOT RUN | 3-minute soak only; trend reported |
| Audio cost | NOT RUN | Harness runs muted; audio uses async `decodeAudioData` and buffer sources |
| Compositor-level presentation timing | NOT RUN | rAF timestamps used as proxy; Chrome tracing (`viz`, `cc`) recommended in Phase B baseline |

---

## H. Root Cause Analysis

Strongest supported causes of the observed stutter, in order of measured impact on this device:

1. **GPU saturation at the default tier (measured).** 17.6–19 ms GPU per frame at native DPR → frames alternate between one
   and two vsyncs (median 16.7 ms, p95 33–50 ms, 22–43 % late). This alone produces "high FPS setting but not smooth". It
   also back-pressures the main thread (long frames per walk replay 353 ms at 16.6 ms GPU vs 44 ms at 11.0 ms GPU).
   Contributors: IBL on all PBR materials (6.4 ms), tabletop (4–5 ms), resolution (5.3 ms for DPR 1.25 vs 1.0), shadows (2 ms).
2. **Main-thread stalls at presentation ticks (measured).** Each presentation tick re-renders the whole board (PERF-03);
   each re-render re-links a shader (PERF-01: 17–58 ms while animating) and rebuilds merged geometry (PERF-02: most of a
   9–12 ms React task). These coincide with hop boundaries, dice settle, card reveal and pass GO, which is why those
   scenarios have the largest spikes (max intervals 100–117 ms, frame CPU up to 104 ms).
3. **First-use and cold shader compilation (measured).** 2.1–4.5 s frozen frames at first launch or after updates;
   150–220 ms per new PBR program variant in a cold cache.
4. **Slow first frames after idle (measured; cause likely GPU clock ramp).** The first 5–9 frames of every animation are
   12–42 % slower, so the start of each animation is the most hitch-prone moment.
5. **Scheduler quantization on non-divisor refresh rates (confirmed by simulation; not observable on this 60 Hz panel;
   intended policy unresolved).**
6. **Testing in development builds (measured)** multiplies 1–4 by roughly 3–4×.

Hypotheses still open: coarse timers on battery (PERF-20), hidden-window backlog (PERF-22), minor sampling jitter (PERF-21).
Ruled out: idle rendering in production, draw-call/CPU-submission cost, shadow-map pass cost, table anisotropy, timer
precision on AC. Not a client cost by construction: runtime schema parsing of `update` payloads (the client does none;
socket JSON parsing itself was not measured).

---

## I. Proposed Performance Architecture

1. **Stable scene inputs, imperative hot paths.** The R3F tree receives stable, structurally shared slices
   (tiles, players, dice, signals) selected from the presentation store; scene subtrees are memoized; hover/selection live in
   an imperative store (like `boardViewStore`) that writes instance colors without a React render. React renders only when
   the *structure* of the scene changes.
2. **GPU resources are owned, not rendered.** Geometries/materials/textures come from long-lived registries keyed by content
   (panel layout cache, merged-geometry cache, effect material pool); transient effects toggle visibility on persistent
   objects instead of mounting new materials; every prop-passed GPU object has an owner that disposes it.
3. **Shader lifecycle.** All program variants a session can need are compiled once with `compileAsync` (parallel compile) at
   load and before a tier switch; the set is listed in one place and covered by a test that counts program links during a
   scripted warm session (expected: 0).
4. **Vsync-true pacing.** Measured refresh period; render on every n-th vsync; caps expressed as divisors; one frame
   timestamp shared by all animations; optional 2–3 warm-up frames when an animation is queued.
5. **A GPU budget per tier** derived from the cost table in E.2, enforced by measurement (GPU timer queries) rather than by
   draw-call counts alone.
6. **Adaptive quality controller** for `auto`: render scale first, then IBL/shadows, with hysteresis, applied only at idle,
   persisted per GPU.
7. **Load path off the critical thread.** Pre-baked or worker-generated textures and environment map; no throwaway WebGL
   contexts.
8. **Observability.** A production-safe, opt-in performance overlay (achieved FPS, GPU ms, long frames) and a repository
   performance probe for before/after evidence; deterministic counters (program links, R3F commits, geometry count) as
   automated regression tests that run even under SwiftShader.

---

## J. Phase B Implementation Roadmap

Small batches, each independently reviewable and measurable with the Appendix 1 protocol. Order reflects impact × risk.
Each batch updates the canonical docs it touches in the same change (`Client/game-board.instruction.md`,
`Client/settings-and-audio.instruction.md`, the client testcase checklist) and stays client-only (no protocol, server,
authority or persistence change).

### B0 — Measurement baseline and harness hygiene

| Field | Content |
| --- | --- |
| Scope | Fix the harness feedback loop (compare-before-set or move metrics out of React state; never re-render `<Board />` from diagnostics); add a "quiet" benchmark mode that reports scene submissions, GPU time and long frames at native DPR; add the probe as a repository script; record the baseline of this report with it |
| Files | `apps/client/src/dev/phase4-uat/Phase4UatHarness.tsx`, `apps/client/src/dev/phase4-uat/rendererBenchmark.ts`, `apps/client/src/game/scene/GameScene.tsx` (diagnostics only), new `scripts/perf/` probe |
| Benefit | Trustworthy before/after numbers; idle checks become meaningful |
| Complexity / risk | Low / Low (dev-only paths) |
| Dependencies | None |
| Success | Harness idle: 0 frames in 10 s; harness walk links per replay equal the production-like count |
| Regression prevention | Harness unit tests; diagnostics stay disabled outside localhost/UAT |

### B1 — Stop GPU resource churn on re-render (highest value, no visual change)

| Field | Content |
| --- | --- |
| Scope | (a) `TileImpactHighlightBatch`: create mesh/material once, key state by tile id, dispose mesh with material; (b) cache `getTilePanelLayout` by `(size, side)` and/or memoize specs by value; module-level merged-geometry cache; (c) stable `tiles` in `Board3D` (memo by model tiles + language); (d) dispose the destination-preview frame geometry; (e) persistent dice-trail and preview materials |
| Files | `apps/client/src/game/scene/board/tiles/TileImpactHighlightBatch.tsx`, `apps/client/src/game/scene/board/tiles/tilePanelLayout.ts`, `apps/client/src/game/scene/board/geometry/MergedRoundedBoxes.tsx`, `apps/client/src/game/scene/special/JailVisual.tsx`, `apps/client/src/game/scene/special/TaxVisual.tsx`, `apps/client/src/game/scene/board/Board3D.tsx`, `apps/client/src/game/scene/board/tiles/TileDestinationPreview.tsx`, `apps/client/src/game/scene/dice/DiceLayer.tsx` |
| Benefit | Removes 250–400 ms of main-thread blocking per walk/roll animation; React task p95 from 23.5 ms to an expected < 10 ms; stops the map and geometry growth |
| Complexity / risk | Low / Low |
| Dependencies | B0 recommended for evidence |
| Success | Warm walk replay: 0 program links (except first use); `renderer.info.memory.geometries` and heap flat over 30 replays; no interval > 50 ms in walk/rent/purchase on the reference |
| Regression prevention | Unit tests asserting instance identity across re-renders; capture pixel diffs; probe counters in CI |

### B2 — Narrow the React fan-out

| Field | Content |
| --- | --- |
| Scope | `Board` and DOM consumers use `usePresentationSelector` slices; structural sharing in `buildBoardRenderModel`; `memo` on `GameScene`/`Board3D`/`TileAssembly`/layers with stable props; hover/selection via an imperative store; split the settings context (graphics vs audio/UI) |
| Files | `apps/client/src/components/Board.tsx`, `apps/client/src/game/scene/board/boardRenderModel.ts`, `apps/client/src/game/scene/GameScene.tsx`, `apps/client/src/game/scene/board/Board3D.tsx`, `apps/client/src/game/scene/board/tiles/TileBodyBatch.tsx`, `apps/client/src/game/scene/board/tiles/TileSurfaceBatch.tsx`, `apps/client/src/components/Dashboard.tsx`, `apps/client/src/settings/` |
| Benefit | R3F commits only on structural change; hover costs one frame and no React render; non-visual socket updates cost no GPU frame |
| Complexity / risk | Medium / Medium |
| Dependencies | B1 |
| Success | Hover sweep: 0 R3F commits; walk replay R3F commits ≤ number of structural changes; volume slider drag: 0 R3F commits |
| Regression prevention | Existing component tests (HUD, prompts, card overlay), presentation tests, visual captures, commit-count probe test |

### B3 — Shader warm-up and tier-switch preparation

| Field | Content |
| --- | --- |
| Scope | After the first board mount, behind the existing scene-loading state, `compileAsync` all programs including hidden instances of transient effects (dice body/pips/trails, preview, flags, construction puff, money coins, card variants); same before applying a tier switch; consider `debug.checkShaderErrors = false` in production after warm-up |
| Files | `apps/client/src/game/scene/GameScene.tsx`, a new warm-up module under `apps/client/src/game/scene/render/`, `apps/client/src/game/scene/render/lighting/SceneLightRig.tsx` |
| Benefit | Cold first launch freeze from 2–4.5 s frames to an expected < 300 ms longest frame; first-use hitches removed |
| Complexity / risk | Medium / Medium (variant coverage) |
| Dependencies | B1 (stable materials make the variant set finite) |
| Success | Fresh-profile Electron launch: longest frame ≤ 300 ms, 0 program links during the first scripted turn |
| Regression prevention | Probe test: program links during scripted gameplay after warm-up = 0 |

### B4 — Scheduler pacing correction

| Field | Content |
| --- | --- |
| Scope | Estimate refresh period from rAF deltas; render every n-th vsync (n from the cap policy); no `setTimeout` pre-wait at caps ≥ refresh; phase-locked due time; publish achieved FPS to diagnostics; one shared frame timestamp for animations |
| Files | `apps/client/src/game/scene/render/demandFrameScheduler.ts` (+ tests), `apps/client/src/game/scene/GameScene.tsx`, animation clocks (`diceAnimationClock.tsx`, `CharacterBillboard.tsx`, `animationTime.ts`, `TubeHouseInstances.tsx`, `MoneyTransferLayer.tsx`) |
| Benefit | Correct rates on 75/90/144/165/240 Hz; immunity to coarse timers; more even motion |
| Complexity / risk | Low–Medium / Low–Medium |
| Dependencies | None (can run in parallel with B1) |
| Success | Simulation tests: achieved FPS = policy for 60/75/90/120/144/165/240 Hz × all caps, also with a 15.6 ms timer model; no regression on the 60 Hz reference |
| Regression prevention | Deterministic host-injected tests (the existing `FrameSchedulerHost` seam) |

### B5 — Graphics 2.0 cost reductions (visual review required)

| Field | Content |
| --- | --- |
| Scope | Render-scale policy (E.4); IBL scoped to metals/glossy in low/balanced with an SH/hemisphere replacement; cheaper tabletop in low/balanced; shadow map updated only when casters move; high: canvas MSAA off with the composer, SMAA/MSAA decision |
| Files | `apps/client/src/game/scene/render/renderQuality.ts`, `apps/client/src/game/scene/render/environment/StudioEnvironment.tsx`, `apps/client/src/game/scene/render/table/Tabletop.tsx`, `apps/client/src/game/scene/render/lighting/SceneLightRig.tsx`, `apps/client/src/game/scene/GameScene.tsx`, `apps/client/src/game/scene/render/post/` |
| Benefit | Balanced GPU median on the reference from 17.6 ms to an expected ≤ 13 ms; low to ≤ 10 ms |
| Complexity / risk | Medium / Medium–High (look) |
| Dependencies | B0 |
| Success | GPU targets above with owner-approved side-by-side captures (tile-name readability gate) |
| Regression prevention | Visual capture suite per tier; tier diagnostics tests |

### B6 — Measured adaptive `auto`

| Field | Content |
| --- | --- |
| Scope | Heuristic start + GPU-time measurement on real animation frames; hysteresis; apply at idle; persist per GPU renderer string; never High on iGPU |
| Files | `apps/client/src/game/scene/render/renderQuality.ts`, a new controller module, `apps/client/src/settings/` |
| Benefit | Every device lands on a tier it can hold |
| Complexity / risk | Medium / Medium |
| Dependencies | B4 (achieved FPS), B5 (render scale) |
| Success | On the reference, `auto` settles within 10 s on a configuration with ≥ 57 FPS effective during walk and stays there |
| Regression prevention | Controller unit tests with recorded frame-time traces; no change in manual tiers |

### B7 — Load path

| Field | Content |
| --- | --- |
| Scope | Pre-bake (or worker-generate) table/district/pebble textures and the PMREM; reuse renderer capabilities instead of probe contexts and release probes with `WEBGL_lose_context` |
| Files | `apps/client/src/game/scene/render/table/tableTextures.ts`, `apps/client/src/game/scene/board/materials/districtSurfaceMaterials.ts`, `apps/client/src/game/scene/board/materials/whitePebbleSurface.ts`, `apps/client/src/game/scene/fallback/webglSupport.ts`, `apps/client/src/game/scene/render/renderQuality.ts` |
| Benefit | About −0.45 s of main-thread work at load and at tier switches; fewer GPU contexts |
| Complexity / risk | Medium / Low–Medium (asset budget; the packaged size gate applies) |
| Dependencies | None |
| Success | Warm load long-frame total ≤ 0.6 s on the reference; ≤ 2 WebGL contexts per page |
| Regression prevention | Texture-equivalence tests (existing deterministic generators as oracle); packaged budget check |

### B8 — Animation and presentation timing polish

| Field | Content |
| --- | --- |
| Scope | Start animation clocks at the first rendered frame; chain hops by nominal end time; snap the presentation backlog when returning from a hidden state beyond a threshold (after confirming PERF-22) |
| Files | `apps/client/src/game/presentation/executors/movementExecutor.ts`, `apps/client/src/game/presentation/PresentationController.ts`, animation components |
| Benefit | Even hop cadence; no catch-up animations after restore |
| Complexity / risk | Low–Medium / Medium (presentation pipeline contract — update `Client/presentation-pipeline.instruction.md`) |
| Dependencies | B4 |
| Success | Motion trace: hop boundary gaps ≤ 2 ms; restore from minimized shows the current state within 1 s |
| Regression prevention | Presentation queue tests; motion-trace probe |

---

## K. Acceptance Criteria

Measured with the Appendix 1 protocol on the reference device of this report (ThinkPad T14 Gen 1, Intel UHD, 1920×1080
@ 60 Hz, 125 % scaling, AC power), production build, warm unless stated; numbers are compared only with this report's
baseline under the same conditions.

| Criterion | Baseline (this report) | Phase B target |
| --- | --- | --- |
| `auto` walk replay: effective FPS during animation | 46.2 | ≥ 57 |
| `auto` walk: contiguous interval p95 / p99 / max | 49.9 / 66.5 / 66.7 ms | ≤ 20 / ≤ 34 / ≤ 50 ms |
| `auto` walk: late frames | 22 % | ≤ 5 % |
| `auto` walk: 1 % low | 15.0 FPS | ≥ 30 FPS |
| Any gameplay scenario (G.4): max interval | 50–117 ms | ≤ 50 ms |
| Program links during a warm replay | 6.7–19 | 0 |
| React task p95 during walk | 23.5 ms | ≤ 8 ms; no task > 16.7 ms during animations except snapshot resets |
| Hover sweep: R3F commits / program links | 19 / 19 | 0 / 0 |
| Idle frames (10 s), production and harness | 0 / ~60 | 0 / 0 |
| Cold first launch (fresh profile, Electron): longest frame | 4.46 s | ≤ 300 ms |
| Live tier switch (warm): longest frame | 366 ms | ≤ 150 ms |
| 30-replay soak: heap growth / geometry growth | +6.7 MB / +30 | ≤ +1 MB / 0 |
| Scheduler simulation (60/75/90/120/144/165/240 Hz × caps, precise and 15.6 ms timers) | 10 of 35 cells below a reachable cap (precise timers); 60 Hz cap 60 → 30.5 FPS with coarse timers | every cell matches the owner-approved policy, with both timer models |
| Balanced GPU median (steady) | 17.6 ms | ≤ 13 ms with owner-approved visuals |
| Regressions | — | `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm validate:docs` PASS; visual captures within thresholds; reduced motion, fallback board, reconnect snap and multiplayer presentation tests unchanged |

Targets for other devices (a 144 Hz monitor, a dGPU, a battery run) are set after their baseline is recorded (L).

---

## L. Remaining Unknowns

1. **High-refresh behavior on real hardware** (75–240 Hz): only simulated.
2. **Battery power:** Chromium timer resolution and GPU clocks on battery; PERF-20 is a hypothesis until measured.
3. **Other GPUs:** Iris Xe / Ryzen iGPUs (the plan 02 reference), discrete and dual-GPU laptops (whether Electron runs on the
   dGPU — `powerPreference: 'high-performance'` alone does not force it on Windows), macOS/Metal, Apple Silicon.
4. **The owner's own setup for the reported symptoms:** device, monitor refresh, tier, cap, and whether the observations came
   from a development build (PERF-19) or the packaged app.
5. **End-to-end multiplayer** with real sockets, bots and network jitter; long (30–60 min) packaged sessions; audio cost.
6. **GPU clock telemetry** to confirm the DVFS explanation of PERF-11.
7. **Compositor-level presentation** (dropped frames after the main thread finished on time).
8. **Visual acceptability** of every Graphics 2.0 change — an owner decision, not a measurement.
9. **Hidden-window backlog** (PERF-22) — manual test pending.

---

## Appendix 1: Reproduction protocol

All steps are run from the repository root on Windows with Node 24 and pnpm; nothing is written into the repository. The
probe scripts used for this report lived in a temporary session folder; B0 proposes adding them under `scripts/perf/`.

1. **Production-mode UAT build and server** (outside the repository):

   ```bash
   cd apps/client && VITE_PHASE4_UAT=1 pnpm exec vite build --mode phase4-uat --minify false --outDir "$TEMP/otb-uat-dist" --emptyOutDir
   ```

   ```bash
   cd apps/client && pnpm exec vite preview --outDir "$TEMP/otb-uat-dist" --port 4173 --host 127.0.0.1 --strictPort
   ```

2. **Scenario URL:** `http://127.0.0.1:4173/?phase4-uat=1&scenario=walk&quality=balanced&fpsLimit=60` (scenarios:
   `walk`, `roll-chance`, `purchase`, `hotel`, `house-2`, `rent`, `pass-go`, `card-chain`, `stress`, `dice-contact-shadows`,
   `board-readability`). Add `&probeQuiet=1` for production-like runs, `&probeLabels=1` to label linked programs.
3. **Driver:** Playwright `chromium.launchPersistentContext(dir, { channel: 'chrome', headless: false, viewport: null,
   args: ['--ignore-gpu-blocklist', '--window-size=1536,864', '--window-position=0,0'] })` (keep the real DPR; never emulate a
   viewport), `context.addInitScript({ path: 'probe-init.js' })`, wait for `main.phase4-uat[data-uat-ready="true"]` plus 3 s,
   call `window.__PROBE__.attachMain()`, set `window.__PROBE__.gpuEnabled = true`, then click the "Chạy lại" button once as
   warm-up and 3–5 times measured, marking `start:<tag>`/`end:<tag>` with `window.__PROBE__.mark`. Cold cache = a new empty
   profile directory. Electron = `_electron.launch` of `electron.exe` with a two-line main that opens a 1440×900
   `BrowserWindow` (`contextIsolation`, `sandbox`) on `about:blank`, then `page.goto(url)`.
4. **CPU profiles:** CDP `Profiler.start` with a 200–250 µs sampling interval around the measured replays (for load: start on a
   same-origin blank document such as `/probe-blank.txt`, then navigate).
5. **GPU A/B:** with `uat-controls=hidden&probeQuiet=1`, run a rAF loop calling `window.__OWN_THE_BLOCK_RENDERER_INVALIDATE__()`,
   skip 30 frames, measure 2 s; obtain the R3F store as `window.__PROBE__._r3fRoot.containerInfo.getState()` and toggle one
   variable (examples: `state.setDpr(1)`, `state.scene.environment = null`, `state.gl.shadowMap.autoUpdate = false`,
   `state.scene.getObjectByName('Tabletop').visible = false`); alternate baseline and variant three times.
6. **Scheduler simulation:** `node --experimental-transform-types` on a script that imports
   `apps/client/src/game/scene/render/demandFrameScheduler.ts` and supplies a `FrameSchedulerHost` whose `requestAnimationFrame`
   fires at the next multiple of `1000/refreshHz` and whose `setTimeout` fires after `delay` (+0–1 ms, or rounded up to a
   15.625 ms tick); the advance callback adds 4 ms and re-invalidates while the animation runs.
7. **Timer baseline:** on a blank same-origin page, `await new Promise(r => setTimeout(r, d))` 120 times for d = 4, 10, 14 ms;
   report lateness percentiles; repeat on battery.
8. **Manual alternative without scripts:** host a game in the desktop app, open the LAN address in Chrome as a spectator
   (production client served by the host), record a Chrome DevTools Performance trace with "Screenshots" and "Web Vitals"
   during a dice roll and a walk; look for `getProgramInfoLog` inside `WebGLRenderer.render`, `createMergedBoxGeometry` inside
   React work, and GPU-bound frames in the GPU track.

## Appendix 2: Probe script

<details>
<summary>probe-init.js (injected with <code>addInitScript</code>; observation only)</summary>

```js
// External measurement probe for the Phase A performance audit. Injected before any page script.
// It never changes application code; it only wraps browser APIs to observe them.
(() => {
  if (window.__PROBE__) return;
  const now = () => performance.now();
  const P = window.__PROBE__ = {
    frames: [], samples: [], timers: [], links: [], syncWaits: [], tex: [], mips: [],
    bufs: { n: 0, bytes: 0, maxMs: 0 }, draws: 0, loaf: [], longtasks: [], contexts: [],
    commits: [], renderers: [], gpuSupported: null, gpuDisjoint: 0, marks: [], countFibers: false,
    labelPrograms: /[?&]probeLabels=1/.test(location.search),
    captureStacks: /[?&]probeStacks=1/.test(location.search),
  };
  P.mark = name => P.marks.push({ name, t: now() });

  // Quiet mode: drop the UAT harness's diagnostics listeners (harness-only feedback loop).
  P.quiet = /[?&]probeQuiet=1/.test(location.search);
  if (P.quiet) {
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this === window && (type === 'own-the-block-renderer' || type === 'own-the-block-destination-preview')) return undefined;
      return origAdd.call(this, type, listener, options);
    };
    const origInfo = console.info.bind(console);
    console.info = (...a) => {
      if (typeof a[0] === 'string' && a[0].startsWith('[own-the-block-renderer]')) return;
      origInfo(...a);
    };
  }

  // React commit hook: counts commits per renderer (React DOM and the R3F reconciler) and keeps the latest roots.
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    let nextId = 1;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(), supportsFiber: true, isDisabled: false,
      inject(internals) {
        const id = nextId++;
        this.renderers.set(id, internals);
        P.renderers.push({ id, name: internals.rendererPackageName, version: internals.version, bundleType: internals.bundleType });
        return id;
      },
      checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, setStrictMode() {},
      onCommitFiberRoot(id, root) {
        const renderer = P.renderers.find(r => r.id === id);
        if (renderer && renderer.name === '@react-three/fiber') P._r3fRoot = root;
        else if (renderer) P._domRoot = root;
        P.commits.push({ id, t: now() });
      },
    };
  }

  // WebGL hooks: program links (optionally labelled by SHADER_NAME/defines/source hash), synchronous waits, uploads.
  const ctxIds = new WeakMap();
  let nextCtx = 0;
  const ctxId = gl => {
    let id = ctxIds.get(gl);
    if (id === undefined) {
      id = nextCtx++;
      ctxIds.set(gl, id);
      P.contexts.push({ id, t: now(), w: gl.canvas && gl.canvas.width, h: gl.canvas && gl.canvas.height,
        webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext });
    }
    return id;
  };
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = origGetContext.call(this, type, ...rest);
    if (ctx && (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl')) ctxId(ctx);
    return ctx;
  };
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const wrap = (name, make) => {
      const orig = proto[name];
      if (typeof orig !== 'function' || orig.__probe) return;
      const wrapped = make(orig);
      wrapped.__probe = true;
      proto[name] = wrapped;
    };
    wrap('linkProgram', orig => function (program) {
      let name = ''; let hash = 0; const defines = new Set();
      if (P.labelPrograms) {
        for (const shader of this.getAttachedShaders(program) || []) {
          const text = this.getShaderSource(shader) || '';
          for (let i = 0; i < text.length; i += 1) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
          const named = text.match(/#define SHADER_NAME (\S+)/);
          const typed = text.match(/#define SHADER_TYPE (\S+)/);
          if (named) name = named[1]; else if (typed && !name) name = `(${typed[1]})`;
          for (const d of ['USE_INSTANCING', 'USE_INSTANCING_COLOR', 'USE_MAP', 'USE_SHADOWMAP', 'USE_ENVMAP', 'OPAQUE']) {
            if (text.includes(`#define ${d}`)) defines.add(d);
          }
        }
      }
      const s = now(); const r = orig.call(this, program);
      P.links.push({ ctx: ctxId(this), t: s, dur: now() - s, name, hash, defines: [...defines] });
      return r;
    });
    for (const name of ['getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog',
      'getActiveUniform', 'getUniformLocation', 'getActiveAttrib', 'getAttribLocation', 'readPixels', 'finish', 'getError']) {
      wrap(name, orig => function (...a) {
        const s = now(); const r = orig.apply(this, a); const d = now() - s;
        if (d > 0.3) P.syncWaits.push({ ctx: ctxId(this), fn: name, t: s, dur: d });
        return r;
      });
    }
    for (const name of ['texImage2D', 'texSubImage2D', 'texStorage2D']) {
      wrap(name, orig => function (...a) {
        const s = now(); const r = orig.apply(this, a);
        P.tex.push({ ctx: ctxId(this), fn: name, t: s, dur: now() - s });
        return r;
      });
    }
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      wrap(name, orig => function (...a) { P.draws += 1; return orig.apply(this, a); });
    }
  }

  // Scheduler wrappers, identified by source text (unminified builds only).
  const origRAF = window.requestAnimationFrame.bind(window);
  const origSetTimeout = window.setTimeout.bind(window);
  const src = fn => { try { return Function.prototype.toString.call(fn); } catch { return ''; } };
  const isSchedulerFrame = fn => { const s = src(fn); return s.includes('this.advance(') && s.includes('pendingFrames'); };
  const isSchedulerTimer = fn => { const s = src(fn); return s.includes('this.requestFrame()') && s.includes('timeoutId'); };
  let inScheduler = false;
  let continued = false;
  const pending = [];
  const pollGpu = () => {
    const gl = P._mainGl; const ext = P._ext;
    if (!gl || !ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (disjoint) P.gpuDisjoint += 1;
    while (pending.length) {
      const { q, f } = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      f.gpu = disjoint ? null : gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
      pending.shift();
    }
  };
  P.pollGpu = pollGpu;
  window.requestAnimationFrame = function (cb) {
    if (typeof cb !== 'function' || !isSchedulerFrame(cb)) return origRAF(cb);
    if (inScheduler) continued = true;
    return origRAF(function (ts) {
      pollGpu();
      const gl = P._mainGl; const ext = P._ext;
      let q = null;
      if (gl && ext && P.gpuEnabled) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
      const samplesBefore = P.samples.length;
      const start = now();
      inScheduler = true; continued = false;
      try {
        cb(ts);
      } finally {
        inScheduler = false;
        const end = now();
        if (q) gl.endQuery(ext.TIME_ELAPSED_EXT);
        const f = { ts, start, cpu: end - start, continued, rendered: P.samples.length > samplesBefore, gpu: null };
        P.frames.push(f);
        if (q) pending.push({ q, f });
      }
    });
  };
  window.setTimeout = function (cb, delay, ...rest) {
    if (typeof cb === 'function' && isSchedulerTimer(cb)) {
      if (inScheduler) continued = true;
      const req = now(); const d = Number(delay) || 0;
      return origSetTimeout(function () {
        P.timers.push({ req, delay: d, late: now() - (req + d) });
        return cb.apply(this, arguments);
      }, delay, ...rest);
    }
    return origSetTimeout(cb, delay, ...rest);
  };

  // The app's diagnostics (localhost/UAT only) call this after every main scene render.
  window.__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__ = sample => { P.samples.push(sample); };

  // Long Animation Frames with script attribution, and long tasks.
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        P.loaf.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration,
          scripts: (e.scripts || []).map(s => ({ invoker: s.invoker, fn: s.sourceFunctionName,
            url: (s.sourceURL || '').split('/').pop(), pos: s.sourceCharPosition, dur: s.duration })) });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) P.longtasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* unsupported */ }

  P.attachMain = () => {
    const canvas = document.querySelector('.game-scene canvas');
    const gl = canvas && origGetContext.call(canvas, 'webgl2');
    if (!gl) return 'no-gl';
    P._mainGl = gl;
    P.mainCtx = ctxId(gl);
    P._ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    P.gpuSupported = Boolean(P._ext);
    return 'ok';
  };
})();
```

</details>

Contiguous-interval analysis (the core of every pacing number in this report):

```js
// frames: scheduler callbacks inside one measured window, in order.
const rendered = frames.filter(f => f.rendered);
const contiguous = [];
for (let i = 0; i + 1 < rendered.length; i += 1) {
  if (rendered[i].continued) contiguous.push(rendered[i + 1].ts - rendered[i].ts);
}
const expectedMs = Math.max(1000 / fpsLimit, 1000 / 60);
const late = contiguous.filter(v => v > expectedMs * 1.5).length;
const effectiveFps = 1000 / (contiguous.reduce((a, b) => a + b, 0) / contiguous.length);
```
