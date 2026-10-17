# 08C final review — soak repeats

> **HISTORICAL** — Measurement log of the Phase B2 final review (2026-10-17), see
> [08C §14](../08C_PHASE_B2_IMPLEMENTATION.md#14-final-review-2026-10-17). Same command each time:
> `pnpm perf:benchmark --tiers balanced --scenarios soak` (30 replays after 3 warm-up replays, diagnostics on, FPS cap 60), one
> fresh page per run. Not comparable with the other 08C reports: this is a different machine (see `review_after_balanced-all.json`,
> `environment`: Core i5-10210U, Intel UHD Graphics, 59.9 Hz, devicePixelRatio 1.25).

"after" is the PR head `7cb246b` (UAT bundle, built from a tree that also holds the review's test files, which do not ship);
"baseline" is `7a76fd6` plus the measurement-only `3db7648` (the same baseline as 08C §2). Heap in decimal MB, as the benchmark prints it.

| Build | Run | Heap growth | Geometry growth | Program growth | Texture growth | Program links (first use / repeat) | React task P95 | Frame interval P95 / max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| after | 1 (after the six other scenarios) | +1.87 MB | 0 | 0 | 0 | 0 / 0 | 6.2 ms | 1016 / 1016 ms (see note 1) |
| after | 3 | **+3.23 MB** | **2** | **53** | 0 | **57 / 0** | 5.2 ms | 33.6 / **2015 ms** (see note 2) |
| after | 4 | +1.98 MB | 0 | 0 | 0 | 0 / 0 | 2.6 ms | 33.5 / 66.6 ms |
| after | 5 | +1.92 MB | 0 | 0 | 0 | 0 / 0 | 2.7 ms | 33.6 / 99.9 ms |
| after | 7 | +2.02 MB | 0 | 0 | 0 | 0 / 0 | 2.8 ms | 33.4 / 66.8 ms |
| after | 8 | +1.88 MB | 0 | 0 | 0 | 0 / 0 | 2.9 ms | 33.5 / 83.2 ms |
| after | 9 | +2.00 MB | 0 | 0 | 0 | 0 / 0 | 2.8 ms | 33.4 / 66.7 ms |
| after | 10 | +1.89 MB | 0 | 0 | 0 | 0 / 0 | 2.8 ms | 33.4 / 50.0 ms |
| baseline | 1 (after the six other scenarios) | +2.30 MB | 0 | 0 | 0 | 0 / 0 | 19.9 ms | 33.5 / 99.9 ms |
| baseline | 6 | +2.19 MB | 0 | 0 | 0 | 0 / 0 | 11.6 ms | 33.4 / 66.6 ms |
| baseline | 11 | +2.22 MB | 0 | 0 | 0 | 0 / 0 | 10.1 ms | 33.4 / 50.2 ms |
| baseline | 12 | +2.23 MB | 0 | 0 | 0 | 0 / 0 | 11.4 ms | 33.5 / 83.3 ms |

Notes.

1. After run 1: a third of the contiguous intervals were about 1 s long (P95 1016 ms, 8.6 FPS) while every resource counter stayed flat.
   A once-per-second cadence is a throttled page (timers at 1 Hz when the window is not visible or is occluded), not render work; the
   run's React task P95 (6.2 ms) is the figure of a throttled page, not of the code. It was not repeated under the same conditions.
2. After run 3 (`review_after_soak-anomaly.json`): between the samples at replay 20 and replay 30 the page compiled 57 programs for the
   first time (0 repeats, so no program was linked twice), kept 53 of them, added 2 geometries and stalled once for 2015 ms; heap
   growth +3.23 MB. The stall is the shader compile of that burst, not its cause. The cause was **not found** and **did not recur** in
   seven further runs of the same bundle (runs 4, 5, 7, 8, 9, 10 and run 1 above); the baseline soaks (4 runs) did not show it either,
   which is not evidence about the baseline's rate: it is 1 anomalous run in 8 after runs against 0 in 4 baseline runs. It is carried
   as an open item in 08C §10 and §14.
