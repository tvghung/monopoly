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
| Latest published release | **v1.7.0** (socket protocol 12, room snapshot schema 11) | GitHub Release `v1.7.0` published 2026-10-09; tag `v1.7.0` = `f37a271` on `main`; `release-candidate.yml` run on the tag succeeded |
| Working branch | `feat/own-the-block-multiplayer-bots-vnext` — **CURRENT DEVELOPMENT** after v1.7.0 | `git log v1.7.0..HEAD` |
| Differences from v1.7.0 | Income Tax 150 (released: 200); bot difficulty levels; two client fixes | [ADR-13](./monopoly-websockets/ARCHITECTURE_DECISIONS.md#adr-13-released-contract-vs-current-development) |
| Open release risk | **R-1**: those rule changes were added inside protocol 12 | [Release acceptance matrix](./monopoly-websockets/testcase/RELEASE_ACCEPTANCE_MATRIX.md) |
| Release records missing on this branch | Commit `e88b959` on `main` (v1.7.0 owner-reported manual QA) | `git show v1.7.0:project-document/own-the-block-vnext/RELEASE_CANDIDATE.md` |

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
| [ui-ux-overhaul/](./ui-ux-overhaul/00_MASTERPLAN_UI_UX_OVERHAUL.md) (all other files) | HISTORICAL | V1 phase plans, audits and acceptance (PostgreSQL era). SUPERSEDED: `07C_PHASE_7_1_DESKTOP_LAN_IMPLEMENTATION.md`, `GAMEPLAY_MUSIC_STEM_EXPORT_SPEC.md`, `V1_AUDIO_PRODUCTION_PIPELINE.md`, `V1_AUDIO_SEGMENTED_TRANSPORT.md` (→ release contract), `PHASE_1_1_MANUAL_ACCEPTANCE.md` (→ testcase checklists) |
| [own-the-block-vnext/](./own-the-block-vnext/RELEASE_SCOPE.md) | HISTORICAL (release program) / REFERENCE (designs) | `RELEASE_SCOPE`, `RELEASE_CANDIDATE`, `ACCEPTANCE_MATRIX`, `USER_MANUAL_BOT_TEST_PLAN`, `UI_UX_REGRESSION_MATRIX` are the v1.7.0 release program records (the copies on this branch predate the final release records at tag `v1.7.0`). `BOT_SYSTEM_SPEC`, `IMPLEMENTATION_PLAN` (decision log), `ONLINE_MULTIPLAYER_DESIGN` are REFERENCE |
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
