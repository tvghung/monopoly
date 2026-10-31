# Phase 09C.1 — Artwork detail refinement and visual defect audit

CURRENT DEVELOPMENT — 2026-10-27 (Asia/Bangkok). **STATUS: COMPLETE** — visual inspection and all required local verification gates passed.

## Scope and baseline

Verified entry: branch `codex/v1.10.0-refactor`, HEAD `2bef82ca9fc62d28a06a0144583e1e86e0c11228`. Read the Phase 09B implementation and asset inventory, Phase 09C visual QA, canonical client/artwork guidance, existing illustration module, exporter and validators. All 30 fronts (A01–A10, D01–D10, U01–U10) were visually inspected at 640×400, with enlarged hand/coin crops and compact comparisons. The two reference screenshots mentioned in the brief were not attached; the attachment contained only the brief. Findings were traced independently to canonical SVG geometry and actual renders.

Fifteen fronts were refined; fifteen fronts and all three category backs remain byte-identical. All 30 mappings, four rarity treatments, titles, categories, descriptions, effects, typography and UI behavior are preserved. No client runtime component, server gameplay file, shared contract or registry was edited. Existing palette, outline language, composition and category identity are preserved. The existing illustration geometry module was refined; exporter and validators are unchanged. SVG remains canonical and PNGs were regenerated with the existing exporter.

## Issue inventory and corrections

P2 denotes a clear anatomy/shape-readability defect; P3 denotes a minor contour/overlap/alignment defect. No P1 issue was found.

- Hands: **A01, A06, D02, D07** — all four inspected and corrected. The shared pincer extended the thumb past the finger group and lacked a clear opposition crease. Compact thumb proportions, palm transitions and finger creases improve the original pinching action. D07 receives a cupped supporting palm in its original position and action.
- Coin/currency illustrations inspected: **A01, A02, A03, A07, A09, A10, D01, D07, D08, U03, U07**. Six stacks in **A02, A03, A07, A10, D08, U03** had an unstroked top ellipse painting over the cylinder contour. Closed outlined cylinder/top paths repair the source, retaining the intentional foreground standing-coin overlap and symbols. Other currency contours were correct. Gold decoration, D04 shield charges, D09 lock rivet, U05 compass and U10 markers were also inspected; decorative circular marks were not misclassified as currency.
- Six pawn bases in **A10, D08, U02, U06, U07, U08** had an unstroked cream fill erasing the lower outline. A closed elliptical base restores the existing contour weight and fill.
- **D02**: moved the blue motion tick away from the fingers.
- **U10**: placed the same three gold markers inside each rotated card's local transform so they follow the frame.

No clip paths, masks, filters or external image resources were responsible for the findings. ViewBox and dimensions stay 640×400; rounded joins/caps and existing ink weights are retained. Intentional object occlusion is preserved. No known broken contour remains after the visual review.

## All-card audit

| Card ID | Defect Type | Original Issue | Fix Applied | Visual Verification | Status |
| --- | --- | --- | --- | --- | --- |
| A01 | P2 hand anatomy | Long thumb and ambiguous pinch silhouette | Compact thumb, finger/palm transition and creases | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| A02 | P2 coin contour | Unstroked top face erased stack rim | Closed outlined cylinder and top face | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| A03 | P2 coin contour | Unstroked top face erased stack rim | Closed outlined cylinder and top face | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| A04 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| A05 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| A06 | P2 hand anatomy | Long thumb and ambiguous pinch silhouette | Compact thumb, finger/palm transition and creases | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| A07 | P2 coin contour | Unstroked top face erased stack rim | Closed outlined cylinder and top face | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| A08 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| A09 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| A10 | P2 coin + P3 token contour | Open coin rim; base fill erased pawn outline | Closed coin paths and complete outlined token base | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| D01 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| D02 | P2 hand + P3 overlap | Long thumb; motion tick crossed fingers | Compact pinch and motion tick outside hand silhouette | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| D03 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| D04 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| D05 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| D06 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| D07 | P2 hand anatomy | Pincer grip did not clearly support the bag | Short opposable thumb and cupped supporting palm | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| D08 | P2 coin + P3 token contour | Open coin rim; base fill erased pawn outline | Closed coin paths and complete outlined token base | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| D09 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| D10 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| U01 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| U02 | P3 token contour | Base fill erased lower pawn outline | Closed outlined elliptical base | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| U03 | P2 coin contour | Unstroked top face erased stack rim | Closed outlined cylinder and top face | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| U04 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| U05 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| U06 | P3 token contour | Base fill erased lower pawn outline | Closed outlined elliptical base | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| U07 | P3 token contour | Base fill erased lower pawn outline | Closed outlined elliptical base | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| U08 | P3 token contour | Base fill erased lower pawn outline | Closed outlined elliptical base | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |
| U09 | None found | Contours, overlap, proportions and compact readability inspected | No change | Original full-art audit; updated category sheet; real inventory mapping | Inspected — correct |
| U10 | P3 marker alignment | Marker rows straddled rotated card edges | Same markers positioned inside each local card transform | Full/crop/160×100 comparison; live inventory and detail | Modified; verified |

## Modified source and asset paths

The shared drawing definitions are in `scripts/art/powerUpIllustrations.mjs`; only hand, coin-stack, token-base geometry and D02/U10 placement were changed. `scripts/art/powerUpExportManifest.json` records the regenerated hashes. Existing export and validation scripts are unchanged.

| ID | Canonical SVG | Regenerated PNG |
| --- | --- | --- |
| A01 | `apps/client/public/art/powerups/fronts/A01.svg` | `apps/client/public/art/powerups/fronts/A01.png` |
| A02 | `apps/client/public/art/powerups/fronts/A02.svg` | `apps/client/public/art/powerups/fronts/A02.png` |
| A03 | `apps/client/public/art/powerups/fronts/A03.svg` | `apps/client/public/art/powerups/fronts/A03.png` |
| A06 | `apps/client/public/art/powerups/fronts/A06.svg` | `apps/client/public/art/powerups/fronts/A06.png` |
| A07 | `apps/client/public/art/powerups/fronts/A07.svg` | `apps/client/public/art/powerups/fronts/A07.png` |
| A10 | `apps/client/public/art/powerups/fronts/A10.svg` | `apps/client/public/art/powerups/fronts/A10.png` |
| D02 | `apps/client/public/art/powerups/fronts/D02.svg` | `apps/client/public/art/powerups/fronts/D02.png` |
| D07 | `apps/client/public/art/powerups/fronts/D07.svg` | `apps/client/public/art/powerups/fronts/D07.png` |
| D08 | `apps/client/public/art/powerups/fronts/D08.svg` | `apps/client/public/art/powerups/fronts/D08.png` |
| U02 | `apps/client/public/art/powerups/fronts/U02.svg` | `apps/client/public/art/powerups/fronts/U02.png` |
| U03 | `apps/client/public/art/powerups/fronts/U03.svg` | `apps/client/public/art/powerups/fronts/U03.png` |
| U06 | `apps/client/public/art/powerups/fronts/U06.svg` | `apps/client/public/art/powerups/fronts/U06.png` |
| U07 | `apps/client/public/art/powerups/fronts/U07.svg` | `apps/client/public/art/powerups/fronts/U07.png` |
| U08 | `apps/client/public/art/powerups/fronts/U08.svg` | `apps/client/public/art/powerups/fronts/U08.png` |
| U10 | `apps/client/public/art/powerups/fronts/U10.svg` | `apps/client/public/art/powerups/fronts/U10.png` |

Thirty asset files changed. The other 36 asset files (15 fronts × 2 plus 3 backs × 2) match the entry hashes exactly. Export verification reproduced all 33 PNGs pixel-for-pixel from their SVGs, including alpha. Structural/mapping validation and build/package byte parity passed.

## Visual evidence and review

Local evidence root, outside Git: `C:/Users/hungtran/Documents/ChatGPT/Own the block (monopoly)/powerup-phase09c1-evidence`.
Repository-local generated review root: `test-results/powerup-09c1` (ignored, not committed).

- External `index.html` is a browsable review of all 15 comparisons; `final-qa/` preserves final screenshots, contact sheets and evidence manifests.
- `before/audit-01.png` through `before/audit-08.png`: original collection at normal artwork scale; enlarged original hand/coin crops are alongside them.
- `comparisons/{ID}-before-after.png` for every modified ID in the table: full 640×400 original/corrected artwork, enlarged vector detail and 160×100 preview. All 15 comparisons were opened and visually inspected, including all corrected hands, coin stacks, pawn bases and U10 markers.
- `contact-sheets/ATTACK.png`, `contact-sheets/DEFENSE.png`, `contact-sheets/UTILITY.png`: updated collection; all opened and inspected against untouched illustrations. Back/reference sheets are generated alongside them.
- `browser/evidence.json`, `native/evidence.json`: actual production UI acceptance results and screenshot lists. Corresponding screenshots cover 1440×900, 1280×720 and 900×500. Scrollable short-height dialogs include scrolled captures.
- `c1-refined-detail-{ID}-1440x900.png`: every modified card in real details; A01/A02/D02/D07/U10 details additionally captured at both smaller sizes.
- `c1-refined-inventory-{1..5}-{size}.png`: all 15 refined cards across five real three-card inventories, every required size.
- `c1-refined-reward-{size}.png`: server-created reward, authorized reveal of A01/D02/U03 and real claim.
- `c1-refined-activation-A01-{size}.png` and `c1-refined-reaction-D02-{size}.png`: real authenticated activation and recipient Reaction, including the preserved blocked cash-transfer outcome.

The reviewed browser and packaged Windows Electron UI shows clear pinching/supporting silhouettes, complete coin-stack rims, continuous pawn bases and aligned U10 markers. Compact details remain consistent with the unchanged artwork; there is no artwork fallback or horizontal modal overflow. All 30 cards still use their correct official assets; hidden reward backs disclose neither identity nor rarity, and reduced-motion/reconnect checks are retained.

The opt-in `scripts/art/powerUpRefinementAcceptance.mjs` adds three focused groups to `scripts/powerUpStabilizationAcceptance.check.mjs` via `--refinement`. It uses committed in-memory test fixtures and production components/authenticated decisions; it introduces no product debug endpoint. Existing acceptance assertions remain intact. New groups execute after the original 13 groups. Before the existing Legendary scenario, the harness reconnects the seeded owner through normal session hydration to discard queued feedback from prior inventory replacements. The existing visibility/status assertions remain; U04 now waits for the same two initialized recipe checkboxes instead of reading them synchronously. This follows the existing session-sync contract and changes no product behavior.

## Automated verification

Command output and exact arguments are recorded in the external evidence root as matching log/JSON files. Commands ran with the bundled Node/pnpm runtime through hidden child processes because the terminal launcher fails Windows CET startup on this host.

| Check | Result | Evidence |
| --- | --- | --- |
| Full `pnpm test` | PASS | 2,724 client / 271 files; 1,161 server / 45 files, 2 existing skips; 629 desktop / 41 files; 74 root tooling tests |
| `pnpm typecheck` | PASS | client, server, shared and desktop workspace checks |
| `pnpm lint` | PASS | full lint plus final targeted QA-harness lint; initial unused global annotation in new helper removed |
| `pnpm build` | PASS | production build and asset validators |
| `pnpm desktop:make` | PASS | Windows package and Squirrel/ZIP distributables built locally |
| `node apps/client/scripts/validatePowerUpArtwork.mjs` | PASS | all 33 SVG/PNG pairs and build copies |
| `node scripts/art/exportPowerUpArtwork.mjs --verify` | PASS | all 33 exact pixel comparisons |
| `node apps/desktop/scripts/validatePackagedPowerUpArt.mjs` | PASS | packaged renderer has all 33 byte-identical pairs |
| `node scripts/art/powerUpContactSheets.mjs` | PASS | updated sheets generated and visually reviewed |
| Browser acceptance `--refinement` | PASS | 16 groups, production Chromium owner/opponent |
| Packaged Electron acceptance `--refinement --native` | PASS | 16 groups; packaged Electron 43.4.0 app:// owner, Chromium opponent |
| `pnpm validate:docs` | PASS | 225 Markdown files |
| Git diff/integrity and preservation | PASS | diff --check; fsck exit 0; all 38 original dirty paths retain exact bytes |

Initial browser attempts are retained separately: one failed the transient Legendary feedback assertion after new fixture groups ran before the original scenarios; another hit the original immediate U04 checkbox-count assertion before UI initialization settled. Moving the new groups to the end produced a complete 16-group browser PASS; native then reproduced the stale-feedback backlog. Source inspection confirmed 650 ms per queued event and session-sync cancellation. The final harness hydrates the seeded Legendary fixture before checking actual activation feedback, and awaits recipe initialization without changing the expected count. Both final complete runs passed all 16 groups after these isolation fixes, with 114 screenshots each and zero page errors. No gameplay or renderer change was made to accommodate these failures. Final logs, rather than failed partial runs, determine acceptance. Build logs contain the existing chunk-size/Node deprecation warnings. Git fsck reports dangling objects without integrity errors; they were left untouched.

## Git safety and closeout

The 38 pre-existing dirty paths (three tracked files and 35 untracked audit files) were copied with hashes before editing. All retain identical bytes; none is included in this task's commit. Baseline source/assets and index/patch evidence are retained outside the repository. The final focused commit includes only the 30 corrected asset files, illustration source/export manifest, opt-in QA helper/harness and three documentation files. The containing commit is discoverable with `git log -1 -- project-document/powerups/09C1_ARTWORK_REFINEMENT_REPORT.md`; its hash is recorded in the final handoff and external closeout evidence.

No PR, push, merge, deployment, release, tag or history rewrite was performed. Existing consolidated commits remain ancestors.

## Remaining limitations

No known visual defect remains from this audit. The two referenced screenshots were unavailable, so no claim is made about matching their precise crop. Visual acceptance covers local Chromium and the actual packaged Windows Electron renderer at the required sizes. Physical-device/GPU fidelity, refresh-rate perception, audio listening, macOS and cross-device UAT were not performed; automated screenshots do not certify those areas. This is a local current-development refinement, not a published release.
