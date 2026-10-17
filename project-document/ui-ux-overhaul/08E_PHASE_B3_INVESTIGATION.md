# 08E — Phase B3 prerequisite investigation

> **CURRENT DEVELOPMENT (investigation record, in progress)** — Executes the gate in
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
| Soak series | **20 runs**, hard cap. `pnpm perf:benchmark --tiers balanced --scenarios soak --soak-replays 30 --soak-warmup 3 --cap 60 --window 1536x864 --gpu default --diagnostics on`, one fresh Chrome profile and one fresh page per run, runs back to back with nothing else running. A launch that produces no `results.json` may be replaced at most twice and is reported; there is no continuing until the anomaly shows |
| Cold baseline | **10 launches**, each a new Chrome process with an empty profile (no shader disk cache, no calibration page), `walk` fixture, balanced, cap 60 |
| Anomaly "reproduced" | A single replay interval of the 30 measured soak replays contains at least **10** first-use programs (B2 run 3 had 57). "Any first-use program in soak" (at least one) is reported separately. A stall is an in-replay frame gap or callback of at least 1000 ms |
| Link classes | initial (before the first replay label), new variant, repeat link, context reset, renderer recreation; throttled page is classified from frame gaps (see §2) |
| Reporting | Counts as k of n; no rates beyond the runs made; an anomaly that does not reproduce stays OPEN with the attempt count |

## 1. Status

Tooling being built; no measured result yet.
