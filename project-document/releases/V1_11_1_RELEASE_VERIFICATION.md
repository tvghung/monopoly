# Own the Block v1.11.1 release verification

Status: PUBLISHED AND VERIFIED — stable v1.11.1 is public, all seven assets and latest update feeds independently verified. The Owner explicitly reports OB-6 test OK and requests production in the current chat. This is OWNER-REPORTED acceptance of OB-6, not certification of every Power-up/native platform scenario.

## Scope and compatibility

- Previous production: [v1.11.0](https://github.com/tvghung/monopoly/releases/tag/v1.11.0), published with seven assets.
- OB-6: [PR #30](https://github.com/tvghung/monopoly/pull/30), main merge `627fe67482cc5dbabec460676cc941ff1ddb037a`. [Implementation evidence](../powerups/OB6_UI_VALIDATION.md).
- Only aligned application-version metadata, current release documentation and v1.11.1 notes are added for publication. OB-7/8/9 are excluded.
- Socket protocol 16, RAM snapshot 14 and update floor 1.11.0 remain unchanged. Root/client/server/desktop/shared packages align at 1.11.1.
- Existing annotated-tag pipeline builds Windows x64, macOS x64 and macOS arm64, verifies packaged runtime/Host/assets/budget and publishes only after success. Existing unsigned/not-notarized distribution is retained.

## Verification

OB-6 local checks, CI and browser/packaged acceptance passed before its merge; Owner subsequently reports test OK. Version preparation passed canonical release validation (1.11.1 / protocol 16), contract tests, documentation validation, versioned renderer build/asset checks and all 629 desktop tests across 41 files. CI on the preparation PR and the tag pipeline remain separate gates. The tagged publication and public checks below establish the production result.

## Production verification

- Preparation [PR #31](https://github.com/tvghung/monopoly/pull/31) merged at `af47c15459abf4f30d33c685f4874369e56180d1`.
- Annotated tag `v1.11.1` has object `52a0e6ae7d33f43de41f6036730aae5942e67373` and targets that main commit.
- Preparation [CI](https://github.com/tvghung/monopoly/actions/runs/41382165094) and [Docs](https://github.com/tvghung/monopoly/actions/runs/41382165204) passed.
- [Tagged release pipeline](https://github.com/tvghung/monopoly/actions/runs/41382922312) completed successfully: release quality, Windows x64, macOS x64, macOS arm64 and Publish GitHub Release.
- [Stable public v1.11.1](https://github.com/tvghung/monopoly/releases/tag/v1.11.1) was published at `2026-11-02T03:42:40Z`; it is neither draft nor prerelease.
- All seven public assets were streamed independently. Each size and SHA-256 matches GitHub asset metadata; the five entries in SHA256SUMS and every installer/Squirrel entry in the update manifest match the downloaded bytes. Windows RELEASES also matches the full package name, size and SHA-1.
- The latest manifest serves 1.11.1 / minimum 1.11.0, byte-identical to the tagged manifest. The latest Windows RELEASES feed is byte-identical to the tagged feed, preserving its UTF-8 BOM.
- [Complete sizes, hashes, manifest and job evidence](./v1.11.1-public-assets.json). Publication is verified; OB-6 may be completed on Jira.

## Preserved limits

OB-6 sign-off does not establish physical high-refresh/GPU results, independent devices/networks, real macOS device use or full-match Power-up balance. No protocol or data migration exists; restarting the host ends its RAM-only match.

## Public asset inventory

| Asset | Bytes |
| --- | ---: |
| `OwnTheBlock-1.11.1-macos-arm64.dmg` | 113313095 |
| `OwnTheBlock-1.11.1-macos-x64.dmg` | 122554515 |
| `OwnTheBlock-1.11.1-win32-x64-Setup.exe` | 156135424 |
| `own_the_block-1.11.1-full.nupkg` | 155494322 |
| `RELEASES` | 85 |
| `SHA256SUMS.txt` | 478 |
| `update-manifest.json` | 1096 |

Independent public-file/feed verification does not establish an installed v1.11.0 → v1.11.1 upgrade or real macOS-device UAT. Those preserved limits do not replace the Owner-reported OB-6 acceptance.
