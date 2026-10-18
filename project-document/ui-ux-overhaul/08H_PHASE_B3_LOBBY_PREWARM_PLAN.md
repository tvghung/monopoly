# 08H — Phase B3 follow-up: build the board's work in the lobby (08G Task 3) — plan

> **REFERENCE** — A plan with an execution record: everything before [Results](#results-task-0-2026-10-18) is the plan as it was approved; Task 0 and Task 1 have been done and are recorded in the
> Results sections (Task 1 was measured and **not adopted**: it misses the 0.2 s threshold at the 3 s reference dwell; its code is kept on branch `perf/phase-b3-lobby-prewarm-task1`), the owner then authorised Task 3 (2026-10-18); its design note and spike are in [Results (Task 3 spike)](#results-task-3-design-note-and-spike-2026-10-18), which stops at approval gate 3. The owner then chose **A1** and approved the lobby memory (2026-10-18); it is implemented and recorded in [Results (Task 3 production, A1)](#results-task-3-production-a1-2026-10-18). Task 4 (the real server path) is done and recorded in [Results (Task 4)](#results-task-4-the-real-path-2026-10-18); it awaits approval gate 4. Numbers outside Results are cited from [08G](./08G_PHASE_B3_T5_FOLLOW_UP_PLAN.md) or [08F](./08F_PHASE_B3_IMPLEMENTATION.md) (both HISTORICAL records).
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

## Results (Task 1, 2026-10-18)

**Candidate: measured, not adopted.** The code is commit `e692e7b` on branch `perf/phase-b3-lobby-prewarm-task1` (pushed, not part of PR 20); it can be reinstated by cherry-picking that commit.

### What was built

- `game/scene/prewarm/proceduralTextureCache.ts`: a take-once cache keyed by generator and arguments (`table:<size>:<rough|plain>`, `district:<surfaceKey>`, `pebble:<variant>`). A consumer **takes** (removes) its entry, so the cache never holds a second copy
  of what a texture holds; a second mount generates as before; `releaseProceduralTextureCache()` runs in `App.tsx` `forgetSession` (a session that ends without the board taking the data).
- `tableTextures.ts`: the generator became `beginTableTexture(size, options)` returning `{ data, renderRows(from, to) }`; `generateTableTextureData` is all rows at once and keeps its golden hashes; a test renders uneven bands in reverse order and gets the same bytes.
  The three consumers (`createTableTextures`, the district and the white-pebble texture sets) take the prepared data first, and generate when there is none (the table only for the default seed).
- `prewarm/lobbyPrewarm.ts` (in the first chunk, imports nothing heavy) schedules the slices with `requestIdleCallback` (timeout 500 ms), one slice per callback, pauses while the tab is hidden, yields to `navigator.scheduling.isInputPending()`, and is skipped for `saveData` and without WebGL;
  `prewarm/lobbyPrewarmTasks.ts` (loaded on demand) builds the slices for the tier (nothing for the low tier): the table in 16 row bands, then the 8 districts, then the 4 pebbles; the scene chunk is requested once there is work. `PrewarmWhileInLobby` mounts beside `Lobby` in `App.tsx`
  and in the harness lobby branch, and restarts on a change of graphics tier. Marks `otb:scene:prewarm-first` and `otb:scene:prewarm-done`; `lobbyToBoard.mjs` records them.
- **Deviation from the plan:** the probe context (step 2) was left out on purpose, because the settings sync already creates it at start-up (the load marks show it at about 0.5 s, before any lobby idle time), so there was nothing left to move.
- 41 unit tests of the new and touched modules pass (cache, scheduler order, cancel, hidden/visible, pending input, save-data, no WebGL, low tier, chunk failure, prepared bytes equal fresh bytes, custom seed, take-once, component mount/unmount).

### Measurement

Same machine and protocol as Task 0: UAT bundles built unminified from PR 20 (`a470300`) and from the candidate (both with the same lobby route), a new Chrome process and an empty profile per launch, the two bundles measured alternately, 20 launches per cell; [raw](./08H_evidence/task1/).

| Dwell | Bundle | T5-lobby median | P95 | min–max | Longest callback after the start (max) | Lobby long task (max) | Page errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 s | PR 20 | 1504 ms | 1555 | 1473–1562 | 77 ms | 79 ms | 0 |
| 3 s | candidate | **1326 ms** | 1366 | 1267–1386 | 164 | 82 | 0 |
| 10 s | PR 20 | 1503 | 1535 | 1477–1555 | 81 | 80 | 0 |
| 10 s | candidate | **1301** | 1340 | 1224–1352 | 154 | 83 | 0 |

| Dwell | Median change | P95 change | Over the limit (1.10 × `main` P95: 1115 at 3 s, 1133 at 10 s) at P95 |
| --- | --- | --- | --- |
| 3 s | **−178 ms** | −189 | +251 (was +440) |
| 10 s | **−202 ms** | −195 | +207 (was +427) |

In the candidate every launch finished the preparation before the board was mounted (20 of 20 at both dwells): first slice about 0.52 s and last slice about 1.2 s after the lobby was shown, so the dwell does not limit what it can do beyond about 1.5 s. Links after `done`: 0 in all 80 launches.

### Decision

- **The rule was: keep if the median improves by at least 0.2 s, otherwise revert.** At the **3 s reference dwell the gain is 178 ms**, 22 ms short; at 10 s it is 202 ms, 2 ms over. The gain is real (larger than the spread of either series, 89 and 119 ms), but it does not meet the threshold at the dwell the owner fixed as the reference, and it
  **does not meet the limit** (P95 still 251 ms over at 3 s). Following the rule, **the code is not adopted on PR 20**; it stays on its own branch for the owner's decision. The rest of 08H's Task 1 acceptance (dwell 0 not worse, `perf:warmup-check` 32/32, visual comparison) was **not run**, because the threshold test came first.
- **Cost seen in the data:** the longest callback after the start doubled (77 → 164 ms at 3 s, 81 → 154 ms at 10 s): the warm-up, which now has its textures ready, uploads them and finishes programs in larger steps. That is a smoothness regression of the exact kind B3 exists to avoid, on a phase that is still short.
  The lobby itself is unaffected (long task 82 against a floor of 79–80).
- **Where the time went:** moving about 0.4 s of CPU texture generation out of the start closed 178–202 ms of the 440 ms gap, less than the CPU cost (not investigated; a plausible reason is that part of the generation overlapped with GPU work on the board path). What remains of the gap is the board's own WebGL context creation (about 0.43 s), the React scene build and the warm-up itself, none of which can be done without a canvas.

### Consequences for the plan

- Task 2's gate is reached with these numbers: PR 20 +440 ms (3 s) over the limit; with the candidate +251 ms. Neither meets the limit, so the options of Task 2 apply: **(b)** authorise Task 3 (a scene created before the Board), whose reachable saving is the remaining 0.4–0.6 s but at a memory and complexity cost; **(c)** amend T5 (08G option D); or **(a')** adopt the candidate (cherry-pick `e692e7b`) as a partial improvement of 0.18–0.20 s, accepting the larger post-start callback, and decide (b) or (c) on top of it.

## Results (Task 3 design note and spike, 2026-10-18)

The owner kept Task 1 reverted, authorised Task 3 and asked for the GPU and heap figures to be recorded. Per the plan, Task 3 starts with a design note and a spike and **makes no production change**; this section is that note and stops at approval gate 3 (A1, A2 or neither, and the memory figure).
The spike is on branch `perf/phase-b3-lobby-scene-spike` (commit `57a6e2e`, from the PR 20 head, UAT harness and driver only; not for merge).

### The spike

In the UAT lobby route (`?lobby=<ms>`) a **real, invisible `<Board />`** (the whole board: scene, HUD, modals; `visibility:hidden`, window-sized, no pointer events) is mounted from the first render of the lobby:

- **A1, persistent scene** (`?persist=hidden-board`): the same board is kept and revealed when the lobby ends (a style change, no remount). This is the **upper bound** of a persistent scene: the production version would hoist only the scene, not the HUD.
- **A2, hidden warm root** (`?persist=warm-root`): the hidden board is unmounted 0.8 s after its `otb:warmup:done`, still in the lobby, and the board is mounted from nothing at the start, as today.

The driver gained `--persist`, `--memory` and the `t5Reveal` metric (`otb:uat:start` to two frames after the commit that made the board visible; for A1 the first rendered frame after the start comes from the first scenario state change, not from the reveal, so the visible moment is `t5Reveal` and T5-lobby is only comparable between PR 20 and A2).
Same machine and protocol as Tasks 0 and 1: unminified UAT bundles (PR 20, and the spike bundle), a new Chrome process and an empty profile per launch, the three configurations measured alternately, 20 launches per cell; [raw](./08H_evidence/task3/).

### Timing

| Dwell | Design | T5-lobby median | P95 | min–max | `t5Reveal` median | Limit (1.10 × `main` P95) at P95 |
| --- | --- | --- | --- | --- | --- | --- |
| 3 s | PR 20 | 1486 ms | 1520 | 1459–1841 | — | 1115: +405 |
| 3 s | A2 | **1034** | 1047 | 1003–1278 | 21 ms | within (−68) |
| 3 s | A1 | **254** | 261 | 252–287 | 18 ms | within (−854) |
| 10 s | PR 20 | 1493 | 1522 | 1465–1544 | — | 1133: +389 |
| 10 s | A2 | **991** | 1015 | 957–1017 | 21 ms | within (−118) |
| 10 s | A1 | **252** | 256 | 248–256 | 17 ms | within (−877) |

In every launch of A1 and A2 the warm-up was done before the start (80 of 80). 0 page errors in all 120 launches. Longest callback after the start (max): PR 20 82 ms, **A2 137 ms**, A1 13 ms. Lobby long task (max): PR 20 80 ms, **A1 and A2 about 730 ms**.

**Both designs meet the T5-lobby limit at the 3 s reference dwell and at 10 s.** A1 makes the board visible in about 18 ms and removes the start-up work from the Start click altogether; A2 meets the limit with a margin of 68 ms at 3 s and 118 ms at 10 s, and keeps the post-start callback larger than PR 20's (137 against 82 ms: the board still builds its scene, creates its context and uploads its textures at the start).

### Memory (6 launches per cell, dwell 10 s, sampled 2 s before the board is mounted, and 2.5 s after it is shown)

Heap = V8 used heap after two forced collections (CDP); GPU and renderer = private memory of the Chrome GPU process and of the page's renderer process read from Windows (the GPU process holds the WebGL textures and buffers; on this integrated GPU the figure includes shared system memory). Medians.

| | JS heap | GPU process | Renderer process | three.js textures / geometries / programs |
| --- | --- | --- | --- | --- |
| **Lobby alone** (PR 20, board not mounted) | 7.0 MB | **185 MB** | 131 MB | 0 / 0 / 0 |
| **Lobby with A1's hidden board** | 15.0 MB (+8.0) | **441 MB (+256)** | 192 MB (+61) | 51 / 99 / 26 |
| Lobby after A2's board was unmounted | 11.9 MB (+4.9) | 413 MB (+228) | 168 MB (+37) | 4 / 6 / 12 (the old context's resources were not yet released) |
| Board visible, PR 20 | 17.4 MB | 478 MB | 214 MB | 52 / 103 / 26 |
| Board visible, A1 | 17.5 MB | 485 MB | 205 MB | 52 / 103 / 26 |
| Board visible, A2 | 18.3 MB | **595 MB (+117 over PR 20)** | 212 MB | 52 / 103 / 26 |

- **A1 brings the board's own memory forward into the lobby**: +256 MB of GPU process memory and +8 MB of JS heap for as long as a lobby lasts, about what the board uses in a game (478–485 MB). Once the board is visible A1 is the same as PR 20 (485 against 478 MB). A player who leaves the lobby without starting pays the memory for nothing.
- **A2's peak is higher than PR 20's**: while the board is playing, the GPU process is still at 595 MB (+117 MB), because the old, unmounted WebGL context is not released at once. Releasing it explicitly (`WEBGL_lose_context` on dispose) was **not tried**; it is part of A2's work if A2 is chosen. A2 also creates a throwaway context, which is what the 08A principle of no throwaway contexts rules out.
- **The lobby freezes for about 0.73 s** when the hidden board mounts (long task 725–733 ms against 80 ms for PR 20): the board's context creation (about 0.43 s) and React scene build cannot be sliced. In the spike the mount happens at once; in a product it must be **deferred** (for example until the lobby is idle, or until the host can start) and it is the Task 3 risk with the most effect on how the lobby feels.

### Design note — choice

**Recommended: A1, a persistent scene, built from the board's slot but mounted early.** Reasons, from the numbers: it is the only design that makes T5 independent of how fast the machine builds a board (254 ms against a limit of 1115; the margin of A2 is 68 ms at 3 s on this machine and would shrink on a slower one), it makes **play again** (`FINISHED → LOBBY → IN_PROGRESS`) instant too,
and its memory is the board's own memory, brought forward, not extra memory on top of a game. Its cost is the larger piece of work (below) and the lobby's 0.73 s freeze, to be deferred.

**What A1 means in production** (not done; each point is a task, with the risk the plan already names):

1. **Scene layer above the Lobby/Board switch.** Only the scene (`BoardRenderSurface` and what it builds, not the HUD, modals or the 40 accessibility buttons) moves to a layer rendered by `App.tsx` for a player in a room with status `LOBBY` or `IN_PROGRESS`, hidden (`visibility:hidden`, `inert`, `aria-hidden`) and frame-held until the Board shows it. `Board` keeps the state it owns (hover store, selection, renderer mode); the layer takes them through a registration, so `Board.renderIsolation.test.tsx` and `GameScene.contextIsolation.test.tsx` stay meaningful (they are extended, not edited to pass).
2. **When to mount.** Deferred: after the lobby is interactive and idle, only on the balanced and high tiers, never on the low tier (it plays on the legacy board or a cheap scene), with `saveData` off, with a visible tab and a supported WebGL, and torn down when the player leaves the room or the session ends; this keeps spectators, reconnects and direct launches into a started room as today (accepted, §Decisions 6).
3. **Reveal.** A style change plus one `invalidate()` and an explicit frame (so the first board frame is drawn at reveal and the warm-up marks and T1/T2 stay exact), with the scene's model coming from the lobby's room state (no empty model).
4. **Lifecycle.** Context loss and tier change keep their current behavior and are covered by tests and `perf:lifecycle-check` with the scene alive in the lobby; the renderer-failure switch to the legacy board still works when the failure happens while hidden.
5. **Acceptance** as in Task 3 above, plus: GPU and heap in the lobby no higher than the figures approved at gate 3; lobby long task attributable to the mount under the budget the owner approves (it cannot be below about 0.43 s for the context itself, so the budget is to be decided, not assumed); T1, T2, T4 and the visual result unchanged; 32 of 32 `warmup-check`.

**A2 stays the fallback** if the owner rejects the lobby memory: it meets the limit by 68–118 ms at P95, needs the explicit context release, and keeps a 0.73 s lobby freeze and a larger post-start callback.

### Not measured in this spike

Dwell 0; T1, T2 and T4 (the harness spike is the upper bound, not the product); the 32 of 32 `warmup-check`; the visual comparison; a warm driver cache; a low-end device; the release of the old context in A2; the real path with a server (Task 4).

### Approval gate 3 — for the owner

1. **A1, A2 or neither.** Recommended: A1.
2. **The memory figure**: +256 MB GPU process memory and +8 MB JS heap during the lobby (A1), equal to the board's own in-game figures; or +117 MB peak during the game (A2, before an explicit release).
3. **The lobby budget** for the mount: a deferred, unsliceable freeze of about 0.73 s (context 0.43 s plus the React build). Recommended: defer to lobby idle and accept it.

## Results (Task 3 production, A1, 2026-10-18)

The owner chose **A1** and approved the memory figure (+256 MB GPU process memory and +8 MB JS heap while a lobby is open) with the mount deferred to lobby idle time. This section records what was built and measured on PR 20's branch.

### What was built

- **`components/sceneLayer/`** (new). `SceneLayerController` owns one invisible host element for the scene, one hover store and a small external store (is a board's slot attached, the selection, a reveal token, a renderer failure); `SceneLayer` (provider, in `App.tsx` around `<main>` and the card overlay, under the state, presentation and settings providers)
  renders the scene into the host with a portal and keeps the host in an invisible, `inert`, `aria-hidden`, window-sized parking element (`visibility:hidden`) while no board holds it; `LayerSlot` (rendered by `Board`) takes the host into the board's slot in a layout effect, tells the layer what the board owns (selection, callbacks)
  and gives the host back when the board unmounts. Moving an element does not remount what is inside it: **one scene, one WebGL context and one set of warmed programs for the whole room session** (lobby, game, the next lobby after play again, the next game).
- **When the scene is built.** A player in a lobby builds it **deferred** (`sceneEarlyMount.ts`): 1.5 s after the lobby appears, then at browser idle (timeout 4 s), on a visible tab, never on the low tier (it plays as before), never with data saving on, never without WebGL. A board shown earlier (a game that starts quickly, a spectator, a reconnect into a started room, a direct launch) mounts the scene itself at once. Once built the scene stays until the room ends.
- **Reveal.** The slot takes the host and `GameScene` gets a new `revealToken` that draws one frame (`RevealFrame`), so the first board frame is drawn at the click and not at the next state change.
- **Failure.** A renderer failure (context lost, render error) while the layer owns the scene drops the scene, tells the bound board to switch to the legacy board, and is remembered, so a board that mounts next starts on the legacy board; leaving the room forgets it.
- **Standalone boards are unchanged.** Without a `SceneLayer` above it (tests, the design lab, the UAT pages) `Board` renders `BoardRenderSurface` itself exactly as before; `Board.renderIsolation.test.tsx` and `GameScene.contextIsolation.test.tsx` are untouched and pass. `BoardRenderSurface` now exports `useBoardRenderModel` and the lazy scene so the layer builds the same model from the same inputs.
- **Tooling.** The UAT lobby route takes `persist=layer` (the page is wrapped in the real `SceneLayer`); `lobbyToBoard.mjs` gained `--persist`, `--memory` (JS heap after GC, renderer counts, private memory of the GPU and renderer processes on Windows, in the lobby, 2.5 s after the board is shown and 12.5 s after) and `t5Reveal`; `lobbyVisualCompare.mjs` compares the board reached through the lobby with and without the layer pixel by pixel.

### Measurement

Same machine and protocol: unminified UAT bundles from the PR 20 head (before) and from this change (after), a new Chrome process and an empty profile per launch, alternately, 20 launches per cell (10 at 5 s). T5-lobby = `otb:uat:start` to the first rendered board frame at or after `otb:warmup:done`; [raw](./08H_evidence/task3-layer/).

| Dwell | Bundle | T5-lobby median | P95 | max | Limit (1.10 × `main` P95) | Longest callback after the start (max) | Lobby long task (max) | Launches with the warm-up not done at the click |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 s | PR 20 | 1500 ms | 1527 | 1531 | 1115 | 75 ms | 87 ms | — |
| 3 s | **A1 layer** | **67 ms** | 451 | 642 | within | 314 | 398 | 7 of 20 (T5 375–642 ms) |
| 5 s | PR 20 | 1499 | 1784 | 1784 | 1115 | 84 | 78 | — |
| 5 s | **A1 layer** | **69** | 75 | 75 | within | 9 | 361 | 0 of 10 |
| 10 s | PR 20 | 1495 | 1526 | 1527 | 1133 | 75 | 83 | — |
| 10 s | **A1 layer** | **69** | 314 | 321 | within | 15 | 406 | 0 of 20 |

0 page errors in all 100 launches; 0 program links after `done` in every launch of every cell.

- **At the 3 s reference dwell the median is 67 ms against a limit of 1115 ms, and the worst of 20 launches is 642 ms.** At 3 s the scene is not always finished at the click: the deferral (1.5 s) plus the mount (about 0.75 s) plus the warm-up (about 0.8 s) end about 3.65 s after the page started, which is the click time of this harness; in 7 of 20 launches the click came a little before the warm-up was done and
  the board waited for it (375–642 ms, still within the limit). From about 5 s on every launch had it ready. A real lobby is longer than 3 s (the players choose characters and ready up); a shorter deferral would move the 3 s cell but costs the lobby the freeze earlier, and was not tried.
- **Two launches at 10 s took 314–321 ms** although the warm-up had been done for 7 s: a 190 ms long task right after the click (the board's own React tree mounting around the scene) delayed the frame; the board was visible (`t5Reveal` 62–65 ms) at the same moment as in the other launches. Not investigated further.
- **The lobby freezes for 0.36–0.41 s once** (long task 361–406 ms against 78–87 ms), at the deferred mount, not the 0.73 s of the spike (the chunk is already loaded, the page has finished booting and the mount is no longer competing with the lobby's own start-up).

### Memory (dwell 10 s, medians; GPU and renderer are private memory of the Chrome processes, read from Windows)

| | JS heap | GPU process | Renderer process |
| --- | --- | --- | --- |
| Lobby alone (PR 20, 6 launches) | 7.0 MB | 185 MB | 131 MB |
| **Lobby with the scene built (A1, 6 launches)** | 14.4 MB (**+7.4**) | 441 MB (**+256**) | 187 MB (+56) |
| Board just shown (2.5 s after ready), PR 20 (10 launches) | 17.4 MB | 470–509 MB | 211–214 MB |
| Board just shown, A1 (10 launches) | 17.6 MB | 513–571 MB | 200–208 MB |
| Board 12.5 s after ready, PR 20 (4 launches) | — | **432–442 MB** | 210–212 MB |
| Board 12.5 s after ready, A1 (4 launches) | — | **438–456 MB (about +9)** | 194–202 MB (about −13) |

The lobby's footprint is the in-game footprint brought forward, as approved. **The in-game steady state is the same** (GPU +9 MB, renderer −13 MB against PR 20). **Just after the reveal A1 is 30–70 MB above PR 20 in the GPU process**: the canvas is resized from the window-sized parking element to its slot and the old buffers are released in the seconds that follow (gone by 12.5 s); the spike
that showed no such difference kept the board in place. A player who leaves the lobby without starting pays +256 MB for nothing until the room ends, and the scene is built only once the lobby has been open 1.5 s and the browser is idle.

### Equivalence and regression checks

- **Pixels:** `lobbyVisualCompare.mjs`, `board-readability` settled scene reached through the lobby route, with and without the layer: **identical at Balanced, High and Low** (`08H_evidence/task3-layer/visual-report.json`).
- **`pnpm perf:warmup-check` on the new bundle: 32 of 32** (links after `done` 0 everywhere; worst callback after `done` 177 ms, the limit is 300 ms). `perf:lifecycle-check --expect-persistent`: all checks passed (that route has no layer; the layer's failure and reveal behavior is covered by unit tests).
- **Tests:** the whole client suite passes (261 files, 2578 tests), including 33 new tests: `SceneLayerController.test.ts` (host moves, reveal tokens, stale releases, hover cleared, selection forwarding, failure), `sceneEarlyMount.test.ts` (delay, idle, save data, hidden tab, cancel), `SceneLayer.test.tsx` (nothing built before the deferral, parked scene invisible and inert, gating, the same element moved lobby → game → lobby → game with one mount,
  dropped with the room, reveal token per attach, one scene on the page, failure in a lobby and in a game, a forgotten failure for the next room, no extra scene renders for hover, volume, a presentation tick, stable callbacks, selection both ways) and a lobby-state model test.
- **Typecheck, lint, `validate:docs`:** see the commit; **client build:** see the commit.

### Not done / not measured

- **Task 4 (the real path):** a real server and PostgreSQL, Start click to first board frame on `main` and on this bundle, 10 launches each. Everything above is the UAT harness's lobby route, which fakes the lobby; the layer is the real `SceneLayer` and `Board`.
- Dwell 0 (the board is shown before the deferral: it behaves as PR 20, not measured); a warm driver cache; a low-end device and the original baseline machine; the packaged Electron app; a game that is left mid-way and restarted (play again) on the real server; screen reader and keyboard walk-through of the lobby with a scene parked; the lobby freeze felt by a person (0.36–0.41 s, once).
- The T5 of the original (harness) definition is unchanged (+371 ms at P95 over its limit, PARTIAL): this change does not touch the path of a board mounted without a lobby.

## Results (Task 4, the real path, 2026-10-18)

**Method** (`scripts/perf/realPathStart.mjs`, `realServerRun.mjs`): per launch a **real authoritative server** (`startAuthoritativeServer`, desktop profile, serving a built, **minified, non-UAT** client; a new server per launch) and a Node socket.io client as the room's **host** (created with the server's host capability); the browser (new Chrome process, empty profile, probe injected) is a **guest** that joins through the real launcher
and lobby, picks a mascot, sets Ready and waits `--dwell` ms; then the host readies and sends `start game`. **click** = the wall-clock instant the host emits `start game`; **mounted** = `[data-testid="game-board"]` appears in the guest's page; **first frame** = first rendered scheduler frame at or after mounted (and after `otb:warmup:done` where the bundle has one).
Bundles: `main` (`dfb1e31`) and this branch's head (`6a9718c`), both minified production builds, served by the same server code (socket protocol 14); 10 launches each per dwell, alternately. [raw](./08H_evidence/task4/).

| Dwell | Bundle | click → first frame, median | min–max | click → mounted | mounted → frame | Longest callback after click (max) | Long task after click (max) | Lobby long task (max) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 s | main | **1060 ms** | 1044–1074 | 64 | 999 | **2251 ms** | 2253 | 0 |
| 3 s | head (layer) | **74 ms** | 66–101 | 71 | 4 | 9 | 259 | 368 |
| 10 s | main | **1065** | 1059–1090 | 72 | 995 | **2256** | 2257 | 0 |
| 10 s | head (layer) | **74** | 70–83 | 71 | 4 | 12 | 258 | 371 |

0 page errors in 40 launches; 0 program links after `done` in every head launch. **The harness result holds on the real path**: from the host's Start to the first board frame, about 1.06 s and a 2.25 s main-thread freeze on `main` become about 74 ms with no callback over 12 ms, at both the 3 s and the 10 s dwell, and the 3 s dwell no longer misses (the real lobby here is shown after the room join, so the deferred mount starts earlier relative to the dwell than in the harness).
What the player still pays: a **0.37 s lobby freeze** (long task 368–371 ms, once, at the deferred mount) and a 259 ms long task right after Start (the board's own React tree).

Notes: the tool needed the guest and the host to pick a mascot (Ready is disabled until then). This base's server persists in memory (`InMemoryPersistenceStore`), so no PostgreSQL was involved here, and the socket protocol is 14, not the 9 that `CLAUDE.md` states: that file is stale against this base.

Not covered by Task 4: the browser as the host (the Start click itself in the browser), a slow or remote network, a warm driver cache, the packaged Electron app, other machines. Gate 4 (owner accepts PASS or PARTIAL): T5-lobby **PASS** on the harness route and on the real path; the original harness T5 stays **PARTIAL**.
