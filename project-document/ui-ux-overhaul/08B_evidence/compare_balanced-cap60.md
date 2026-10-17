Tier: `balanced`

| Metric | B0 baseline | After B1 | Change |
| --- | --- | --- | --- |
| Warm walk replay: program links (all) | 17.0 per replay | 0.0 per replay | −17.0 per replay (100 % better) |
| Warm walk replay: program re-links of an identical program | 17.0 per replay | 0.0 per replay | −17.0 per replay (100 % better) |
| Hover sweep (18 tiles): program links | 19.0 per sweep | 0.0 per sweep | −19.0 per sweep (100 % better) |
| Hover sweep (18 tiles): R3F commits | 19.0 per sweep | 19.0 per sweep | 0.0 per sweep (0 % better) |
| React task P95 (walk) | 28.9 ms | 10.1 ms | −18.8 ms (65 % better) |
| Warm walk frame interval P95 | 41.6 ms | 27.9 ms | −13.7 ms (33 % better) |
| Warm walk frame interval P99 | 54.2 ms | 34.7 ms | −19.5 ms (36 % better) |
| Maximum frame interval (walk) | 62.5 ms | 41.7 ms | −20.8 ms (33 % better) |
| Walk intervals over 50 ms | 4 count | 0 count | −4 count (100 % better) |
| Geometry growth after 30 replays | 30 geometries | 0 geometries | −30 geometries (100 % better) |
| Heap growth after 30 replays (after GC) | 5.14 MB | 2.37 MB | −2.77 MB (54 % better) |
| GPU frame time, median (walk) | 11.7 ms | 11.9 ms | +0.2 ms (−2 % worse) |
| GPU frame time, P95 (walk) | 26.0 ms | 20.7 ms | −5.3 ms (20 % better) |
| CPU frame time, P95 (walk) | 20.2 ms | 5.6 ms | −14.6 ms (72 % better) |
| Effective FPS during animation (walk) | 40.3 fps | 41.4 fps | +1.1 fps (3 % better) |
| Idle scene submissions in the idle window | 0 count | 0 count | 0 count (0 % better) |
