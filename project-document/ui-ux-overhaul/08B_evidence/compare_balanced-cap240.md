Tier: `balanced`

| Metric | B0 baseline | After B1 | Change |
| --- | --- | --- | --- |
| Warm walk replay: program links (all) | 17.0 per replay | 0.0 per replay | −17.0 per replay (100 % better) |
| Warm walk replay: program re-links of an identical program | 17.0 per replay | 0.0 per replay | −17.0 per replay (100 % better) |
| Hover sweep (18 tiles): program links | 19.0 per sweep | 0.0 per sweep | −19.0 per sweep (100 % better) |
| Hover sweep (18 tiles): R3F commits | 19.0 per sweep | 19.0 per sweep | 0.0 per sweep (0 % better) |
| React task P95 (walk) | 35.7 ms | 11.3 ms | −24.4 ms (68 % better) |
| Warm walk frame interval P95 | 55.5 ms | 20.9 ms | −34.6 ms (62 % better) |
| Warm walk frame interval P99 | 69.4 ms | 48.5 ms | −20.9 ms (30 % better) |
| Maximum frame interval (walk) | 83.3 ms | 55.6 ms | −27.7 ms (33 % better) |
| Walk intervals over 50 ms | 39 count | 2 count | −37 count (95 % better) |
| Geometry growth after 30 replays | NOT RUN | NOT RUN | n/a |
| Heap growth after 30 replays (after GC) | NOT RUN | NOT RUN | n/a |
| GPU frame time, median (walk) | 11.2 ms | 11.4 ms | +0.1 ms (−1 % worse) |
| GPU frame time, P95 (walk) | 13.1 ms | 14.7 ms | +1.6 ms (−12 % worse) |
| CPU frame time, P95 (walk) | 40.9 ms | 5.0 ms | −35.9 ms (88 % better) |
| Effective FPS during animation (walk) | 54.3 fps | 57.9 fps | +3.6 fps (7 % better) |
| Idle scene submissions in the idle window | 0 count | 0 count | 0 count (0 % better) |
