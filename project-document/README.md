# Own the Block — Documentation Hub

Start here for any change. This page says where the current rules live, how to tell current rules from history, and which
documents to read for a given task. It does not repeat gameplay rules.

- **Canonical technical documentation:** [`monopoly-websockets/`](./monopoly-websockets/README.md). Each rule has one owner
  document there; other documents link to it.
- **Release source of truth:** [ui-ux-overhaul/V1_RELEASE_CONTRACT.md](./ui-ux-overhaul/V1_RELEASE_CONTRACT.md) (path and fields are
  read by `scripts/validateV1Contract.mjs`; do not move it).
- **Agent operating rules:** `CLAUDE.md` and `AGENTS.md` at the repository root (identical files).
- **Code and tests are the evidence of what is implemented.** If code, schema and the canonical docs disagree, the change is not
  finished (see [Conflicts](#when-code-and-documentation-disagree)).

## Lifecycle and scope labels

| Label | Meaning | How to use it |
| --- | --- | --- |
| CURRENT | Governs implementation and process now | Follow it; fix it in the same task when behavior changes |
| RELEASED | Behavior or contract shipped in a published version | Use to reason about compatibility with installed apps |
| CURRENT DEVELOPMENT | Implemented on the working branch after the latest release, not yet released | Label it in docs wherever it differs from RELEASED |
| HISTORICAL | Record of a past decision, plan, implementation or acceptance | Background only; never rewrite it to match today |
| SUPERSEDED | Replaced by a named document | Read the replacement instead |
| REFERENCE | Design rationale or research, not an executable instruction | Consult for "why"; current behavior is in CURRENT docs |
| PLANNED | Agreed requirement not yet implemented | Never describe it as behavior |

Test and acceptance statuses use only `PASS`, `FAIL`, `NOT RUN`, `BLOCKED`, `NOT APPLICABLE`; an owner statement without a
log is recorded as `OWNER-REPORTED`, never as an automated or independent `PASS`.

## Release and branch status

| Item | Value | Evidence |
| --- | --- | --- |
| Latest published release | **v1.10.0** (socket protocol 14, room snapshot schema 11) | [GitHub Release v1.10.0](https://github.com/tvghung/monopoly/releases/tag/v1.10.0); annotated tag points to `5a93a29c29ee91ad941ecf07eb958fc78e83bf9b`; tag workflow 39434544013 succeeded |
| Current release preparation | **v1.11.0**: integrated PR #28 Power-up System, OB-1/OB-2/OB-3 desktop repairs and OB-4 picker; protocol 16 / RAM snapshot 14; minimum supported version 1.11.0 | [Release verification record](./releases/V1_11_0_RELEASE_VERIFICATION.md), [release contract](./ui-ux-overhaul/V1_RELEASE_CONTRACT.md), [release notes](../.github/release-notes/v1.11.0.md). Publication is not yet verified; v1.10.0 remains the latest verified published release |
| v1.11.0 authorization and limits | Owner authorizes merge/tag/publication through the existing pipeline with manual UAT gaps recorded as NOT RUN. Tag distributions remain unsigned; macOS is not notarized | [Acceptance matrix](./monopoly-websockets/testcase/RELEASE_ACCEPTANCE_MATRIX.md). Automated checks and publication do not establish physical-device, real update, independent-network, full-match/balance or macOS manual PASS |
| v1.10.0 acceptance limits | Owner full-match UAT is OWNER-REPORTED on a local B8 executable, not hash-matched to the public installer; native renderer suspend/recovery is BLOCKED; physical high-refresh, other GPU, macOS device use, cross-network guests and the real v1.9.1 → v1.10.0 update remain NOT RUN | [v1.10.0 release notes](../.github/release-notes/v1.10.0.md), [acceptance matrix](./monopoly-websockets/testcase/RELEASE_ACCEPTANCE_MATRIX.md) |
| v1.9.1 hosting reliability (retained in v1.10.0) | Online public probes use Electron's network stack, bounded DNS/readiness retries, resolver-cache refresh and safe failure diagnostics; protocol 14 and snapshot schema 11 remain unchanged | [HTTP and hosting](./monopoly-websockets/Api/http-runtime.instruction.md#online), [Shared contracts — Version history](./monopoly-websockets/Shared/socket-and-state-contracts.instruction.md#version-history) |
| Historical hosting observations | The affected Windows PC failed on v1.9.1-rc.1 (`PUBLIC_READINESS` / `DNS`, 39 attempts in 39.6 s). Owner-reported rc.2 room creation took about 40–90 s; the cause and timing breakdown remain unknown. These observations do not establish v1.10.0 installer or device acceptance | [release matrix](./monopoly-websockets/testcase/RELEASE_ACCEPTANCE_MATRIX.md), [hosting checklist](./monopoly-websockets/testcase/http-runtime-and-deployment.md) |

## Performance release status (2026-10-21)

v1.10.0 published the B4/B5/B7/B8 performance and presentation work. Their measured limits remain as recorded below and in the [release notes](../.github/release-notes/v1.10.0.md). The current refactor branch contains separate E1 reliability changes, labeled CURRENT DEVELOPMENT and excluded from the v1.10.0 installer. The [Phase A roadmap](./ui-ux-overhaul/08A_PERFORMANCE_AUDIT.md) remains an investigation reference.

| Phase | Status | Evidence / next action |
| --- | --- | --- |
| B3 shader warm-up | **PARTIAL — CLOSED** | [B3 implementation](./ui-ux-overhaul/08F_PHASE_B3_IMPLEMENTATION.md), [lobby prewarm follow-up](./ui-ux-overhaul/08H_PHASE_B3_LOBBY_PREWARM_PLAN.md); preserve the accepted T5-lobby result and recorded limits |
| B4 FPS stability | **PARTIAL — CLOSED, MERGED** | [B4 record](./ui-ux-overhaul/08I_PHASE_B4_IMPLEMENTATION.md); [PR #21](https://github.com/tvghung/monopoly/pull/21) merge `37961bf1b093b30a7b89f99279dd2dcb94a50f76`; physical high-refresh and full-match owner UAT deferred |
| B5 GPU graphics | **PARTIAL — CLOSED, MERGED** | [B5 record](./ui-ux-overhaul/08J_PHASE_B5_IMPLEMENTATION.md); [PR #22](https://github.com/tvghung/monopoly/pull/22) merge `f7e25d7ae717efb5fddba0494a34edc634bc0e28`; **Owner Visual Acceptance — PASS** (owner-reported 2026-10-19); remaining limits stay open |
| B5 follow-up defaults | **PASS — CLOSED** | Fixed Balanced graphics default and Dog/valid-fallback mascot for new human seats; explicitly chosen Auto remains available; [B5 record](./ui-ux-overhaul/08J_PHASE_B5_IMPLEMENTATION.md) |
| B6 Adaptive Graphics | **SKIPPED — owner decision** | No adaptive controller is authorized in this phase |
| B7 Loading Optimization | **PASS — CLOSED, MERGED; RELEASED in v1.10.0** | [B7 record](./ui-ux-overhaul/08K_PHASE_B7_IMPLEMENTATION.md): packaged Windows launcher, room/game transition, return/reentry and deferred assets pass; cold board and first tier-switch costs remain; owner closeout approved 2026-10-20; PR #23 merge `c7d8c0a61e60d53c2bb4f5e3e0b8a628105dcfe3`; integrated [CI](https://github.com/tvghung/monopoly/actions/runs/39392475577) and [Docs](https://github.com/tvghung/monopoly/actions/runs/39392475574) are the B8 start gate |
| B8 animation timing | **PARTIAL — CLOSED, MERGED** | [B8 record and owner UAT follow-up](./ui-ux-overhaul/08L_PHASE_B8_IMPLEMENTATION.md); [PR #24](https://github.com/tvghung/monopoly/pull/24) merge `b4bc30859dd29d6fac0cf33505b5732761c0dd2e`; [CI](https://github.com/tvghung/monopoly/actions/runs/39403034866) and [Docs](https://github.com/tvghung/monopoly/actions/runs/39403034871) PASS; **full-match owner UAT: OWNER-REPORTED PASS** on locally packaged `phase-b8` executable, not post-merge main; native suspension still BLOCKED and other explicit limits remain |

The current protocol and snapshot numbers are defined only in code: `SOCKET_PROTOCOL_VERSION` in `packages/shared/src/types.ts`
and `ROOM_SNAPSHOT_SCHEMA_VERSION` in `apps/server/src/rooms.ts`; the history is in
[Shared contracts — Version history](./monopoly-websockets/Shared/socket-and-state-contracts.instruction.md#version-history).

## Reading order for a code task

1. Identify the affected feature(s) in [FEATURE_TRACEABILITY.md](./monopoly-websockets/FEATURE_TRACEABILITY.md).
2. Read this Hub's status table above (released vs current development).
3. Read the foundation rules: [shared](./monopoly-websockets/monopoly.shared.instructions.md) always, plus the block rule:
   [client](./monopoly-websockets/monopoly.client.instructions.md), [api](./monopoly-websockets/monopoly.api.instructions.md),
   [game core](./monopoly-websockets/monopoly.game-core.instructions.md), [contracts](./monopoly-websockets/monopoly.contracts.instructions.md).
4. Read the module index, then the feature/event instruction it names.
5. Read the testcase checklist for the feature.
6. Read the actual source and tests named by the traceability entry before changing anything.
7. Check [ARCHITECTURE_DECISIONS.md](./monopoly-websockets/ARCHITECTURE_DECISIONS.md) if the change touches authority, persistence,
   networking, protocol, packaging or release.

## Navigation by task

| Task | Read |
| --- | --- |
| Change a screen, dialog or HUD element | [Client index](./monopoly-websockets/Client/README.md) → feature instruction → [client checklist](./monopoly-websockets/testcase/client-state-sync-motion-and-accessibility.md) |
| Change a socket event, ACK or broadcast | [Api index](./monopoly-websockets/Api/README.md) → event instruction → [Shared index](./monopoly-websockets/Shared/README.md) |
| Change a game rule (rent, tax, jail, cards, debt, bankruptcy, teams, bots) | [GameCore index](./monopoly-websockets/GameCore/README.md) → rule instruction → [board data](./monopoly-websockets/Shared/board-and-card-data.instruction.md) → [how-to-play](./monopoly-websockets/Client/how-to-play.instruction.md) |
| Change room/session lifecycle, reconnect or deadlines | [Persistence](./monopoly-websockets/Persistence/README.md), [room lifecycle](./monopoly-websockets/GameCore/room-lifecycle.instruction.md), [session](./monopoly-websockets/Api/socket-session.instruction.md) |
| Change hosting, LAN, Online, tunnel or registry | [HTTP and hosting](./monopoly-websockets/Api/http-runtime.instruction.md), [Desktop index](./monopoly-websockets/Desktop/README.md), [hosting checklist](./monopoly-websockets/testcase/http-runtime-and-deployment.md) |
| Change the Electron shell, preload, packaging or update | [Desktop index](./monopoly-websockets/Desktop/README.md), [app update](./monopoly-websockets/Client/app-update.instruction.md), [release contract](./ui-ux-overhaul/V1_RELEASE_CONTRACT.md) |
| Change protocol or snapshot shape | [Shared contracts](./monopoly-websockets/Shared/socket-and-state-contracts.instruction.md), [ADR-06](./monopoly-websockets/ARCHITECTURE_DECISIONS.md#adr-06-shared-runtime-validated-contracts-and-explicit-versions), [ADR-12](./monopoly-websockets/ARCHITECTURE_DECISIONS.md#adr-12-packaging-update-policy-and-protocol-review) |
| Prepare or verify a release | [release contract](./ui-ux-overhaul/V1_RELEASE_CONTRACT.md), [release acceptance matrix](./monopoly-websockets/testcase/RELEASE_ACCEPTANCE_MATRIX.md) |
| Fix a bug | The feature's traceability entry; decide whether code broke a documented rule or the doc was wrong, and fix that source |

## Module map

| Module | Code | Index | Foundation rule |
| --- | --- | --- | --- |
| Client (React/Vite, WebGL board) | `apps/client/` | [Client](./monopoly-websockets/Client/README.md) | [client](./monopoly-websockets/monopoly.client.instructions.md) |
| Desktop (Electron shell, host runtime, update, packaging) | `apps/desktop/` | [Desktop](./monopoly-websockets/Desktop/README.md) | [shared](./monopoly-websockets/monopoly.shared.instructions.md) |
| HTTP and Socket.IO handlers | `apps/server/src/createServer.ts`, `apps/server/src/socket/` | [Api](./monopoly-websockets/Api/README.md) | [api](./monopoly-websockets/monopoly.api.instructions.md) |
| Game core, bots, room aggregate | `apps/server/src/rooms.ts`, `apps/server/src/game/`, `apps/server/src/commands/`, `apps/server/src/bots/` | [GameCore](./monopoly-websockets/GameCore/README.md) | [game core](./monopoly-websockets/monopoly.game-core.instructions.md) |
| RAM runtime services | `apps/server/src/persistence/`, `apps/server/src/services/` | [Persistence](./monopoly-websockets/Persistence/README.md) | [shared](./monopoly-websockets/monopoly.shared.instructions.md) |
| Shared contracts and board data | `packages/shared/src/` | [Shared](./monopoly-websockets/Shared/README.md) | [contracts](./monopoly-websockets/monopoly.contracts.instructions.md) |
| Room registry (optional Cloudflare Worker) | `services/room-registry/` | [room registry README](../services/room-registry/README.md) | [api](./monopoly-websockets/monopoly.api.instructions.md) |
| Tests and acceptance | `apps/**/*.test.ts(x)`, `e2e/`, packaged proofs | [testcase index](./monopoly-websockets/testcase/README.md), [release matrix](./monopoly-websockets/testcase/RELEASE_ACCEPTANCE_MATRIX.md) | — |

Canonical cross-cutting documents: [technical index](./monopoly-websockets/README.md),
[ARCHITECTURE_DECISIONS.md](./monopoly-websockets/ARCHITECTURE_DECISIONS.md),
[FEATURE_TRACEABILITY.md](./monopoly-websockets/FEATURE_TRACEABILITY.md).

## Document catalog

Collections are classified at folder level; exceptions are listed.

| Location | Class | Notes |
| --- | --- | --- |
| [monopoly-websockets/](./monopoly-websockets/README.md) | CURRENT | Canonical technical docs. Exceptions: [RAM-HOSTING-DISCOVERY](./monopoly-websockets/RAM-HOSTING-DISCOVERY.md) and [RAM-HOSTING-VERIFICATION](./monopoly-websockets/RAM-HOSTING-VERIFICATION.md) are HISTORICAL records of the v1.5.0 migration (still cited for rationale) |
| [ui-ux-overhaul/V1_RELEASE_CONTRACT.md](./ui-ux-overhaul/V1_RELEASE_CONTRACT.md) | CURRENT | Release identity, packaging, publication and per-version release records; contains clearly marked historical subsections |
| audits/v1.10.0-deep-technical-audit/17_PHASE_A1_DOCUMENTATION_SYNC.md (local-only historical evidence: `17_PHASE_A1_DOCUMENTATION_SYNC.md`; unavailable in a clean checkout) | HISTORICAL | A1 documentation reconciliation record; distinguishes v1.10.0 release evidence from current E1 development. |
| [ui-ux-overhaul/08A_PERFORMANCE_AUDIT.md](./ui-ux-overhaul/08A_PERFORMANCE_AUDIT.md) | REFERENCE | Phase A performance and graphics investigation; measurements, findings and a proposed Phase B roadmap pending owner approval |
| [ui-ux-overhaul/08B_PHASE_B0_B1_IMPLEMENTATION.md](./ui-ux-overhaul/08B_PHASE_B0_B1_IMPLEMENTATION.md) | HISTORICAL | Implementation record and measured evidence of performance batches B0 (measurement baseline) and B1 (GPU-resource stability); the benchmark tooling it uses is documented in [scripts/perf/README.md](../scripts/perf/README.md) |
| [ui-ux-overhaul/08C_PHASE_B2_IMPLEMENTATION.md](./ui-ux-overhaul/08C_PHASE_B2_IMPLEMENTATION.md) | HISTORICAL | Implementation record and measured evidence of performance batch B2 (React render fan-out: hover, settings and non-visual updates no longer commit the 3D scene); raw reports in [08C_evidence/](./ui-ux-overhaul/08C_evidence/README.md) |
| [ui-ux-overhaul/08D_PHASE_B3_PREREQUISITE_GATE.md](./ui-ux-overhaul/08D_PHASE_B3_PREREQUISITE_GATE.md) | REFERENCE | Mandatory investigation gate (shader program signatures, B2 soak anomaly, bounded soak series, B3 baseline) to close before B3 shader warm-up code; a plan, no results yet |
| [ui-ux-overhaul/08E_PHASE_B3_INVESTIGATION.md](./ui-ux-overhaul/08E_PHASE_B3_INVESTIGATION.md) | HISTORICAL | Execution record of the B3 gate (shader signatures, soak series, cold baseline) and the owner-approved B3 targets T1–T5; raw data in `08E_evidence/` |
| [ui-ux-overhaul/08F_PHASE_B3_IMPLEMENTATION.md](./ui-ux-overhaul/08F_PHASE_B3_IMPLEMENTATION.md) | HISTORICAL | Implementation record and measured evidence of performance batch B3 (shader warm-up): PARTIAL, T1 and T2 met, T5 not met; raw data in [08F_evidence/](./ui-ux-overhaul/08F_evidence/README.md) |
| [ui-ux-overhaul/08G_PHASE_B3_T5_FOLLOW_UP_PLAN.md](./ui-ux-overhaul/08G_PHASE_B3_T5_FOLLOW_UP_PLAN.md) | REFERENCE | Plan for closing the B3 time-to-playable (T5) gap (options with derived bounds, spikes, owner decisions, approval gates, an agent prompt) with its execution record: the placeholder overlap was measured and dropped, a baked environment and cheaper texture generators cut the median from 3747 to 2651 ms, T5 is still PARTIAL (+371 ms at P95); the context-creation and second-generator experiments were measured and not kept |
| [ui-ux-overhaul/08H_PHASE_B3_LOBBY_PREWARM_PLAN.md](./ui-ux-overhaul/08H_PHASE_B3_LOBBY_PREWARM_PLAN.md) | REFERENCE | Plan for using the lobby's idle time for the board's cold start (08G Task 3): a lobby-to-board measurement route and metric, a canvas-free prep, and a gated decision on a pre-created scene; Task 0 (the route, metric and baselines) is done: at the 3 s reference PR 20 is 1521 ms against a limit of 1115 ms; Task 1 (lobby-time texture prep) was measured at −178 ms at 3 s and −202 ms at 10 s, below the 0.2 s rule at the reference dwell, so it is not adopted (branch `perf/phase-b3-lobby-prewarm-task1`); Task 3 is built as design A1 (a persistent scene layer, deferred mount; T5-lobby median 67 ms at 3 s against a limit of 1115 ms, +256 MB GPU in the lobby, pixel-identical, 32/32 warm-up checks; Task 4, the real server path, is done: click to first frame 1060 -> 74 ms and a 2.25 s freeze gone). Before it, the Task 3 design note and spike: a hidden board in the lobby brings T5-lobby to 254 ms (A1, persistent scene) or 1034 ms (A2, warm root) against 1486 ms and a limit of 1115 ms at 3 s, at a lobby cost of +256 MB GPU and +8 MB heap (A1); no production change, the gate of A1, A2 or neither is with the owner |
| [ui-ux-overhaul/08I_PHASE_B4_IMPLEMENTATION.md](./ui-ux-overhaul/08I_PHASE_B4_IMPLEMENTATION.md) | HISTORICAL | B4 frame pacing implementation and real multiplayer diagnostics; verdict **PARTIAL** on draft PR #21, with physical high-refresh and owner UAT outstanding. |
| [ui-ux-overhaul/08J_PHASE_B5_IMPLEMENTATION.md](./ui-ux-overhaul/08J_PHASE_B5_IMPLEMENTATION.md) | HISTORICAL | B5 GPU and graphics implementation record on the stacked draft branch; current tier rules are in the client board instruction. |
| [ui-ux-overhaul/08K_PHASE_B7_IMPLEMENTATION.md](./ui-ux-overhaul/08K_PHASE_B7_IMPLEMENTATION.md) | HISTORICAL | B7 owner-approved scoped closeout and raw before/after loading evidence; current startup and board rules remain in the client instructions. |
| [ui-ux-overhaul/08L_PHASE_B8_IMPLEMENTATION.md](./ui-ux-overhaul/08L_PHASE_B8_IMPLEMENTATION.md) | HISTORICAL | B8 animation cadence, interruption recovery and measured evidence shipped in v1.10.0; owner full-match report is not installer hash acceptance, and native suspension remains BLOCKED. |
| [ui-ux-overhaul/](./ui-ux-overhaul/00_MASTERPLAN_UI_UX_OVERHAUL.md) (all other files) | HISTORICAL | V1 phase plans, audits and acceptance (PostgreSQL era). SUPERSEDED: `07C_PHASE_7_1_DESKTOP_LAN_IMPLEMENTATION.md`, `GAMEPLAY_MUSIC_STEM_EXPORT_SPEC.md`, `V1_AUDIO_PRODUCTION_PIPELINE.md`, `V1_AUDIO_SEGMENTED_TRANSPORT.md` (→ release contract), `PHASE_1_1_MANUAL_ACCEPTANCE.md` (→ testcase checklists) |
| [own-the-block-vnext/](./own-the-block-vnext/RELEASE_SCOPE.md) | HISTORICAL (release program) / REFERENCE (designs) | `RELEASE_SCOPE`, `RELEASE_CANDIDATE`, `ACCEPTANCE_MATRIX`, `USER_MANUAL_BOT_TEST_PLAN`, `UI_UX_REGRESSION_MATRIX` are the v1.7.0 release program records (the copies are the final v1.7.0 release records, merged from `main`). `BOT_SYSTEM_SPEC`, `IMPLEMENTATION_PLAN` (decision log), `ONLINE_MULTIPLAYER_DESIGN` are REFERENCE |
| [visual-overhaul-v2/](./visual-overhaul-v2/README.md) | HISTORICAL | Visual program G1–G5 with evidence READMEs; the screenshot archive is published as a GitHub pre-release |
| [auto-update/](./auto-update/README.md) | REFERENCE | Design record of the in-app updater; current behavior: [Client/app-update](./monopoly-websockets/Client/app-update.instruction.md) |
| [v1-1-feedback/](./v1-1-feedback/README.md) | HISTORICAL | v1.1.0 owner feedback tracker |
| Repository [README](../README.md) | CURRENT (player/host facing) | Download, hosting, LAN/Online, reconnect and host-close consequences |
| `.github/release-notes/` | RELEASED records | One file per published version |

## When code and documentation disagree

Three kinds of truth are kept apart:

1. **Product intent** — approved rules and decisions (owner requests, decision logs, CURRENT docs).
2. **Actual implementation** — what code and runtime do.
3. **Verification evidence** — tests and recorded acceptance.

Rules: never edit a spec just to match code, and never assume code is wrong. Check for a newer decision and the tests, record
the discrepancy in the affected doc (and in the final report), and fix the source that is wrong. Do not hide a bug by rewording
documentation. Every technical claim names a code path, test or decision document.

## Adding or changing documentation

- **New feature:** add or extend the feature instruction in the module folder, add a row to the module index, add an entry to
  [FEATURE_TRACEABILITY.md](./monopoly-websockets/FEATURE_TRACEABILITY.md), and add checklist items to the matching testcase file.
- **New module:** create `monopoly-websockets/<Module>/README.md`, link it from the technical index and from the module map above.
- **New instruction file:** name it `<topic>.instruction.md` and link it from its module `README.md` (the validator fails otherwise).
- **New testcase checklist:** link it from [testcase/README.md](./monopoly-websockets/testcase/README.md).
- **Marking history:** add a banner directly under the title, `> **HISTORICAL** — <what/when>. Current rules: <link>.` (or
  `SUPERSEDED by <link>`); do not change the rest of the record. Do not mark documents that scripts read (the release contract, `07C_PHASE_7_2_FINAL_ENGINEERING.md`)
  without updating `scripts/validateV1Contract.mjs`.
- **Code paths in current docs:** write them repo-relative in backticks (for example `apps/server/src/socket/turn.ts`); the
  validator checks that they exist. Globs and placeholders are not checked.

## Validation

```bash
pnpm validate:docs     # links, anchors, canonical files, CLAUDE.md = AGENTS.md, code paths, index integrity
pnpm test:docs         # validator self-tests
pnpm validate:v1-contract
```

CI: `.github/workflows/docs.yml` runs both docs commands on every push to `main` and every pull request (no install, no path
filter), so documentation, agent-instruction and code changes that break a documented path are all caught.

## Power-up development

The current working tree contains the verified Phase 04–08B Power-up development. The Phase 02 design remains historical background; current runtime rules are in [Power-up gameplay](./monopoly-websockets/GameCore/power-ups.instruction.md), with exact per-phase evidence below.

Phase 03D adds the official 30-card registry, config and pure validation based on [03C APPROVED](./powerups/03C_POWERUP_GAMEPLAY_RULES_SPEC_APPROVED.md). [03D report](./powerups/03D_CARD_DEFINITIONS_REPORT.md) records contracts, tests and unresolved live-integration gates; Phase 04 is not activated.

## Power-up Phase 04–05 (HISTORICAL phase report)

This report records the reward/inventory foundation and remains unchanged as phase evidence: [implementation report](./powerups/04_05_IMPLEMENTATION_REPORT.md). It is superseded by the current gameplay/client/API instructions and Phase 06–08 reports. Protocol 15 / snapshot 12 are the predecessor contract; published v1.10.0 remains protocol 14 / snapshot 11.

## Power-up Phases 06–08 (CURRENT DEVELOPMENT)

All 30 official cards have server-side handlers and functional client commands; the current working-branch contract is protocol 16 / snapshot 14. Validation evidence and card-by-card limitations are in [Phase 06](./powerups/06_GAMEPLAY_ENGINE_REPORT.md), [Phase 07](./powerups/07_UI_UX_IMPLEMENTATION_REPORT.md), and [Phase 08](./powerups/08_FINAL_VALIDATION_REPORT.md). The work remains unreleased; Phase 09A records the local consolidation and any preserved uncommitted paths. Do not treat handler coverage as full native/product acceptance.

## Power-up Phase 08B stabilization (CURRENT DEVELOPMENT)

[Stabilization report](./powerups/08B_STABILIZATION_REPORT.md), [30-card coverage](./powerups/08B_CARD_TEST_COVERAGE_MATRIX.md), [interaction matrix](./powerups/08B_INTERACTION_MATRIX.md), and [balance/stress evidence](./powerups/08B_BALANCE_AND_STRESS_REPORT.md) record completed development validation and separate production blockers. Historical Phase 07/08 conclusions remain preserved with dated follow-up evidence. Physical device/GPU and platform release UAT remain required.

## Power-up Phase 09A local baseline

[Consolidation report](./powerups/09A_GIT_CONSOLIDATION_REPORT.md), [verified recovery checkpoint](./powerups/09A_PRE_CONSOLIDATION_CHECKPOINT.md), and [artwork integration readiness](./powerups/09A_ARTWORK_INTEGRATION_READINESS.md) record local-only Git consolidation. Artwork is unchanged; its next iteration is separate.


## Power-up Phase 09B–09C artwork (CURRENT DEVELOPMENT)

[Artwork implementation](./powerups/09B_ARTWORK_IMPLEMENTATION_REPORT.md), [30-card asset inventory](./powerups/09B_CARD_ART_ASSET_INVENTORY.md) and [visual QA](./powerups/09C_VISUAL_QA_REPORT.md) record the original vector/PNG family, category backs, rarity frames, integrated client surfaces and browser/packaged Electron evidence. Gameplay definitions and protocol remain unchanged. Local commits only; physical-device/product acceptance and publication remain separate.


## Power-up Phase 09C.1 detail refinement (CURRENT DEVELOPMENT)

[Artwork refinement audit](./powerups/09C1_ARTWORK_REFINEMENT_REPORT.md) records the full 30-card hand/coin/contour review, focused SVG/PNG corrections, before/after evidence and regression results. The approved compositions, card backs, rarity frames, UI behavior and gameplay definitions remain unchanged.

## Power-up Phase 09D final integration (CURRENT DEVELOPMENT)

The completed candidate is awaiting Product Owner manual UAT. The checklist is prepared with every manual case initially marked NOT TESTED; this documentation is not evidence that manual UAT was performed: [Phase 09D manual UAT checklist](./powerups/09D_MANUAL_UAT_CHECKLIST.md).

Final branch, test, CI, and PR details: [Phase 09D final PR report](./powerups/09D_FINAL_PR_REPORT.md).
