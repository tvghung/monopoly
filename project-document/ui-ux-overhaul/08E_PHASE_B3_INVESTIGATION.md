# 08E — Phase B3 prerequisite investigation

> **CURRENT DEVELOPMENT (investigation record)** — Executes the gate in
> [08D](./08D_PHASE_B3_PREREQUISITE_GATE.md). Measurement and diagnostic tooling only: no production rendering code is changed,
> no shader warm-up is implemented, and B2 keeps its **PARTIAL** verdict and its original heap acceptance target.

## 0. Pre-registered protocol (written before any measured run)

This section was committed before the first series run so the run counts, the stop rule and the anomaly definition cannot move
after the data is seen.

| Item | Fixed value |
| --- | --- |
| Code under test | `origin/main` `f87d9a3` (UAT bundle built unminified from this tree, `vite build --mode phase4-uat --minify false`) |
| Control bundle | **Not run.** The B2 review head `7cb246b` (where the anomaly was seen) was built too: all 153 output files are byte-identical (SHA-256) to the `f87d9a3` bundle, so it is the same program, not a control |
| Machine | Core i5-10210U, Intel UHD Graphics (driver 31.0.101.2137), Windows 10 Pro 19044, Chrome 155, AC power at 100 %, display 59.9 Hz, devicePixelRatio 1.25 |
| Soak series | **20 runs**, hard cap. `--tiers balanced --scenarios soak --soak-replays 30 --soak-warmup 3 --cap 60 --window 1536x864 --gpu default --diagnostics on`, one fresh Chrome profile and one fresh page per run, runs back to back with nothing else running. A launch that produces no `results.json` may be replaced at most twice and is reported; there is no continuing until the anomaly shows |
| Cold baseline | **10 launches**, each a new Chrome process with an empty profile (no shader disk cache, no calibration page), `walk` fixture, balanced, cap 60 |
| Anomaly "reproduced" | A single replay interval of the 30 measured soak replays contains at least **10** first-use programs (B2 run 3 had 57). "Any first-use program in soak" (at least one) is reported separately. A stall is an in-replay frame gap or callback of at least 1000 ms |
| Link classes | initial (before the first replay label), new variant, repeat link, context reset, renderer recreation; throttled page is classified from frame gaps |
| Reporting | Counts as k of n; no rates beyond the runs made; an anomaly that does not reproduce stays OPEN with the attempt count |

## 1. Verdict

**Gate verdict: PARTIAL.** Steps 1–5 of 08D §2 are done with raw evidence committed and reproducible commands. The B2 anomaly was
**not reproduced** and stays **OPEN**. The cold first-turn program set is identical across all 10 baseline launches. The gate is not
PASS because the anomaly's cause is unknown and because one soak launch hung for an unexplained reason (§4). Whether to proceed to
shader warm-up is the owner's decision (§8).

| Question | Answer from the evidence |
| --- | --- |
| Is the cold program set stable and finite? | Yes on this machine and bundle: 42 distinct signatures (49 links, 7 repeat links of identical programs) after the first scripted turn in **10 of 10** cold launches, identical by signature; 0 first-use programs in the second turn (10 of 10) |
| Did the B2 anomaly (57 first-use programs, 2 geometries, 2 s stall) reproduce? | **0 of 20** valid soak runs had any first-use program in the 3 warm-ups or 30 measured replays (threshold was ≥10 in one replay); 0 of 20 had a stall of 1000 ms or more, a context loss or restore, or a renderer/canvas change. One further launch (run 18) failed and is not counted as valid (§4) |
| Cause of the anomaly | **Unknown.** The instrumented runs never saw a new variant, renderer recreation or context reset in a replay, so none is supported; the evidence cannot exclude any of them for the one B2 event |
| Context resets / renderer recreation seen at all | 0 of 30 launches (20 soak + 10 baseline) |

## 2. Method and tooling (08D step 1)

- Probe v3 (`scripts/perf/probe-init.js`, observation only): per link, vertex/fragment source hash (`sig`), the define list, replay
  label, link index, renderer/canvas/context identity, graphics tier, tone mapping, shadow map, fog, DPR, loss/restore counters and
  page hidden/focus; plus the scene objects and materials that use each newly linked program, a scene census per replay (object,
  light and material counts, new scene geometries, renderer memory counters), and context-created/lost/restored, renderer-changed,
  canvas-changed and visibility events.
- Analysis (`scripts/perf/signatures.mjs`, 11 unit tests): classifies each link as initial, new variant, repeat link, context reset
  or renderer recreation; builds the signature table; diffs two runs by signature; lists stalls and throttled intervals.
- **Method defect found and fixed.** The first version counted every idle gap inside a replay (the demand-rendered scene is
  legitimately idle between animation steps), which showed 30 stalls in each of runs 1–20. Those two fields (`stalls`, `throttled`) in
  the raw JSON of runs 1–20 are therefore invalid; the stall figures reported here use the contiguous-interval maximum of the same
  runs (maximum 116.6 ms over all runs), which excludes idle gaps by definition. Link classification and program counts are
  unaffected. The fix (a gap counts only after a frame that scheduled a continuation) applies from run 21 on.
- Drivers: `pnpm perf:soak-series`, `pnpm perf:b3-baseline`; documented in `scripts/perf/README.md`.
- Owner attribution works: in a baseline launch 20 of the 43 programs resolved to named scene objects (for example
  `BoardGroundShadow`, a `MeshBasicMaterial`); the rest are internal passes (shadow depth, PMREM). Had a burst occurred, the report
  would have named its objects and families.

## 3. Soak series (08D step 3)

Fixed in §0: 20 valid runs on `f87d9a3`, 30 replays after 3 warm-up replays, balanced, cap 60, 1536×864, default GPU, a fresh Chrome
profile per run. Launches 1–21 were made: 20 valid (1–17, 19, 20, 21) and one failed (18, replaced once; the protocol allowed two).
Raw: [08E_evidence/soak-series](./08E_evidence/soak-series/) (`runNN.results.json`, `series.md`, `series.json`).

| Measure over the 20 valid runs | Result |
| --- | --- |
| Anomaly reproduced (≥10 first-use programs in one replay) | **0 of 20** |
| Any first-use program during warm-up or soak | 0 of 20 |
| Repeat links, context resets, renderer recreations in soak | 0 / 0 / 0 in all 20 |
| Contiguous interval maximum | 50.0–116.6 ms (median 83.3); P95 of intervals 33.4–52.2 ms (median 33.5) |
| Heap growth over 30 replays (B2 target ≤ 1 MB, **not met, unchanged**) | +1.70 to +2.14 MB, median +1.97 MB (20 of 20 above 1 MB) |
| Geometry / program / texture growth | programs 0 and textures 0 in 20 of 20; geometries 0 in 19, −4 in run 15 |
| Load-time set | 49 links / 42 signatures in 19 of 20; **run 20: 50 links / 43 signatures** (one extra `MeshPhysicalMaterial` variant first linked 2.8 s after navigation, before any replay; a load-time event, cause not investigated further) |

Distinct signatures over all 20 runs: 43; present in every run: 42.

## 4. Failed launch (run 18) — open

Run 18 took 1557 s (typical 205 s) and ended with `TimeoutError`: the harness did not return to `data-uat-ready="true"` within
120 s of the click in the **first warm-up replay** (`soak-series/run-18-FAILED.log`). It produced no samples (`results.json` holds an
empty run list), so it is unclassified: a throttled or suspended page or a stuck harness are both possible and this record does not
choose. It is excluded from the 20 valid runs and listed as an open risk: 1 of 21 launches. B2's run 1 also showed a
throttled-looking series, so an environmental cause on this machine is plausible but unproven.

## 5. Cold-launch and first-turn baseline (08D step 4)

10 launches, each a new Chrome process with an empty profile (no shader disk cache), `walk` fixture, balanced, cap 60, `f87d9a3`
bundle, same window and GPU selection as the series. Raw: [08E_evidence/cold-baseline](./08E_evidence/cold-baseline/). Machine and
settings as in §0. The application bundle is `f87d9a3`; each file's `environment.commit` is the branch commit that ran the driver.

> **Superseded in part by §11.** This baseline assumed the first scripted turn starts at mount + 180 ms and treated load and turn as
> separable. Measured with a real turn-start mark (§11), 21 of the 49 links happen *before* the turn starts and 28 after, so the two
> overlap and must not be read as phases. The window below runs from navigation to the settled first turn as one cold window; its
> frame figures were already active-interval based and agree with §11.

| Measure (10 launches) | min / median / max |
| --- | --- |
| Time to a settled first turn | 7.7 / 7.9 / 9.8 s |
| Program links during the first turn: total / first-use / repeat | 49 / 42 / 7 in 10 of 10 |
| Longest scheduler callback | 2005 / 2043 / 2768 ms |
| Longest contiguous frame interval | 2012 / 2096 / 2779 ms |
| Longest long task | 2010 / 2048 / 2773 ms |
| Synchronous WebGL wait total in the window | about 3.7 s (inspected launch, run 2) |
| Signature set after the first turn | identical in 10 of 10 (42 signatures) |
| First-use programs in the second scripted turn | 0 in 10 of 10 |
| Programs after the second turn | 43 in 10 of 10 (117 geometries in the inspected launch) |
| Context events | 0 of 10 |

Families of the 42 signatures (run 2): `MeshStandardMaterial` 12, `MeshBasicMaterial` 8, `MeshDepthMaterial` 4, `KitOpaque` 4,
`MeshPhysicalMaterial` 3, unnamed 2, `DistrictSurfaceMaterial` 2, `TileDividerMaterial` 2, and one each of `ShaderMaterial`,
`PMREM.Background`, `PMREMGGXConvolution`, `SphericalGaussianBlur`, `TileImpactHighlightMaterial`.

## 6. The B2 anomaly (08D step 2)

Event: run 3 of the B2 review — 57 first-use programs, 0 repeats, 53 kept, 2 geometries, 2015 ms stall between replays 20 and 30.

- It does **not** look like the cold set again: the cold set is 42 signatures and 43 programs, while the event added 53 programs on top
  of an already warm page. The 2 s stall is the same size as the cold first-turn stall (2.0–2.8 s), which supports "the stall is shader
  compilation of a burst" and nothing more.
- It was not reproduced in 20 valid runs of the same bundle (byte-identical to `7cb246b`) on the same machine, and 0 of 30 launches
  showed a context or renderer event. The instrumented runs therefore give no evidence for a context reset or a renderer recreation,
  and none for a new variant.
- Counting the B2 review, the event was seen in 1 of 28 soak launches of this bundle on this machine (1 of 8 in the review, 0 of 20
  here). The review used the old probe; only this series could have attributed the event, and it did not occur.

## 7. Remaining risks (all open)

1. **B2 burst, OPEN:** not reproduced in 20 valid runs; cause unknown. Not resolved.
2. **Run 18 hang, OPEN:** 1 of 21 launches, unclassified (§4).
3. **Run 20 load variant:** 1 of 20 launches linked one extra load-time variant, so the load set is not strictly constant; a warm-up
   list must tolerate extra variants.
4. One machine, one driver, one fixture (`walk`), balanced tier only; the real lobby-to-board path and the low and high tiers were not
   measured here.
5. First turn and load overlap in the harness (§5).
6. Heap growth is unchanged (+1.7 to +2.1 MB); B2 stays PARTIAL.

## 8. Decision for the owner

08D §3 read against this record: steps 1–4 done with raw evidence (met); post-first-turn signature set identical across baseline runs
(met, 10 of 10); anomaly "not reproduced in the bounded series and kept as an open risk" (met: 0 of 20, kept OPEN); a context reset or
renderer recreation handled as its own defect (not applicable, none seen); B3 success criteria restated against the measured baseline
(**not done here**: choosing targets is a product decision; the baseline to restate against is the §5 table — longest frame about
2.0–2.8 s, 42 first-use signatures, 49 links, 7 repeat links, 43 programs).

Recommendation: a warm-up can be designed against the measured cold set of 42 signatures, but it should not assume the set is closed
(risks 1 and 3), should keep this probe in its acceptance run, and should treat any first-use link after the first turn in a soak as a
failure to investigate. Implementation is a separate change after approval; this PR implements nothing of it.

## 9. Reproduce

```bash
# VITE_PHASE4_UAT=1
pnpm --filter @monopoly/client exec vite build --mode phase4-uat --minify false --outDir <dist> --emptyOutDir
pnpm perf:soak-series run --dist <dist> --runs 20 --out <dir>
pnpm perf:soak-series aggregate --out <dir>
pnpm perf:b3-baseline run --dist <dist> --runs 10 --out <dir>
node --test scripts/perf/signatures.check.mjs
```

## 10. Validation of this change

- `node --test scripts/perf/*.check.mjs`: PASS (38 tests). `pnpm validate:docs`: PASS (149 files). `pnpm lint`: PASS. `pnpm typecheck`: PASS.
- `pnpm test`, `pnpm build`, desktop checks: NOT RUN (only `scripts/perf`, `package.json` scripts, README and documents changed; no `apps/` or `packages/` file changed).
- After the measured runs, one dead no-op statement (`P.census.push?.call;`) was removed from the probe to satisfy lint, and a destructuring in the report builder was rewritten with identical output; a 3-replay smoke run afterwards produced the same report shape. The measured runs used the probe without that line removed.

## 11. Owner approval, B3 acceptance targets and closeout corrections (2026-10-17)

The owner approved proceeding toward Phase B3 (shader warm-up) with this gate recorded as **PARTIAL** and every unexplained anomaly
kept **OPEN**. Approval is for the B3 change, which is a separate branch and PR after this record is merged; nothing in this PR
implements warm-up or changes production rendering.

### 11.1 Owner-approved B3 acceptance targets

| # | Target | How it is measured |
| --- | --- | --- |
| T1 | Cold-launch **longest active frame ≤ 300 ms** | `b3Baseline` `coldLongestActiveFrameMs`: the larger of the longest scheduler callback and the longest *active* contiguous interval (§11.2), over a cold window from navigation to the settled first turn, empty Chrome profile |
| T2 | **Zero shader program links during tested gameplay after warm-up completes** | Links with a timestamp after `otb:warmup:done` (`overlap.linksAfterWarmupDone`) in the first and second scripted turn and in every soak replay |
| T3 | Cover the **42 stable cold signatures** and handle **unexpected variants safely** | Warm-up signature set ⊇ the 42 signatures of §5; any link whose signature is not in the set is recorded by the probe (class "new variant") and must not break rendering, hang or throw |
| T4 | **No shader or geometry resource growth** and no visual or gameplay regression | Soak counters (programs, geometries, textures) unchanged against the §3 series; `perf:visual-compare`, `perf:lifecycle-check`, the existing unit/e2e suites |
| T5 | **Time-to-playable P95 must not regress by more than 10 %** against a same-machine baseline | `timeToPlayableMs` (§11.3), P95 over at least 20 cold launches on the same machine and bundle family |

Shader signature diagnostics (the probe and the renderer's shader error checking) stay enabled during acceptance testing; neither is
to be disabled to improve a benchmark number.

### 11.2 Active frames versus idle gaps

The scene is demand-rendered: the gap after a frame that did not schedule a continuation is idle time, not a frame time. The tools now
separate them everywhere a frame figure is reported (`scripts/perf/signatures.mjs` `longestFrame`, unit tested):

- **Longest active frame** = max(longest scheduler callback, longest rAF-to-rAF gap *after a frame that scheduled a continuation*).
- **Idle gap** = a gap after a frame that did not schedule one; reported as `maxIdleGapMs` and never counted as a frame.
- Stall and throttled-page detection already require a running animation (§2); the earlier `maxGapMs` field, which mixed the two, was
  removed from the baseline report. The 10-launch v1 baseline in §5 used the contiguous-interval metric for its frame figures and is
  unchanged by this correction; its `longest gap` console line and `*GapMs` summary fields were the mixed ones and are not used.

### 11.3 Independent boundaries (warm-up completion and first turn)

The baseline now records each boundary separately, each from its own signal, and reports windows that are allowed to overlap:

| Boundary | Source |
| --- | --- |
| `mounted` | board `main` mounted (DOMContentLoaded observer) |
| `firstFrame` | first scheduler frame that rendered the board |
| `warmupStart` / `warmupDone` | `performance.mark('otb:warmup:start')` / `('otb:warmup:done')`, to be emitted by the B3 change (null today) |
| `turnStart` | `performance.mark('otb:uat:turn-start:<scenario>')`, emitted by the UAT harness (`Phase4UatHarness.tsx`, UAT-only module, not in the production bundle) when its first scripted turn begins |
| `turnSettled` | `data-uat-ready` flips to true |

Windows: `cold` (navigation to turnSettled), `firstTurn` (turnStart to turnSettled), `warmup` (warmupStart to warmupDone) and `second`
(a replay on the warm scene) are measured independently and may overlap. `overlap` reports the links before and after `turnStart` and
after `warmupDone` and after `turnSettled`, so an overlap is visible instead of being folded into "phases". **Time-to-playable** is
navigation start to the first board frame submitted at or after `warmupDone` (the first board frame while no warm-up exists).

The probe keeps any `performance.mark("otb:…")` with its time, so the B3 change only has to emit those two marks. The harness change
is one `performance.mark` line in a UAT-only file; it is a measurement boundary, not rendering code.

### 11.4 Same-machine baseline for the B3 targets (v2)

20 cold launches (new Chrome process, empty profile each), the UAT bundle built from this branch (it differs from the §3/§5 bundle only
by the harness mark), same machine and settings as §0. Raw: [08E_evidence/cold-baseline-v2](./08E_evidence/cold-baseline-v2/).

| Measure (20 launches) | min / median / P95 / max |
| --- | --- |
| Longest active frame (T1 metric) | 2077 / 2136 / 2213 / 2493 ms (target ≤ 300 ms) |
| of which longest scheduler callback | 2007 / 2026 / 2089 / 2431 ms |
| Idle gap in the cold window (not a frame) | 1925 / 1969 / 2010 / 2312 ms |
| Longest long task | 2011 / 2031 / 2093 / 2436 ms |
| **Time-to-playable (T5 baseline)** | **1608 / 1669 / 1858 / 1889 ms** → regression limit at +10 % of P95 = **2044 ms** |
| Links in the cold window: total / first-use | 49 / 42 in 20 of 20 |
| Links before / after `turnStart` | 21 / 28 in 20 of 20 (load and first turn overlap) |
| Signature set after the first turn | identical in 20 of 20 (42 signatures) |
| First-use programs in the second turn | 0 in 20 of 20 |
| Second-turn longest active frame | 44 / 49 / 53 / 55 ms |
| Programs after the second turn; context events | 43 in 20 of 20; 0 of 20 |

T1 is therefore not met today by about a factor of seven (the 2.0–2.5 s frame is the cold compile of the first scene; see §5 for the
families); T2 has no measurement yet because no warm-up exists (`linksAfterWarmupDone` is null).

### 11.5 Items that stay OPEN (unchanged by approval)

1. **B2 shader burst** (57 first-use programs, 2 geometries, 2 s stall): not reproduced in 0 of 20 valid runs; cause unknown.
2. **Run 18 hang**: 1 of 21 launches, unclassified.
3. **Extra load-time variant** (run 20, 1 of 20 launches): the load set is not strictly constant; T3's "unexpected variants" rule exists because of it.
4. **Heap growth**: +1.70 to +2.14 MB over 30 replays against the original ≤ 1 MB B2 target; B2 stays PARTIAL.

The 10 % allowance in T5 applies to time-to-playable only; it does not relax the B2 heap target or close any item above.

### 11.6 Validation of the closeout change

`node --test scripts/perf/*.check.mjs` PASS (38); `pnpm --filter @monopoly/client test` PASS (247 files, 2468 tests; a first run failed because jsdom has no `performance.mark`, fixed with an optional call, which Chrome treats identically — the v2 baseline bundle was built before that one-character guard); `pnpm lint` PASS; `pnpm typecheck` PASS; `pnpm validate:docs` PASS. `pnpm build`, desktop checks and the soak series were NOT RUN for this change (the soak series of §3 is unaffected: it ran before and no production rendering code changed).
