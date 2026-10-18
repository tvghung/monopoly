# Controls and one-off checks (08F)

Outputs of checks that have no driver script of their own (they were run from short scratch scripts that were not kept; the
behavior they test is covered by `scripts/perf/warmupCheck.mjs` and the unit tests where it can be). Same machine as the report.

## 1. Pixel equivalence once a frame is forced

The settled-state comparison (`visual/`) differs on the three `board-*` states and on `crop-tax-38-balanced` because the **main** bundle's
capture shows no tile names (see 08F §8). To compare what is drawn, both bundles were loaded with the `board-readability` fixture, left for
6 s, asked for one more frame with `window.__OWN_THE_BLOCK_RENDERER_INVALIDATE__()` (twice, 2 s apart) and screenshotted at 1280 × 720:

| Tier | differing pixels of 921 600 | max channel delta |
| --- | --- | --- |
| low | 0 | 0 |
| balanced | 0 | 0 |
| high | 1 | 1 |

Capture of main at 4, 10 and 20 s after the ready marker without the extra frame: no tile names at any of the three times.

## 2. Fallbacks (balanced, `walk`, fresh profile)

| Condition | Result |
| --- | --- |
| Chrome with `--disable-3d-apis --disable-gpu` (no WebGL) | `data-renderer-mode="legacy"`, no canvas, no warm-up report, 0 page errors, longest long task 172 ms |
| `KHR_parallel_shader_compile` hidden from `getExtension` and `getSupportedExtensions` | warm-up `complete`, `parallel: false`, 704 ms, 0 links after `otb:warmup:done`, longest callback after it 78 ms, 0 page errors |

## 3. Negative control (a fixture removed)

A bundle built with `fixtures.addConstruction()` commented out, `warmupCheck.mjs --scenarios walk,house-4,hotel --tiers balanced --skip-switch`
(raw files in `negative-control-missing-construction-fixture/`):

```
ok   cold balanced walk      warm-up 609 ms, links during 26, after 0, worst callback after 33 ms
FAIL cold balanced house-4   warm-up 632 ms, links during 26, after 2, worst callback after 501 ms :: 2 program links after warm-up (KitOpaque, (MeshStandardMaterial)); callback 501 ms after warm-up
FAIL cold balanced hotel     warm-up 682 ms, links during 27, after 2, worst callback after 325 ms :: 2 program links after warm-up ((MeshStandardMaterial)); callback 325 ms after warm-up
```

The check fails on the missing variant, and the board still drew and played (the variant compiled on first use, as before B3).
