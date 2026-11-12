# Own the Block v1.11.2 release verification

Status: RELEASE PREPARATION — the Owner explicitly asks in the current chat to push, merge into main and release the next version (OWNER-REPORTED authorization). Publication is not verified until the tag pipeline and public asset checks below are recorded.

## Scope and compatibility

- Previous production: [v1.11.1](https://github.com/tvghung/monopoly/releases/tag/v1.11.1), protocol 16 / snapshot 14 / minimum 1.11.0.
- Included since v1.11.1: PR #33 (OB-7/OB-9), #34 (OB-8), #35 (OB-11), #36 (OB-12), #37 (OB-13), #38 (OB-14), #39 (OB-15) and [PR #40](https://github.com/tvghung/monopoly/pull/40), which covers mascot artwork, the die-cut border fix, tap animations and the OWN THE BLOCK-only title.
- Socket protocol 18, RAM snapshot 16 and update floor 1.11.2 were set during OB-8/OB-12 development and are unchanged by this preparation. Root/client/server/desktop/shared packages are already aligned at 1.11.2. v1.11.1 clients must update.
- The existing annotated-tag pipeline builds Windows x64, macOS x64 and macOS arm64, verifies the packaged runtime, Host, assets and budget, and publishes only after every step succeeds. Distribution stays unsigned and not notarized.

## Verification

PR #40 local checks passed: typecheck, lint, full tests (client 2799, server 1188, desktop 623 + 6 skipped), build with artwork/audio validators, and documentation validation. Browser checks covered board border continuity, artwork, the landing title and picker transition end states. GitHub Actions reported **no check runs** for PR #40 (commit `d5c4fc7`); the pushing account `hungtran1411-it` has push but not admin rights and cannot read the Actions configuration. With that limitation disclosed, the Owner chose to merge on the local results and push the tag anyway. PR #40 merged at `31788c875822f8b824a4daa77328a60cb0dc245c` without CI. This preparation passed `validate:v1-contract` (1.11.2 / protocol 18), `test:v1-contract` (34/34), `validate:docs` and the release metadata check locally. Publication depends on the tag pipeline actually running and passing; if it does not run, no release is published.

## Production verification

Pending: preparation PR merge commit, annotated tag object/target, CI and tag pipeline runs, public release state and asset checks.

## Preserved limits

- Manual motion checks were not watched at real frame rate: the browser pane was throttled.
- Physical GPU performance, independent devices and networks, real macOS use, an installed v1.11.1 → v1.11.2 upgrade and full-match Power-up balance are NOT RUN.
- No data migration exists; restarting the host ends its RAM-only match.
