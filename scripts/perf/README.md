# Renderer performance tooling

Reproducible measurement of the 3D board (Phase B0 of the performance program; background and findings:
[08A performance audit](../../project-document/ui-ux-overhaul/08A_PERFORMANCE_AUDIT.md), implementation record:
[08B Phase B0 + B1](../../project-document/ui-ux-overhaul/08B_PHASE_B0_B1_IMPLEMENTATION.md)). Nothing here ships in the
game: the probe is injected from outside and the harness is a development/UAT build.

| File | Purpose |
| --- | --- |
| `runBenchmark.mjs` | Playwright driver: builds or serves the UAT bundle, opens headed Chrome on the real GPU, replays deterministic harness fixtures and writes `results.json` |
| `probe-init.js` | In-page probe injected before any page script; observation only |
| `metrics.mjs` | Pure analysis (percentiles, pacing, link classification, React tasks, resource trend); unit tested by `metrics.check.mjs` |
| `compareResults.mjs` | Before/after table from two reports; flags non-comparable conditions; unit tested by `compareResults.check.mjs` |
| `captureCompare.mjs` | Before/after **visual equivalence**: renders the same settled harness states from two bundles in the same browser and compares the screenshots pixel by pixel (see [Visual equivalence](#visual-equivalence)) |
| `captureMotion.mjs` | Mid-animation pixel comparison of the tile impact (depression, rebound, highlight) at fixed simulated times through the harness's `?tile-impact-probe=1`, with a built-in determinism control (`--repeat-self`) and a check that the animation is visible in the compared frames |
| `captureHover.mjs` | Before/after **hover and selection** check (Phase B2): the canvas with tiles hovered, after the pointer left and after a click, the inspection dialog, and the 2v2 owner hover card, from two bundles, with a control (one bundle against itself) |
| `cpuProfile.mjs`, `heapSample.mjs` | Diagnosis tools (not benchmarks): a V8 CPU profile of warm replays ranked by self and inclusive time, and the allocation sites still alive after N replays, optionally with the JIT off; they say *where* to look, never what a frame costs |
| `lifecycleCheck.mjs` | Structural GPU-resource ownership check in a real browser: inspects the live three.js scene during dice rolls, walks with the destination preview and construction bursts, switches tiers live and forces a WebGL context loss; `--expect-persistent` asserts one material per shared effect for the whole session; works on a bundle (`--dist`) or a running dev server (`--base-url`, React StrictMode) |
| `signatures.mjs`, `soakSeries.mjs`, `b3Baseline.mjs` | Phase B3 gate (08D/08E): first-use shader program signatures (probe v3), classification of every link (initial / new variant / repeat link / context reset / renderer recreation), a fixed-count soak series and a cold-profile first-turn baseline; unit tested by `signatures.check.mjs` |
| `pngDiff.mjs` | Dependency-free PNG decode/encode, pixel comparison and diff image; unit tested by `pngDiff.check.mjs` |
| `staticServer.mjs` | The static file server `captureCompare.mjs` serves a bundle with |

## Run it

Prerequisites: Chrome installed (Playwright uses `channel: 'chrome'`), `pnpm install`, a **headed** session on the machine
being measured. Close other heavy applications, use AC power and do not touch the mouse or keyboard while it runs: the
window is real, the GPU is real and input would change the result.

```bash
# Build the production-React UAT bundle from the current tree, then measure idle + walk at the Balanced tier
pnpm perf:benchmark --build --label my-change --tiers balanced --scenarios idle,walk --out /tmp/otb-my-change

# Measure a bundle built earlier (keep one per commit so before/after use identical builds)
pnpm perf:benchmark --dist /tmp/otb-before/uat-dist --label before --tiers low,balanced,high --scenarios all

# Before/after table
pnpm perf:compare /tmp/otb-before/results.json /tmp/otb-after/results.json --tier balanced
```

Options: `--tiers low,balanced,high,auto`, `--scenarios idle,dice,walk,hover,volume,socket,purchase,rent,build,soak|all`, `--cap 30|60|120|180|240`
(the harness FPS limit), `--replays 5`, `--soak-replays 30`, `--soak-warmup 3`, `--idle-seconds 10`, `--window 1536x864`, `--gpu default|intel|nvidia`
(adds `--force_low_power_gpu` / `--force_high_performance_gpu` on hybrid laptops), `--diagnostics on|off`, `--lite`,
`--assert-idle` (exit code 1 unless every idle window has 0 scene submissions and the probe provably saw frames).

The build must be **unminified** (the driver does that for `--build`): the probe recognises the frame scheduler by the source
text of its callbacks and fails loudly (exit code 1) when it sees no rendered frame instead of reporting zeros.

## Scenarios (deterministic harness fixtures)

Each animated scenario is the UAT harness fixture replayed with its own "Chạy lại" button: the room snapshots, delays and
presentation events are scripted, so every replay is the same gameplay trace. One first replay (reported separately as
`firstReplay`) and `--replays` warm replays are measured; the page is loaded fresh for every scenario and tier.

| Scenario | Fixture | What it exercises |
| --- | --- | --- |
| `idle` | `board-readability` | Static board for `--idle-seconds` after load work has finished: scene submissions must be 0 |
| `dice` | `dice-contact-shadows` | Two dice rolls and settles |
| `walk` | `walk` | Dice roll, destination preview, five hops, landing, turn handoff |
| `hover` | `board-readability` | Mouse sweep across the first 18 tiles (150 ms per tile) per sweep, `--replays` sweeps |
| `volume` | `board-readability` | Master-volume slider moved through `--volume-steps` (20) values, 50 ms apart, per sweep: a setting unrelated to the picture, so 0 R3F commits and 0 scene submissions are expected (zero rendered frames is the pass condition: the "probe saw no frame" exit code ignores it while another run in the report saw frames) |
| `socket` | `board-readability` | `--volume-steps` (20) room updates that change nothing on the board (a log line, as a chat or presence update does) per sweep: 0 scene submissions expected; R3F commits are bounded by the context bridge (see the B2 record) |
| `purchase` | `purchase` | Property purchase |
| `rent` | `rent` | Rent payment (money transfer coins) |
| `build` | `house-2` | Building construction (two houses) |
| `soak` | `walk` | `--soak-replays` (30) replays after 3 warm-up replays; heap and resource counters after a forced GC at 0, 10, 20 and 30 |

## Metric definitions

CPU, GPU and presentation time are different things and are never mixed.

| Metric | Definition |
| --- | --- |
| **FPS cap** | The harness `fpsLimit`. A setting, not a result; it is never reported as delivered FPS |
| **Scene submission** | A scheduler callback during which the page issued at least one WebGL draw call |
| **Contiguous interval** | rAF-timestamp gap between two consecutive rendered frames where the earlier one scheduled a continuation (an animation was running). Idle gaps of the demand-rendered scene are excluded. This is the **presentation cadence** a player sees |
| **Effective FPS** | `1000 / mean(contiguous interval)` |
| **Frame time P50/P95/P99/max** | Nearest-rank percentiles of the contiguous intervals |
| **Late frame** | Interval above 1.5 × `max(1000 / cap, 1000 / refreshHz)`; the refresh rate is measured on the page |
| **Intervals over 50 ms** | Absolute stutter count |
| **1 % low** | `1000 / mean(worst 1 % of intervals)`, only with at least 100 intervals |
| **CPU frame time** | Duration of the scheduler callback: all `useFrame` work plus the renderer's WebGL submission |
| **GPU frame time** | `EXT_disjoint_timer_query_webgl2` `TIME_ELAPSED` around the callback; `null` where unsupported or disjoint |
| **Callback lag** | Callback start minus its rAF timestamp: main-thread contention before the frame |
| **Draw calls / triangles per frame** | Counted from the WebGL calls of the callback (all passes: shadow, main, post) |
| **Program link** | One `linkProgram`. **First use** = no earlier link in that context had the same source hash; **repeat** = the identical program linked again after being released. Only repeats are avoidable cost |
| **Sync waits** | Main-thread time in synchronous WebGL calls above 0.3 ms (`getProgramParameter`, `getProgramInfoLog`, …) |
| **React task** | One scheduler macrotask (a `MessageChannel` message handler) in which at least one React commit happened; its wall duration. A different method from the Phase A CPU-profile attribution, so compare only with other runs of this tool |
| **Commits** | React commits per renderer: `dom` (React DOM) and `r3f` (`@react-three/fiber`), from a minimal DevTools hook |
| **Long animation frames** | Browser `long-animation-frame` entries (above 50 ms): count, total and max |
| **Heap growth** | `Runtime.getHeapUsage().usedSize` after two forced `HeapProfiler.collectGarbage`; the probe is drained after every replay so its own arrays do not count |
| **Geometry / texture / program counts** | `renderer.info.memory.geometries`, `.textures`, `renderer.info.programs.length` read through the R3F store |

Compositor-level presentation timing is **not** measured: rAF timestamps are the proxy. A scheduler-pacing effect (for
example the vsync-divisor rounding of finding PERF-06 on a 144 Hz display) is part of what these numbers show; run with
`--cap 240` to see the frame cost without a cap.

## Visual equivalence

A performance change must not change what the board looks like. `captureCompare.mjs` serves two UAT bundles in turn, renders
the same settled states (complete board at every tier, Jail, both Tax tiles and a property tile as crops, landmarks, maximum
houses, standees, four stations, and the end state of dice, walk, purchase, rent, house, hotel and jail fixtures) at one
viewport and device pixel ratio, and compares the screenshots with `pngDiff.mjs`:

```bash
pnpm perf:visual-compare --before /tmp/otb-before/uat-dist --after /tmp/otb-after/uat-dist --out /tmp/otb-visual --assert-identical
pnpm perf:visual-compare --before ... --after ... --out ... --renderer swiftshader   # software WebGL, same result on any machine
```

`--states a,b` selects states, `--ready-timeout <seconds>` raises the wait for a fixture to become ready (software rendering is
slow), `--tolerance <0..255>` allows a per-channel difference. A state that fails to capture is reported as not comparable
with its reason instead of aborting the run.

It writes `before/*.png`, `after/*.png`, `diff/*.png` (only for states that differ, differing pixels in red) and
`visual-report.json` (differing pixel count and ratio, maximum channel delta, mean absolute delta per state). Every state is a
settled scene, never a frame in the middle of an animation, because mid-animation pixels depend on frame timing; animation
behavior is covered by the unit tests and by the benchmark counters. Both bundles must be rendered by the same browser on the
same GPU: pixels from different GPUs or drivers are not comparable.

### Finding the cause

```bash
node scripts/perf/cpuProfile.mjs --dist <dist> --scenario dice --replays 3        # heaviest functions and React components
node scripts/perf/heapSample.mjs --dist <dist> --scenario walk --warmup 3 --replays 30   # retained allocation sites
JSFLAGS="--no-opt --no-sparkplug --no-maglev" node scripts/perf/heapSample.mjs ...        # the same with the JIT tiers off
```

Read the heap growth with the JIT in mind: `Runtime.getHeapUsage` includes compiled code and feedback vectors, which keep growing for tens of replays after load. Compare growth with a longer `--soak-warmup` (or with the JIT off) before attributing it to retained objects.

### Hover and selection

```bash
pnpm perf:hover-compare --before <dist> --after <dist> --out <dir>
```

Hover is a store, not React state (B2), so the same tiles are hovered in two bundles and the scene is captured while it is static: every hovered state must be pixel-identical, the dialog must open on a click and close on Escape, and in a 2v2 game the owner card must say the same thing. A state that differs while the control is clean fails the run.

### Mid-animation and ownership checks

```bash
pnpm perf:motion-compare --before <dist> --after <dist> --out <dir> --repeat-self
pnpm perf:lifecycle-check --dist <dist> --out <report.json> --expect-persistent
pnpm perf:lifecycle-check --base-url http://127.0.0.1:5173 --out <report.json> --expect-persistent   # a running `vite --mode phase4-uat`
```

`captureMotion.mjs` only covers what was found reproducible: the frozen-clock tile impact. A stepped Playwright fake clock was tried
for dice, hops, the destination preview and construction bursts and gave different frames for one bundle against itself, so those
animations have **no** pixel comparison; `lifecycleCheck.mjs` checks their resources structurally instead (it is not pixel
evidence). A pixel result is only evidence when the control (the same bundle twice) is identical and the compared frames
actually change over time; the tool prints both. `lifecycleCheck.mjs` allow-lists the console messages the B0 baseline already
printed and fails on any other warning or error.

## Measurement overhead

`--diagnostics off` mounts the same scene tree a player gets (no frame counter, no diagnostics publisher, no tile/prop rect
publishers; `?renderDiagnostics=off` in the page URL). `--lite` installs only the passive observers (long animation frames,
long tasks) and none of the wrappers, so a run in each mode quantifies what the instrumentation costs. The numbers measured
for the current baseline are in the 08B record. Never compare a `--diagnostics on` report with a `--diagnostics off` one;
`compareResults.mjs` flags that.

## Reports and comparability

`results.json` holds the environment (commit, dirty flag, CPU, GPU renderer, Chrome version, devicePixelRatio, viewport,
drawing buffer, measured refresh rate, GPU timer support, all options) and one entry per tier × scenario. Compare only
reports with the same machine, GPU renderer, display refresh rate, window, Chrome major version, cap and diagnostics mode;
`compareResults.mjs` prints "Not comparable" with the reasons otherwise. Reports from different machines, such as the Phase A
reference laptop and any other computer, are recorded separately and never merged.

On a hybrid-graphics laptop Chrome picks the GPU by Windows graphics settings; the report names the renderer it used.

## Program signatures, soak series and cold baseline (B3 gate)

Probe v3 keeps, for every program link, the vertex/fragment source hashes (`sig`), the defines that make the variant, the replay label, renderer/context identity and the renderer state at that moment; the soak scenario adds owners of new programs, a per-replay scene census and context/renderer/visibility events to `results.json` under `signatures`.

```bash
pnpm perf:soak-series run --dist <uat-dist> --runs 20 --out <dir>     # fixed count, fresh Chrome profile per run; then: aggregate --out <dir>
pnpm perf:b3-baseline run --dist <uat-dist> --runs 10 --out <dir>     # cold profile, first scripted turn, second turn
node --test scripts/perf/signatures.check.mjs
```

Stalls and throttled pages are only counted for gaps that follow a frame which scheduled a continuation; the demand-rendered scene is idle between animation steps. The run count is fixed before a series and is a cap, not a target.
