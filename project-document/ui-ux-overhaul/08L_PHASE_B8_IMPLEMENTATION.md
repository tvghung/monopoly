# 08L — Phase B8: Animation cadence and interruption recovery

> **CURRENT DEVELOPMENT — implemented; recommendation PARTIAL, owner review pending.** Branch `codex/phase-b8-animation-timing` starts at verified post-B7 main `4855a0443b74b5e431b44cc438081fa67f11b1e4` in a separate worktree. No owner checkout was modified.

## B7 prerequisite

[PR #23](https://github.com/tvghung/monopoly/pull/23) merged by merge commit `c7d8c0a61e60d53c2bb4f5e3e0b8a628105dcfe3` after owner approval and successful [head CI](https://github.com/tvghung/monopoly/actions/runs/39390956852) / [head Docs](https://github.com/tvghung/monopoly/actions/runs/39390956489). Integrated [CI](https://github.com/tvghung/monopoly/actions/runs/39392475577) and [Docs](https://github.com/tvghung/monopoly/actions/runs/39392475574) passed. The subsequent canonical merge record is final main `4855a0443b74b5e431b44cc438081fa67f11b1e4`; its [Docs](https://github.com/tvghung/monopoly/actions/runs/39392759053) passed. CI does not trigger for that docs-only push; its runtime tree is unchanged from the checked merge. B4/B5 merge ancestry, Balanced and Dog defaults are intact.

B7 is **PASS — CLOSED** within its accepted scope. Cold-board improvement is unproven; first-tier switching remains expensive. Other GPUs/physical high-refresh displays, macOS packaged UI, full-match owner UAT, independent-network Online hosting and audible acceptance remain unvalidated. The earlier nonreproducible timeout remains an observation.

## Verified defects and alternatives

Affected features: F18/F19 (board/fallback), F21/F22 (dice/turn), F32 (Play Again), F39 (spectator), F40 (presentation), F41 (settings) and F52 (diagnostics). Current policy: [presentation pipeline](../monopoly-websockets/Client/presentation-pipeline.instruction.md#b8-interruption-and-cadence-policy-current-development).

1. `movementExecutor.ts` waited a full hop after each timer callback. In the reproducible five-hop simulation, 12 ms of late delivery per timer stretches 900 ms to 960 ms. Real browser traces also show 1.4–14.6 ms extra cadence gaps, although COMPLETE-to-next-START callbacks already meet the 2 ms target.
2. The provider/controller had no visibility lifecycle policy. A jsdom experiment suspending timer delivery across 60 seconds leaves the token at tile 0, queue playing, one second after restore, while authoritative tile is 12. This is a **simulation**, not evidence of a previously observed packaged-device defect.
3. Equal-version reconnect sync was discarded with live duplicates. If authoritative state had not advanced, a reconnect could retain unfinished local presentation. A focused regression now covers this case.

Existing character, dice, camera, money, construction and card effects already use elapsed-time sampling. No measured evidence justified a universal clock rewrite or animation redesign. Starting every hop clock on its first rendered frame was rejected because it stretches low-FPS movement independently of queue settlement. A permanently running recovery watchdog was rejected because it adds idle work. Replaying every hidden event was rejected because it prolongs obsolete feedback after restore.

## Implementation

- Carry nominal monotonic hop boundaries, publish them in movement START signals and wait only the remaining time. Preserve each logical tile, exact destination, intermediate STEP, separate LAND, speed preference and the intentional GO checkpoint/coin concurrency.
- Hydrate authoritative snapshots while hidden and snap on visibility/page/freeze recovery. Advance private semantic cursors without hidden feedback replay. A visible blur lasting at least one second snaps on focus; brief blur retains ordinary motion.
- Detect an existing queue wait delivered at least one second late, reset to the current snapshot and reject the stale continuation. There is no new timer loop. Reset continues stopping presentation audio and resolving queued items.
- Permit equal-version sync reset while still rejecting older snapshots and duplicate live updates.
- Extend opt-in traces to explicit UAT bundles, with nominal timestamps and public settled positions. Ordinary production tracing stays disabled.
- Fix the pre-existing source-isolation test's URL decoding via Node `fileURLToPath` so the full regression suite works in a checkout containing spaces.

No server code, gameplay rules, socket protocol, snapshot schema, persistence, graphics quality policy, B5 assets/materials, B3 scene persistence or B7 bootstrap changed. The existing three-second card-reading policy remains.

## Measurement conditions and results

Browser: installed headed Chrome 154.0.8037.98, Windows x64, ANGLE Intel Iris Xe 0x46A8 / D3D11, approximately 59.9 Hz. Timing traces use production React UAT builds, Balanced, 1280×720 / DPR 1, five hops, one warm replay per cap. Baseline tracing was enabled with a diagnostic-only guard change; original B7 movement logic remained. The code was restored after the baseline build. Settings above physical refresh test cap handling, not physical 120/180/240 Hz presentation.

Raw traces: [motion summary](./08L_evidence/motion/motion-summary.json), [before 60](./08L_evidence/motion/before-60-trace.json), [after 60](./08L_evidence/motion/after-60-trace.json).

| FPS setting | Five-hop window before → after | Largest nominal cadence gap before → after | After callback boundary maximum |
| --- | --- | --- | --- |
| 30 | 919.8 → 915.0 ms | 7.7 → 0 ms | 0.2 ms |
| 60 | 928.7 → 901.8 ms | 9.9 → 0 ms | 0.2 ms |
| 120 | 933.3 → 899.6 ms | 14.6 → 0 ms | 0.2 ms |
| 180 | 913.7 → 899.9 ms | 4.2 → 0 ms | 0.2 ms |
| 240 | 919.2 → 901.2 ms | 5.9 → 0 ms | 0.7 ms |

All ten runs settle at tile 6 with zero page errors. The intended hop total is 900 ms; callback delivery/resolution still causes measurement noise and a final late completion. The existing callback boundary target was already met before B8 (maximum 0.2 ms); B8 preserves it, while fixing accumulating **cadence** drift. These are small samples, not broad smoothness or hardware guarantees.

| Reproducible simulation | Before | B8 |
| --- | --- | --- |
| Five hops, 12 ms late timers | 960 ms | 912 ms (only final lateness remains) |
| Suspended delivery across 60 seconds, one second after restore | settled 0 / authoritative 12, playing | settled 12, no old movement replay |
| Nominal hop gaps under irregular timers, five caps × four speeds | accumulated timer drift | zero nominal gaps; exact final position |

Simulation evidence: [baseline cadence](./08L_evidence/baseline-simulation.json), [after cadence](./08L_evidence/after-simulation.json), [baseline visibility](./08L_evidence/baseline-visibility.json), [after visibility](./08L_evidence/after-visibility.json). Tests use deterministic clocks; below-cap/irregular-frame sampling does not substitute for real display measurements.

## Motion and visual evidence

[Frame-sequence capture](./08L_evidence/motion-frames/motion-summary.json) includes fresh, in-progress movement for both builds: [before](./08L_evidence/motion-frames/before-motion-0.png) / [after](./08L_evidence/motion-frames/after-motion-0.png), eight PNGs each. Trace FRAME entries retain positions, elapsed time and actual scheduler samples. Screenshots themselves perturb sampling and are not pixel-exact matched timestamps. The frames show the retained restrained arc, character/shadow, board and B5 palette; they do not establish perceptual smoothness by themselves. No new visual identity is proposed.

## Regression and delivery gates

- Local `pnpm typecheck`, `pnpm build`: **PASS**. Production build retains deferred App/GameScene and validates audio/card/landmark assets.
- Local `pnpm test`: **PASS**, client 2,654, server 561, desktop 525. New timing/recovery tests plus existing dice/card/money/construction, speed, Reduced Motion, queue failure, scene isolation and persistence regressions pass.
- Local `pnpm lint` and `pnpm validate:docs`: **PASS**, 162 Markdown files.
- [Real two-client room](./08L_evidence/real-session.json): **PASS**, state reset 0.7 ms and first actual WebGL submission 5.6 ms after synthetic restore. active guest reload/resume, active visibility recovery through an actual WebGL submission, dice/landing, camera, focus switching, host resume, forfeit and same-room Play Again. Random rolls/tab contention are observational; do not treat their FPS as a controlled improvement.
- [Warm-up summary](./08L_evidence/warmup/summary.json): **PASS**, 2/2 cold Balanced walk/hotel checks, no post-warm-up shader links, worst callbacks 87/60 ms.
- [Renderer lifecycle](./08L_evidence/lifecycle.json): **PASS**, walk/dice/houses/hotel, tier switches, bounded transient materials and context-loss DOM fallback; zero page errors.
- [Baseline idle/pacing](./08L_evidence/baseline-browser.json) and [initial after run](./08L_evidence/after-browser/results.json) retain zero idle submissions/callbacks and zero warm program links. The initial after run overlapped other probes; its 59.2 FPS / higher CPU sample is retained but not used to claim a pacing improvement. [Isolated after pacing](./08L_evidence/pacing-final.json): 59.2 FPS, P95 16.9 ms, P99/max 33.3/33.4 ms, CPU P95 2.6 ms, median GPU 5.2 ms; 10-second idle = zero submissions/callbacks. Baseline was 60.0 FPS, P95/P99 16.9/17.0 ms, CPU P95 4.0 ms, median GPU 5.2 ms. The small sample has occasional missed frames; parity at P99 is not established, and B8 claims no FPS/GPU improvement. A five-replay [baseline control](./08L_evidence/pacing-before-repeat.json) itself measured 57.5 FPS / P99 33.4 ms / max 166.7 ms. A later [B8 standalone repeat](./08L_evidence/pacing-after-repeat.json) measured 59.9 FPS / P99 17.0 ms / max 33.3 ms, but its display DPR changed to 1.25 (1796×893 buffer) from 1.5 (1509×741), so this repeat pair is not a controlled before/after comparison. These samples do not identify a B8 pacing regression or prove P99 parity.
- The initial environment test attempt was blocked by Electron download/filesystem restrictions; the permitted rerun passed desktop tests. The baseline source-isolation test failed on a percent-encoded checkout path and was corrected without weakening its assertions.
- An initial browser config unintentionally inherited WebKit, whose binary is unavailable. The explicit one-project Chrome configuration passes independently; no WebKit PASS is claimed.

## Limits and recommendation

**PARTIAL — implementation complete, draft owner review required.** Nominal cadence, deterministic interruption recovery and the available browser motion targets pass. No general FPS/GPU gain is claimed.

The [actual minimize observation](./08L_evidence/minimize-observation.json) is **BLOCKED**: CDP reported a minimized Chrome window, but native document visibility stayed visible. The optional `B8_MINIMIZE=1` probe failed its bounded visibility observation; it cannot establish suspended-window recovery and is not relabeled PASS. The passing core E2E uses real two-client gameplay with explicit synthetic visibility, plus a separately measured actual WebGL submission. Long suspension is deterministic simulation.

B8 packaged Electron UI/minimize testing, physical high-refresh displays, other GPUs, macOS, long full-match owner motion acceptance and independent-network Online hosting remain **NOT RUN**. Existing B3/B4/B5/B7 accepted limitations remain. Browser spectator/replay contracts are covered deterministically; a new real spectator device session is not claimed. Owner must review the supplied motion evidence and a complete packaged match before accepting B8. Do not merge B8 automatically.
