Tier: `balanced`

| Metric | B1 baseline (7a76fd6) | After B2 | Change |
| --- | --- | --- | --- |
| Warm walk replay: program links (all) | 0.0 per replay | 0.0 per replay | 0.0 per replay (0 % better) |
| Warm walk replay: program re-links of an identical program | 0.0 per replay | 0.0 per replay | 0.0 per replay (0 % better) |
| Hover sweep (18 tiles): program links | 0.0 per sweep | 0.0 per sweep | 0.0 per sweep (0 % better) |
| Hover sweep (18 tiles): R3F commits | 19.0 per sweep | 0.0 per sweep | −19.0 per sweep (100 % better) |
| Hover sweep (18 tiles): React task P95 | 7.9 ms | n/a | n/a |
| Hover sweep (18 tiles): DOM commits | 19.0 per sweep | 0.0 per sweep | −19.0 per sweep (100 % better) |
| Hover sweep (18 tiles): scene submissions | 19.0 per sweep | 20.2 per sweep | +1.2 per sweep (−6 % worse) |
| Volume slider (20 changes): R3F commits | 20.0 per sweep | 0.0 per sweep | −20.0 per sweep (100 % better) |
| Volume slider (20 changes): DOM commits | 20.0 per sweep | 20.0 per sweep | 0.0 per sweep (0 % better) |
| Volume slider (20 changes): scene submissions | 20.0 per sweep | 0.0 per sweep | −20.0 per sweep (100 % better) |
| Non-visual room update (20): R3F commits | 20.0 per sweep | 0.0 per sweep | −20.0 per sweep (100 % better) |
| Non-visual room update (20): DOM commits | 40.0 per sweep | 40.0 per sweep | 0.0 per sweep (0 % better) |
| Non-visual room update (20): scene submissions | 20.0 per sweep | 0.0 per sweep | −20.0 per sweep (100 % better) |
| Walk replay: R3F commits | 14.0 per replay | 11.0 per replay | −3.0 per replay (21 % better) |
| Walk replay: DOM commits | 24.4 per replay | 25.0 per replay | +0.6 per replay (−2 % worse) |
| Dice replay: R3F commits | 8.0 per replay | 5.0 per replay | −3.0 per replay (38 % better) |
| React task P95 (walk) | 10.6 ms | 4.0 ms | −6.6 ms (62 % better) |
| React task P95 (dice) | 23.0 ms | 2.8 ms | −20.2 ms (88 % better) |
| React task P95 (purchase) | 7.2 ms | 1.3 ms | −5.9 ms (82 % better) |
| React task P95 (rent) | 6.9 ms | 1.1 ms | −5.8 ms (84 % better) |
| React task P95 (build) | 7.3 ms | 1.5 ms | −5.8 ms (79 % better) |
| React task P95 (soak: 30 walk replays) | 11.2 ms | 1.8 ms | −9.4 ms (84 % better) |
| Warm walk frame interval P95 | 27.9 ms | 28.0 ms | +0.1 ms (−0 % worse) |
| Warm walk frame interval P99 | 34.7 ms | 41.6 ms | +6.9 ms (−20 % worse) |
| Maximum frame interval (walk) | 41.7 ms | 48.5 ms | +6.8 ms (−16 % worse) |
| Walk intervals over 50 ms | 0 count | 0 count | 0 count (0 % better) |
| Geometry growth after 30 replays | 0 geometries | 0 geometries | 0 geometries (0 % better) |
| Heap growth after 30 replays (after GC) | 2.29 MB | 2.00 MB | −0.29 MB (13 % better) |
| GPU frame time, median (walk) | 11.3 ms | 11.2 ms | −0.1 ms (0 % better) |
| GPU frame time, P95 (walk) | 24.1 ms | 18.8 ms | −5.3 ms (22 % better) |
| CPU frame time, P95 (walk) | 5.5 ms | 8.3 ms | +2.8 ms (−51 % worse) |
| Effective FPS during animation (walk) | 41.3 fps | 40.4 fps | −0.9 fps (−2 % worse) |
| Idle scene submissions in the idle window | 0 count | 0 count | 0 count (0 % better) |
