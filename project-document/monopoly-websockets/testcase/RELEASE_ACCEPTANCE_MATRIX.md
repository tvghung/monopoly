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
| v1.7.0 | 2026-10-09 | 12 / 11 | `.github/release-notes/v1.7.0.md` | The final copies at tag `v1.7.0`: `own-the-block-vnext/ACCEPTANCE_MATRIX.md`, `RELEASE_CANDIDATE.md`, `USER_MANUAL_BOT_TEST_PLAN.md` (commit `e88b959`, not on this branch; read with `git show v1.7.0:<path>`). The copies on this branch are the pre-QA versions: [ACCEPTANCE_MATRIX](../../own-the-block-vnext/ACCEPTANCE_MATRIX.md) |
| v1.8.0 | 2026-10-09 | 13 / 11 | .github/release-notes/v1.8.0.md | [Published GitHub Release](https://github.com/tvghung/monopoly/releases/tag/v1.8.0); candidate and acceptance evidence below |
| **v1.9.0** (latest) | 2026-10-11 | 14 / 11 | `.github/release-notes/v1.9.0.md` | [Published GitHub Release](https://github.com/tvghung/monopoly/releases/tag/v1.9.0); tag workflow 38119202459 succeeded. Physical-device Online hosting failure is under investigation; this fix is not released |

`v1.9.1-rc.1` is an unpublished validation candidate, not a published release row. It retains protocol 14,
snapshot 11 and the 1.9.0 minimum supported version. **External-device Online hosting: FAIL** on the original
affected Windows PC (`PUBLIC_READINESS` / `DNS`, no HTTP status, 39 attempts, 39,612 ms). LAN and the earlier manual
Quick Tunnel checks passed on that PC; the exact cause of the automatic probe's DNS failures remains unconfirmed.

`v1.9.1-rc.2` is an unpublished candidate on `release/v1.9.1-rc.2`, with the same protocol, snapshot and
minimum version. The owner reports repeated Online room creation on the previously failing Windows PC with Defender
enabled, at roughly 40–90 seconds each (**OWNER-REPORTED**, no per-run trace). Independent-network joining, full gameplay,
upgrade-path and macOS device checks remain **NOT RUN**. A manual
`release-candidate.yml` dispatch uploads workflow artifacts only; it does not publish a release.

The `release/v1.9.1-stable` candidate retains the rc.2 Online behavior and changes product version metadata to 1.9.1.
Automated gates and publication status are recorded only after execution; no rc.2 result is counted as a stable-build PASS.

### v1.9.1 stable candidate — local validation, 2026-10-14

| Scenario | Automated | Manual | Evidence / limitation |
| --- | --- | --- | --- |
| Frozen install; typecheck, lint, full test, renderer build, docs and V1 contract validators | PASS | NOT APPLICABLE | Local `release/v1.9.1-stable`: server 559, desktop 524, client 2,340 tests; documentation validator covered 130 Markdown files. The full suite was rerun after adding healthy-route and HTTP 429 probe assertions. |
| Windows x64 installer, artifact metadata, packaged runtime and Host, audio, art and size budget | PASS | NOT APPLICABLE | Local `pnpm desktop:make`, `collectArtifacts.mjs`, `validateRelease.mjs --release --artifacts`, packaged proofs; installer is `OwnTheBlock-1.9.1-win32-x64-Setup.exe`. Packaged Host proof reports `physicalDeviceAcceptance: MANUAL_REQUIRED`. |
| Live Quick Tunnel public route and four-player contract on the build machine | PASS | NOT APPLICABLE | `scripts/proveQuickTunnel.mjs` passed with protocol 14, admission and reconnect checks. This is a same-machine/local-network proof, not independent-network acceptance or a startup benchmark. |
| Healthy probe and DNS-recovery timing in fake-timer tests | PASS | NOT APPLICABLE | `apps/desktop/src/online/probe.test.ts` asserts two immediate public requests with no resolver/backoff on the healthy path; rc.2 tests cover bounded DNS recovery and retry. `apps/desktop/src/online/connectivity.test.ts` covers the 8-second registration fallback. Simulated timing does not explain the affected PC's 40–90-second reports. |
| Windows in-place update from 1.9.0 or rc.2; independent-network guests and full game; real macOS device hosting | NOT RUN | NOT RUN | Version precedence and Squirrel feed shape have automated coverage, but no isolated real-install upgrade or external-device run was executed for this candidate. |
| Final `main` CI, three-platform release-candidate workflow, public tag and feed | NOT RUN | NOT APPLICABLE | Pending pre-publication validation; this table is not publication evidence. |

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

## v1.8.0 candidate validation before publication (protocol 13 / snapshot 11)

Merged into `main` by the project owner as PR #6 (merge commit `ea133e4`, 2026-10-09). The candidate evidence below predates publication; GitHub later published [v1.8.0](https://github.com/tvghung/monopoly/releases/tag/v1.8.0) on 2026-10-09.
Scope and decisions: [ADR-13](../ARCHITECTURE_DECISIONS.md#adr-13-released-contract-vs-current-development),
[V1_RELEASE_CONTRACT §V1.8.0](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md), `.github/release-notes/v1.8.0.md`.

| Scenario | Automated | Manual | Evidence / limitation |
| --- | --- | --- | --- |
| typecheck, lint, `pnpm test`, build (Windows x64 dev machine, `bf60852`) | PASS | NOT APPLICABLE | Local 2026-10-09: desktop 491, server 559, client 2302 tests; contract/music/card-art/landmark validators |
| `pnpm validate:docs` (128 files), `pnpm test:docs`, `validate:v1-contract` (1.8.0, protocol 13), `test:v1-contract` | PASS | NOT APPLICABLE | Local, same commit |
| GitHub CI on the PR head (`bf60852`) and on `main` (`ea133e4`), Docs workflow | PASS | NOT APPLICABLE | `ci.yml` runs 37917830408 (PR) and 37918466424 (main); Docs 37917829860 and 37918466393 |
| Release Candidate workflow, manual dispatch on the branch (Windows x64, macOS x64, macOS arm64: quality gates, packaged build, packaged proofs; validation-only, publishes nothing) | PASS | NOT APPLICABLE | Run 37917874868 on `bf60852` |
| Desktop Build on the branch (`bf60852`) | FAIL (Windows only: WebKit e2e "single rendered Ogg Vorbis music asset…" failed twice with "access control checks"; every other step including packaged proofs passed) | NOT APPLICABLE | Run 37917870580. Known WebKit-on-Windows music-lifecycle flake class (also seen at v1.7.0); not caused by this change, but not proven flake-free either |
| Desktop Build on `main` (`ea133e4`, Windows and macOS) | PASS | NOT APPLICABLE | Run 37918826593 |
| Packaged Windows x64 host proof (`pnpm desktop:proof:host`, local) | PASS | NOT APPLICABLE | Local, version 1.8.0 package; `physicalDeviceAcceptance: MANUAL_REQUIRED` |
| Cross-version handshake, executed against the real v1.7.0 server code (isolated worktree, probe test, not committed) | PASS: a v1.7.0 host (protocol 12) rejects a protocol-13 client with `UPGRADE_REQUIRED`; a v1.7.0 host never ACKs `set bot difficulty` (no ACK in 3 s) | NOT APPLICABLE | The reverse (protocol-12 client against the current server): `apps/server/src/socket.integration.test.ts`. Two real packaged apps (1.7.0 ↔ 1.8.0): NOT RUN |
| Host-close confirmation: unanswered past 2 s, cancel, confirm, repeated close, unmount, process gone (fake timers, event-emitter `webContents`) | PASS | NOT RUN | `apps/desktop/tests/quitRequestController.test.ts`, `windowHandlers.test.ts`, `preloadBridge.test.ts`, `apps/client/src/App.test.tsx`. Real Windows/macOS window: NOT RUN |
| Finished 2v2 room: winning-team member holding a jail-free card leaves | PASS (reproduced as `INTERNAL_ERROR` before the fix, 3/3; passes after) | NOT APPLICABLE | `apps/server/src/socket.teamplay.integration.test.ts` |
| `sell house`, `make offer` idempotency; `decline offer` guard; sell property to bank, reject forced sale, do not buy, wait in jail | PASS (idempotency/guard tests fail when the fix is disabled) | NOT APPLICABLE | `apps/server/src/socket.hardening.integration.test.ts` |
| Income Tax 150 | PASS (`rulesContract.test.ts`, `game.test.ts`) | NOT RUN | Owner request in a chat transcript (ADR-13), not a written repository decision |
| Bot difficulty (5 levels) | PASS (`policy.test.ts`, `socket.bots.integration.test.ts`, `Lobby.test.tsx`) | NOT RUN | **No full game has been played per level** (neither manually nor by a simulation) |
| Emulated phone/tablet (`pnpm test:e2e:mobile`) | PASS on Chromium; WebKit/Windows flake above | NOT APPLICABLE | Not a physical device |
| Physical Android / iPhone / iPad | NOT APPLICABLE | NOT RUN | |
| Independent-network Online play (Quick Tunnel across networks) | NOT APPLICABLE | NOT RUN | Same as v1.7.0 (BLOCKED there) |
| In-place update 1.7.0 → 1.8.0 on a real install | NOT APPLICABLE | NOT RUN | Cannot be run before 1.8.0 is published; the `update-manifest.json` and mandatory-update policy are generated by the release workflow |
| Full games with bots on real Windows / macOS desktops | NOT APPLICABLE | NOT RUN | No owner report exists for 1.8.0 |
| Code signing / notarization | NOT APPLICABLE | NOT APPLICABLE | Unsigned by design |

**Verdict:** engineering and automated gates PASS; **manual acceptance for 1.8.0 is NOT RUN** (rows above). **Owner decision (2026-10-09,
in the working session, in answer to an explicit question):** the project owner chose to accept the NOT RUN rows as they were accepted
for v1.7.0 and to tag `v1.8.0` now. This is a risk acceptance of unverified rows, **not** a manual PASS and not an owner test report; the
release notes disclose the gaps. The rows stay NOT RUN until someone runs them.

## v1.8.1 pre-release corrections on `codex/v181-pre-release-fixes`

This branch starts from `origin/main` at `debf4e4`. It corrects the unreleased v1.8.0 candidate before manual acceptance; it does not
bump the app version or publish a release. Automated entries below are updated only after the listed local gates run. Owner manual
acceptance was later recorded by the owner as OWNER-REPORTED MANUAL ACCEPTANCE: PASS; no independent per-case or full LAN/device log was provided.

| Task | Automated | Manual | Evidence / limitation |
| --- | --- | --- | --- |
| Revealed-card minimum for human, bot and observer; server rejects early dismissal | PASS | OWNER-REPORTED PASS | Server card/game tests, bot policy/driver tests, client overlay and semantic-executor tests; all client 2,306 tests and server 559 tests passed across runs; aggregate runner worker note below |
| Income Tax 30% rounded down, zero no-debt; Luxury Tax fixed 100 | PASS | OWNER-REPORTED PASS | `apps/server/src/game.test.ts`, `apps/server/src/v3.simplifiedRules.test.ts`, `apps/server/src/rulesContract.test.ts`, client tax-copy tests; owner-reported acceptance; no per-case landing/Bank display log |
| Lobby bot difficulty shared dropdown | PASS | OWNER-REPORTED PASS | `apps/client/src/components/Lobby.test.tsx`; owner-reported acceptance; no per-case interaction log |
| Settings language shared dropdown | PASS | OWNER-REPORTED PASS | `apps/client/src/settings/SettingsPanel.test.tsx`, `apps/client/src/components/LanguageSelector.test.tsx`; owner-reported acceptance; no per-case persistence/viewport log |
| English hotel text in Property Modal | PASS | OWNER-REPORTED PASS | `apps/client/src/game/ui/property/PropertyInspectionModal.test.tsx` checks a live locale switch; audit found no source translation defect |

The aggregate `pnpm test` command had Vitest worker processes exit unexpectedly in the server socket-hardening and 2v2 suites. Those two suites passed separately (30/30 and 28/28); the other server tests passed in the aggregate report. The non-default `vmThreads` experiment was not used as gate evidence because four timer-based driver-liveness tests fail under that pool, while they pass with the server's default fork pool.

## Open release risks

| ID | Risk | Type | Status |
| --- | --- | --- | --- |
| R-1 | `set bot difficulty` and Income Tax 150 were added inside protocol 12 (mixed 1.7.0/vNext apps connecting with different rules) | Compatibility | RESOLVED in code: protocol 12 → 13, `UPGRADE_REQUIRED` for any 1.7.0 app, desktop "update both apps" message, minimum supported 1.8.0 (executed against real v1.7.0 server code, table above) |
| R-2 | The branch lacked the v1.7.0 release records on `main` (`e88b959`) | Documentation divergence | RESOLVED: `origin/main` merged without conflicts |
| R-3 | WebKit-on-Windows music-lifecycle e2e is flaky ("access control checks"); failed twice in one Desktop Build run on the branch, passed in the next run on `main` | Test infrastructure | OPEN, non-blocking follow-up |
| R-4 | No manual acceptance for 1.8.0 (bot games per level, real host-close, two real apps, in-place update, devices, independent networks) | Verification gap | ACCEPTED BY OWNER for release on 2026-10-09 (risk acceptance; rows remain NOT RUN) |

## v1.9.0 release execution record

Owner acceptance for the v1.9.0 implementation scope: OWNER-REPORTED MANUAL ACCEPTANCE: PASS. This is the owner's report for the requested gameplay and animation behavior, not an independently logged LAN, physical-device, or cross-network test suite.

Protocol 14 is required because Income Tax changes from v1.8.0's fixed 150 to 30% of current nonnegative cash, rounded down. The strict handshake rejects mixed protocol versions; minimum supported version is 1.9.0. Room snapshot schema stays 11 because the accepted changes add no persisted snapshot fields.

| Gate | Automated / release evidence | Manual evidence |
| --- | --- | --- |
| Accepted v1.8.1/v1.9.0 behavior | Local checks PASS; GitHub CI/RC pending | OWNER-REPORTED PASS |
| Protocol compatibility and update policy | Protocol 14 / minimum 1.9.0; strict handshake and server/LAN fixtures PASS | Packaged mixed-version upgrade: NOT RUN |
| Windows x64, macOS x64, macOS arm64 release candidates | Pending Release Candidate workflow on the integrated main SHA | Physical devices and independent networks: not independently verified in this run |
| Official publication | Pending tag-triggered Release Candidate workflow | Not applicable |

Local suite evidence: desktop 491/491, client 2,337/2,337, server 559/559 across the single-fork rerun (29/29 files), and 42 root contract/registry/artwork validator tests passed. Music transport passed 22/22. Mobile Chromium and WebKit E2E passed 4/4. The first aggregate pnpm test invocation exited on a Vitest worker error in the server package without an assertion failure; the stable server rerun passed. CI remains the required independent gate.
