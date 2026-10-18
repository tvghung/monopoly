# 08F — Phase B3: shader warm-up

> **HISTORICAL** — Implementation record of performance program batch B3 (2026-10-17), built on the
> [Phase A audit](./08A_PERFORMANCE_AUDIT.md) (REFERENCE), the [B3 gate](./08D_PHASE_B3_PREREQUISITE_GATE.md) and its
> [investigation](./08E_PHASE_B3_INVESTIGATION.md) (targets T1–T5 are in 08E §11.1). It records what was changed, how it was measured
> and what the measurements showed; it is not a rule. Current rules:
> [game board instruction, "Shader warm-up"](../monopoly-websockets/Client/game-board.instruction.md); measurement tooling:
> [scripts/perf/README.md](../../scripts/perf/README.md); raw data: [08F_evidence/](./08F_evidence/README.md).

Status: **PARTIAL.** The cold-launch freeze is gone and nothing links after the warm-up, but one owner-approved target is not met and
one is met only in part:

| # | Target (08E §11.1) | Result on the measuring machine | Verdict |
| --- | --- | --- | --- |
| T1 | Cold longest active frame ≤ 300 ms | median **108 ms**, P95 201, max 202 over 20 launches; `main`: median 2613, P95 2729, 20 of 20 above 300 | **MET** |
| T2 | 0 program links after `otb:warmup:done` | **0** in 20 cold launches (first and second scripted turn), in 32 `perf:warmup-check` launches and switches, and in 5 soak runs (150 replays) | **MET** |
| T3 | Cover the 42 stable cold signatures; unexpected variants handled safely | 30 of 42 are linked; the other 12 are pre-environment variants that a frame drawn after the environment never asks for (§7.3). Safety of an unexpected variant shown with a negative control | **PARTIAL** |
| T4 | No program/geometry/texture growth, no visual or gameplay regression | Soak growth 0 / 0 / 0 in 5 of 5 runs; lifecycle check passes; 14 of 19 settled states bit-identical, the rest explained (§8). Heap growth unchanged (open item) | **MET** with the open items of §10 |
| T5 | Time-to-playable P95 within +10 % of a same-machine baseline (≤ 2044 ms on the original machine) | median **3747 ms**, P95 **3867** against `main` median 2162, P95 2228 (limit 2451): **+74 % at P95** | **FAIL** |

Overall verdict: **PARTIAL.** T5 is not met and cannot be met by this design without further work (§7). The four items that 08E §11.5 keeps
open (B2 burst, run-18 hang, extra load-time variant, heap growth) stay open (§10).

## Contents

- [1. Scope and what did not change](#1-scope-and-what-did-not-change)
- [2. Machine, bundles and method](#2-machine-bundles-and-method)
- [3. Architecture](#3-architecture)
- [4. Changed files](#4-changed-files)
- [5. Cold launch: before and after](#5-cold-launch-before-and-after)
- [6. Scenarios, tiers and fallbacks](#6-scenarios-tiers-and-fallbacks)
- [7. Targets in detail](#7-targets-in-detail)
- [8. Visual and behavior equivalence](#8-visual-and-behavior-equivalence)
- [9. Validation](#9-validation)
- [10. Open items and remaining risks](#10-open-items-and-remaining-risks)
- [11. Reproduce](#11-reproduce)
- [12. Acceptance checklist](#12-acceptance-checklist)

## 1. Scope and what did not change

Client rendering only. Not touched: gameplay rules, server authority, the socket protocol, persistence, the FPS scheduling policy (the
frame scheduler gained a hold, its pacing is unchanged), B4 (scheduler pacing) and B5. Materials, geometry, animation and shader sources
are unchanged; one effect, `StudioEnvironment`, no longer runs twice (§3.6). `debug.checkShaderErrors` is on and the probe is unchanged in
the measured runs; no measurement boundary was moved. Two measurement-tool changes: `b3Baseline.mjs --from <n>` (alternate two bundles) and the new
`warmupCheck.mjs`.

## 2. Machine, bundles and method

| Item | Value |
| --- | --- |
| Machine | 11th Gen Core i7-11800H laptop, Windows 11 Home 10.0.26200, AC power; Chrome 155 chose the **Intel UHD Graphics (0x9A60)** iGPU through ANGLE/D3D11 (a GeForce RTX 3050 Ti is present and unused: the page reports the Intel renderer), 1536 × 864 window, FPS cap 60 |
| Not the machine of 08E | 08E measured a Core i5-10210U on Windows 10 (the "original baseline machine"). **That machine was not available.** Every before/after figure here is main against B3 on this machine, alternately. T5's absolute limit of 2044 ms (derived from 1858 ms P95 there) cannot be evaluated here; `main` itself needs 2162 ms median on this machine |
| Bundles | `main` = `dfb1e31` (the base of this branch); B3 = this branch. Both are UAT bundles built unminified (`VITE_PHASE4_UAT=1 vite build --mode phase4-uat --minify false`), the probe-compatible build of 08E |
| Cold launch | `b3Baseline.mjs`: a new Chrome process and an empty profile per launch (no driver shader cache), `walk` fixture, Balanced, 60 FPS cap; 20 launches per bundle, **alternating** (main 1, B3 1, main 2, ...) to spread drift |
| Metric definitions | Those of 08E §11.2–11.3: longest active frame = max(longest scheduler callback, longest active contiguous interval); time-to-playable = navigation start to the first board frame at or after `otb:warmup:done` (the first board frame for `main`, which has no warm-up) |
| Series on the final code | The cold series, `perf:warmup-check`, lifecycle check, visual comparison and the 5-run soak were all run on the final commit's bundle. An earlier 20-launch series on the same code without the loading label gave the same picture ([summary](./08F_evidence/cold-b3-before-loading-indicator/baseline-summary.json)) |

## 3. Architecture

```text
GameScene (memo)                                   creates FrameWarmupHost (holds the DemandFrameScheduler from onCreated)
 └ Canvas
    └ WarmupHostContext
       ├ SceneLightRig, StudioEnvironment (PMREM), Tabletop, Board3D ...   all layers mount and apply their effects
       └ ShaderWarmup  (last child, renders nothing)
            effect on [gl, scene, camera, tier, context epoch]:
              host.hold()
              WarmupFixtures      stand-ins for what the scene does not hold yet (kept for the renderer's life)
              runShaderWarmup()   marks, compile batches, steps, outcome
              host.release() + invalidate()    only when this run was not replaced
```

### 3.1 Holding the frames

`DemandFrameScheduler.hold()` returns an idempotent release; holds nest; invalidations made while held are kept and the first frame after
the last release draws the latest state. `FrameWarmupHost` attaches the scheduler when the canvas is created, so **no frame is drawn before the first warm-up ends**
(that frame is where a cold launch froze for 2–2.7 s). A watchdog (20 s) ends a hold whose warm-up never reported back and the warm-up has its own 12 s deadline: a stuck
driver costs the old behavior (compile on first use), never a blank board. While the first hold lasts the scene shows the same "building the board" label the lazy
chunk's fallback shows; it is a data attribute plus CSS, so it never renders the scene (see `08F_evidence/controls/loading-indicator-during-warmup.png`).

### 3.2 Compiling

`renderer.compile(scene)` creates every program for the mounted scene, hidden objects included, and returns at once because with `KHR_parallel_shader_compile` the driver links on
worker threads. `compileBatches` starts all batches before it waits, then finishes each program as soon as it is ready: three.js's first use of a program (reading the link
log and enumerating uniforms and attributes, about 10 ms each on ANGLE, and the place where the shader error check runs) is performed by the warm-up, a few programs per task, instead of
inside the first frame. `compileAsync` itself was not used because it cannot be cancelled and its 10 ms poll never ends if the context is lost; the same readiness test
(`program.isReady()`) is polled with an abort signal and a deadline. Without the extension, the first-use work is done one program per slice. Scene textures are then uploaded in
slices with `renderer.initTexture`, which removed about 140 ms of `texSubImage2D` from the first frame.

### 3.3 Fixtures

A program is keyed on material parameters, geometry attribute layout, instancing flags (including whether an instance color exists), lights, render target and renderer state. Stand-ins with
the same inputs compile the program the real object will ask for (`warmupFixtures.ts`). They are never added to the scene and are kept for the renderer's life, because a program
stays cached only while some material references it. They are built from the factories the real components export, so the two cannot drift silently:

| Family | Why the scene cannot reach it | Source of the stand-in |
| --- | --- | --- |
| Shadow depth | Created inside the shadow pass, drawn into a render target | Derived from the scene's shadow casters the way `WebGLShadowMap.getDepthMaterial` derives them; compiled with a target bound (the target is part of the key) |
| Mascot standee | Mounts when its texture has been rasterised; fading variant for bankruptcy | `getStandeeFaceMaterialProps`, `applyStandeeOpacity`, `createStandeeDepthMaterial` |
| Dice | Mount at the first roll | Same body material props, `createDiceTrailMaterials`, `createDiceContactShadowMaterial`; by tier (no trail on Low, a shadow-casting body on High) |
| Destination preview | Mounted per move | `createDestinationPreviewMaterials` |
| House build, puff | The instance color exists only once a house does (a different program) | `createTubeHouseMeshes` with an instance color, `createConstructionPuffMaterial` |

### 3.4 Tiers

A tier change holds the frames again and the old picture stays on screen until the new tier's programs are ready. On the high tier the scene is compiled against the post chain's input
buffer, and the chain's own full-screen programs are found by walking the chain's object graph (`warmupPostChain.ts`: the ambient occlusion pass alone keeps six) and compiled on a one-triangle
stand-in with the target their pass draws into and **no lights** (lights are part of the key; the passes draw their own empty scenes). The chain is created in an effect of its own and loads
lazily, so `ScenePostEffects` announces it when its passes exist and the warm-up waits for it (5 s at most). Programs of a tier already visited stay cached: switching back takes about 6 ms.

### 3.5 Marks and report

`otb:warmup:start` / `otb:warmup:done` bound the first warm-up; `done` is emitted only when every step finished. A timeout or a cancellation emits `otb:warmup:incomplete` /
`otb:warmup:aborted` instead. Later warm-ups emit `otb:warmup:tier-switch:*` and `otb:warmup:context-restored:*`. Dev/UAT pages publish the report as `window.__OWN_THE_BLOCK_WARMUP__`.

### 3.6 `StudioEnvironment`

Its PMREM effect depended on `invalidate`, which react-three-fiber replaces when the canvas is created, so the studio was filtered twice at every launch (the program signatures show it: `main` links the PMREM programs twice
in each of 20 launches, 140 repeat links in total; B3 links them once, 0 repeats). The effect now reads `invalidate` through a ref. The environment texture is the same.

## 4. Changed files

| File | Change |
| --- | --- |
| `apps/client/src/game/scene/render/warmup/shaderCompile.ts` | Batch compile, readiness polling, first-use finishing, render-target binding, abort/timeout/no-parallel paths |
| `apps/client/src/game/scene/render/warmup/warmupRunner.ts` | Orchestration, marks, report, outcome rules |
| `apps/client/src/game/scene/render/warmup/ShaderWarmup.tsx` | The component (hold, run, release, tier/context re-runs, fixtures, steps) |
| `apps/client/src/game/scene/render/warmup/warmupHost.ts` | `FrameWarmupHost`, watchdog, loading flag, post-chain rendezvous, context |
| `apps/client/src/game/scene/render/warmup/warmupFixtures.ts` | Stand-ins (§3.3) |
| `apps/client/src/game/scene/render/warmup/warmupPostChain.ts` | High-tier chain materials |
| `apps/client/src/game/scene/render/warmup/warmupTextures.ts` | Texture collection and sliced upload |
| `apps/client/src/game/scene/render/demandFrameScheduler.ts` | `hold()` / `isHeld` |
| `apps/client/src/game/scene/GameScene.tsx`, `GameScene.css`, `apps/client/src/components/BoardRenderSurface.tsx` | Host creation and attach, provider, `<ShaderWarmup />`, loading label |
| `apps/client/src/game/scene/render/post/ScenePostEffects.tsx` | Announces the chain to the warm-up |
| `apps/client/src/game/scene/render/environment/StudioEnvironment.tsx` | No second PMREM (§3.6) |
| `scripts/perf/warmupCheck.mjs`, `scripts/perf/b3Baseline.mjs`, `scripts/perf/README.md`, `package.json` | `perf:warmup-check`; `--from` for alternating series |
| Tests | `shaderCompile`, `warmupRunner`, `warmupHost`, `ShaderWarmup`, `warmupFixtures`, `warmupPostChain`, `warmupTextures` tests; hold cases in `demandFrameScheduler.test.ts` |
| Docs | `game-board.instruction.md` ("Shader warm-up"), the client testcase checklist, this record and its evidence |

## 5. Cold launch: before and after

20 launches per bundle, alternating, empty profile each ([raw](./08F_evidence/cold-b3/baseline-summary.json), [main](./08F_evidence/cold-main/baseline-summary.json)).

| Measure | `main` min / median / P95 / max | B3 min / median / P95 / max |
| --- | --- | --- |
| Longest active frame (T1) | 2533 / 2613 / 2729 / 2740 ms | **82 / 108 / 201 / 202 ms** |
| Longest scheduler callback | 2454 / 2524 / 2569 / 2591 ms | 71 / 99 / 186 / 187 ms |
| Launches with an active frame above 300 ms | 20 of 20 | **0 of 20** |
| Longest long task | 2463 / 2527 / 2573 / 2598 ms | 1227 / 1247 / 1273 / 1310 ms |
| Program links in the cold window (first-use) | 49 (42) median; 50 (43) at P95 | **32 (32) in 20 of 20**; 0 repeat links (main: 7 per launch) |
| Links after `otb:warmup:done` | no warm-up | **0 in 20 of 20** |
| Programs after the second turn | 43 / 43 / 44 / 44 | 30 / 30 / 30 / 30 |
| Second turn longest active frame (warm) | 30 / 32 / 39 / 42 ms | 30 / 31 / 42 / 46 ms |
| First frame after `done` (callback) | n/a | median 140 ms (the draw itself, uploads done) |
| Warm-up window (`start` to `done`) | n/a | median 659 ms (Balanced) |
| **Time-to-playable (T5)** | 2121 / 2162 / 2228 / 2242 ms | **3670 / 3747 / 3867 / 3886 ms** |
| Time until the last frame of 100 ms or more ends | median 7405, P95 7648 ms (20 of 20 launches have one) | median 3875, P95 3963 ms (10 of 20 launches have one; the others have none) |

Where the time goes before the first frame (B3 medians): the page is mounted at 0.86 s, the canvas and the first PMREM link come at 2.19 s (`main` draws its first frame here, at 2.17 s),
the studio PMREM takes 0.91 s of blocked main thread (its convolution shader is the heaviest compile of the page), the warm-up starts at 3.10 s and ends at 3.75 s.

## 6. Scenarios, tiers and fallbacks

| Check | Result |
| --- | --- |
| `pnpm perf:warmup-check` ([log](./08F_evidence/warmup-check/check.txt)) | **32 of 32**: 20 scenarios at Balanced (walk, pass-go, purchase, rent, decline, partial-debt, house-1, house-4, hotel, construction-reduced, chance, chest, card-chain, jail, bankrupt, reduced-motion, dice-contact-shadows, landmarks-all, stress, standees); walk, house-4 and dice at Low and at High; six live tier switches. Every launch: marks present and ordered, outcome `complete`, **0 links after `done`**, longest callback after it ≤ 300 ms, 0 page errors |
| Warm-up cost by tier | Balanced 613–892 ms, Low 587–641, High 849–898. Switches: Balanced → Low 197 ms (9 links), back 6 ms; Balanced → High 515 ms (38 links), High → Low 6 ms, Low → High 51 ms (11 links: the chain is created again), High → Balanced 6 ms. Longest callback after any switch ≤ 33 ms |
| Programs held | 30 after a Balanced launch; 52 → 55 → 106 → 95 → 106 → 95 across the switch sequence (the first Low and High visits add programs, later visits add none or the re-created chain): bounded, no growth per cycle |
| Reduced motion | `reduced-motion` and `construction-reduced` scenarios pass |
| Context loss | `pnpm perf:lifecycle-check --expect-persistent` passes: the loss falls back to the legacy board with 0 new page errors, the live tier cycle and the persistent-material checks hold |
| No WebGL | Legacy board, no warm-up, no error ([results](./08F_evidence/controls/results.md)) |
| No `KHR_parallel_shader_compile` | Warm-up `complete`, 0 links after `done`, longest callback after it 78 ms |
| Unexpected variant | Negative control: with the construction fixture removed the check fails on the two missing programs and the board still draws; the variant compiles on first use as before |
| Soak ([B3](./08F_evidence/soak-b3/series.md), [main](./08F_evidence/soak-main/series.md)) | 5 runs of 30 replays: 0 first-use programs in warm-up and soak replays, 0 repeat links, 0 context or renderer events, interval P95 21 ms, 0 stalls of 1 s |

## 7. Targets in detail

### 7.1 T1 and T2

Both are met on every launch measured. The longest callback after `done` in the 32 checks is 66–214 ms (214 ms on one High launch). The remaining first-frame cost is the draw itself (140 ms at the median in the cold series); in a development-bundle trace one program's first use (about 50 ms) still fell inside it and was not identified.

### 7.2 T4

Soak growth over 30 replays: geometries 0, programs 0, textures 0 in 5 of 5 runs (08E measured 0 in 20 of 20 on `main`). The lifecycle check (one material per shared effect, live tier cycle, forced context loss) passes. Heap growth is +1.89 to +1.99 MB
(`main` on this machine: +1.88 to +1.99 MB): unchanged, and the B2 heap target stays unmet (§10). Programs after the second turn fall from 43 to 30 because the 12 pre-environment variants and the second PMREM are no longer linked.

### 7.3 T3

The 42 signatures are those present in every one of the 20 `main` launches ([signature-coverage.json](./08F_evidence/signature-coverage.json)). **30 are linked by B3**; 2 more programs (the house build and its puff) are linked that the walk fixture never asks for. The 12 that are not linked are
the lit and instanced variants `main` compiled in its first frame, **before the environment map existed**: `main` drew that frame, then generated the environment, then compiled every lit material again with it (that is where the "49 links, 42 signatures" of 08E §5 come from). B3 draws its first frame after the environment exists, so those variants are never asked for. A board whose environment layer failed is compiled as it is, so its variants are covered by the warm-up itself. I did not
compile the 12 as well to reach 42: it adds about 170 ms of warm-up (measured in a trial) and 12 programs that nothing draws, and two of them (coin material variants) hold their own environment map and cannot be reached that way. This is a reading of T3 that I am
reporting, not hiding: by the letter of "warm-up signature set ⊇ the 42" the target is **not** met.

### 7.4 T5 — not met, and why

Time-to-playable rises by 1.6 s at the median (+74 % at P95, limit +10 %). The cause is structural, not an inefficiency that tuning removes: `main` drew its first frame as soon as the canvas existed (2.17 s) and paid the compile inside that frame and in a second frame about 2.6 s later
(the 2.6 s stalls of §5); B3 must finish three things before the first frame it counts as playable: the studio PMREM (0.91 s, needed before any lit program can be compiled with the right key), then the warm-up (0.66 s). The warm-up itself cannot begin earlier because the renderer, the
scene and the environment do not exist before the canvas does, and the canvas is created after the lazy chunk and the React mount (2.19 s here). In exchange the page is free of frames of 100 ms or more 3.6 s sooner (median 3875 ms against 7405 ms) and the 2.6 s frames are gone.

Remaining gap: +1585 ms at the median against `main` (3747 against 2162) and +1416 ms over the limit at P95 (3867 against 2451). Not measured, but candidate ways to close part of it, each a separate decision:
(a) start the warm-up while the studio PMREM runs, by compiling the lit variants against a placeholder environment texture of the same layout (the variants depend only on its mapping and size), which would overlap part of the compile with the blocked PMREM (unmeasured, at most the 0.66 s warm-up);
(b) create the scene earlier (prefetch the scene chunk in the lobby, which a real match has and the harness has not) so the 2.19 s moves out of the load; (c) draw a first frame of the board without the lit materials while the programs compile (a visual change); (d) redefine "playable" as the first stable
frame, which is where B3 is 3.6 s ahead. The 08E target text ("must not regress by more than 10 %") is not reachable with the warm-up in the critical path.

## 8. Visual and behavior equivalence

`captureCompare.mjs` on the final code ([report](./08F_evidence/visual/full-run.visual-report.json)): **14 of 19 settled states bit-identical.** The five that differ:

- `board-low`, `board-balanced`, `board-high`, `crop-tax-38-balanced`: the **`main`** capture has no tile names (and no "Start" sign text); B3's has them. In `main`, the troika text completes after the first frame and the invalidation it requests does not reach the scheduler (the effect captured the `invalidate`
  that R3F replaces when the canvas is created), so the names stay missing until something else draws a frame: a screenshot of `main` 4, 10 and 20 s after load shows none. In B3 the text is ready during the hold, so the first frame has it. Once a frame is forced in both bundles the images are **bit-identical at Low and Balanced and
  differ by one pixel of one channel level at High** ([results](./08F_evidence/controls/results.md)). `main` against `main` is identical on these states, so the difference is not capture noise. **This is a latent defect of `main`, not fixed here and only hidden on a cold launch in B3** (§10).
- `dice-settled-balanced`: the dice silhouette only, as in 08B/08C (capture noise of that state; 0.2 % of pixels).

Behavior: the full client suite passes (254 files, 2520 tests, from 247 and 2468), including the render-isolation tests (the scene is still not committed by hover, settings or non-visual updates). The warm-up does not touch game state, the socket or persistence.
Not run: the Playwright end-to-end suites, a played match, Electron.

## 9. Validation

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm --filter @monopoly/client test` | PASS (254 files, 2520 tests) |
| `node --test scripts/perf/*.check.mjs` | PASS (38) |
| `pnpm build` | PASS (client build with the music, card and landmark validators; server typecheck) |
| `pnpm --filter @monopoly/desktop typecheck` / `test` | PASS / PASS (35 files, 519 passed, 6 skipped) |
| `pnpm validate:docs` | PASS |
| `pnpm desktop:package` | NOT RUN (packaging; no Electron main-process change) |
| `pnpm db:status`, server and PostgreSQL integration | NOT RUN (no server, persistence or protocol change) |
| Playwright e2e | NOT RUN |

## 10. Open items and remaining risks

Kept **open**, unchanged (08E §11.5): the B2 shader burst (57 programs, 2 s stall) — not seen in 5 soak runs, 20 cold launches or 32 checks here, cause still unknown, and a warm-up that is complete would hide its first-use cost but not explain it;
the run-18 hang — not seen (no unexplained timeout in the launches made for this record); the extra load-time variant — B3's 20 launches link the same 32 (`main` linked 43 first-use programs in one launch), not a resolution; heap growth over 30 replays (+1.9 MB, target ≤ 1 MB, B2 stays PARTIAL).

New or confirmed:

1. **T5 fails** (§7.4); the owner decides whether and how to pursue (a)–(d).
2. **A 1.2–1.3 s main-thread block remains at load** (longest long task, 1227–1310 ms): the studio PMREM and the first effects. It is not a frame and T1 does not see it, but the page does not respond during it; before B3 it was hidden inside the longer stalls.
3. **One outlier of 726 ms** in an earlier 20-launch series of the same code (a gap between frames with callbacks of 4–7 ms, 0.37 s after `done`); the final series has none, `main` showed a comparable extra 770 ms in one launch of its own series. Cause not identified; it is environmental until shown otherwise.
4. **T3 is 30 of 42** (§7.3).
5. **The latent `main` text-invalidation defect** (§8): tile names may not appear until another frame is drawn. B3 only hides it on cold launches because the text finishes during the hold. It should be fixed separately (the text effects should invalidate through the live scheduler, not the `invalidate` captured before it was swapped).
6. **A new transient effect that creates its own material needs a fixture**, or its first use links as before. `pnpm perf:warmup-check` fails on it; nothing fails earlier than that.
7. **High tier relies on a bounded walk of the post chain's object graph** to find the pass materials; a library update that moves them would show as links after `done` on High (the check covers it) and cost the old first-frame stall there.
8. One machine, one GPU/driver, Chrome only (not Electron), the harness path (not lobby to board), 20 fixtures, a fresh profile (a warm shader cache makes both bundles faster and was not measured).
9. Programs of every visited tier stay cached (Balanced 30, up to 106 after Low/Balanced/High were all visited): bounded, but not freed on a switch.
10. While the board is held (0.9 s of the first 3.7 s here) the page shows the loading label over an empty canvas; before, it showed the empty canvas for 2.2 s and then a frozen first frame.

## 11. Reproduce

```bash
git checkout <this commit>
pnpm install --frozen-lockfile
# bundles: B3 from this tree, main from dfb1e31 (a second worktree), both UAT and unminified
VITE_PHASE4_UAT=1 pnpm --filter @monopoly/client exec vite build --mode phase4-uat --minify false --outDir <dist-b3> --emptyOutDir
# 20 alternating cold launches (empty Chrome profile each)
for k in $(seq 1 20); do
  node scripts/perf/b3Baseline.mjs run --dist <dist-main> --from $k --runs 1 --out <dir>/main
  node scripts/perf/b3Baseline.mjs run --dist <dist-b3>   --from $k --runs 1 --out <dir>/b3
done
node scripts/perf/b3Baseline.mjs aggregate --out <dir>/main && node scripts/perf/b3Baseline.mjs aggregate --out <dir>/b3
pnpm perf:warmup-check --dist <dist-b3> --out <dir>/check
pnpm perf:lifecycle-check --dist <dist-b3> --out <dir>/lifecycle.json --expect-persistent
pnpm perf:visual-compare --before <dist-main> --after <dist-b3> --out <dir>/visual
pnpm perf:soak-series run --dist <dist-b3> --runs 5 --out <dir>/soak
```

## 12. Acceptance checklist

- [x] T1 cold longest active frame ≤ 300 ms (108 ms median, 202 ms max, 20 launches)
- [x] T2 0 links after `otb:warmup:done` (cold turns, 32 checks, 5 soak runs)
- [ ] T3 covers all 42 stable signatures (30 of 42; §7.3)
- [x] T4 no resource growth, no visual or behavior regression (heap target still open)
- [ ] T5 time-to-playable within +10 % (+74 % at P95)
- [x] Marks `otb:warmup:start` / `done` are accurate and `done` is never emitted before compilation finished (unit-tested for timeout, abort and a throwing renderer)
- [x] Tier switches, reduced motion, context loss, missing WebGL and missing parallel compile handled
- [x] Shader error checking and the probe stay on; no measurement boundary changed
- [x] B2 burst, run-18 hang, extra load-time variant and heap growth kept open
- [ ] Original baseline machine, Electron, a played match, Playwright e2e (not run)
