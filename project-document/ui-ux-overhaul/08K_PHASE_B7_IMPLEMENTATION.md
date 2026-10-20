# 08K — Phase B7: Loading performance optimization

> **CURRENT DEVELOPMENT implementation record — PASS — CLOSED; owner merge approval recorded 2026-10-20.** Started from verified post-closeout `main` `2787559ab9e499eb4fdb7dff04b150798be05c46` in isolated worktree `codex/phase-b7-loading-optimization`. The exact B7 implementation head used for packaged acceptance was `caa5c9305333b9057248912a8badd7713be9fe21`; the evidence/report commit advances the PR head without changing shipped code. B4/B5 are merged and closed; B5 owner visual acceptance is PASS. Current rules belong to [join and bootstrap](../monopoly-websockets/Client/join-room.instruction.md) and the [board contract](../monopoly-websockets/Client/game-board.instruction.md).

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

### Final packaged Electron acceptance (2026-10-20)

The production package was built from the exact B7 implementation head `caa5c9305333b9057248912a8badd7713be9fe21` with `pnpm desktop:package`. Test machine: Windows 10 x64 build 19044, Intel Core i5-10210U, Electron 43.4.0. The real packaged OwnTheBlock.exe under apps/desktop/out ran with normal packaged settings, without `--no-sandbox`, using fresh temporary profiles. The focused Playwright Electron proof is `scripts/perf/packagedElectronAcceptance.mjs`; its [request/check log](./08K_evidence/packaged-electron-acceptance.json), [launcher capture](./08K_evidence/packaged-launcher.png) and [game capture](./08K_evidence/packaged-game.png) are retained. This is a local Windows packaged run, not a separate physical-device or Online-network test.

| Packaged check | Result |
| --- | --- |
| Executable starts and paints the normal `app://own-the-block/index.html` launcher | **PASS** |
| Idle launcher defers the gameplay `App` JS; opening the Host form loads `App` JS/CSS (HTTP 200) | **PASS** |
| LAN Host creation reaches a lobby; fresh-profile quality is Balanced in the settings control and renderer; new Host mascot is Dog | **PASS** |
| Host plus Bot starts a real game; 3D canvas and board are visible; deferred `GameScene` JS and baked studio environment load from the package (HTTP 200) | **PASS** |
| Forfeit returns to launcher; explicit **Đóng phòng** stops the still-running Host helper; the same app creates a different room | **PASS** |
| A second packaged Electron instance joins that new LAN room; both leave cleanly | **PASS** |
| Packaged renderer page errors / failed `app://` resources | **PASS** — zero / zero |

The first proof attempt assumed the human would always take the first turn; the Bot correctly won the server tie-break in that run. The assertion was corrected to accept either legal turn order. A later attempt found the Host button disabled after forfeit because the Host helper intentionally remains live; the proof now uses the launcher's **Đóng phòng** action before creating the next room. Neither finding required a product-code correction.

Additional packaged regression proofs: `pnpm desktop:proof:host` **PASS** (real interface, four clients, reconnect, newest-wins and process-loss checks); packaged size budget **PASS** (365.8 MiB unpacked, 0.3 MiB `app.asar`); packaged card art **PASS** (28), landmark art **PASS** (22), and Ogg/Web Audio decode **PASS** (music plus 25 effects). Audible listening is still **NOT RUN**. These results preserve the previously validated B3 persistent scene, B4/B5 visual and resource behaviors, and B7 lazy-loading/fallback evidence within the tested paths; they do not constitute a new full-match or all-hardware acceptance run.

Local closeout gates: `pnpm typecheck` **PASS**, `pnpm lint` **PASS**, `pnpm build` **PASS**, `pnpm validate:docs` **PASS** (161 Markdown files), desktop typecheck **PASS**, and `pnpm desktop:package` **PASS**. The first `pnpm test` run **FAIL** because two procedural-texture golden tests timed out during an unusually long client run (1,017 s); neither produced a differing hash. The same file then passed 3/3 in 5.3 s, and the full `pnpm test` rerun **PASS** (client 2,623/2,623, server 561/561, desktop 525/525). The stall did not reproduce; its host-machine cause is unproven.

CI/Docs for the packaged-tested implementation head `caa5c9305333b9057248912a8badd7713be9fe21`: GitHub CI run `39277563221` **PASS**, Docs run `39277563232` **PASS**. The report-only commit has its own PR checks; use [PR #23](https://github.com/tvghung/monopoly/pull/23) for its final head SHA and check status.

Remaining limits: cold first board frame and first-time Low/High shader variants are still expensive; physical high-refresh, other GPUs, long full-match owner UAT, independent-network Online hosting, macOS packaged UI and audible playback are **NOT RUN**. No universal startup or GPU-memory target is claimed.

**Owner decision (2026-10-20): PASS — CLOSED within the documented B7 acceptance scope. PR #23 is merge-approved.** The packaged launcher, game transition, return/reentry, deferred assets and defaults pass on this Windows machine without an observed regression in the checked B3–B7 paths. The owner explicitly approves marking PR #23 Ready for Review and merging with a merge commit after required checks pass. B8 is approved to implement only after verified B7 integration. All remaining limits above stay unproven / NOT RUN; the earlier nonreproducible test timeout remains an observation, not a proven product defect.
