# Own the Block v1.11.1 release verification

Status: PREPARED — publication not yet verified. The Owner explicitly reports OB-6 test OK and requests production in the current chat. This is OWNER-REPORTED acceptance of OB-6, not certification of every Power-up/native platform scenario.

## Scope and compatibility

- Previous production: [v1.11.0](https://github.com/tvghung/monopoly/releases/tag/v1.11.0), published with seven assets.
- OB-6: [PR #30](https://github.com/tvghung/monopoly/pull/30), main merge `627fe67482cc5dbabec460676cc941ff1ddb037a`. [Implementation evidence](../powerups/OB6_UI_VALIDATION.md).
- Only aligned application-version metadata, current release documentation and v1.11.1 notes are added for publication. OB-7/8/9 are excluded.
- Socket protocol 16, RAM snapshot 14 and update floor 1.11.0 remain unchanged. Root/client/server/desktop/shared packages align at 1.11.1.
- Existing annotated-tag pipeline builds Windows x64, macOS x64 and macOS arm64, verifies packaged runtime/Host/assets/budget and publishes only after success. Existing unsigned/not-notarized distribution is retained.

## Verification

OB-6 local checks, CI and browser/packaged acceptance passed before its merge; Owner subsequently reports test OK. Version preparation passed canonical release validation (1.11.1 / protocol 16), contract tests, documentation validation, versioned renderer build/asset checks and all 629 desktop tests across 41 files. CI on the preparation PR and the tag pipeline remain separate gates. No publication is claimed by this preparation document.

## Production verification to record

Record merged preparation SHA, annotated tag target, release workflow URL/conclusion, seven public assets, SHA-256/manifest/Windows RELEASES validation and the latest update feed. Mark Jira Done only after publication is verified.

## Preserved limits

OB-6 sign-off does not establish physical high-refresh/GPU results, independent devices/networks, real macOS device use or full-match Power-up balance. No protocol or data migration exists; restarting the host ends its RAM-only match.
