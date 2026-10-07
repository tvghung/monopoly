# Checklist — bilingual client, state sync, motion và accessibility

## Session/sync

- [x] `[CLIENT][AUTOMATED]` Join/resume ACK gates Lobby/Board; restore/reconnect keeps token and
  snapshot; terminal errors clear only invalid session; newest-wins old tab stops.
- [x] `[CLIENT][AUTOMATED]` Stale revision ignored; spectator/reconnecting has no mutation;
  StrictMode does not duplicate listeners/countdowns/actions.
- [x] `[CLIENT][AUTOMATED]` Protocol-v7 session/reconnect sync resumes the same
  identity in the current `IN_PROGRESS` state without replacing the reconnect
  credential; pending-card stages hydrate without replaying the old reveal.
- [x] `[CLIENT][AUTOMATED]` Presentation event derivation is deterministic, ordered,
  stale-safe and limited to observable diffs; reconnect snapshots do not replay history.
- [x] `[CLIENT][AUTOMATED]` Board display targets publish before each hop while
  settled positions gate prompts; reset epoch, tile impacts and stationary-player
  behavior remain independent.
- [x] `[CLIENT][AUTOMATED]` Animation queue covers FIFO, pause/resume, skip/reset,
  reduced motion, executor failure recovery, skip-all/reconnect snap and stale
  executor cancellation.

## VI/EN content and money

- [ ] `[AUDIT][CLIENT]` HTML title/description/manifest, join/lobby/host/ready/spectator,
  reconnect, dice/buy/payment/forced-sale/trade/property/jail/forfeit/winner/error/empty/
  tooltip/alt/log copy is localized for both VI and EN. Internal event/package/env names are exempt.
- [ ] `[AUDIT]` No player-facing “Monopoly”, uncatalogued interface copy, `$`, `$M` or USD
  formatter remains; user-authored names and chat are preserved.
- [x] `[CLIENT][AUTOMATED]` All displayed amounts use shared VNĐ formatter, including card
  detail, tooltip, prompt, log, offer, bid, balance and bail.
- [x] `[CLIENT][AUTOMATED]` Board renders exact canonical shared 40 tiles without duplicate
  metadata source; exact private deck order absent from DOM/state.

## Turn/property/payment UX

- [ ] `[CLIENT]` Token settlement gates buy/turn; each roll completes one turn and
  jail animation cannot expose a premature action.
- [ ] `[CLIENT]` Active debtor sees remaining claim/liquidation/bankruptcy confirmation;
  other Player/spectator cannot settle/declare.
- [ ] `[CLIENT]` Landing development, payment-shortfall gross values and
  private forced-sale proposal visibility
  render correct labels/actions/deadlines.
- [ ] `[CLIENT]` TradeBundle asset selection and ACK failure
  keeps authoritative UI.

## Accessibility/layout

- [ ] `[CLIENT][MANUAL-E2E]` Keyboard/focus/labels/live errors/reduced-motion usable;
  VI and EN text and short board labels fit desktop/mobile without hiding critical
  action.

## Language preference

- [x] `[AUTO][CLIENT]` `settings.test.ts`: V1 settings migrate to V2, default language is
  Vietnamese, existing preferences survive, and invalid locale values normalize safely.
- [x] `[AUTO][CLIENT]` `SettingsPanel.test.tsx`, `DesktopMultiplayerLauncher.update.test.tsx`:
  settings and the one-click menu switch update the shared language immediately.
- [x] `[AUTO][CLIENT]` `LanguageDocumentSync.test.tsx`: `<html lang>`, title and description
  follow the selected language.
- [x] `[AUTO][CLIENT]` `formatters.test.ts`, `activityText.test.ts`, `cardVisuals.test.ts`,
  `model.test.ts`: special tile labels, structured activity, card copy and How To Play have
  VI/EN assertions; names/chat preserve user-authored text.
- [ ] `[MANUAL-E2E]` Confirm English menu, settings, lobby and active-game HUD at 1280×720
  and a narrow viewport; verify no clipped labels or blocked actions.

## Design system V2 (visual-overhaul-v2 plan 01)

- [x] `[CLIENT][AUTOMATED]` `palette.test.ts`: `palette.css` ≡ `OTB_PALETTE`, và mọi cặp contrast
  đã ghi (≥ 4.5:1 hoặc 3:1 cho chữ lớn/non-text) đạt; `propertyVisualColors.test.ts` kiểm header
  district v2 ≥ 4.5:1.
- [x] `[CLIENT][AUTOMATED]` `ReducedMotionDocumentSync.test.tsx`: setting hoặc OS ghi
  `data-reduced-motion`; `motionTokens.test.ts`: token CSS ≡ mirror TS và duration về 0ms.
- [x] `[CLIENT][AUTOMATED]` Primitive v2 (Button default type, IconButton, Panel, Chip,
  SegmentedControl, Switch, Slider, MoneyText, DeltaChip, PlayerAvatar, GroupPips) và icon registry
  có test render/accessible name/bàn phím; `Phase4UatHarness.test.tsx` và `DesignLab.test.tsx`
  cover tham số URL, marker `data-uat-ready` và mọi section của Lab.
- [ ] `[CLIENT][MANUAL-E2E]` Review thị giác Design Lab (Chromium; WebKit NOT RUN vì chưa cài) và
  Gate G1 của product owner: `project-document/visual-overhaul-v2/evidence/01/`.

## Gameplay audio

- [x] `[CLIENT][AUTOMATED]` One trusted unlock starts exactly four equal-length
  stems at one timestamp; repeated room/state updates do not duplicate sources,
  leave stops every stem, and re-entry reuses the cached buffers.
- [x] `[CLIENT][AUTOMATED]` The 64-bar score metadata, melody register/rest/rise
  constraints, deterministic stem rendering, bounded sample peak, weighted
  intensity examples, hysteresis and four-bar transition scheduling are asserted.
- [ ] `[CLIENT][MANUAL-E2E]` Headphone/speaker melody, timbre, treble, loop seam,
  SFX masking, multi-loop fatigue and real browser/Electron/device output remain
  listening gates; automated waveform checks do not prove perceived mix quality.
- [x] `[DESKTOP][AUTOMATED]` V1.1.1 single-track music: the shipped `own-the-block-main-theme-loop.ogg` is one stereo 48 kHz
  Ogg Vorbis stream of exactly 6,781,091 frames and under 5 MiB, and the container reader rejects non-Ogg data, a truncated
  or unterminated stream, a missing stream start, a non-Vorbis first packet, a chained stream and a wrong rate or channel
  count: `apps/desktop/tests/oggVorbisMetadata.test.ts`.
- [ ] `[PACKAGED]` `proof:packaged:audio` serves the track through `app://` as `audio/ogg`, decodes it, and finds the decoded
  frame count equal to the container's declared count (a gapless loop).
- [ ] `[BROWSER]` The mobile Chromium flow starts exactly one decoded, looping stereo music source (`e2e/mobile-host.spec.ts`);
  the WebKit run proves it only where the engine has Web Audio (macOS CI; the Windows WebKit build has none). Safari and iOS
  before 18.4 cannot decode Ogg Vorbis, so a guest there plays without music. Not testable in CI.

## Phase 2.5B commercial WebGL board

- [x] `[CLIENT][AUTOMATED]` Tile surface matrix keeps upward normals and matching
  footprints on bottom/left/top/right representatives; canonical 40 tiles are
  assigned once to eight district surface batches plus one special batch.
- [x] `[CLIENT][AUTOMATED]` All eight district descriptors generate distinct
  textless albedo/bump data; the 512-square sRGB/non-color texture pairs and
  materials are reused and deferred disposal survives React StrictMode remount.
- [x] `[CLIENT][AUTOMATED]` Normal property typography is name-only with adaptive
  short/canonical/long Vietnamese sizing; local SDF completion invalidates the
  demand frame without a user interaction.
- [x] `[CLIENT][AUTOMATED]` Neutral chassis, integrated accents, frame bounds,
  orthographic camera, tone mapping, budget constants and the triangle estimator
  are guarded by tests; live diagnostics measure actual draw calls/triangles. WebGL
  lazy routing waits for its dynamic import deterministically.
- [x] `[CLIENT][AUTOMATED]` Graphics quality resolution (`auto` never picks `high`, low
  on small touch devices, invalid values normalize to `auto`), the per-tier config table,
  Neutral tone mapping and the post-chain constants are guarded by `renderQuality`,
  `toneMapping`, `postSettings` and settings tests.
- [x] `[CLIENT][AUTOMATED]` V1.1 graphics tier switch: the Canvas camera is `manual` and the frustum depends on the aspect only
  (`FixedBoardCamera.test.ts`), the key light drops its shadow map when `mapSize`/`enabled` change (`SceneLightRig.test.ts`), and a
  failed optional layer is retried when its reset key (the tier) changes (`OptionalSceneLayer.test.tsx`).
- [x] `[BROWSER]` V1.1 graphics tier switch keeps the board: `e2e/visual/graphicsTierSwitch.visual.ts` (SwiftShader; run with
  `pnpm exec playwright test --config playwright.visual.config.ts graphicsTierSwitch`) switches low → balanced → low → high →
  balanced and asserts the renderer drew the new tier, the pixel ratio of each tier, the camera frustum equal to the first load,
  draw calls and triangles, and a canvas that still shows the board. Before the fix the first switch left a bare table. Run on
  2026-10-03 against the dev server: 1 passed in 10.6 min (the spec is slow and is not part of `pnpm test`).
- [ ] `[MANUAL-E2E]` V1.1: switch Cài đặt → Đồ họa → Chất lượng đồ họa between Tự động / Cao / Cân bằng / Thấp several times in a real game on
  the packaged app and on a phone: the board, pieces and coin trays stay on screen every time.
- [x] `[CLIENT][AUTOMATED]` The tabletop covers every standard aspect ratio (1 → 2.4) and
  the frame counter splits main / shadow / post draw calls and composer passes
  (`tabletopCoverage`, `rendererInfo`, `composerPasses` tests).
- [x] `[CLIENT][AUTOMATED]` The page shell starts in the v2 theme (`index.html` attribute, bootstrap
  default) and its browser-chrome colors come from the palette (`visualTheme.test.ts`).
- [x] `[CLIENT][AUTOMATED]` HUD: player card view models (seats, displayed money, displayed turn, building counts, pips,
  jail / offline / recovery / bankrupt / left), roster semantics and summaries, animated money counter (reduced motion,
  reset epoch, speed), delta chips (no replay, cap of two, reset), turn banner, dice callout, activity ticker and chat
  bubbles (gating, reset, text-only), single transient timer, `usePresentationSelector` re-render behavior, Space
  shortcut guards, and the overlap geometry (`playerCardSelectors`, `PlayerCardList`, `useAnimatedNumber`,
  `useBalanceDeltaFeed`, `turnAndDiceOverlays`, `tickerAndBubbles`, `centerStage`, `useRollShortcut`,
  `polygonOverlap`, `tileScreenRects`, `usePresentationSelector` tests).
- [ ] `[CLIENT][MANUAL-E2E]` HUD overlap report (`evidence/03/g3/*.json`, `hudOverlap`) reviewed at 1440×900,
  1280×720, 1024×768, 812×375 and 667×375, and the 5-second test (3 people: whose turn, who has the most money)
  recorded in plan 03 section 17.
- [ ] `[CLIENT][MANUAL-E2E]` Review the v2-theme sweep (`evidence/01/theme-v2/`, 28 images) against the V1
  baseline; automated candidate review found no confirmed regression, a human pass is still open.
- [ ] `[CLIENT][MANUAL-E2E]` Review low / balanced / high captures side by side (harness
  `quality=<tier>`, `pnpm visual:capture` group `g2`), including the eight regression tile names
  and the WebGL fallback; gate G2 verdict recorded by the product owner.
- [ ] `[CLIENT][MANUAL-E2E]` Benchmark `stress` and `board-readability` per tier on the
  reference device (Intel Iris Xe or Apple M1 class) with `VISUAL_GPU=hardware`; record model, GPU,
  OS and browser. Current numbers are from an Intel UHD 630-class GPU, which is not the reference device.
- [ ] `[CLIENT][MANUAL-E2E]` Record 1920×1080 bottom/left/top/right visual review,
  orange/pink/blue material distinction, center/corner hierarchy, four-player
  developed-property stress scene and active roll/landing action flow.

## Desktop shell

- [x] `[DESKTOP][AUTOMATED]` Renderer navigation, external URL allowlist and packaged
  renderer traversal guard have unit coverage.
- [x] `[DESKTOP][AUTOMATED]` Production reload/history shortcuts and DevTools policy
  are covered by a pure input-policy test; preload compilation bundles local IPC
  modules into the exact BrowserWindow artifact.
- [x] `[DESKTOP][AUTOMATED]` Settings reset requests native fullscreen false and
  fullscreen events synchronize even when the settings modal is closed.
- [ ] `[DESKTOP][MANUAL-E2E]` Active-player window close prompts and confirmed close
  preserves reconnect token; lobby/join close exits normally; explicit `Bỏ cuộc`
  still revokes the session.
- [ ] `[DESKTOP][CONFIGURED]` Windows Squirrel and macOS DMG makers are configured;
  macOS artifact is not claimed from Windows validation.

## Phase 1.1 acceptance procedure

The executable procedure is documented in
[`project-document/ui-ux-overhaul/PHASE_1_1_MANUAL_ACCEPTANCE.md`](../../ui-ux-overhaul/PHASE_1_1_MANUAL_ACCEPTANCE.md).
The manual boxes above remain unchecked until a human run records the environment,
players, and observed result.

## Modal v2 and settings (visual overhaul V2, plan 04)

- [x] `[AUTO][CLIENT]` `Modal.test.tsx`: size/placement/backdrop/footer/tone/layer props, exit animation, only the top dialog handles
  Escape/Tab, Tab and Shift+Tab from an element outside the ring stay inside, focus returns to the opener (also under React
  StrictMode) or to the dialog below, `describedBy`.
- [x] `[AUTO][CLIENT]` `Slider.test.tsx`, `Switch.test.tsx`, `SettingsPanel.test.tsx`, `selectors.test.tsx`: keyboard-operable segmented
  controls and switches, the slider value is announced once, the reduced-motion hint describes its switch, OS reduced motion is
  known at the first render, the desktop-only "Cửa sổ" section.
- [ ] `[MANUAL-E2E]` G4: Vietnamese typography and WebKit rendering of every plan 04 surface (Design Lab `surfaces` captures).

## 3D asset kit (visual overhaul V2, plan 05)

- [x] `[AUTO][CLIENT]` `kit/lowPolyKit.test.ts`: every primitive (including `arcadeWall`, `prism`, `blob` and `dome`) is a faceted part with exactly position,
  normal and color, deterministic, standing on y = 0 and outward-wound; a `dome` never goes below the ground; merging keeps the sum of triangles.
- [x] `[AUTO][CLIENT]` `tubeHouseGeometry.test.ts`, `tubeHouseLayout.test.ts`, `tubeHouseMeshes.test.ts`: ≤ 180 triangles per house, rows of 1–4 houses stay inside
  the tile and its upper art panel on all 22 streets and all four board sides, three instanced meshes with room for 88 houses, facade pastel and owner color,
  the Phase 4 pop and hotel-transition curves (nothing plays with reduced motion, a downgrade, zero duration or a stale signal).
- [x] `[AUTO][CLIENT]` `landmarks/landmarks.test.ts`, `LandmarkShadowProxy.test.ts`: the plan lists exactly the 22 streets and all 22 are built, in tile order; every
  built landmark stays under 900 triangles, 3 draws, 1.30 footprint and its `Max H`, stands inside the plinth slab and never below the ground, is faceted and
  deterministic; plinth below the landmark with the rim first and recolored alone; one shadow proxy for all visible landmarks.
- [x] `[AUTO][CLIENT]` `landmarkVisuals.test.ts`, `deedCardModel.test.ts`, `PropertyDeedCard.test.tsx`, `tileAccessibility.test.ts`: 22 flat 160 x 160 landmark SVGs, one per street, named from
  the plan; the deed card shows the landmark picture (district motif on a load error) and "Khách sạn · <landmark>" under the tile name and describes the card with it; stations,
  utilities and special tiles have none; a hotel tile button is named "Có Khách sạn · <landmark>".
- [x] `[AUDIT]` `pnpm test:landmark-art` (`validateLandmarkArtwork.check.mjs`) and `pnpm validate:landmark-art`, run by `pnpm build` (`--build-output`) and CI: exact coverage of the 22
  street tiles, no script / text / foreignObject / raster / href / external URL, viewBox `0 0 160 160`, no orphan file, built copies identical to the source;
  `pnpm test:card-art` keeps its behavior on the shared validation helper.
- [x] `[PACKAGED]` `pnpm --filter @monopoly/desktop proof:packaged:landmarks` verified the 22 landmark SVGs (and `proof:packaged:cards` the 28 card SVGs) inside the packaged renderer of `pnpm desktop:package`;
  the runtime proof `pnpm --filter @monopoly/desktop proof:packaged` also passed. Scope: Windows x64, 02/10/2026; nothing in these proofs draws the board.
- [x] `[AUTO][CLIENT]` `props/tablePropGeometry.test.ts`, `props/tablePropLayout.test.ts`, `hud-overlap/polygonOverlap.test.ts`: four props, at most 4 draws and 3,000 triangles
  together, faceted and deterministic, standing on the table, inside their placement envelope; the analytic projection equals the fixed camera; every prop clear of the board,
  the stations and each other; all four shown from 1280 x 720 up and hidden on tablet and phone landscape; never over a tile; HUD and tile overlap helpers.
- [x] `[AUTO][CLIENT]` `LandmarkBanner.test.tsx`: "Khánh thành <landmark>!" only for a street reaching the hotel tier in live presentation; silent for houses, a hotel coming
  down, a hotel already on the board when the HUD mounts and after a snap, reconnect or reset; lifetime scaled by the animation speed; text only under reduced motion.
- [x] `[AUTO][CLIENT]` `characters/standee.test.ts`, `characterTextureCache.test.ts`: the standee faces the camera azimuth only and is as tall on screen as the old sprite;
  unlit alpha-tested face, mascot-shaped depth material, opacity fade, instanced bases follow their anchors, the 320 px die-cut bake.
  Movement semantics (`characterMotion.test.ts`, `characterPlacement.test.ts`, `characterReaction.test.ts`) are unchanged.
- [x] `[AUTO][CLIENT]` `special/taxStandeeClearance.test.ts`: the tax paper stack (tiles 4 and 38) stays at least 0.02 below the top of the round standee base for every
  occupant slot and inside the elevation of the shallow SVG badge art, so the player's coloured base is visible on a tax tile like on every other tile.
- [x] `[MANUAL-E2E]` Style review of the three pilots (gate G5a, approved by the product owner on 01/10/2026) and review of all 22 landmarks, the table props, the "Khánh thành" banner and the
  deed card art (gate G5, approved by the product owner on 02/10/2026; no separate Vietnamese reviewer is named): `evidence/05/g5/`, `evidence/05/props/`. Overlap checker JSON: no HUD or tile finding.
- [x] `[MANUAL-E2E]` Worst-case budgets (`landmarks-all`, `houses-max`, `standees`, `stress`) measured in every tier: `evidence/05/g5/numbers` (the pilots' numbers are in `evidence/05/g5a/numbers`),
  all inside the plan 05 §5.3 budgets.
- [ ] `[MANUAL-E2E]` The reference-device benchmark (`stress` balanced): only the machine's own Intel UHD GPU was measured (`evidence/05/g5/benchmark`, 30 FPS in `balanced`, as before plan 05);
  and a human look at the packaged window (`pnpm desktop:run:packaged`) for landmarks, standees and props under `app://`.

## How-to-play guide (V1.1 item 8)

- [x] `[AUTO][CLIENT]` `howToPlay/model.test.ts`: the guide has the twelve topics in order (Mục tiêu và lượt chơi, Mua đất, Thu tiền
  thuê, Xây nhà và công trình, Nhà Tù, Thuế và ô đặc biệt, Thẻ Cơ Hội, Thẻ Khí Vận, Giao dịch mua bán, Nợ và phá sản, Bỏ cuộc
  và chiến thắng, Chơi đội 2v2); it is pure; every money amount in the text exists in the shared board data, cards or `rules.ts`, and the
  rules numbers (players, start cash, Xuất Phát reward, Ga ladder, Công Ty multipliers, bail, jail rounds, durations marked
  "(mặc định)", the 70% bank price, offer lifetime) are read from them; the tax tiles are charged, not free; all 13 Cơ Hội and
  15 Khí Vận cards are listed with the printed text and the artwork title and counted by kind; the three 1.1 rule statements
  (offers to buy a debtor's property, the debtor's own price, keep watching or leave after giving up) are present; no
  technical or English word; cross-references use real section titles.
- [x] `[AUTO][CLIENT]` `howToPlay/HowToPlay.test.tsx`: the key is named "Hướng dẫn chơi", a 44 px icon key (or labelled, or
  corner) that announces a dialog and renders nothing outside a provider; one provider owns one dialog that every key opens;
  the dialog is titled, `lg`, modal, with an introduction and twelve collapsed `<details>` that open independently and
  start collapsed again on the next visit; focus starts on the first topic; the 13 and 15 cards sit in their own topics;
  tables are named focusable regions with real header cells and decorative swatches; Escape, the close key and an outside
  click close it and focus returns to the key; works under StrictMode with no settings, audio or toast provider.
- [x] `[AUTO][CLIENT]` `howToPlay/placement.test.tsx` and `App.test.tsx` ("App how-to-play key placement"): the key exists on every
  loading stage, every failure screen (with and without an action, start-up failure, render failure with its own provider),
  the reconnecting overlay (outside the announced status), the join screen (hero, never submits), the lobby header (first key,
  host and guest) and the game and spectator toolbar (first key, `data-hud-region="toolbar"`, order [?] [Cài đặt]
  [Bỏ cuộc/Rời phòng]); where no provider exists these screens keep exactly their old buttons.
- [ ] `[MANUAL-E2E]` The key and the guide on every screen with the real app: web join screen, loading, restoring, replaced and error
  screens, reconnecting overlay (the guide opens above it), lobby, game and spectator toolbar, and the desktop launcher once it
  carries the key; at desktop width, a tablet, a phone in portrait and a phone at 812×375 and 667×375 (no overflow, targets
  ≥ 44 px, the join card still fits 812×375 without scrolling).
- [ ] `[MANUAL-E2E]` The guide by touch, mouse and keyboard: topics are collapsed on opening, Enter and Space open and close
  them, Tab and Shift+Tab stay inside the dialog and wrap, tables scroll sideways only when needed, Escape and the close key
  return focus to the key, and a screen reader announces each topic as collapsed or expanded.
- [ ] `[MANUAL-E2E]` Overlap: `pnpm visual:capture` sidecars list the `toolbar` HUD region with no persistent overlap and no region
  overlap (`hudOverlap.findings`, `hudOverlap.regionOverlaps`) at the standard viewports, and the spectator banner stays clear
  of the three-key toolbar from 360 to 1920 px wide.
- [ ] `[MANUAL-E2E]` Owner read-through of the Vietnamese text of the twelve topics for plainness and correctness, and a check of
  the three 1.1 rule statements (buy offers during a debt, the seller-chosen forced-sale price, keep watching after
  "Bỏ cuộc") against the running game.
