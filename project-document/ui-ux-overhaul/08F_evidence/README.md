# 08F evidence (Phase B3, shader warm-up)

Raw data behind [08F_PHASE_B3_IMPLEMENTATION.md](../08F_PHASE_B3_IMPLEMENTATION.md). Machine, bundles and commands are in the report (§2, §13).
Every file was produced by the scripts in [scripts/perf/README.md](../../../scripts/perf/README.md); nothing was edited by hand.

| Folder | Content |
| --- | --- |
| `cold-main/`, `cold-b3/` | 20 cold launches each (a new Chrome process with an empty profile per launch), measured alternately (main 1, B3 1, main 2, ...) with `b3Baseline.mjs run --from n --runs 1`: one `run-NN.json` per launch (boundaries, windows, links, signature table, frame list) and `baseline-summary.json` (`aggregate`) |
| `cold-b3-before-loading-indicator/` | Summary of an earlier 20-launch series of the same B3 code before the loading label was added (same machine); kept because the label is the only difference |
| `signature-coverage.json` | T3: the 42 signatures present in all 20 `main` launches against the signatures the B3 bundle links |
| `warmup-check/` | `pnpm perf:warmup-check` over 20 scenarios at Balanced, 3 at Low and High and 6 live tier switches: `check.log`, `summary.json`, one JSON per launch, `tier-switch.json` |
| `soak-b3/`, `soak-main/` | Soak series (30 replays after 3 warm-up replays): `series.md`, `series.json`, one `run-NN.results.json` per run (5 for B3, 3 for main) |
| `lifecycle/` | `pnpm perf:lifecycle-check --expect-persistent` (scenarios, live tier cycle, forced context loss) |
| `visual/` | `captureCompare.mjs` reports: the full run on the final code, a run on the previous build with a priming state, and the control (main against main) |
| `controls/` | `results.md` (equivalence with a forced frame, fallbacks, negative control), the negative-control raw files and a screenshot of the loading label during the warm-up |
