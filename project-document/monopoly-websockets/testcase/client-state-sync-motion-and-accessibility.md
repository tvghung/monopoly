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

The Phase 1.1 procedure was documented in
[`project-document/ui-ux-overhaul/PHASE_1_1_MANUAL_ACCEPTANCE.md`](../../ui-ux-overhaul/PHASE_1_1_MANUAL_ACCEPTANCE.md)
(HISTORICAL procedure; not current — its Docker/PostgreSQL steps no longer apply to the RAM-only host). Current manual
release tracking lives in [RELEASE_ACCEPTANCE_MATRIX.md](./RELEASE_ACCEPTANCE_MATRIX.md).
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

## UI/UX polish batch 5 (2026-10-08): landmark names, language selector, modal peek, jail layout

Evidence labels for this section: `[AUTO]` is a committed test; `[PROBE]` is a throwaway Playwright script (not committed) driving the dev-only UAT
harness (`?phase4-uat=1`) in system Chrome, results written down here; `[NOT RUN]` was not exercised.

### Landmark names (VI/EN)

- [x] `[AUTO][CLIENT]` `game/ui/property/landmarkVisuals.test.ts`: the 22 street landmarks have their exact Vietnamese name (unchanged) and exact English name
  (22 pairs, English names all different, proper nouns with their diacritics), `getLandmarkHotelLabel` is "Khách sạn · …" / "Hotel · …".
- [x] `[AUTO][CLIENT]` `PropertyDeedCard.test.tsx` (model built per language, street name untranslated), `components/legacy-board/tileAccessibility.test.ts` (English tile label
  "Hotel · Chùa Cầu Temple").
- [ ] `[NOT RUN]` A full match: build a hotel, switch language in Settings and read the deed card, the opening banner and the tile label again; the 3D board itself
  prints no landmark text.

### Language selector and main-menu heading

- [x] `[AUTO][CLIENT]` `components/LanguageSelector.test.tsx` (10 tests), `DesktopMultiplayerLauncher.update.test.tsx`, `DesktopMultiplayerLauncher.test.tsx`: see
  [join-room-and-player-lifecycle.md](./join-room-and-player-lifecycle.md); `settings/settings.test.ts` still normalizes an unknown stored language to the default.
- [x] `[PROBE]` The open list on the Design Lab `launcher` surface at 1280×720: Settings, the selector (globe, "Tiếng Việt", chevron) and Quit share one row and the list opens
  upward over the menu. The lab nests its own settings provider, so a language change cannot be watched there; that path is the AUTO row above.
- [ ] `[NOT RUN]` The selector by touch, and in the packaged desktop app (English labels, 40rem and landscape-short layouts).

### Modal peek ("Xem bàn cờ" / "Hiện quyết định")

- [x] `[AUTO][CLIENT]` `design-system/components/Modal/Modal.peek.test.tsx` (12 tests): the eye key exists only with `peek`; hiding sets `inert`/`aria-hidden` on the mounted fading overlay, removes the dialog from
  the accessibility tree and sends/closes nothing; showing returns the same elements with the typed value; focus goes to the restore key and back to the eye; Escape does
  nothing while hidden; the restore key and the "decision hidden" flag disappear when the dialog goes away; `view` dialogs do not raise the flag; only the dialog hidden last
  owns the key; the dialog below takes Escape; a new `peekKey` shows the dialog; `peekSummary` updates while hidden; a language change relabels both keys.
- [x] `[AUTO][CLIENT]` `components/dashboard/DecisionPeek.test.tsx` (8 tests): hiding and showing the purchase and development dialogs sends no command; a purchase request in flight is
  not repeated after hide/show; a settled decision leaves no key; a new purchase operation shows itself; the debt countdown keeps ticking beside the restore key and
  after restoring; with a decision hidden the property card has no "Bán Nhà" and shows the view-only note, with it back after showing.
- [x] `[AUTO][CLIENT]` Existing dialog tests updated only for the added eye key (`WinnerBanner.test.tsx`, `OwnedPropertiesControl.test.tsx`, `PlayerPortfolioModal.test.tsx`).
- [x] `[PROBE]` Live WebGL board (UAT scenario `chance`, card dialog) at 667×375, 896×414 and 1280×720: hiding leaves the board visible, `elementFromPoint` at the center hits the canvas (no
  invisible layer), the key sits top center inside the safe area; opening tile 13 while hidden shows its card, which covers the key, and Escape closes only the card and
  leaves the key reachable; showing returns focus to the eye key. Design Lab `buy` and `debt-debtor` surfaces show the key and the "N seconds left" chip.
- [ ] `[NOT RUN]` With a real match against a server: purchase, upgrade and a debt with a forced sale each hidden and shown mid-decision and then completed; a reconnect while hidden; the
  game ending while hidden; forced-sale proposals and incoming offers hidden. The Rescue and Forced-Sale dialogs are covered only by the shared Modal tests.

### Jail layout on narrow phones

- [x] `[AUTO][CLIENT]` `game/ui/hud/centerStage.test.tsx` ("CenterStage jail group", 3 tests): in a narrow window the roll button and the jail panel are in the one stage column with the roll first and
  exactly one roll button, in a wider window the stage has no jail panel, and the stage is marked busy during the dice roll while the panel stays mounted.
  `components/dashboard/JailPanel.test.tsx` is unchanged (bail/card/pending/error behavior).
- [x] `[PROBE]` UAT scenario `jail-failed` (jailed player with one card, own turn), VI and EN, at 568×320, 667×375, 740×360, 812×375, 844×390, 896×414, 1280×720 and 1920×1080: the roll button is the top
  element at its center (clickable), both jail buttons are ≥ 44 px tall and hit-testable, the panel overlaps neither the roll button, nor the four player cards, nor the properties dock, no horizontal
  scroll. Before the change 568×320 failed (panel over the roll button, `rollClickable: false`).
- [ ] `[NOT RUN]` 2v2 revive panel next to a jailed player, a disconnected jailed player, an insufficient-bail balance and a pending request on a device; Safari/WebKit and real notch devices.

## Responsive gameplay overhaul (2026-10-08, same branch): camera, chips, notifications, portrait, short-landscape dialogs

Labels as in the batch-5 section above (`[AUTO]` committed test, `[PROBE]` throwaway Playwright script on the UAT harness in system Chrome, `[NOT RUN]`).

- [x] `[AUTO][CLIENT]` `game/scene/camera/boardView.test.ts` (9 tests): zoom range, pan clamped so the window never leaves the overview, finger direction, zoom about an anchor keeps the point under it,
  no automatic focus at the overview / within 6 s of a manual change, one eased follow once left alone, reset, detach.
- [x] `[AUTO][CLIENT]` `game/ui/hud/CameraControls.test.tsx`: no keys without a 3D board; zoom in/out steps, ends disabled, reset only away from the overview; keys are the shared 44 px icon buttons.
- [x] ~~`[AUTO][CLIENT]` `game/ui/hud/turnAndDiceOverlays.test.tsx`: on a phone-sized window an opponent's turn gets no banner and the local turn still does.~~ Superseded by the
  mobile/tablet overhaul below: the turn banner no longer exists (its tests were removed with it).
- [x] `[PROBE]` Camera on the live board (667×375, touch): zoom keys, wheel, mouse drag and CDP two-finger pinch change the zoom (reset key appears, zoom-out enables); a drag over the board opens no dialog;
  a plain tap on a tile still opens its card; no page errors. Overview board share 52–63% at 568×320–896×414 and 64–86% at 1024×768–1280×720; zoom-in screenshots inspected.
- [x] `[PROBE]` HUD chips at 667×375 (stations-4): non-turn, non-local seats are chips and the board is visibly clearer; seats with a status keep the full card (the offline seat in the fixture).
- [x] `[PROBE]` Jail group with the camera keys at 568×320, 667×375, 740×360 (VI and EN): no overlap between roll, jail panel, zoom keys, properties button and cards.
- [x] `[PROBE]` Short-landscape dialogs (see design-system "Modal trên màn hình ngang thấp") before and after: purchase buttons on one line, debt summary without overlap.
- [x] `[PROBE]` Portrait (superseded below for tablets, which now play upright): the rotate notice shows and the board is inert at 375×667, 768×1024 and 820×1180 with a touch pointer (`isMobile`, `pointer: coarse`); a 900×1200 window with a mouse is not
  blocked; 1180×820 touch landscape is not blocked. Rotating 667×375 → 375×667 → 667×375 on one page keeps the page (no navigation), the four seats and the zoomed camera.
- [x] `[AUTO][E2E]` `e2e/mobile-host.spec.ts` (mobile-chromium and mobile-webkit, local): the room toolbar stays tappable over the rotate notice in portrait and every acceptance viewport passes.
- [x] `[PROBE]` Automatic follow on the live board (`pass-go`, 844×390): zoomed by the keys, a move within 6 s does not move the camera; a move once left alone pans it to the token.
- [x] `[PROBE]` HUD overlap matrix (persistent `data-hud-region` boxes plus roll button, jail panel, camera keys, properties button; no pair overlapping, nothing off-screen, no horizontal scroll, no page error):
  scenarios `stations-4`, `opponent-turn`, `offline`, `jail-failed`, `teams-2v2` × 568×320, 667×375, 740×360, 812×375, 844×390, 896×414, 1024×768, 1180×820, 1280×720, 1440×900, 1920×1080 (VI): 55/55;
  four of them again in EN at device pixel ratio 3 (20/20); `teams-revive` VI and EN at 568×320–844×390 after the revivable-card fix.
- [x] `[AUTO][CLIENT]` `components/Log.test.tsx`: a gameplay line while the Journal is closed marks the tab (not the chat count) and opening it clears the mark.
- [ ] `[NOT RUN]` Real phones and tablets (pinch on glass, notch safe areas, browser chrome showing/hiding), browser text zoom, a full match against a server on a device.

## v1.8.1 pre-release acceptance corrections (`codex/v181-pre-release-fixes`)

- [x] `[AUTO][CLIENT]` `apps/client/src/settings/SettingsPanel.test.tsx`: Settings language uses the shared dropdown, immediately changes the open UI, persists through the existing settings path, and Escape closes the option list without closing Settings.
- [x] `[AUTO][CLIENT]` `apps/client/src/components/Lobby.test.tsx`: bot difficulty uses the LanguageSelector dropdown treatment, exposes all five localized levels, and disables changes for guests and while busy.
- [x] `[AUTO][CLIENT]` `apps/client/src/game/ui/property/PropertyInspectionModal.test.tsx`: switch the already-open English modal and verify hotel count, hotel rent guidance, build-cost label and `Hotel · Chùa Cầu Temple` remain English; this confirms the audited path has no missing translation.
- [ ] `[NOT RUN]` Manual owner acceptance: change Settings language and Lobby bot difficulty in a real room; inspect the English hotel deed in a real property modal at desktop and narrow viewport sizes.

## Mobile and tablet overhaul (2026-10-08, branch `overhaul/mobile-tablet-redesign`)

From the owner's iPhone screenshots (Safari landscape with the tab bar, a ~760×280 game window): the jail panel covered "Đổ xúc xắc",
"<tên> đang chơi" / "Lượt của bạn" were said twice, the cards, the properties button and the zoom keys were too large, the debt and build
dialogs were hard to read ("Build 1 houses (100.000…" spilling out of its button), and the launcher, join form and lobby carried helper lines.
Rules: [game-board "Tầng bố cục"](../Client/game-board.instruction.md), [design-system "Vùng chạm"](../Client/design-system.instruction.md).

- [x] `[AUTO][CLIENT]` `game/ui/hud/centerStage.test.tsx`: the status pill shows only the room code (no turn label, nothing without a code); the jail panel sits in the center
  stage under the roll button at every size, one roll button, the card key keeps its full accessible name.
- [x] `[AUTO][CLIENT]` `components/Board.test.tsx`: the center pill names the displayed player on the move; no "Lượt của bạn" / "Đến lượt bạn!" anywhere.
- [x] `[AUTO][CLIENT]` `components/dashboard/DebtPanel.test.tsx`: one-line property rows (deed chip) under `SHORT_VIEWPORT_QUERY`, compact deeds otherwise.
- [x] `[AUTO][CLIENT]` `components/dashboard/DecisionSheets.test.tsx`: a build option is drawn as two lines and keeps "Xây 1 Nhà (50.000 ₫)" as its name;
  `i18n/catalog.test.ts`: no English string says "1 houses".
- [x] `[AUTO][CLIENT]` Lobby/JoinForm tests: no "Chia sẻ mã phòng để mời bạn", mascot colour note, "Màu đội" label or "Phòng chung" helper line.
- [x] `[AUTO][E2E]` `e2e/mobile-host.spec.ts` (mobile-chromium and mobile-webkit, local, 4/4): touch targets are measured where a finger lands (`elementFromPoint` runs
  through the centre, 44 px, the dialog close key 40 px) for the toolbar keys, the Journal tab, the properties key and the roll button at every acceptance viewport;
  768×1024 added and plays (no rotate notice); 360×800 and 390×844 still show it.
- [x] `[PROBE]` HUD vs tiles and HUD vs HUD (persistent `data-hud-region` boxes, roll, camera keys, properties key, Journal tab; > 4% of a tile is a finding):
  `stations-4`, `opponent-turn`, `teams-2v2`, `jail-failed` × 568×320, 640×360, 667×375, 760×280, 812×375, 844×390, 932×430, 1024×768, 768×1024, 820×1180, 1024×1366,
  1280×720, 1440×900: no finding after the narrow-phone camera column and the portrait dock (before: camera keys over GO at 568×320, dock over the bottom-right card at 768×1024).
- [x] `[PROBE]` Screenshots at 760×280 and 667×375 (VI and EN): jail group, opponent pill, 2v2 revive, buy / build / hotel / debt dialogs fit with every button reachable;
  real-app join form and 2v2 lobby at 760×280 show none of the removed helper lines.
- [ ] `[NOT RUN]` Real iPhone/iPad/Android devices (Safari tab bar, notch insets, pinch on glass), the desktop launcher in Electron at a small window.

## v1.9.0 motion owner acceptance

- [ ] Open a local development game with `?motion-trace=1`. Leave the board idle, make the first roll, and inspect the first hop separately from later hops. The first rendered position should continue from the visible origin, horizontal travel should not reverse, no SNAP or duplicate START should appear, and COMPLETE should finish on the destination anchor. Repeat at 30, 60 and 120 FPS and with the available animation-speed choices.
- [ ] Repeat movement after a later roll, including one step, a long path and GO wraparound; land on and leave an occupied tile; land on Chance/Community Chest; go to Jail; use a direct relocation card; then reset, reconnect and rejoin. Include a bot as mover and a second LAN client as observer. Verify no duplicate movement and correct shared-tile slots.
- [ ] Roll both dice repeatedly, including equal consecutive faces. Check distinct restrained trajectories, readable authoritative top faces, no pop/clipping/disappearance, contact SFX timing, and trails only on Balanced/High. Verify Low and Reduced Motion have no trail, Reduced Motion has subdued rotation, and results stay exact.
- [ ] Check intermediate tile steps and final landing: a short depression, stronger final contact, a brief highlight and exact neutral rest; overlapping impacts must not leave an offset. Verify destination preview uses the mover's color, stays on an occupied destination, clears after resolution and is steady with Reduced Motion.
- [ ] Open and close Chance/Community Chest, property, purchase/build/debt, Settings and nested confirmation dialogs. Check coordinated backdrop/surface exits, focus and Escape, no doubled card entrance, no lost three-second readable card interval, and no invisible click-blocking overlay.
- [ ] Open/close Journal by toggle and Escape on desktop and narrow viewport. Confirm transform-aligned toggle, no horizontal overflow or board interception during exit, preserved chat/unread/scroll behavior, and Reduced Motion without sliding.
- [ ] Check roll button enabled/disabled feedback, dice callout, player-card turn/balance feedback, building/ownership changes, money transfer, toasts and turn/game notifications. Compare Low/Balanced/High and Reduced Motion.
- [ ] Repeat representative scenes at 30/60/120 FPS and inspect the renderer diagnostics for idle demand rendering and active-frame pacing. Keep hardware frame-time profiling separate from automated tests.
- [ ] Recheck all accepted v1.8.1 behaviors: three-second card visibility on human/bot/observer clients, Income Tax, Lobby difficulty dropdown, Settings language dropdown, English hotel text, FPS choices, Low quality and demand-rendering idle behavior.
- [ ] Run in a Windows x64 packaged manual build with two clients, then test reconnect and a full match. Owner visual/device acceptance remains a separate check from automated coverage.

## v1.9.0 final refinement checks

- [x] `[OWNER-REPORTED]` Before this refinement the owner accepted mascot first hop, dice/trails/results, destination preview, other gameplay effects, FPS and the earlier v1.8.1 features. These systems remain frozen.
- [x] `[AUTO][CLIENT]` `TileMotionProvider.test.ts`: frame priority regression, body/surface/root agreement at start/peak/rebound/rest on all 40 tiles, text clearance above the moving face and fixed socket below maximum depression; existing controller tests cover overlap/reset.
- [x] `[AUTO][CLIENT]` `Modal.test.tsx`, `Modal.peek.test.tsx`, decision component tests: exit semantics/unmount, nested focus/ESC, same mounted input across peek, one restore control, new-key/close cleanup and localized labels.
- [x] `[AUTO][CLIENT]` `CardInteractionOverlay.test.tsx`: no reading credit during entrance or peek; resume remaining credit on restore, retain an unread observer card before a later operation, and keep dismiss actor-only/once with ACK error handling.
- [x] `[AUTO][CLIENT]` `Log.test.tsx`: mounted CSS panel, immediate inert/aria-hidden, rapid toggles, focus/ESC, draft clearing, unread/chat and preference behavior. `demandFrameScheduler.test.ts` remains the FPS/idle scheduler regression gate.
- [ ] `[MANUAL][OWNER]` Test the new package: property/special/corner/developed/occupied tiles depress together with no text/art flashing and recover exactly; repeat overlapping impacts with destination preview.
- [ ] `[MANUAL][OWNER]` Open/close centered and sheet dialogs, nested confirmation, eye hide/restore and rapid toggles/ESC; preserve input/debt status and require three readable card seconds on every client.
- [ ] `[MANUAL][OWNER]` Journal slides both directions on desktop/phone landscape with aligned tab, no horizontal scroll or closed-panel click interception; verify chat/unread/preferences and Reduced Motion.
- [ ] `[MANUAL][OWNER]` Low/60 FPS gameplay and LAN human/bot/observer regression; recheck the accepted hopping, dice, highlights, buildings, money and audio.

## Performance program B0/B1 checks (GPU-resource stability)

Evidence and numbers: [08B](../../ui-ux-overhaul/08B_PHASE_B0_B1_IMPLEMENTATION.md). Judge smoothness only in a production build (a
development build multiplies long-frame time about 3.8×, audit PERF-19).

- [x] `[AUTO][CLIENT]` `measurementScheduler.test.ts`, `localDiagnostics.test.ts`, `DiagnosticsReadouts.test.tsx`, `Phase4UatHarness.diagnostics.test.tsx`: renderer diagnostics observe the scene and never drive it; a diagnostics event cannot re-render `<Board />`; no frame request after the mount measurement.
- [x] `[AUTO][CLIENT]` `TileImpactHighlightBatch.resources.test.ts`, `tilePanelLayout.cache.test.ts`, `MergedRoundedBoxes.hook.test.ts`, `specialVisualRebuild.test.tsx`, `stableTiles.test.ts`: highlight resources, panel layouts and Jail/Tax geometry keep their identity across board re-renders, are bounded, and are disposed on unmount; tile data and language changes still update.
- [x] `[AUTO][CLIENT]` `TileDestinationPreview.geometry.test.ts`, `TileDestinationPreview.materials.test.tsx`, `diceTrailMaterials.test.ts`, `diceLayerMaterialLifetime.test.tsx`, `constructionPuffMaterial.test.ts`: transient-effect materials are owned by always-mounted components, survive show/hide/roll/tier cycles, and are disposed once with their owner; the preview frame geometry is released per move.
- [x] `[AUTO][SCRIPT]` `pnpm test:perf-tools`: benchmark metric definitions, comparison tool and pixel comparison.
- [x] `[PROBE]` `pnpm perf:benchmark` on the Intel UHD iGPU (Chrome 155, 144 Hz): idle 10 s = 0 scene submissions, warm replays and hover sweeps = 0 shader re-links, 0 geometry growth over 30 and 90 replays at Low, Balanced and High (08B §5–6).
- [x] `[PROBE]` `pnpm perf:visual-compare` B0 against B1: 18 of 19 settled states bit-identical; dice-settled differs only on the dice silhouette and equally between two captures of one bundle (08B §7).
- [x] `[PROBE]` `pnpm perf:motion-compare`: tile-impact depression/rebound/highlight on tiles 1, 4 and 10 at Balanced and tile 1 at Low, 26 frames identical between B0 and B1 at fixed simulated times, with an identical determinism control; High tier frames do not change in that capture path and are not evidence (08B §7.1).
- [x] `[PROBE]` `pnpm perf:lifecycle-check --expect-persistent`: one highlight, contact-shadow, preview, trail (per die) and puff material for a whole session; effects drawn during rolls, walk and builds; live tier cycle and forced context loss without page errors or new console messages; also on the React development server (StrictMode) (08B §7.1).
- [ ] `[NOT RUN]` Pixel comparison of dice roll, hop, destination preview and construction-burst animation in progress: a stepped fake clock was not reproducible (the same bundle differed from itself), so these have structural evidence only.
- [x] `[PROBE]` Superseded by B2: React task P95 ≤ 8 ms on walk, dice and soak is met (1.1–4.4 ms, 08C §6–7); heap growth over 30 replays ≤ 1 MB is met after 30 warm-up replays (+0.65 MB) and not met with the 3-warm-up default (+2.00 MB), see the B2 section below.
- [ ] `[NOT RUN]` The Phase A reference laptop (ThinkPad T14 Gen 1, 60 Hz), Electron, battery power, other GPUs and refresh rates, a 30–60 minute packaged session.
- [ ] `[MANUAL][OWNER]` Play a full match at Balanced and High on the target machine, watching hops, dice rolls, purchase, rent and construction for hitches, and compare with the previous build.

## Performance program B3 checks (shader warm-up)

Evidence and numbers: [08F](../../ui-ux-overhaul/08F_PHASE_B3_IMPLEMENTATION.md). Rules: [game-board.instruction.md](../Client/game-board.instruction.md)
"Shader warm-up".

- [x] `[AUTO][CLIENT]` `shaderCompile.test.ts`, `warmupRunner.test.ts`: all batches are started before any wait; each program is finished once; the render target is bound only while compiling and restored (also when `compile` throws); a program that never becomes ready ends as `timeout`, an abort as `aborted`; without parallel compile the first use is done in slices; `otb:warmup:done` is never emitted for a timeout, an abort or a throwing renderer.
- [x] `[AUTO][CLIENT]` `warmupHost.test.ts`, `demandFrameScheduler.test.ts` (hold): frames are held from canvas creation, hold/release are idempotent and nest, the watchdog releases a hold that never ends, an invalidation made while held is drawn after the release, a hidden tab becoming visible does not start frames while held, the post chain rendezvous resolves on arrival, timeout, abort and dispose.
- [x] `[AUTO][CLIENT]` `ShaderWarmup.test.tsx`: holds, warms, releases and invalidates; a tier switch cancels the run it replaces, uses its own reason and does not release a hold the newer run needs; shadow depth fixtures only while shadows are on; a restored context and an unmount are handled.
- [x] `[AUTO][CLIENT]` `warmupFixtures.test.ts`, `warmupPostChain.test.ts`, `warmupTextures.test.ts`: depth fixtures follow side, alpha test, maps, instancing, instance color and attribute layout of the casters; the standee, dice (by tier), preview and construction fixtures are built once and released on dispose; post chain materials are found without walking into the scene, renderer or targets; only ready textures are uploaded.
- [x] `[PROBE]` `pnpm perf:warmup-check`: cold launches (empty Chrome profile) of the scripted scenarios at Balanced and of walk, 4 houses and dice at Low and High, plus a live Low → Balanced → High → Low → High → Balanced switch sequence: marks present and ordered, 0 program links after `otb:warmup:done`, longest callback after it ≤ 300 ms, no page error (08F §6).
- [ ] `[PARTIAL]` T1 (cold longest active frame ≤ 300 ms) and T2 are met on the measuring machine; T3 covers 30 of the 42 cold signatures (the 12 pre-environment variants are no longer asked for); T5 (time-to-playable) is **not met**, see 08F §7.
- [ ] `[NOT RUN]` The original baseline machine (Core i5-10210U, Windows 10), Electron, other GPUs, the real lobby-to-board path, a 30–60 minute session.
- [ ] `[MANUAL][OWNER]` Launch the packaged game with a fresh GPU cache and start a match at Balanced and High: the board should appear once, without a multi-second freeze, and the first roll, walk, purchase and build should not hitch.

## Performance program B2 checks (React render fan-out)

Evidence and numbers: [08C](../../ui-ux-overhaul/08C_PHASE_B2_IMPLEMENTATION.md). Rules: [game-board.instruction.md](../Client/game-board.instruction.md)
"React render fan-out" and [settings-and-audio.instruction.md](../Client/settings-and-audio.instruction.md) "Reading settings".

- [x] `[AUTO][CLIENT]` `Board.renderIsolation.test.tsx`: the scene is not rendered for a sweep of hovered tiles, settings changes, a log-only presentation tick, a queue-status tick or a log-only room update; it is rendered once for a token move and once for an owner change (unchanged tile objects keep their identity), at most once per change of the drawn slice during a roll and a walk, and its callbacks are stable.
- [x] `[AUTO][CLIENT]` `settingsStore.test.ts`, `useSettingsSelector.test.tsx`: selector readers re-render only for their value; the settings context value never changes while a provider is mounted; an update that changes nothing notifies nobody; defaults without a provider.
- [x] `[AUTO][CLIENT]` `tileHoverStore.test.tsx`, `shareStructurally.test.ts`, `sceneStateIsolation.test.ts`: hover store semantics; structural sharing keeps equal parts and replaces changed ones; nothing reachable from `GameScene.tsx` other than `GameScene.tsx` itself imports the app state context.
- [x] `[AUTO][CLIENT]` `GameScene.contextIsolation.test.tsx`: with the real `GameScene` and react-three-fiber `Canvas` (stand-in renderer), a component under the canvas sees none of the room state, a room-state change does not render it, and other contexts are still bridged into the canvas.
- [x] `[AUTO][CLIENT]` `Board.renderIsolation.test.tsx` (2v2 hover card): in a 2v2 game the owner card follows the hover store (owner, team, relation; gone for another tile and when the pointer leaves), is never drawn in Solo, and a hover in a team game does not render the scene.
- [x] `[AUTO][CLIENT]` `diceLayerMaterialLifetime.test.tsx`: the die body geometry is built once for both dice at the first show, kept across roll/hide/show and released once with the layer.
- [x] `[AUTO][SCRIPT]` `pnpm test:perf-tools`: per-sweep comparison rows and caller-supplied labels; every row names a runnable scenario.
- [x] `[PROBE]` `pnpm perf:benchmark --scenarios hover,volume,socket` on the Intel UHD iGPU (Chrome 155, 144 Hz) at Low, Balanced and High: hover sweep of 18 tiles, 20 volume changes and 20 non-visual room updates = 0 R3F commits; volume and room updates draw 0 scene frames, each hover draws one (08C §6).
- [x] `[PROBE]` `pnpm perf:benchmark` React task P95 on Balanced: walk 4.0, dice 2.8, purchase 1.3, rent 1.1, build 1.5, soak 1.8 ms (baseline 10.6 / 23.0 / 7.2 / 6.9 / 7.3 / 11.2); 0 shader re-links and 0 geometry growth preserved.
- [x] `[PROBE]` `pnpm perf:visual-compare` baseline against B2: 18 of 19 settled states bit-identical, dice-settled equal to the capture's own noise; `pnpm perf:hover-compare`: 7 of 7 hover states bit-identical, dialog opens and closes, 2v2 owner card text identical; `pnpm perf:lifecycle-check --expect-persistent` passes (08C §8).
- [ ] `[NOT MET]` Heap growth over 30 replays ≤ 1 MB with the benchmark's fixed 3 warm-up replays (+2.00 MB; +0.65 MB after `--soak-warmup 30`; +0.11 MB with the JIT off, so the residual is compiled-code growth).
- [ ] `[NOT RUN]` Mid-animation pixel comparison of dice, hops, destination preview and construction bursts (no reproducible frame method), the Phase A reference laptop, Electron, battery power, a 30–60 minute packaged session.
- [ ] `[MANUAL][OWNER]` Hover tiles, move the volume slider and open the settings dialog during a roll, a walk and a build on the target machine; confirm the tile highlight follows the pointer, nothing stutters and the 2v2 owner card still names the owner.
