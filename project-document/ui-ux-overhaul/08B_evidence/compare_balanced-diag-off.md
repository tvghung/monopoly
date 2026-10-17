Tier: `balanced`

| Metric | B0 baseline | After B1 | Change |
| --- | --- | --- | --- |
| Warm walk replay: program links (all) | 17.0 per replay | 0.0 per replay | −17.0 per replay (100 % better) |
| Warm walk replay: program re-links of an identical program | 17.0 per replay | 0.0 per replay | −17.0 per replay (100 % better) |
| Hover sweep (18 tiles): program links | 19.0 per sweep | 0.0 per sweep | −19.0 per sweep (100 % better) |
| Hover sweep (18 tiles): R3F commits | 19.0 per sweep | 19.0 per sweep | 0.0 per sweep (0 % better) |
| React task P95 (walk) | 24.1 ms | 9.7 ms | −14.4 ms (60 % better) |
| Warm walk frame interval P95 | 27.8 ms | 27.9 ms | +0.1 ms (−0 % worse) |
| Warm walk frame interval P99 | 48.6 ms | 34.8 ms | −13.8 ms (28 % better) |
| Maximum frame interval (walk) | 69.4 ms | 48.5 ms | −20.9 ms (30 % better) |
| Walk intervals over 50 ms | 3 count | 0 count | −3 count (100 % better) |
| Geometry growth after 30 replays | NOT RUN | NOT RUN | n/a |
| Heap growth after 30 replays (after GC) | NOT RUN | NOT RUN | n/a |
| GPU frame time, median (walk) | 11.3 ms | 11.3 ms | −0.1 ms (1 % better) |
| GPU frame time, P95 (walk) | 17.9 ms | 24.0 ms | +6.2 ms (−34 % worse) |
| CPU frame time, P95 (walk) | 13.0 ms | 5.5 ms | −7.5 ms (58 % better) |
| Effective FPS during animation (walk) | 45.1 fps | 40.7 fps | −4.3 fps (−10 % worse) |
| Idle scene submissions in the idle window | 0 count | 0 count | 0 count (0 % better) |
