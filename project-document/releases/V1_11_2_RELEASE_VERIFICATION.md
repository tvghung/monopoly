# Own the Block v1.11.2 release verification

Status: PUBLISHED AND VERIFIED — stable v1.11.2 is public, and all seven assets and the latest update feeds were independently verified. The Owner explicitly asked in the current chat to push, merge into main and release the next version (OWNER-REPORTED authorization). This is not manual UAT PASS for the items under "Preserved limits".

## Scope and compatibility

- Previous production: [v1.11.1](https://github.com/tvghung/monopoly/releases/tag/v1.11.1), protocol 16 / snapshot 14 / minimum 1.11.0.
- Included since v1.11.1: PR #33 (OB-7/OB-9), #34 (OB-8), #35 (OB-11), #36 (OB-12), #37 (OB-13), #38 (OB-14), #39 (OB-15) and [PR #40](https://github.com/tvghung/monopoly/pull/40), which covers mascot artwork, the die-cut border fix, tap animations and the OWN THE BLOCK-only title.
- Socket protocol 18, RAM snapshot 16 and update floor 1.11.2 were set during OB-8/OB-12 development and are unchanged by this preparation. Root/client/server/desktop/shared packages are already aligned at 1.11.2. v1.11.1 clients must update.
- The existing annotated-tag pipeline builds Windows x64, macOS x64 and macOS arm64, verifies the packaged runtime, Host, assets and budget, and publishes only after every step succeeds. Distribution stays unsigned and not notarized.

## Verification

PR #40 local checks passed: typecheck, lint, full tests (client 2799, server 1188, desktop 623 + 6 skipped), build with artwork/audio validators, and documentation validation. Browser checks covered board border continuity, artwork, the landing title and picker transition end states. GitHub Actions reported **no check runs** for PR #40 (commit `d5c4fc7`); the pushing account `hungtran1411-it` has push but not admin rights and cannot read the Actions configuration. With that limitation disclosed, the Owner chose to merge on the local results and push the tag anyway. PR #40 merged at `31788c875822f8b824a4daa77328a60cb0dc245c` without CI. This preparation passed `validate:v1-contract` (1.11.2 / protocol 18), `test:v1-contract` (34/34), `validate:docs` and the release metadata check locally. Publication depends on the tag pipeline actually running and passing; if it does not run, no release is published.

## Production verification

- Preparation [PR #41](https://github.com/tvghung/monopoly/pull/41) merged at `0468ea345c596549852829bdf3d8dfe9dd5812de`; like PR #40 it had no CI runs, because Actions were not triggering for the repository.
- The first push of annotated tag `v1.11.2` started no workflow. After the Owner re-enabled Actions, the tag was deleted and pushed again unchanged. Tag object `dbe3d28d04a3815f4512f7ab2bac43edb3f92733` targets that main commit.
- [Tagged release pipeline](https://github.com/tvghung/monopoly/actions/runs/43171705788) completed successfully: release quality gates, Windows x64, macOS x64, macOS arm64 and Publish GitHub Release.
- [Stable public v1.11.2](https://github.com/tvghung/monopoly/releases/tag/v1.11.2) was published at `2026-11-12T07:09:06Z`; it is neither draft nor prerelease.
- All seven public assets were downloaded independently:
  - Each SHA-256 matches its GitHub asset digest.
  - The five entries in SHA256SUMS and every installer/Squirrel entry in the update manifest match the downloaded bytes.
  - Windows RELEASES matches the full package name, size and SHA-1.
- The latest manifest serves 1.11.2 / minimum 1.11.2 and is byte-identical to the tagged manifest. The latest Windows RELEASES feed is byte-identical to the tagged feed.
- [Complete sizes, hashes, manifest and job evidence](./v1.11.2-public-assets.json).

## Public asset inventory

| Asset | Bytes |
| --- | ---: |
| `OwnTheBlock-1.11.2-macos-arm64.dmg` | 113303487 |
| `OwnTheBlock-1.11.2-macos-x64.dmg` | 122541935 |
| `OwnTheBlock-1.11.2-win32-x64-Setup.exe` | 156142592 |
| `own_the_block-1.11.2-full.nupkg` | 155501963 |
| `RELEASES` | 85 |
| `SHA256SUMS.txt` | 478 |
| `update-manifest.json` | 1096 |

## Preserved limits

- Manual motion checks were not watched at real frame rate: the browser pane was throttled.
- Physical GPU performance, independent devices and networks, real macOS use, an installed v1.11.1 → v1.11.2 upgrade and full-match Power-up balance are NOT RUN.
- No data migration exists; restarting the host ends its RAM-only match.
