# 08K — Phase B7: Loading performance optimization

> **CURRENT DEVELOPMENT implementation record — DRAFT / PARTIAL recommendation.** Started from verified post-closeout `main` `2787559ab9e499eb4fdb7dff04b150798be05c46` in isolated worktree `codex/phase-b7-loading-optimization`. B4/B5 are merged and closed; B5 owner visual acceptance is PASS. Current rules belong to [join and bootstrap](../monopoly-websockets/Client/join-room.instruction.md) and the [board contract](../monopoly-websockets/Client/game-board.instruction.md).

## Investigation and choices

Affected traceability: F01/F02 (bootstrap/launcher), F18/F19 (WebGL/fallback), F41 (graphics setting) and the B3 lobby path. B3 already supplies the persistent scene, shader warm-up, baked studio environment and optimized procedural textures; B5 already lowered Low/Balanced GPU cost. Re-baking the environment or replacing those generators was therefore rejected. Removing shader warm-up would move links into gameplay frames. B6 adaptive graphics and B8 animation timing are outside this phase. There is no gameplay, authority, networking, wire-contract, snapshot or product-version change; protocol/snapshot versions stay unchanged.

The baseline eagerly evaluated the complete room/game `App` before showing the desktop launcher, even though no room was selected. It also kept the shared temporary WebGL capability context alive after caching its facts. First-time Low/High tier switches still compile shader variants, and first board canvas creation remains costly. B7 changes the avoidable launcher work and releases the probe resource; it does not promise to eliminate the board's first-time compile.

A constructor-only WebGL support check was measured as an experiment: in five alternating cold-board pairs it reduced observed context creations from three to two, but showed no consistent first-frame speedup. A real two-browser test then exposed a correctness failure: when the browser exposed `WebGL2RenderingContext` but refused `getContext('webgl2')`, the board stayed blank instead of falling back to the accessible DOM board. That candidate was **rejected and reverted**. Its raw results remain under [rejected-constructor-only](./08K_evidence/rejected-constructor-only/); they are not evidence for the delivered build. The final build retains the actual capability check and has three observed context creations, like baseline, but explicitly releases the one temporary context.

## Delivered implementation

- `AppBootstrap` loads the room/game `App` through a dynamic import. The desktop launcher renders before that gameplay chunk is parsed. Opening a room form preloads it after the form paints; web guests preload while bootstrap runs. Until the chunk resolves, the existing loading screen remains. A failed chunk load disconnects the attempted socket, shows the safe bootstrap error and can be retried.
- `getSharedWebGLProbe` still performs the necessary actual support check, caches the facts for explicit Auto, and releases its temporary context via `WEBGL_lose_context`. Fixed Low/Balanced/High settings no longer run a *separate quality probe*, but they still use the shared support probe. The actual renderer and legacy fallback remain authoritative. `SceneLayer`, standalone `GameScene` and quality document sync resolve fixed tiers without calling the Auto capability function.
- `scripts/perf/launcherStartup.mjs` adds reproducible renderer-startup measurement with a synthetic idle desktop bridge. `loadDecomposition.mjs` now reports context count and separates the capability context from the board canvas contexts. Focused tests cover the load-failure retry, fixed-tier behavior, Auto cache/release and blocked-WebGL fallback.

## Before/after measurements

Before and final bundles were built from the unmodified post-closeout main and this branch with `VITE_PHASE4_UAT=1`, unminified `vite build --mode phase4-uat`. All browser runs used the same Windows machine, headed Chrome 155 and Intel UHD Graphics 0x9B41 / ANGLE D3D11. Cold launches use fresh Chrome profiles. Warm navigation is a second navigation in one profile. Launcher runs use a synthetic idle desktop bridge; they are **not packaged Electron timings**. Raw JSON is in [08K_evidence](./08K_evidence/).

| Measurement | Before | Final B7 | Reading |
| --- | ---: | ---: | --- |
| Desktop launcher heading, 5 cold runs, median | 589 ms | 269 ms | 54% sooner in this browser harness |
| Cold launcher long-task total, median | 382 ms | 69 ms | 82% less main-thread blocking |
| Initial JS transfer, cold median | 3.45 MB | 1.53 MB | Unminified UAT gameplay chunk deferred |
| Launcher heading, 5 warm navigations, median | 157 ms | 107 ms | 32% sooner; not proof of persistent HTTP-cache gain |
| Join-form click to heading, 5 cold runs, median | 41 ms | 38 ms | No observed form-response regression; click timed inside the page |
| WebGL context creations, cold board | 3 | 3 | No creation-count improvement in the safe final design; temporary probe explicitly released |
| First frame after warm-up, cold board | 2045–2236 ms across five alternating baseline pairs | 2036 ms median in a separate five-run final series | Series are not paired; no reliable first-frame gain claimed |
| Persistent B3 lobby T5, 5 cold runs, median | 68 ms | 66 ms | Existing fast reveal preserved; zero post-warm-up shader links |
| JS heap 10 s after board, 3 runs, median | 17.688 MB | 17.688 MB | No measured retained-heap increase at this point |
| Steady board geometries / textures / programs | 103 / 52 / 26 | 103 / 52 / 26 | Same in all three memory runs |

The first switch to Low and High took 648 and 812 ms in the final run (baseline separate run: 769 and 874 ms); the separate runs do not establish an optimization. Return visits took 5–52 ms. The lobby still has 269–436 ms long tasks while preparing its persistent scene. One of five final lobby runs had a 221 ms post-start callback, within the 300 ms warm-up gate but a remaining hitch. In the three-run memory sample, late renderer-process memory median was 198→205 MB and GPU-process memory 360→365 MB. These small, noisy process samples do not establish either a leak or a saving; steady JS heap and renderer object counts were unchanged.

## Validation and remaining limits

- [Visual report](./08K_evidence/visual-report.json): Low, Balanced, High settled boards and a Balanced property crop are pixel identical at 1280×720 / DPR 1 (4/4, zero differing pixels). The sampled approved B5 appearance is preserved.
- [Warm-up report](./08K_evidence/warmup-after/summary.json): 7/7 cold-walk and tier-switch checks pass, zero program links after `otb:warmup:done`, no callback above the 300 ms gate after it.
- [Lifecycle report](./08K_evidence/lifecycle-after.json): walk, dice, construction, tier switching and forced context loss pass with bounded shared materials, no page errors and clean legacy fallback.
- [Real two-browser session](./08K_evidence/real-session-final.json): authoritative host and guest joined; the guest's forced no-WebGL path used the DOM board; roll, camera, visibility recovery, reload/resume, forfeit and Play Again passed. The initial constructor-only experiment failed this test and was corrected before the passing final run.
- Required local gates: `pnpm typecheck` **PASS**, `pnpm lint` **PASS**, `pnpm test` **PASS**, `pnpm build` **PASS**, `pnpm validate:docs` **PASS**. Focused startup/graphics tests: 32/32 **PASS**. The final fallback correction was followed by focused tests, production build and the browser regression suite; Draft PR CI/Docs are reported in the PR check suite and final integration report.

Packaged Electron startup, other GPUs, long full-match owner UAT and physical high-refresh validation remain **NOT RUN**. The first board frame and first-time tier switch are still costly. No claim is made that B7 meets a universal startup or GPU-memory target.

**Recommendation: PARTIAL / DRAFT.** The desktop launcher opens materially sooner in the controlled browser harness and its temporary capability context is released without an observed gameplay, visual, fallback or resource regression. Cold-board and first-tier-switch costs remain. Owner review should focus on packaged launcher-to-room responsiveness and whether this bounded improvement is sufficient for B7 closeout. Do not merge the draft automatically.
