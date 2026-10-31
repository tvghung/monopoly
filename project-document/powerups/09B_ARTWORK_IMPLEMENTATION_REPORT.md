# Phase 09B — Original Power-up artwork implementation

CURRENT DEVELOPMENT — 2026-10-27 (Asia/Bangkok). Verification and final local commit references are recorded in [09C visual QA](./09C_VISUAL_QA_REPORT.md). This is local development work, not a release.

## Baseline and recovery

Verified entry branch: `codex/v1.10.0-refactor`. Entry HEAD: `b9c6142eb75d5777acc2a5417322f021d23cd9bd`, following the two Phase 09A consolidated commits. The index was unstaged. Three ambiguous tracked paths and 35 audit paths were preserved. An additional checkpoint outside the repository, `powerup-pre-phase09bc-checkpoint-2026-10-27-b9c6142` under the repository parent, holds all 38 exact file copies, SHA-256 inventory, entry Git index, status and binary diff; every copied hash was verified.

PowerShell still fails before startup with the host Windows CET error. Work and logged commands use bundled Node v24.22.1 child processes with hidden windows, following the successful Phase 09A approach. No workaround changed Windows security settings.

## References and visual direction

Inspected the existing 28 Chance/Chest SVG sources, their 640×400 viewBox, validators, URL mapping, card renderer and build/packaging path. Visually reviewed the Chance property-repairs illustration and Chest insurance illustration beside new Power-up contact sheets. Existing classic art is locally authored vector geometry: broad rounded outlines, few warm colors, simple houses/objects, no baked UI copy or external imagery. These original files were preserved.

Implemented the approved **Classic Monopoly × Modern Minimalist × Stylized Power-up** direction. The new family uses warm paper, dark blue ink, coral Attack, blue Defense, violet/teal Utility, geometric town houses, board tokens, expressive hands, coins, deeds and purposeful movement. Compositions use stronger focal objects and layered story elements while preserving clear silhouettes and negative space. Flat highlights and limited ornament replace fantasy painting or glossy advertising effects. Original compositions were authored for this project; no third-party artwork or stock illustration library was copied.

## Actual production method

- `scripts/art/powerUpIllustrations.mjs`: editable geometric drawing primitives plus **30 separately authored scene compositions** and three category-back compositions. Shared houses, cards, coins, hands and tokens establish visual continuity; per-card object arrangement, scale, action and story are distinct.
- `scripts/art/exportPowerUpArtwork.mjs`: outputs standalone SVG and 640×400 lossless PNG using the project's Playwright/Chromium canvas. `--verify` regenerates the composition in memory and compares exported PNG pixels exactly.
- `scripts/art/powerUpExportManifest.json`: exporter version, dimensions, byte sizes and SHA-256 of all 33 source/export pairs.
- `scripts/art/powerUpContactSheets.mjs`: reproducible category, back and classic-reference sheets in test artifacts.
- Production assets: `apps/client/public/art/powerups/fronts/` and `apps/client/public/art/powerups/backs/`. UI text and frames are separate.

Scoped `.gitattributes` rules retain LF SVG bytes across Windows checkouts, so export hashes remain stable. All SVGs have explicit intrinsic dimensions and stable viewBox, valid XML, only geometric SVG elements and local colors. They contain no scripts, external URLs/fonts, embedded raster images, unsafe attributes, broken references or baked gameplay text. PNGs are decoded and CRC-checked by validation. Sources and PNGs together add approximately 1.41 MiB before packaging; final exact bytes are in the asset inventory.

## Integration and frame system

`apps/client/src/game/ui/powerUps/powerUpArtManifest.ts` explicitly maps each official ID and each category back. It is client-owned and separate from the immutable server registry. Rarity treatments are also client-only: Common balanced; Rare highlighted rails; Epic inset ornament and controlled glow; Legendary double gold border, four corner details and distinct discovery feedback. Rarity labels and symbols supplement frame color. Hidden backs have no rarity treatment.

Integration surfaces and modified presentation components:
- `PowerUpArtwork.tsx`: reusable decorative SVG renderer, same-ID PNG fallback, then coherent category motif.
- `PowerUpCard.tsx`: shared category header, artwork, unchanged authoritative name/full localized effect, activation, selection and rarity frame.
- `PowerUps.css`: bounded 8:5 art, responsive compact heights, full descriptions, focus/selected/disabled states, distinct frames and reduced-motion support.
- `PowerUpPanel.tsx`: START/replacement and inventory inherit art; adds read-only full-card details and matching authorized status thumbnails.
- `PowerUpRuntimePanels.tsx`: existing activation, Reaction and consent surfaces inherit artwork through their existing shared card component; no effect logic was changed.
- `PowerUpFeedback.tsx` and client presentation events: matching thumbnails and newly authorized inventory acquisition/Legendary discovery use the existing PresentationController/AnimationQueue. Removal remains neutral consumption; existing ACK-only activation/block/reflect semantics remain intact.
- `apps/client/src/i18n/catalog.ts`: adds only VI/EN detail and acquisition labels; approved effect descriptions and card names remain unchanged.

Reward flips are enabled only following local choice and server-provided reveal. Reconnect hydration does not replay the live flip. State and decisions never wait for image loading or animation. Existing queue cancellation, reset epochs, hidden-page handling and effective reduced-motion controls remain active.

## Secrecy and immutable gameplay

Before authorized reveal, only three category-back images are mounted/requested. No individual artwork, rarity, names, effects, identity attributes or hidden front elements are introduced. Decorative images have empty alt text; adjacent UI text supplies accessible meaning after authorization. Opponent inventory stays category/count only; consent displays only the viewer's authorized inventory. Existing server projections, strict shared contracts, IDs, rarity distributions, effect values, currency caps, timing, targeting, protocol and snapshot schema are unchanged.

Fallbacks keep controls usable but do not satisfy official acceptance: asset validation and live acceptance explicitly reject missing assets, stale exports, broken images and fallback usage for official cards.

## Validation and evidence

See [09C visual QA](./09C_VISUAL_QA_REPORT.md) for exact final commands/results, iterations, browser/Electron captures, remaining physical-device limits and commit IDs. All 30 mappings and concepts: [asset inventory](./09B_CARD_ART_ASSET_INVENTORY.md). Canonical behavior and verification checklists were updated in the same change.

No PR, push, merge, deployment, tag or release is part of this task.

## Verified local commit references

Artwork: 5d62394af240e787fefc17a22213d739d1a22d31. Integration and validation: b567d67404dc341078f8fe2eb1bd8034fd7c3b5e. The final test/report commit contains these reports; its exact HEAD is recorded in external completion.json and the final chat response. Both implementation commits are local descendants of the preserved Phase 09A baseline.
