# Release acceptance matrix

Status: CURRENT. Index of acceptance status per version and platform. It does not copy the detailed per-release matrices; it
links them and records only what their evidence states. Feature-level checklists are in [testcase/README.md](./README.md).

**Status words:** `PASS` (executed and passed, evidence linked), `FAIL`, `NOT RUN`, `BLOCKED`, `NOT APPLICABLE`.
`OWNER-REPORTED` = the owner stated it passed without a per-case log; it is product acceptance, not independent evidence, and is
never upgraded to `PASS`. An automated `PASS` is never a manual `PASS`. Acceptance owner for every release: the project owner
(the person who approves the tag).

## v1.11.0 Power-up release preparation

Status: PREPARED, publication not yet verified. The Product Owner explicitly authorizes merging PR #28 and publishing the stable release with manual gaps recorded below. This supersedes the previous PR Draft/UAT-first hold as a release decision; it is not manual UAT PASS.

Protocol 16, RAM snapshot14 and LAN discovery16; minimum supported version1.11.0. v1.10.0 protocol14 clients cannot join these hosts. Finish matches before updating because a Host process shutdown permanently ends its RAM-only rooms/sessions.

| Scope | Automated / release status | Manual / device status | Evidence / boundary |
| --- | --- | --- | --- |
| Power-up gameplay, artwork and OB-1 through OB-4 | PASS on pre-merge head7d296dd for CI/docs, picker browser9checks, packaged runtime/Host/art/audio/budget and nativeLAN/OnlineUI7checks | NOT RUN for human-paced full-match Power-up/balance review | Existing [OB-4 report](../../powerups/OB4_PICKER_VALIDATION.md) and [release verification](../../releases/V1_11_0_RELEASE_VERIFICATION.md) distinguish exact candidates. Native Online guest is samePC/network. |
| Versioned1.11.0 quality, Windowsx64/macOSx64/macOSarm64 distributables and public checksums/feed | NOT RUN — pending final versioned main CI and tag-triggered Release Candidate | NOT APPLICABLE for publication mechanics | Every quality/platform/proof/integrity gate must pass before publish. |
| Actual installed1.10.0→1.11.0 upgrade, physical second-deviceLAN, independent-network guests, realmacOSdevices, otherGPU/high-refresh and human listening | NOT RUN | NOT RUN | Pipeline success does not upgrade these statuses. |
| Signing / notarization | NOT APPLICABLE — existing unsigned tag mode | NOT RUN | Windows/macOS installers unsigned; macOS not notarized. |
| Native renderer suspend/recovery and full physical performance acceptance | BLOCKED / NOT RUN according to historical reproduction limits | NOT RUN | No new PASS is inferred from headless frame sampling or native launch. |

The existing manual checklist remains unchanged. Publication URLs, tag/main commits, all-target CI results, asset digests and remaining risks will be recorded after actual verification in the release record.

## HISTORICAL — Owner manual full-match acceptance on the pre-release B8 worktree (2026-10-20)

| Scope / binary | Manual result | Evidence / boundary |
| --- | --- | --- |
| Owner-played full match using local `phase-b8` packaged Windows `OwnTheBlock.exe` (`apps/desktop/out/Own the Block-win32-x64/OwnTheBlock.exe` in that worktree) | **OWNER-REPORTED PASS** | Owner confirmed completing a full-game UAT and that all checked items passed. The [B8 implementation record](../../ui-ux-overhaul/08L_PHASE_B8_IMPLEMENTATION.md#owner-full-match-uat-follow-up--20-october-2026) records this later testimony. Archived B8 packaged proof was built at application SHA `30060c3a3685b3cad6a41baa0df32c67ad61d32c`; the exact owner's executable hash was not supplied. This is **not** post-merge-main binary acceptance or acceptance of a published installer, including v1.10.0. No per-case log, setup, visual recording or proof of specific feature coverage was supplied. |
| B8 native suspended-renderer recovery (≤1 second) and external hardware/platform/network checks | **BLOCKED / NOT RUN** | The packaged Electron minimize/restore did not suspend rendering. Full-match owner confirmation does not turn a non-reproduced suspended-renderer test or independent-network, macOS, other-GPU/high-refresh testing into PASS. B8 remains **PARTIAL — CLOSED**, merged in [PR #24](https://github.com/tvghung/monopoly/pull/24). |

This is pre-publication owner feedback for the B8 worktree, **not acceptance of the published v1.10.0 installer** and not independently observed PASS results for every item in the bot-plan, game-rule or release checklists. See the v1.10.0 row below and the canonical [release contract](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md).

## Published releases

All rows below are published GitHub Releases, verified 2026-10-21. v1.10.0 publication is corroborated by the public GitHub Release and successful tag workflow; protocol and snapshot numbers come from
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
| v1.9.0 | 2026-10-11 | 14 / 11 | `.github/release-notes/v1.9.0.md` | [Published GitHub Release](https://github.com/tvghung/monopoly/releases/tag/v1.9.0); tag workflow 38119202459 succeeded. The Online hosting reliability fix was added in v1.9.1 |
| v1.9.1 | 2026-10-14 | 14 / 11 | `.github/release-notes/v1.9.1.md` | [Published GitHub Release](https://github.com/tvghung/monopoly/releases/tag/v1.9.1); tag workflow [38524488302](https://github.com/tvghung/monopoly/actions/runs/38524488302) succeeded on `3590444` |
| v1.10.0 | 2026-10-20 | 14 / 11 | `.github/release-notes/v1.10.0.md` | [Published GitHub Release](https://github.com/tvghung/monopoly/releases/tag/v1.10.0); tag workflow [39434544013](https://github.com/tvghung/monopoly/actions/runs/39434544013) succeeded on `5a93a29`; [v1.10.0 release record](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md) |


## v1.10.0 stable release — hồ sơ kỹ thuật và nghiệm thu

**Trạng thái:** ĐÃ PHÁT HÀNH ngày 2026-10-20. Tag có chú thích `v1.10.0` trỏ tới commit baseline `5a93a29c29ee91ad941ecf07eb958fc78e83bf9b`; tag workflow đã thành công. Release notes xác định protocol 14, snapshot schema 11 và minimum supported version 1.9.0. Working tree hiện có các E1 patch được tạo sau release; chúng không thuộc tag hoặc installer v1.10.0.

| Phạm vi | Bằng chứng tự động / phát hành | Bằng chứng thủ công / thiết bị | Giới hạn |
| --- | --- | --- | --- |
| Release CI, tag và asset đã phát hành | PASS — tag workflow 39434544013 thành công; GitHub Release và các asset nền tảng đã được công bố | NOT APPLICABLE | Build và công bố artifact không chứng minh từng binary đã cài được nghiệm thu trên thiết bị vật lý. |
| Phạm vi hiệu năng và trình bày B4/B5/B7/B8 | B4, B5, B8 PARTIAL — CLOSED; B7 PASS — CLOSED theo [release notes](../../../.github/release-notes/v1.10.0.md) và implementation records | UAT trọn ván do chủ dự án báo cáo trên executable `phase-b8` tại local worktree; chưa cung cấp hash executable | Không xem UAT đó là nghiệm thu đã đối chiếu hash với installer v1.10.0 công khai. |
| Native Electron renderer suspend/recovery | BLOCKED — thao tác minimize/restore không suspend renderer, vì vậy chưa chứng minh mục tiêu phục hồi renderer sau suspend trong ≤1 giây | NOT RUN / BLOCKED | Chưa có PASS cho nghiệm thu suspend của native OS. |
| Chạy installer, màn hình high-refresh vật lý, GPU khác, sử dụng macOS, gameplay qua mạng độc lập và cập nhật thật v1.9.1 → v1.10.0 | Đã có artifact phát hành và CI build | NOT RUN | Không suy ra nghiệm thu install/update thật, phiên registry/tunnel bên ngoài hoặc game cross-network từ mocked test, loopback cục bộ, web build hay CI. |

B6 Adaptive Graphics bị loại theo quyết định của chủ dự án. Cold-board first-frame và lần chuyển graphics tier đầu tiên vẫn có thể chậm. Release notes ghi các gói chưa ký số và macOS chưa notarized. Đây là dữ kiện của release; E1 fixes hiện tại được ghi riêng trong audit reports 12–16 và chưa phát hành.

`v1.9.1-rc.1` is an unpublished validation candidate, not a published release row. It retains protocol 14,
snapshot 11 and the 1.9.0 minimum supported version. **External-device Online hosting: FAIL** on the original
affected Windows PC (`PUBLIC_READINESS` / `DNS`, no HTTP status, 39 attempts, 39,612 ms). LAN and the earlier manual
Quick Tunnel checks passed on that PC; the exact cause of the automatic probe's DNS failures remains unconfirmed.

`v1.9.1-rc.2` is an unpublished candidate on `release/v1.9.1-rc.2`, with the same protocol, snapshot and
minimum version. The owner reports repeated Online room creation on the previously failing Windows PC with Defender
enabled, at roughly 40–90 seconds each (**OWNER-REPORTED**, no per-run trace). Independent-network joining, full gameplay,
upgrade-path and macOS device checks remain **NOT RUN**. A manual
`release-candidate.yml` dispatch uploads workflow artifacts only; it does not publish a release.

The published v1.9.1 build retains the rc.2 Online behavior and changes product version metadata to 1.9.1.
The stable-build results below come from their own local checks and tagged workflow, not from rc.2.

### v1.9.1 stable release — validation, 2026-10-14

| Scenario | Automated | Manual | Evidence / limitation |
| --- | --- | --- | --- |
| Frozen install; typecheck, lint, full test, renderer build, docs and V1 contract validators | PASS | NOT APPLICABLE | Local full suite on the final packaging cleanup: server 559, desktop 525, client 2,340 tests. Final `main` CI and tag workflow quality gates passed. |
| Windows x64 installer, artifact metadata, packaged runtime and Host, audio, art and size budget | PASS | NOT APPLICABLE | Local `pnpm desktop:package`, `collectArtifacts.mjs`, `validateRelease.mjs --release --artifacts`, packaged proofs; final tagged Windows CI job passed. Packaged Host proof reports `physicalDeviceAcceptance: MANUAL_REQUIRED`. |
| Live Quick Tunnel public route and four-player contract on the build machine | PASS | NOT APPLICABLE | `scripts/proveQuickTunnel.mjs` passed with protocol 14, admission and reconnect checks. This is a same-machine/local-network proof, not independent-network acceptance or a startup benchmark. |
| Healthy probe and DNS-recovery timing in fake-timer tests | PASS | NOT APPLICABLE | `apps/desktop/src/online/probe.test.ts` asserts two immediate public requests with no resolver/backoff on the healthy path; rc.2 tests cover bounded DNS recovery and retry. `apps/desktop/src/online/connectivity.test.ts` covers the 8-second registration fallback. Simulated timing does not explain the affected PC's 40–90-second reports. |
| Windows in-place update from 1.9.0 or rc.2; independent-network guests and full game; real macOS device hosting | NOT RUN | NOT RUN | Version precedence and Squirrel feed shape have automated coverage, but no isolated real-install upgrade or external-device run was executed for this candidate. |
| Final `main` CI, three-platform release-candidate workflow, public tag and feed | PASS | NOT APPLICABLE | `main` CI 38522493706 and docs 38522493627 passed. Unsigned validation run [38522758173](https://github.com/tvghung/monopoly/actions/runs/38522758173) passed all four jobs on `3590444`; downloaded artifacts matched their manifests and the Windows archive had no test JS, source maps or build config. Annotated `v1.9.1` points to `3590444`; tag workflow [38524488302](https://github.com/tvghung/monopoly/actions/runs/38524488302) passed quality, three platform jobs and publication. The public release is stable and latest. All seven public asset URLs returned HTTP 200; downloaded assets matched `SHA256SUMS.txt` and `update-manifest.json`; the latest update feed serves 1.9.1 with minimum 1.9.0. |

The first pre-publication validation run 38504716182 passed its four CI jobs, but manual archive inspection found
compiled Online test modules and source maps in the Windows `app.asar`: **artifact-content acceptance: FAIL** for that
candidate. The packaging cleanup on `codex/v191-package-cleanup` removed them and made the size-budget gate reject
their return. A fresh local package, unsigned validation run 38522758173 and the published tagged package were inspected:
**PASS** (39 `app.asar` entries, no compiled tests, source maps or build configuration). The earlier failed artifact was
never published.

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


## v1.10.0 current-development F3 local artifact checks — 2026-10-23

Đây là candidate cục bộ `LOCAL-CONTROLLED-RC` từ working tree `codex/v1.10.0-refactor`; nó không thay thế hay xác nhận lại artifact v1.10.0 đã phát hành. Hồ sơ chi tiết: Report 26 (local-only historical evidence: `26_PHASE_F3_CONTROLLED_RC_ARTIFACT_VERIFICATION.md`; unavailable in a clean checkout), artifact manifest (local-only evidence: test-results/phase-f3-controlled-rc/run-2026-10-23T07-20-30-210Z/F3-RC-ARTIFACT-MANIFEST.json; unavailable in a clean checkout).

| Phạm vi | Automated | Manual | Bằng chứng / giới hạn |
| --- | --- | --- | --- |
| Windows x64 local Forge package, ASAR, entrypoint và external resources | **PASS** | NOT RUN | Candidate fingerprint `72273d1c6979132a2f68587ee915480ba86fff1897e8cf82f5ffcafbd0061379`; không tạo installer, không publish hoặc ký số. |
| E1 regression/characterization và workspace release gates | **PASS** | NOT APPLICABLE | 30/30 mỗi chế độ E1; `pnpm test` 3.988/3.988; xem report26 và log trong F3 evidence. |
| Native launch, installer, cập nhật 1.9.1 → 1.10.0, macOS, thiết bị/GPU, suspend/resume và cross-network | NOT RUN | NOT RUN | Không chạy trong F3 vì chưa thiết lập được môi trường isolated đủ an toàn; không suy ra PASS từ static artifact checks. |
| AUDIT-018 / nghiệm thu phát hành đầy đủ | **NOT RUN — OPEN** | NOT RUN | Artifact F3 đã xác minh; các kiểm tra native, installer, cập nhật và thiết bị nêu trên vẫn còn mở. |

## v1.10.0 current-development F6 installer parity and Host isolation — 2026-10-23

Đây là kiểm tra cục bộ tiếp nối F3/F4/F5, không thay thế artifact v1.10.0 đã phát hành. Chi tiết và hash: Report 28 (local-only historical evidence: `28_PHASE_F6_INSTALLER_PARITY_AND_HOST_ISOLATION.md`; unavailable in a clean checkout); evidence nằm trong `test-results/phase-f6-release-hardening/`.

| Phạm vi | Automated | Manual | Bằng chứng / giới hạn |
| --- | --- | --- | --- |
| F6.0 preflight và bảo toàn | **PASS** | NOT RUN | Branch/HEAD khớp baseline; 184 tệp F3 và artifact F5 được băm lại; reports 00–27 và protected outputs được ghi nhận. |
| F6.1 NuSpec root cause | **VERIFIED** | NOT APPLICABLE | Installed template chỉ liệt kê glob cụ thể; thiếu root `LICENSES.chromium.html` và `version`; `additionalFiles` là API được hỗ trợ. |
| F6.2 installer parity | **PASS — local controlled artifact** | NOT RUN | 184/184 F3 payload files byte-identical; hai executable Squirrel được phân loại riêng; Setup unsigned. Không cài hoặc publish. |
| F6.3 Host isolation | **BLOCKED** | NOT RUN | Packaged HostRuntime cố định bind `0.0.0.0`; có Wi-Fi interface đang hoạt động, không tìm thấy VM/container cô lập; không chạy packaged Host. |
| Native Host / local multiplayer | **BLOCKED** | NOT RUN | Mocked Host lifecycle và explicit-loopback Socket tests chạy; không có packaged HostRuntime/native multiplayer evidence. |
| Installation / update | **BLOCKED** | NOT RUN | Không có sandbox; không tìm thấy installer/feed 1.9.1; candidate tiếp tục là 1.10.0. |
| Automated regression / quality gates | **PASS** | NOT APPLICABLE | Report 28 ghi riêng E1, package, Host characterization, client/server/desktop/root tests, typecheck, lint, build, docs, v1 contract và diff check. Build có cảnh báo chunk >500 kB. |

## v1.10.0 current-development F7 safe Host test infrastructure — 2026-10-23

Chi tiết: Report 29 (local-only historical evidence: `29_PHASE_F7_SAFE_HOST_TEST_INFRASTRUCTURE.md`; unavailable in a clean checkout); logs và snapshot riêng tại `test-results/phase-f7-safe-host-infrastructure/`.

| Phạm vi | Automated | Manual | Bằng chứng / giới hạn |
| --- | --- | --- | --- |
| F7.0 preflight / preservation | **PASS** | NOT RUN | Snapshot trước test; reports 00–28, F3/F5/F6, B8, E1 và client dist được kiểm chứng/khôi phục. |
| F7.1 fail-closed test listeners | **PASS** | NOT APPLICABLE | 44 focused PASS; 2 LAN-peer tests SKIPPED. Worker setup, child preload và explicit loopback fixture; không thử bind LAN thật. |
| F7.2 local Host fixture feasibility | **VERIFIED** | NOT RUN | Loopback Socket.IO và mocked Host lifecycle chạy được; packaged Host không có loopback bind configuration. |
| F7.3 Windows VM preparation | **PASS — plan** | NOT RUN | Runbook 16 bước; hiện không có VM hoặc network boundary được xác minh. |
| Full automated suite | **PASS** | NOT APPLICABLE | 4.015 PASS, 2 server LAN tests SKIPPED; E1 regression/characterization 30/30 mỗi mode. |
| Packaged Host / native multiplayer | **BLOCKED** | NOT RUN | Không launch F3; máy hiện tại không chứng minh inbound/outbound isolation. |
| Install / update acceptance | **BLOCKED** | NOT RUN | F6 Setup chỉ dành cho disposable VM; thiếu v1.9.1 installer/feed, signing và version progression test-only. |


## v1.10.0 current-development F8 VM-free native Host and local acceptance — 2026-10-23

Chi tiết: Report 30 (local-only historical evidence: `30_PHASE_F8_VM_FREE_NATIVE_HOST_ACCEPTANCE.md`; unavailable in a clean checkout); evidence tại test-results/phase-f8-vm-free-native/run-2026-10-23T15-27-10.976Z/.

| Phạm vi | Automated | Native/manual | Bằng chứng / giới hạn |
| --- | --- | --- | --- |
| F8.0 preflight và preservation | **PASS** | NOT RUN | 114 trạng thái Git trước F8, sáu deletion, reports 00–29, F3/F5/F6, E1 và client dist được xác minh/khôi phục. |
| F8.1 trusted loopback mode | **PASS** | NOT RUN | Focused desktop 35/35, server 47/47, client 70/70; production bind vẫn 0.0.0.0. |
| F8.2 candidate unpacked | **PASS** | NOT RUN | Candidate riêng 184 tệp; EXE/ASAR/resources và 40/40 ASAR integrity entries được băm. Không tạo installer. |
| F8.3 native isolation | **BLOCKED** | NOT RUN | Firewall ON nhưng BlockInbound,AllowOutbound; không chứng minh được egress block cho candidate. |
| F8.4 Host Start/Stop | **BLOCKED** | NOT RUN | Không launch candidate theo điều kiện F8.3. |
| F8.5 local multiplayer | NOT RUN | NOT RUN | Chưa có packaged local Host để kết nối hai client. |
| F8.6 board/input | NOT RUN | NOT RUN | Chưa mở game board trong candidate. |
| Automated quality gates | **PASS** | NOT APPLICABLE | 4,031 PASS, 2 server LAN tests SKIPPED; E1 regression/characterization 30/30 mỗi mode; typecheck, lint, build, docs, protocol và diff gates đạt. |

Không suy ra native acceptance cho F3, installer, LAN hoặc WAN từ candidate/package verification.
