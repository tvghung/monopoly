Tier: `low`

| Metric | B0 baseline | After B1 | Change |
| --- | --- | --- | --- |
| Warm walk replay: program links (all) | 16.0 per replay | 0.0 per replay | −16.0 per replay (100 % better) |
| Warm walk replay: program re-links of an identical program | 16.0 per replay | 0.0 per replay | −16.0 per replay (100 % better) |
| Hover sweep (18 tiles): program links | 19.0 per sweep | 0.0 per sweep | −19.0 per sweep (100 % better) |
| Hover sweep (18 tiles): R3F commits | 19.0 per sweep | 19.0 per sweep | 0.0 per sweep (0 % better) |
| React task P95 (walk) | 22.7 ms | 10.0 ms | −12.7 ms (56 % better) |
| Warm walk frame interval P95 | 33.3 ms | 27.8 ms | −5.5 ms (17 % better) |
| Warm walk frame interval P99 | 41.7 ms | 33.3 ms | −8.4 ms (20 % better) |
| Maximum frame interval (walk) | 55.6 ms | 34.8 ms | −20.8 ms (37 % better) |
| Walk intervals over 50 ms | 3 count | 0 count | −3 count (100 % better) |
| Geometry growth after 30 replays | 30 geometries | 0 geometries | −30 geometries (100 % better) |
| Heap growth after 30 replays (after GC) | 5.40 MB | 2.18 MB | −3.21 MB (60 % better) |
| GPU frame time, median (walk) | 6.8 ms | 7.7 ms | +0.9 ms (−14 % worse) |
| GPU frame time, P95 (walk) | 15.3 ms | 11.0 ms | −4.3 ms (28 % better) |
| CPU frame time, P95 (walk) | 12.8 ms | 4.6 ms | −8.2 ms (64 % better) |
| Effective FPS during animation (walk) | 45.0 fps | 43.1 fps | −1.9 fps (−4 % worse) |
| Idle scene submissions in the idle window | 0 count | 1 count | +1 count |
