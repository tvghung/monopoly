# 08D — Phase B3 prerequisite gate

> **REFERENCE** — A mandatory investigation gate that must be closed before any Phase B3 (shader warm-up) code is
> written. It is a plan with acceptance criteria, not a measurement record: **no gate step has been run, and no result below is claimed.**
> Context: [Phase A audit §J, B3](./08A_PERFORMANCE_AUDIT.md#b3--shader-warm-up-and-tier-switch-preparation) (REFERENCE) and the
> [B2 record](./08C_PHASE_B2_IMPLEMENTATION.md) (HISTORICAL). Measurement tooling: [scripts/perf/README.md](../../scripts/perf/README.md).

Status of related work, unchanged by this document: **B2 stays PARTIAL.** Its heap-growth acceptance criterion (growth over 30 replays,
as the benchmark measures it) is not edited, relaxed or re-scoped here.

## 1. Why a gate

B3 warms up "all programs" and assumes the program set is stable and finite. The B2 review soak contradicts that assumption once: between
replays 20 and 30 of run 3 the page compiled 57 programs for the first time (0 repeats), kept 53, added 2 geometries and stalled for 2,015 ms
(heap +3.23 MB). It did not recur in 7 further runs and was not seen in 4 baseline runs
([review_soak-repeats.md](./08C_evidence/review_soak-repeats.md)). The cause is unknown. A warm-up built on an unexplained set could
precompile the wrong programs, hide a real leak, or mask a context loss.

## 2. Required steps (in order)

1. **Expose and capture first-use program signatures.** Extend the observation-only probe (`scripts/perf/probe-init.js`; no production
   code) so each first-use program records: a hash of vertex and fragment source (and of the defines/prefix that make the variant),
   cumulative program count, a monotonic timestamp and the replay index, the renderer/context identity, and the relevant state at that moment
   (graphics tier, material type, light/shadow/fog/tone-mapping settings, instanced/skinned flags, context-lost and context-restored
   counts). The report must aggregate them so two runs can be diffed by signature.
2. **Investigate the B2 anomaly** (57 first-use programs, 2 new geometries, one 2 s stall) using step 1 data: which signatures, which
   materials and scene objects, and whether they form a coherent family (for example one transient effect or a tier change) or an
   unrelated set.
3. **Bounded controlled soak series.** Fixed bundle, machine, window size, GPU selection, FPS cap and `--soak-replays`/`--soak-warmup`.
   Fix the run count before starting (recommended minimum: 20 soak runs on `main`, plus a stated number with the B2 branch bundle if it is
   still needed as a control) and the stop rule (a hard cap; no continuing until it reproduces). Record per run whether the anomaly
   reproduced and classify every new-program event as one of: **new shader variant** (new signature, same renderer and context),
   **repeat link** (known signature linked again), **context reset** (lost/restored event), **renderer recreation** (new renderer or
   context identity), or **throttled page** (stalled intervals with flat resource counters, as in B2 run 1).
4. **Reproducible B3 baseline** on the same machine and settings using the current `main` implementation: cold-profile launch longest frame,
   program count and links during the first scripted turn, program signatures present after the first turn, and the soak counters. Repeat
   enough times to report spread, not a single run; record commit SHA, build mode, display refresh rate, GPU and driver.
5. **Document** findings, remaining uncertainty and the proceed decision in a follow-up record (`08E`) that links the raw evidence.

## 3. Criteria to proceed to shader warm-up

All must hold; the owner approves the decision.

- Steps 1–4 are done with raw evidence committed or archived, and the commands are reproducible from the record.
- The first-use program set after the first scripted turn is identical (by signature) across baseline runs, or every difference is explained
  and bounded.
- The anomaly is either **reproduced and explained** (cause identified, and the warm-up plan covers or deliberately excludes it), or **not
  reproduced in the bounded series and kept as an open risk**. Not reproducing it does not mean it is resolved.
- If it reproduced as a context reset or renderer recreation, that is handled as its own defect before warm-up is designed.
- The B3 success criteria in the roadmap are restated against the measured baseline.

## 4. Rules for the record

- An anomaly that did not reproduce stays listed as an open risk with the number of runs it was tested in; it is never marked resolved.
- Rates are stated as counts (k of n), with no extrapolation beyond the runs made.
- Production code is not changed by this gate; B3 implementation is a separate change after the gate is closed.
