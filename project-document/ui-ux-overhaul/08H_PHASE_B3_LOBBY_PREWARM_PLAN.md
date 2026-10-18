# 08H — Phase B3 follow-up: build the board's work in the lobby (08G Task 3) — plan

> **REFERENCE** — A plan with an execution record: everything before [Results](#results-task-0-2026-10-18) is the plan as it was approved; Task 0 has been done and is recorded in the
> Results section, Tasks 1 to 4 have not been started. Numbers outside Results are cited from [08G](./08G_PHASE_B3_T5_FOLLOW_UP_PLAN.md) or [08F](./08F_PHASE_B3_IMPLEMENTATION.md) (both HISTORICAL records).
> It is written so that a developer or an agent that reads only this file and the documents it links can execute it. Targets T1–T5 are defined in [08E §11.1](./08E_PHASE_B3_INVESTIGATION.md);
> measurement tooling is in [scripts/perf/README.md](../../scripts/perf/README.md).

## Description

After 08G, cold time-to-playable is 2651 ms at the median and 2821 ms at P95 against a limit of 2450 ms (**+371 ms**); every cheap lever on the page itself has been measured and either
taken or ruled out. What remains is work that cannot start before the board is on screen: the board's WebGL context and renderer (about 0.6 s), the React build of the scene
(0.24 s), the procedural textures (about 0.4 s of CPU) and the shader warm-up (0.7 s). In a real match the board is preceded by a **lobby**, often for seconds and sometimes for minutes, during which the
machine is idle. This plan covers using that time: first the work that does not need a renderer at all (cheap, safe), then, only if the numbers ask for it, a pre-created scene. It also defines the
**lobby-to-board measurement** that decides whether any of it is worth doing, because the harness path (a page that opens straight on the board) cannot show a gain from a lobby.

## Context

- **The lobby and the board are two branches of one expression** in `apps/client/src/App.tsx` (the `roomContent` constant): `<Lobby …/>` while the player's room status is `LOBBY`, otherwise the room toolbar
  and `<Board />`. When the host starts the game and the room snapshot with status `IN_PROGRESS` is applied (`applyRoom`), the Lobby unmounts and the Board mounts from nothing: the scene chunk request
  (`lazy(() => import('../game/scene/GameScene'))` in `apps/client/src/components/BoardRenderSurface.tsx`), the canvas, the renderer, the textures and the warm-up all start at that moment.
- A **spectator**, a **reconnecting** player and an app that opens into a running room go straight to the board: there is no lobby, and nothing in this plan helps them.
  The **play again** path (`FINISHED → LOBBY → IN_PROGRESS`) mounts the Board a second time; a persistent scene (Task 3) would make that start instant, a lobby-time prep (Task 1) would not need to repeat.
- The numbers that decide the design are the 08G decomposition (B3 + follow-up, medians over 20 cold launches; raw in [08G_evidence/](./08G_evidence/task0-load-decomposition.json)):

| Piece of the 2.65 s | ms | Needs a canvas or the room? | Can a lobby absorb it? |
| --- | --- | --- | --- |
| Page boot (before the scene chunk is requested) | about 700 | no, but it is paid before the lobby exists | already absorbed: not part of lobby-to-board |
| Scene chunk fetch and evaluation | 57–150 | no | yes, trivially (a plain `import()`) |
| Throwaway WebGL probe context | 70–330 | no | yes (`getSharedWebGLProbe` in `apps/client/src/game/scene/fallback/webglProbe.ts`) |
| Baked studio environment download and inflate | overlaps the canvas creation | no | yes (`preloadBakedStudioEnvironment`, today called when the chunk is evaluated) |
| Procedural texture generation (table, 8 districts, 4 pebbles; `generateTableTextureData`, `generateDistrictSurfaceTextureData`, `generateWhitePebbleTextureData`) | about 200–400 (CPU profile, not an interval) | no: their inputs are constants (a fixed seed, 8 fixed descriptors, 4 variants) | yes, **if their output is cached** (today each layer generates its own on mount) |
| The board's WebGL context (`getContext`) and renderer setup | about 430 + 200 | needs a canvas element | only with a pre-created canvas (Task 3) |
| React build of the scene | about 240 | needs the tree | only with a pre-created scene (Task 3) |
| Shader warm-up | about 710 | needs renderer and scene | only with a pre-created scene, or by warming the driver's program cache with a hidden one (Task 3) |

- **What a lobby cannot be assumed to give.** The figures above are for a fresh Chrome profile (no driver shader cache), which is the first launch on a machine and after a graphics driver update; on a later launch
  the driver's disk cache already removes most of the compile time (08A measured 0.53 s against 4.05 s at load) and the time-to-playable of both bundles is smaller. A warm-cache run has not been measured here.
- **Derived, not measured: a lobby changes what T5 means.** Page boot (the mark `main-mounted` at about 0.86 s) is paid before the lobby, so a start-to-first-frame figure leaves it out: `main` is about 2.17 − 0.86 ≈ 1.3 s
  and this branch about 2.65 − 0.86 ≈ 1.8 s, a gap of about 0.5 s against a limit of about 0.15–0.2 s over `main`. Task 1 removes at most the 0.5 s of independent work in the table, so it is the first thing that could
  close the lobby-based gap on its own; this is the hypothesis Task 0 exists to test.
- Existing building blocks: `FrameWarmupHost`/`ShaderWarmup` (the warm-up is per canvas and re-runs on tier change), the module-level baked-environment cache (`bakedStudioEnvironment.ts`), the golden-hash test that
  guards the generators (`apps/client/src/game/scene/render/table/proceduralTextureGolden.test.ts`), the UAT harness (`apps/client/src/dev/phase4-uat/Phase4UatHarness.tsx`, which mounts `<Board />` directly on a fixture) and
  the `otb:*` marks read by `scripts/perf/loadDecomposition.mjs`.

## Current State

- Branch `perf/phase-b3-t5-follow-up` (PR 20, draft, stacked on PR 19). Time to first playable frame, cold, harness path: 2651 ms median, 2821 P95 (`main`: 2138, 2227); T1 79 ms, T2 0 links after `done`.
- Nothing in the app does any work for the board while the lobby is shown. The scene chunk is not requested, no texture is generated, no context is created, until the Board mounts.
- The generators' results are not cached: `createTableTextures`, `DistrictSurfaceMaterialLibrary` and `createWhitePebbleTextureSet` call them when a layer mounts, and a second mount (a tier change that rebuilds a layer, a StrictMode double mount in
  development, play again) generates again.
- No measurement route goes through a lobby. `e2e/mobile-host.spec.ts` exercises a host on a real server; there is no timing in it.

## Purpose

Find out, with a measurement that matches how a match actually starts, how much of the board's cold start a lobby can absorb, take the part that is cheap and safe, and decide with numbers whether a pre-created scene
(a larger and riskier change) is justified.

## Desired Outcome

- A repeatable **lobby-to-board** measurement (a harness route and a driver) with a written definition of T5-lobby, and baselines for `main`, PR 19 and PR 20 at three lobby dwell times.
- Task 1 landed if it moves the T5-lobby median by at least 0.2 s (the spread of one 20-launch series), with T1, T2, T4 and the visual result unchanged and no visible hitch in the lobby.
- A recorded decision, with numbers, on Task 3: do it, or accept PARTIAL for T5 (and say which T5, harness or lobby).

## Execution guide

Work on a new branch from `perf/phase-b3-t5-follow-up` (or from `main` once PRs 19 and 20 are merged). One task per commit; measure every candidate against a reference bundle **alternately**, 20 launches each, a new Chrome process and an
empty profile per launch (08F §11); run `pnpm perf:warmup-check` on a candidate before measuring it. A gain smaller than the spread of one series is not a gain; a measured non-gain is reverted and recorded (as 08G did twice).

### Task 0 — the lobby-to-board route and its baselines (no behavior change; about a day)

1. **Harness route.** Add a scenario to the UAT harness (a new query value, for example `lobby=<dwellMs>`, combined with an existing fixture such as `walk`): the page first renders the real, presentational
   `Lobby` component (`apps/client/src/components/Lobby.tsx` takes only props) with fixed fake props, then, after the dwell, replaces it with `<Board />` on the fixture exactly as `App.tsx` does (same two-branch
   expression, so the Board mounts from nothing). A dwell of 0 is the worst case, a few seconds is a short lobby, ten seconds a normal one.
2. **Marks (UAT-only).** `otb:uat:lobby-shown` when the Lobby commits, `otb:uat:start` in the commit that mounts the Board. Production code gains no mark in this task.
3. **Driver** `scripts/perf/lobbyToBoard.mjs` modelled on `b3Baseline.mjs` (alternating series via `--from n --runs 1`, empty profile per launch): for each launch record the start mark, the first board frame at or after
   `otb:warmup:done` (the first board frame for a bundle with no warm-up), the longest active frame after the start mark, links after `done`, and the long task at start.
4. **Definition (to be confirmed by the owner, §Decisions 1):** **T5-lobby = time from `otb:uat:start` to the first rendered board frame at or after `otb:warmup:done`.** Reference limit: 1.10 × the P95 of the same measurement on `main` at the same dwell.
5. **Baselines:** `main` (`dfb1e31`), PR 19 and PR 20 heads, dwell 0, 3 s and 10 s, 20 alternating launches each (nine series). Record the spread.

- Acceptance: the three dwell series exist as raw files with summaries; the derived estimate of the Context section (about 1.3 s for `main`, about 1.8 s for PR 20 at dwell 0) is confirmed or corrected in a table in this file's results section; the table says whether
  dwell changes anything today (it should not: nothing runs in the lobby yet).
- This task is also the place to measure a **warm driver cache** run (a second launch with the same profile) of the harness path and of lobby-to-board, so the owner can see what a returning player gets.

### Task 1 — lobby-time prep that needs no canvas (small; after Task 0)

A module (for example `apps/client/src/game/scene/prewarm/lobbyPrewarm.ts`) with one entry point `startLobbyPrewarm()`, called once when the Lobby mounts (not at app start: a player who never reaches a lobby pays nothing) and cancelled on unmount of the app. In order:

1. `import('../game/scene/GameScene')` (the chunk the Board would request), so the chunk evaluation, which also starts the baked-environment download, is out of the way.
2. `getSharedWebGLProbe()` (the single throwaway context; it moves 70–330 ms off the start).
3. **Generate and cache the procedural textures.** Introduce a keyed cache (`proceduralTextureCache.ts`: key = generator + arguments, value = the typed arrays) that the three consumers read through; the prep fills it. The generators are pure and
   byte-for-byte guarded by the golden hashes, so a cached result and a fresh one are the same bytes. Slice the work so that no slice blocks the lobby for more than a budget (§Decisions 3: recommended 50 ms; the table texture is one 1024 × 1024 pass of about 100 ms today and needs splitting by row bands, or running
   in a worker, to meet it) and yield with `scheduler.yield`/`setTimeout` and `navigator.scheduling?.isInputPending?.()` between slices.
4. Gating: skip entirely on the low tier or when `resolveAutoTier` would pick it (coarse pointer and small screens), when WebGL is unsupported, when `navigator.connection?.saveData` is set, and while the tab is hidden; resume on visibility.
5. **Memory:** the cache holds about 20 MB (table 4 MB, 8 × 1.3 MB districts, 4 × 1.3 MB pebbles, as raw data); it is the same data the textures would hold while the board is open, but it must be released when the player leaves the room, and a texture must not
   keep a second copy (the consumers pass the cached array to the `DataTexture` and never mutate it).

- Acceptance: T5-lobby median at dwell 3 s and 10 s improves by at least 0.2 s against the PR 20 baseline of Task 0; at dwell 0 it is not worse; `pnpm perf:warmup-check` 32 of 32; golden hashes unchanged; the lobby shows no frame over 50 ms attributable to the prep (a long-animation-frame check
  in the new driver while the lobby is shown); a unit test per module (cache hit/miss and release, gating, cancellation on unmount, slice budget with a fake clock); visual comparison unchanged; the canonical docs and the testcase checklist updated.
- If the median improves by less than 0.2 s, revert and record the measurement.

### Task 2 — decision gate (owner)

Bring the Task 0 and Task 1 tables to the owner. Three outcomes: (a) T5-lobby is within the limit: stop, record PASS for the lobby definition and PARTIAL for the harness definition; (b) it is not: authorise Task 3; (c) amend T5 (08G option D) instead.

### Task 3 — a scene created before the Board (only if authorised at Task 2)

Two designs; Task 3 begins with a short design note choosing one, with a spike measuring it, before any production change.

- **A1, a persistent scene.** The canvas and the scene live above the Lobby/Board switch (a `SceneLayer` rendered by `App.tsx` for any room, portalled into the board's slot once the Board registers it, hidden and frame-held until then). Everything now inside
  `BoardRenderSurface` that builds the scene's model moves up with it. This is the version that also makes play-again instant and survives the Lobby ↔ Board switches, and the one with the most to lose: `Board.renderIsolation.test.tsx` and
  `GameScene.contextIsolation.test.tsx` encode the current structure; the hover store, the selection and the legacy-board fallback are Board state; the R3F context bridge re-provides every context above the canvas (08C), so the layer must sit
  under the same stable-context rules; `inert`/`aria-hidden` and focus handling for the 40 tile buttons while hidden; the renderer-failure switch to the legacy board.
- **A2, a hidden warm root.** In the lobby a second React root, in a detached element, mounts `GameScene` with an empty model, runs the warm-up, then unmounts and disposes its renderer before the Board mounts (or at the latest when the real canvas exists). It
  warms the driver's program cache, the chunk, the textures and the environment, but the real canvas still creates its context (0.43 s), builds its scene (0.24 s) and finishes its programs (about 0.2 s). Smaller to write, but two contexts alive for a while and a throwaway one, against the 08A principle of no throwaway contexts.
- Acceptance for either: T5-lobby at dwell 3 s and 10 s measured alternately against Task 1's head; T1, T2, T4 and the visual result unchanged; 32 of 32 `warmup-check`; context-loss and tier-switch behavior covered by tests and by `perf:lifecycle-check`; memory with the scene alive in the lobby recorded (GPU and JS heap) and approved by the owner (§Decisions 4); no change for a spectator or a reconnect.

### Task 4 — confirm on the real path (once, at the end)

One run with a real server and PostgreSQL (the `e2e` runner or two clients with a bot), measuring from the Start click to the first board frame after `done`, on the final bundle and on `main`, 10 launches each. The harness route is the instrument; this is the check that it did not mislead.

## Measurement protocol

- UAT bundles, unminified, `VITE_PHASE4_UAT=1`; reference and candidate alternately, 20 launches each, a new Chrome process and an empty profile per launch, same machine; report min / median / P95 / max.
- Always report the harness T5 as well (the original definition), so the two never get mixed up.
- Report the original-machine figures when that machine is available; until then no absolute claim.

## Decisions for the owner (recommended defaults)

1. **Which number is "T5" for a real match?** Recommended: keep the harness T5 as the gate for PR 19/20 (PARTIAL), and adopt **T5-lobby** (start mark to first frame after `done`, limit 1.10 × `main`'s P95 at the same dwell) as the product metric, with a 3 s dwell as the reference.
2. **Is a renderer or scene created before the board is shown acceptable at all?** Recommended: **not yet**: do Tasks 0 and 1 first (no extra context, no extra GPU memory); decide at the gate with numbers.
3. **Lobby jank budget** for the prep slices. Recommended: 50 ms per slice with input-pending yielding; a worker for the table texture if one pass cannot be split below that.
4. **Memory ceiling** for anything kept alive in the lobby. Recommended: about 20 MB of JS heap for Task 1; for Task 3, record and approve a GPU and heap figure before merging.
5. **Devices:** skip the prep on the low tier, on coarse-pointer small screens, with data saver on and in a hidden tab. Recommended: yes to all four.
6. **Spectators, reconnects and a direct launch into a room** get no benefit; accept.

## Approval gates

1. After Task 0: owner confirms the T5-lobby definition and the baselines.
2. After Task 1: owner reads the numbers (Task 2).
3. Before Task 3: owner chooses A1, A2 or neither, and approves the memory figure.
4. After Task 4: owner accepts PASS or PARTIAL.

## Risks

- A gain seen only in a harness that fakes a lobby; mitigated by Task 4 and by reporting both definitions.
- Texture cache lifetime bugs (stale or double-held data): the golden hashes guard the bytes, a unit test guards release, `perf:lifecycle-check` guards the GPU side.
- Prep work competing with the lobby's own UI or with a connecting socket: slice budget, input-pending yielding, gating, and the lobby jank check in the driver.
- A1 touches the structure that B2 made render-isolated; any change there must keep `Board.renderIsolation.test.tsx` and `GameScene.contextIsolation.test.tsx` meaningful, not edited to pass.
- On a warm driver cache every number here is smaller; a first-launch win may be invisible to a returning player (Task 0 measures it so this is known before work is spent).
- Nothing here changes gameplay, the protocol, persistence or the FPS scheduler.

## Ready-to-paste agent prompt

```text
You are a Senior React Three Fiber / WebGL performance engineer. Work from branch perf/phase-b3-t5-follow-up (PR 20) in a new isolated worktree and
branch; do not touch other checkouts. Read, in order: project-document/ui-ux-overhaul/08E_PHASE_B3_INVESTIGATION.md (section 11),
08F_PHASE_B3_IMPLEMENTATION.md, 08G_PHASE_B3_T5_FOLLOW_UP_PLAN.md (results), then 08H_PHASE_B3_LOBBY_PREWARM_PLAN.md (this plan) and
scripts/perf/README.md.

Goal: use the lobby's idle time to reduce the board's cold start, measured lobby-to-board, without losing T1 (<= 300 ms), T2 (0 program links after
otb:warmup:done) or T4 and without changing what the board looks like. Do not change gameplay, the protocol, persistence or FPS scheduling; do not
implement B4/B5; do not disable shader error checks; keep the four open 08E items open.

Do the tasks in order and stop at each approval gate for the owner: Task 0 (the lobby-to-board harness route, marks, the lobbyToBoard.mjs driver and the nine
baseline series, plus a warm-driver-cache run), Task 1 (lobby-time prep with no canvas: chunk, probe context, cached procedural textures with a slice budget and
gating; keep it only if the T5-lobby median at 3 s and 10 s improves by >= 0.2 s, otherwise revert and record), then stop for the owner's decision (Task 2).
Do Task 3 only if the owner authorises it and chooses A1 or A2, starting with a design note and a spike. Measure every candidate against a reference bundle
alternately, 20 launches each, empty Chrome profile per launch; run pnpm perf:warmup-check first. Report real numbers, retain PARTIAL where a target is not
met and quantify the gap. Update the canonical docs and the testcase checklist with each landed task, run pnpm typecheck, lint, the client tests, build and
validate:docs, then commit, push and update the draft PR. Do not merge.
```

## Results (Task 0, 2026-10-18)

The owner confirmed the definition: **T5-lobby = `otb:uat:start` to the first rendered board frame at or after `otb:warmup:done`; limit 1.10 × the P95 of `main` at the same dwell; reference dwell 3 s.**
Task 0 added the harness route (`?lobby=<ms>` in `Phase4UatHarness.tsx`: the real `Lobby`, then the board mounted from nothing; the scripted scenario starts only after the board is there; marks `otb:uat:lobby-shown` and
`otb:uat:start`, UAT-only), its unit tests and `scripts/perf/lobbyToBoard.mjs`. The three bundles were built from `main` (`dfb1e31`), PR 19 and PR 20 with the same harness change applied to each and confirmed by their contents
(no warm-up in `main`; no baked environment in PR 19). Same machine and protocol as 08F §2: a new Chrome process and an empty profile per launch, the three bundles measured alternately, 20 launches per cell
(10 for the warm-cache cell); [raw](./08H_evidence/).

| Dwell | Bundle | T5-lobby median | P95 | Limit (1.10 × `main` P95) | Over the limit at P95 | Longest callback after the start (max) |
| --- | --- | --- | --- | --- | --- | --- |
| 0 s | `main` | 1424 ms | 1510 | 1661 | — | 2623 ms |
| 0 s | PR 19 | 3000 | 3093 | | +1432 | 94 |
| 0 s | PR 20 | 1966 | 1992 | | +331 | 78 |
| **3 s** | `main` | **985 ms** | 1014 | **1115** | — | 2463 |
| **3 s** | PR 19 | 2520 | 2557 | | +1442 | 125 |
| **3 s** | PR 20 | **1521** | **1555** | | **+440** | 82 |
| 10 s | `main` | 988 | 1030 | 1133 | — | 3399 |
| 10 s | PR 19 | 2527 | 2585 | | +1452 | 120 |
| 10 s | PR 20 | 1514 | 1560 | | +427 | 77 |
| 3 s, warm driver cache (10 launches) | `main` | 938 | 960 | 1056 | — | 397 |
| 3 s, warm driver cache | PR 19 | 1562 | 1607 | | +551 | 131 |
| 3 s, warm driver cache | PR 20 | 1389 | 1430 | | +374 | 71 |

0 page errors and, for PR 19 and PR 20, 0 links after `done` in every launch of every cell.

### What it shows

1. **The derived estimate of the Context section was wrong in both directions.** It said about 1.3 s for `main` and 1.8 s for PR 20 at dwell 0 (gap 0.5 s); measured: 1.42 s and 1.97 s (gap +0.33 s over the limit), and at the 3 s reference **+0.44 s**. The page-boot work of
   the harness page is not all finished when a dwell-0 board mounts: **a dwell of 3 s is 0.44 s faster than a dwell of 0 for `main` and for PR 20 alike**, so the lobby is already absorbing about 0.44 s of boot residue by itself, with no prep at all.
2. **Dwell beyond about 3 s changes nothing** (3 s and 10 s are within 7 ms of each other for every bundle): a lobby of any realistic length gives the same T5-lobby, so what Task 1 can add is bounded by the work that is independent of the room, not by how long the lobby lasts.
3. **At the 3 s reference PR 20 is 440 ms over the limit at P95**: the same size as the harness T5 gap (371 ms), not smaller. The lobby by itself does not close it.
4. **The hypothesis for Task 1** (from the table of the Context section, the independent work is the chunk 57–150 ms, the probe context 70–330 ms and the texture generation, about 200–400 ms of CPU, and some of the first is already absorbed by the boot residue found in point 1) is that it can remove roughly 0.3–0.5 s:
   **borderline against a 0.44 s gap, so Task 1 is worth trying but may not be enough alone**; the measurement after it decides.
5. **A warm driver cache** (a second launch with the same profile) shrinks the gap only a little (+374 ms at P95) and shows what the warm-up costs a returning player: `main`'s longest callback falls from 2.4 s to 0.4 s with a warm cache, so its freeze mostly disappears
   while PR 20's warm-up still takes about 0.6 s (its remaining work is finishing the programs and uploading textures, not compiling). **For a returning player PR 20 buys frames of at most 71 ms instead of 397 ms for about 0.45 s of extra waiting.** This is a product trade-off
   the owner should see; it is not addressed by this plan. A possible follow-up (not started): skip the hold when the first programs are ready at once, because then there was nothing to wait for.
6. **The lobby already has an 80 ms long task of its own** (the largest long task while the lobby is shown is 77–88 ms in all three bundles, with nothing of the board running), so the Task 1 jank budget of 50 ms per slice must be read against this floor:
   the lobby jank check should compare the prep's bundle with `main` at the same dwell, not with zero.

### Consequences for the plan

- Task 1 stays as written, with two changes: its acceptance compares T5-lobby at dwell 3 s and 10 s against PR 20's **1521 and 1514 ms** (needs −0.2 s at least, −0.44 s to meet the limit), and the lobby jank check compares against the 80 ms floor.
- Task 2's gate: Task 1 meeting the limit (1115 ms at P95 at 3 s) ends the work with PASS for the lobby definition; anything above leaves the choice of Task 3 or an amended T5 to the owner.
- The harness T5 (+371 ms) and T5-lobby (+440 ms at 3 s) are reported together from here on.
