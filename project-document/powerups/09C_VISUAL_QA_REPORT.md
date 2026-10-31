# Phase 09C — Artwork visual QA and development acceptance

CURRENT DEVELOPMENT — 2026-10-27 (Asia/Bangkok). **STATUS: COMPLETE for the requested artwork production, integration and automated browser/Windows Electron acceptance.** Physical-device/product UAT and publication remain separate; no release is authorized or claimed.

## Delivered and visually reviewed

- 30/30 original, differentiated Power-up front illustrations, with 30 SVG sources and 30 corresponding lossless PNGs.
- Exactly three category-specific backs, each in SVG/PNG. Four live rarity frame treatments.
- All 30 IDs use explicit client mappings. Names, full effect text, rarity/category, percentages, currency caps, duration, targeting and activation contracts remain unchanged.
- Shared artwork appears in START reveal, inventory/replacement, full details, activation, Reaction, consent, status information and queued acquisition/activation/consumption feedback.
- Original editable geometry, deterministic exports, export hashes, build/packaged validators, fallback behavior and regression tests are included.

All 28 classic Chance/Chest SVG sources were inspected for geometry, proportions, color/outline conventions, viewBox and dependencies; source hashes are in the external reference audit. Classic property-repairs and Chest insurance were visually compared beside the new art. The approved **Classic Monopoly × Modern Minimalist × Stylized Power-up** direction uses warm paper, bold ink, limited flat colors, recognizable town houses, board tokens and expressive object stories. Power-up frames are more expressive while keeping the same board-game family.

## Genuine visual review and corrections

| Finding | Correction and evidence |
| --- | --- |
| Initial Legendary Defense sample repeated the property-shield composition too closely | D08 was redrawn as a golden canopy with tenant, rent bill and bank-payment coins; D04 retains its two-charge property shield. Initial sample remains in external `representatives-before.png`; final Defense contact sheet was opened and inspected |
| D02's reaching hand touched/crossed the canvas edge | Repositioned and reduced the hand, regenerated source/PNG, then opened the corrected full Defense sheet |
| Category backs initially differed mostly by motif/accent | Added distinct crimson, navy and violet fields; inspected all three backs together |
| A03 contact label was overwritten by a regex match from a compatibility list | Restricted QA-name extraction to the immutable registry identity table; all 30 labels now match the registry |
| Initial browser assertion exposed SVG intrinsic-size ambiguity | Added explicit 640×400 dimensions alongside the viewBox, regenerated all pairs and locked the dimensions into XML validation |
| Actual 900×500 full-detail screenshot cropped the illustration despite initial bounds checks passing | Positioned the image within its bounded art container; added image-to-container bounds assertions and compact scrolled captures. Opened corrected browser and native detail screenshots |
| Initial native reconnect automation assumed a web-style reload | Followed the packaged app's existing launcher Join flow using the same invitation/session. Hidden, revealed and consent restoration now pass with the same authoritative choices; desktop startup/security code was unchanged |

Initial failing attempts and pre-correction captures are retained externally. No failed assertion was suppressed. The live harness was strengthened after screenshot inspection and rerun against the rebuilt production renderer and packaged app.

## Actual visual acceptance

`scripts/powerUpStabilizationAcceptance.check.mjs --artwork` passes **13 grouped checks** in production Chromium. The same harness with `--native` passes **13 grouped checks** with the real packaged, sandboxed `app://own-the-block` Electron renderer acting as the player. Each mode records 46 scenario screenshots, plus four individual production-frame captures and a composed rarity comparison. Both have zero page errors and reject fallback usage for official images.

The extension `scripts/art/powerUpArtworkAcceptance.mjs` verifies:

1. Three hidden category backs with no rarity, name, effect, individual artwork attributes or front-image requests; hidden reconnect.
2. Real server-authorized three-card reveal, exact selected artwork, locked choice and reconnect without flip replay.
3. All 30 IDs in real inventory, four actual production frame treatments and full-card details.
4. Actual reduced-motion behavior on a Legendary card.
5. Existing D04/two-charge, A04 interception, A05/D03, U04 Legendary recipe, full-hand U06 consent/reload, Legendary feedback, target peek and keyboard scenarios.
6. The acting renderer also **receives and resolves** a Reaction and a reconnect-restored full-hand consent, so native coverage includes both recipient and initiating roles.

Required **1440×900, 1280×720 and 900×500** captures and assertions pass for hidden reward, authorized reveal, details, Reaction and consent. The suite checks dialog bounds, document/modal horizontal overflow, images inside their containers, decoded image dimensions, Tab/Shift+Tab containment, Escape and opener restoration. Scrollable compact content and its controls are captured at the top and bottom rather than truncating approved text.

Sampled card text contrast, including the Legendary gradient stops, is **at least 4.85:1** in both modes. This is sampled evidence, not an every-pixel/device certification. No broken official images, frame distortion or information hidden by artwork remains in the reviewed captures. Intentional modal scrolling keeps long text and controls reachable.

Native runtime evidence: **Electron 43.4.0 / Chromium 150.0.7871.224**, packaged flag true, GPU compositing and WebGL enabled. Native screenshots show the real 3D board. Browser acceptance uses the supported legacy-board fallback. Both were visually inspected.

The independent original `scripts/powerUpAcceptance.check.mjs` also passes **10 scenarios**, including real dice START, offline reward recovery, explicit full-inventory replacement/decline, reconnect, A01/D05 reflection, U07 remote purchase and A02 expiry. Its final compact replacement capture was opened and inspected after the crop fix.

## Actual commands and results

Commands below use the repository's existing scripts. Because PowerShell fails before startup with the host CET error, the bundled **Node v24.22.1** invokes the same pnpm CLI or module entry point with its directory prepended to PATH. Exact executable, argv, cwd, exit code, duration and full stdout/stderr are retained in `powerup-phase09bc-evidence/*.json` and `*.log` under the repository parent.

| Gate / actual command | Final result |
| --- | --- |
| Client: `node node_modules/vitest/vitest.mjs run --environment jsdom --pool=threads --maxWorkers=1 --no-file-parallelism` (cwd apps/client) | PASS: 271 files, **2,724 tests**, no failed/skipped |
| Server: `node node_modules/vitest/vitest.mjs run` (cwd apps/server) | PASS: 45 files, **1,161 tests**, two pre-existing non-loopback fixture skips |
| Desktop: `node node_modules/vitest/vitest.mjs run src tests --pool=threads --maxWorkers=1 --no-file-parallelism` (cwd apps/desktop) | PASS: 41 files, **629 tests**, no failed/skipped |
| Shared package | No standalone test script; all-card server/client/schema regressions exercise shared contracts; shared typecheck PASS |
| Focused changed client suite | PASS: 30 tests across artwork, panel and queued-feedback suites; included in the full client total |
| Root `node --test` tooling run (ten explicit files; exact argv in root-tooling-tests.json) | PASS: **84 tests** across release contract, perf, registry, music, classic/landmark art, docs and new Power-up art validation |
| `node --test apps/client/scripts/validatePowerUpArtwork.check.mjs` after final dimension checks | PASS: four tests; corrupt/missing/stale/orphan/unequal assets and unsafe XML rejected |
| `pnpm typecheck` | PASS: shared, server, client, desktop |
| `pnpm lint` | PASS, including final recipient-role acceptance extension |
| `node scripts/validateDocs.mjs` | PASS: 224 Markdown files, including all three reports and preserved audits |
| `node scripts/validateV1Contract.mjs` | PASS: product 1.10.0, protocol 16; unchanged |
| `pnpm build`, then final `pnpm desktop:make` renderer preparation | PASS: production client, 26 audio, 28 classic SVGs, 22 landmarks, 33 Power-up SVG/PNG pairs; Electron main/preload/server compilation |
| `node scripts/art/exportPowerUpArtwork.mjs --verify` | PASS: **33/33** source-composition equality and SVG/PNG pixel comparisons |
| `node scripts/art/powerUpContactSheets.mjs` | PASS: Attack, Defense, Utility, backs and classic-reference contact sheets generated and opened |
| `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpStabilizationAcceptance.check.mjs --artwork` | PASS: **13 Chromium groups** |
| Same command plus `--native` | PASS: **13 native Electron groups** |
| Same loader with `scripts/powerUpAcceptance.check.mjs` | PASS: **10 original browser scenarios**, repeated after crop correction |
| `pnpm exec playwright test -c playwright.powerups.config.ts` | PASS: **two mobile flows** |
| `pnpm desktop:make` | PASS: Windows x64 application and Squirrel installer |
| `node apps/desktop/scripts/validatePackagedPowerUpArt.mjs` | PASS: all 33 SVG/PNG pairs byte-identical in packaged renderer |
| `node apps/desktop/scripts/validatePackagedCardArt.mjs` | PASS: all 28 classic art files preserved in package |
| `node apps/desktop/scripts/checkPackagedBudget.mjs` | PASS: unpacked application **367.5 MiB**, installer **148.9 MiB** |
| `pnpm desktop:proof:host` and `pnpm proof:packaged` | Both PASS: real-interface HTTP/LAN, four clients, stable host, reconnect/newest connection, process exit clears room/token |
| `git diff --cached --check`, scoped staging review and preserved-path SHA-256 checks | PASS; all **38/38** excluded paths remain byte-identical |
| `git fsck --connectivity-only` | PASS (exit 0); two pre-existing dangling staging blobs are informational |

Primary package total: **4,514 passed / 0 failed / two pre-existing skips**. Tooling: **84 passed / 0 failed / 0 skipped**. Browser/native/mobile and focused repeats are separate evidence and are not double-counted. No existing tests were removed, weakened or newly skipped. Expected injected transaction/save failures remain visible in server logs and pass rollback assertions.

The complete server suite includes all 30 concrete socket effects, 80 Attack/Reaction eligibility cases, numeric boundaries, replay/save rollback, privacy/reconnect and eight seeded full matches (3,091 commands). No effect implementation was modified. Existing Vite large-chunk, Node shell-argument and jsdom/Three test advisories remain; they are not hidden or attributed to new gameplay changes.

## Evidence paths

All paths below are local test artifacts, separate from production assets:

- `test-results/powerup-09bc/contact-sheets/ATTACK.png`, `DEFENSE.png`, `UTILITY.png`, `BACKS.png`, `REFERENCES.png`.
- `test-results/powerup-09bc/browser/evidence.json` and `native/evidence.json`: actual checks, screenshot inventory, errors, contrast and native runtime.
- In each mode: `09-hidden-reward-*.png`, `10-authorized-reveal-*.png`, ten `11-inventory-*.png` captures, `12-full-card-details-*.png`, `13-rarity-comparison.png`, `14-reduced-motion.png`, `15-reaction-*.png`, `16-consent-*.png`, `17-acting-player-reaction-*.png`, `18-acting-player-consent-reconnect-*.png`, and compact `-scrolled.png` counterparts.
- `test-results/powerup-acceptance/`: original START/full-inventory/activation/reconnect acceptance evidence.
- Repository-parent `powerup-phase09bc-evidence/`: command logs/argv, source audit, initial failed attempts, before-crop screenshots, final evidence copies, package SHA-256 inventory, staged patch reviews, Git integrity and preservation records.

Screenshots inspected include every front/back via contact sheets; classic references; actual four-frame comparisons; browser/native hidden/revealed rewards; 900×500 corrected details and Legendary activation; Reaction and consent in both roles; full-hand replacement and scrolled controls. Final artifact hashes are retained externally so later regeneration can be distinguished from this reviewed run.

## Git and preservation

Branch: `codex/v1.10.0-refactor`.

| Local commit | Scope |
| --- | --- |
| `5d62394af240e787fefc17a22213d739d1a22d31` | Original 30 fronts, three backs, SVG/PNG exports, drawing/export/contact tooling, export manifest and scoped LF/binary attributes |
| `b567d67404dc341078f8fe2eb1bd8034fd7c3b5e` | Client integration, four frames, fallback, details, authorized acquisition feedback, validators, tests/build gates and canonical documentation |
| Final test/report commit containing this report | Native recipient-role acceptance extension and the three final reports. Exact final HEAD is recorded in external completion.json and the final chat response; resolve with `git log -1 --format=%H -- project-document/powerups/09C_VISUAL_QA_REPORT.md` |

Entry HEAD `b9c6142eb75d5777acc2a5417322f021d23cd9bd` and the Phase 09A consolidated baseline remain ancestors. Every staged path was reviewed before committing. The three ambiguous paths and 35 audit files remain uncommitted with original bytes; no clean-worktree claim is made. The additional verified recovery checkpoint remains outside the repository. Server/shared diffs are empty and the approved VI/EN card-effect text is unchanged. Protocol 16, snapshot 14 and product version 1.10.0 are unchanged.

## Remaining limitations and publication boundary

- **NOT RUN:** physical monitor/GPU/high-refresh comparison, human full-match/listening UAT and macOS device validation.
- Automated native screenshots and interactions establish the tested Windows package; they do not certify other GPUs, operating systems or signed production update/install artifacts.
- The unsigned local Windows application/installer is a development build. No final PR, remote publication or release acceptance is implied.

**Confirmed: no PR, push, merge, deployment, tag, or release.**

Implementation: [09B report](./09B_ARTWORK_IMPLEMENTATION_REPORT.md). All 30 ID mappings and exact footprint: [asset inventory](./09B_CARD_ART_ASSET_INVENTORY.md).
