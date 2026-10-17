Tier: `high`

| Metric | B0 baseline | After B1 | Change |
| --- | --- | --- | --- |
| Warm walk replay: program links (all) | 17.0 per replay | 0.0 per replay | −17.0 per replay (100 % better) |
| Warm walk replay: program re-links of an identical program | 17.0 per replay | 0.0 per replay | −17.0 per replay (100 % better) |
| Hover sweep (18 tiles): program links | 19.0 per sweep | 0.0 per sweep | −19.0 per sweep (100 % better) |
| Hover sweep (18 tiles): R3F commits | 38.0 per sweep | 38.0 per sweep | 0.0 per sweep (0 % better) |
| React task P95 (walk) | 33.2 ms | 13.7 ms | −19.5 ms (59 % better) |
| Warm walk frame interval P95 | 173.6 ms | 83.2 ms | −90.4 ms (52 % better) |
| Warm walk frame interval P99 | 187.7 ms | 97.2 ms | −90.5 ms (48 % better) |
| Maximum frame interval (walk) | 194.5 ms | 111.2 ms | −83.3 ms (43 % better) |
| Walk intervals over 50 ms | 93 count | 122 count | +29 count (−31 % worse) |
| Geometry growth after 30 replays | 30 geometries | 0 geometries | −30 geometries (100 % better) |
| Heap growth after 30 replays (after GC) | 5.52 MB | 2.47 MB | −3.05 MB (55 % better) |
| GPU frame time, median (walk) | 77.6 ms | 48.9 ms | −28.7 ms (37 % better) |
| GPU frame time, P95 (walk) | 94.9 ms | 65.9 ms | −29.0 ms (31 % better) |
| CPU frame time, P95 (walk) | 171.7 ms | 7.4 ms | −164.3 ms (96 % better) |
| Effective FPS during animation (walk) | 11.8 fps | 18.5 fps | +6.7 fps (57 % better) |
| Idle scene submissions in the idle window | 0 count | 0 count | 0 count (0 % better) |
