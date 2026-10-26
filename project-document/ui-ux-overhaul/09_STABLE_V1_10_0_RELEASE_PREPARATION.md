# Stable v1.10.0 — Pre-publication release gates

> **HISTORICAL preparation record.** At the time this checklist was written, the owner chose a direct **Stable v1.10.0** release without an intermediate RC, and no tag or release had yet been authorized. v1.10.0 was later published; current release identity and limits are in [V1_RELEASE_CONTRACT](./V1_RELEASE_CONTRACT.md). This historical record retains the original go/no-go evidence and does not change its time or result.

## Scope and provenance

- Source baseline at preparation: post-PR #25 `main` `2330d9c5bbc7858895795944c9057b3406cc7a4c` (2026-10-20).
- Release-preparation branch: `release/prepare-v1.10.0-stable`.
- Previous public release: `v1.9.1`.
- Intended next public release: `v1.10.0` (**not published** at preparation time).
- Intended package filenames: `OwnTheBlock-1.10.0-win32-x64-Setup.exe`, `OwnTheBlock-1.10.0-macos-x64.dmg`, `OwnTheBlock-1.10.0-macos-arm64.dmg`.
- Program status: B3/B4/B5/B8 PARTIAL — CLOSED; B6 SKIPPED; B7 PASS — CLOSED. B5 visual acceptance and B8 full match are owner-reported within their documented scope.
- Full match owner UAT was conducted with a prior locally packaged `phase-b8` executable, not with the new v1.10.0 installer. Reference application source is `30060c3a3685b3cad6a41baa0df32c67ad61d32c`; no hash of the exact owner-played binary is available.

## Version, compatibility and preflight

- [x] Preparation source identifies `v1.10.0` as newer than public `v1.9.1`; do not move/rewrite historical tags.
- [x] Align product version in root, client, server, desktop and shared private `package.json` files and the `V1_RELEASE_CONTRACT.md` semantic version.
- [x] Keep `SOCKET_PROTOCOL_VERSION = 14` and snapshot schema `11`. No protocol or schema bump is part of the release-preparation task.
- [x] Keep `apps/desktop/update-policy.json` at `minimumSupportedVersion = 1.9.0`, `reviewedForSocketProtocol = 14` unless a separately evidenced compatibility failure forces an approved policy change.
- [ ] Validate `pnpm install --frozen-lockfile`, metadata alignment, `pnpm validate:v1-contract`, `pnpm test:v1-contract`, release notes and matching planned artifact names.
- [ ] Review impact of all changes since tag `v1.9.1`; confirm there are no compatibility-breaking runtime changes hidden behind the unchanged protocol number.
- [ ] Execute real mixed-version Host/Guest checks (v1.9.1 with v1.10.0) or explicitly accept them as NOT RUN; unchanged protocol number alone does not prove compatibility.
- [ ] Verify Windows update from an installed v1.9.1 to a prepublication v1.10.0 test feed without modifying the production latest feed, or record as NOT RUN/BLOCKED. Do not create a public tag as a shortcut.

## Required quality and platform gates

- [ ] PR CI and Docs PASS on the **final versioned head**.
- [ ] Release quality: typecheck, lint, full tests, production client build, shared/V1 contract and asset validators PASS.
- [ ] **Windows x64**: Electron desktop build and installer, bundled Host proof, renderer/audio/card/landmark proofs, size budget, release artifact manifest, SHA-256 and source identity PASS.
- [ ] **macOS x64**: build/DMG verification, packaged runtime/Host/assets and manifest SHA-256 PASS.
- [ ] **macOS arm64**: build/DMG verification, packaged runtime/Host/assets and manifest SHA-256 PASS.
- [ ] Confirm exactly the expected artifact filenames and Windows Squirrel `RELEASES` / `own_the_block-1.10.0-full.nupkg`.
- [ ] Signing status: this release path defaults to `unsigned-validation`; Windows signing and macOS notarization remain BLOCKED/NOT RUN unless valid credentials and checks prove otherwise.
- [ ] Actual final-installation gameplay smoke and version/UI/update path as feasible; mark manual checks OWNER-REPORTED only when the owner confirms them for the new artifact.

## Safe validation procedure — no intermediate RC release

The existing GitHub workflow is named `Release Candidate` for historical reasons. **Manual `workflow_dispatch` does NOT publish**: it builds Windows x64, macOS x64 and macOS arm64 artifacts and runs release gates. It is a non-publishing preflight, not a versioned RC or GitHub prerelease.

1. On the merged, versioned release-preparation commit, open GitHub **Actions → Release Candidate → Run workflow**.
2. Select the *exact approved validation ref* (ideally after merging the preparation PR to `main`, but **before** creating `v1.10.0` tag). Leave `socket_url` empty for LAN-first; choose `distribution_mode = unsigned-validation`.
3. Verify **Release quality gates**, **Windows x64**, **macOS x64**, **macOS arm64** all finish SUCCESS. Since dispatch is not a tag push, the **Publish GitHub Release** job must be SKIPPED.
4. Inspect job logs and download artifacts; compare `manifest.json` hashes and package names. Record run URL, run commit SHA, individual status, signing status and any manual gaps here.
5. If the workflow cannot be dispatched on the preparation branch or the exact ref, merge the reviewed preparation PR first, then dispatch from `main`. A merge of the version bump is **not** permission to publish.

## Outstanding known limitations

- True native suspended-renderer recovery ≤1 second: **BLOCKED**; minimized Electron renderer remained active in tested environment.
- High-refresh physical devices, other GPUs, macOS real-device use, independent-network Online and full installed upgrade path: **NOT RUN** unless new evidence is added.
- B7 cold first board frame and initial tier-switch costs remain open; B8 P99 pacing parity unproven.
- Previous v1.9.1 host Online startup sometimes took 40–90 seconds on one Windows machine; no proven root cause.
- The owner-reported prior packaged full-match PASS must not be rewritten as a clean v1.10.0 installer UAT PASS.

## Final approval checkpoint (MANDATORY)

- [ ] Versioned PR reviewed/merged; three-platform build and release-gate receipts recorded.
- [ ] Known limitations and unsigned distribution explicitly presented to the owner.
- [ ] **Explicit owner final approval to publish v1.10.0 Stable on GitHub Releases.**

**Do not push an annotated `v1.10.0` tag before the final approval.** The workflow's tag trigger immediately builds and then **publishes** the release after gates pass. Do not create a GitHub Release, promote a draft, alter the public update feed, or mark a stable release published before the explicit decision.

Once approval is granted, create the signed-in-Git (annotated) `v1.10.0` tag on the verified final `main` SHA and push the tag. Monitor `release-candidate.yml` tag-run quality, three platform jobs and publish; verify published asset SHA-256, `update-manifest.json`, `RELEASES`, latest feed and URLs, and document the actual outcome. Stop if any gate fails.
