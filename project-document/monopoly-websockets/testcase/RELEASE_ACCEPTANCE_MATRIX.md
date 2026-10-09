# Release acceptance matrix

Status: CURRENT. Index of acceptance status per version and platform. It does not copy the detailed per-release matrices; it
links them and records only what their evidence states. Feature-level checklists are in [testcase/README.md](./README.md).

**Status words:** `PASS` (executed and passed, evidence linked), `FAIL`, `NOT RUN`, `BLOCKED`, `NOT APPLICABLE`.
`OWNER-REPORTED` = the owner stated it passed without a per-case log; it is product acceptance, not independent evidence, and is
never upgraded to `PASS`. An automated `PASS` is never a manual `PASS`. Acceptance owner for every release: the project owner
(the person who approves the tag).

## Published releases

All rows below are published GitHub Releases (`gh release list`, verified 2026-10-09). Protocol and snapshot numbers come from
each version's release notes in `.github/release-notes/`.

| Version | Published | Protocol / snapshot | Release notes | Detailed acceptance record |
| --- | --- | --- | --- | --- |
| v1.0.0 | 2026-10-02 | 9 / 8 | `.github/release-notes/v1.0.0.md` | [V1_RELEASE_CONTRACT §V1.0.0](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md), [V1_FINAL_MANUAL_ACCEPTANCE](../../ui-ux-overhaul/V1_FINAL_MANUAL_ACCEPTANCE.md) (HISTORICAL) |
| v1.1.0 | 2026-10-03 | 9 / 8 | `.github/release-notes/v1.1.0.md` | V1_RELEASE_CONTRACT §V1.1.0, [v1-1-feedback](../../v1-1-feedback/README.md) (HISTORICAL) |
| v1.1.1 | 2026-10-04 | 9 / 8 | `.github/release-notes/v1.1.1.md` | V1_RELEASE_CONTRACT §V1.1.1 |
| v1.2.0 | 2026-10-05 | 9 / 8 | `.github/release-notes/v1.2.0.md` | V1_RELEASE_CONTRACT §V1.2.0, [auto-update](../../auto-update/README.md) (REFERENCE) |
| v1.3.0 | 2026-10-06 | 10 / 9 | `.github/release-notes/v1.3.0.md` | V1_RELEASE_CONTRACT §V1.3.0, [team-play checklist](./team-play.md) |
| v1.4.0 | 2026-10-07 | 11 / 10 | `.github/release-notes/v1.4.0.md` | V1_RELEASE_CONTRACT §V1.4.0 |
| v1.4.1 | 2026-10-07 | 11 / 10 | `.github/release-notes/v1.4.1.md` | V1_RELEASE_CONTRACT §V1.4.1 |
| v1.5.0 | 2026-10-08 | 11 / 10 | `.github/release-notes/v1.5.0.md` | [RAM-HOSTING-VERIFICATION](../RAM-HOSTING-VERIFICATION.md) (HISTORICAL). No section in the release contract; the release notes are the record |
| v1.6.0 | 2026-10-08 | 11 / 10 | `.github/release-notes/v1.6.0.md` | Release notes only (no separate acceptance record found) |
| v1.6.1 | 2026-10-08 | 11 / 10 | `.github/release-notes/v1.6.1.md` | Release notes only (no separate acceptance record found) |
| **v1.7.0** (latest) | 2026-10-09 | 12 / 11 | `.github/release-notes/v1.7.0.md` | The final copies at tag `v1.7.0`: `own-the-block-vnext/ACCEPTANCE_MATRIX.md`, `RELEASE_CANDIDATE.md`, `USER_MANUAL_BOT_TEST_PLAN.md` (commit `e88b959`, not on this branch; read with `git show v1.7.0:<path>`). The copies on this branch are the pre-QA versions: [ACCEPTANCE_MATRIX](../../own-the-block-vnext/ACCEPTANCE_MATRIX.md) |

## v1.7.0 — platform and scenario summary

Source: `RELEASE_CANDIDATE.md` and `ACCEPTANCE_MATRIX.md` at tag `v1.7.0`, plus the `release-candidate.yml` run on the tag
(`gh run list`: run 37877831791, conclusion success).

| Platform / device | Scenario | Automated | Manual | Evidence / limitation |
| --- | --- | --- | --- | --- |
| Linux CI + Windows x64 dev machine | typecheck, lint, unit/integration tests, build | PASS | NOT APPLICABLE | Local run on `548c551`; release workflow on the tag succeeded |
| Windows x64, macOS x64, macOS arm64 (CI runners) | Packaged build, packaged proofs, `validate:release`, publish with `update-manifest.json` | PASS | NOT APPLICABLE | `release-candidate.yml` run 37877831791 on tag `v1.7.0`; assets published |
| Windows x64 dev machine | Packaged host proof (`pnpm desktop:proof:host`: four clients, LAN discovery, reconnect, restart clears room and token) | PASS on previous candidate `648d4ca`; NOT RUN locally on `548c551` | NOT APPLICABLE | RELEASE_CANDIDATE "Validation on 648d4ca" |
| Same machine and network | Live Quick Tunnel (`scripts/proveQuickTunnel.mjs`) | PASS (on `c764135`) | NOT APPLICABLE | Not a cross-network proof |
| Independent networks | Online play across different Wi-Fi/cellular networks | NOT APPLICABLE | BLOCKED | Tag record NET-03/AC-R04 BLOCKED; release notes say not independently verified; the owner's general "multiplayer" statement does not itemise networks |
| Emulated phone/tablet (Playwright Chromium + WebKit) | `pnpm test:e2e:mobile` | PASS (4 tests on `548c551`; one WebKit music-lifecycle flake passed on re-run) | NOT APPLICABLE | RELEASE_CANDIDATE |
| Modal peek toggle on devices | Plan D5–D8 | NOT APPLICABLE | OWNER-REPORTED | MP-15 "devices not itemised by the owner" |
| Physical Android / iPhone / iPad | Join, play, rotate, touch targets | NOT APPLICABLE | NOT RUN | AC-U07/U08, AC-R04 at tag |
| Windows / macOS desktop | Full games with bots, bot animation, modal peek | NOT APPLICABLE | OWNER-REPORTED | AC-R03 / BA-13; no per-case log; platforms not itemised |
| Windows / macOS desktop | In-place update from 1.6.1 to 1.7.0 on a real install | NOT APPLICABLE | NOT RUN | No record found |
| All | Code signing / notarization | NOT APPLICABLE | NOT APPLICABLE | Unsigned distribution by design (release notes); signing BLOCKED in `validate:release` |
| All | Performance baseline, human usability study | NOT RUN | NOT RUN | No record found |

## CURRENT DEVELOPMENT on `feat/own-the-block-multiplayer-bots-vnext` (after v1.7.0, unreleased)

Changes: commit `1937a73` (Income Tax 150, bot difficulty, jail panel timing, trade-offer input). Details:
[ADR-13](../ARCHITECTURE_DECISIONS.md#adr-13-released-contract-vs-current-development).

| Scenario | Automated | Manual | Evidence / limitation |
| --- | --- | --- | --- |
| typecheck, lint, `pnpm test`, build on `1937a73` | PASS | NOT APPLICABLE | Local Windows x64 run 2026-10-09: desktop 479, server 527, client 2298 tests (agent-run local result reported in session; no committed log); CI not triggered for this branch (ci.yml runs on `main` and pull requests) |
| Bot difficulty (5 levels, host-only, guests read-only) | PASS (`apps/server/src/bots/policy.test.ts`, `apps/server/src/socket.bots.integration.test.ts`, `apps/client/src/components/Lobby.test.tsx`) | NOT RUN | No full game per level has been played |
| Income Tax 150 | PASS (`apps/server/src/rulesContract.test.ts`, `apps/server/src/game.test.ts`) | NOT RUN | Implemented on the vNext development branch; product approval/release decision not independently verified |
| Jail panel only on the jailed player's own turn | PASS (`apps/client/src/components/dashboard/JailPanel.test.tsx`) | NOT RUN | |
| Trade offer keeps typed amounts | PASS (`apps/client/src/components/dashboard/TradeOfferModal.test.tsx`) | NOT RUN | |
| Packaged build and proofs | NOT RUN | NOT RUN | |
| Compatibility with released 1.7.0 clients and hosts | NOT RUN | NOT RUN | **RELEASE RISK R-1 open** (below) |

**Verdict for the branch: NOT RELEASE READY** while R-1 is open and manual checks are NOT RUN.

## Open release risks

| ID | Risk | Type | Status |
| --- | --- | --- | --- |
| R-1 | `set bot difficulty` and Income Tax 150 were added inside protocol 12, so mixed 1.7.0/vNext apps connect. A 1.7.0 server never ACKs `set bot difficulty` (unknown event, no listener; the vNext client has no ACK timeout) — reachable only with a mixed-version host setup; a 1.7.0 client ignores `boardState.botDifficulty`; a desktop guest of the other version displays its own tax value while the host charges its value. Code reading, not executed. | Additive command and state (handshake-compatible) plus a gameplay-rule display mismatch for cross-version desktop guests | OPEN — owner decision required: accept, or bump the protocol and `apps/desktop/update-policy.json` in a separate engineering task |
| R-2 | This branch lacks the v1.7.0 release records committed on `main` (`e88b959`). | Documentation divergence | OPEN — sync the branch with `main` before the next release |
