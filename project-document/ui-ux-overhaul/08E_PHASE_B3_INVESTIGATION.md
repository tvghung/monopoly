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

The harness mounts the board and schedules the first scripted turn 180 ms later; the first shader link happens after that, so **load
and first turn overlap and cannot be separated without changing production code**. The window below runs from navigation to the
settled first turn.

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
