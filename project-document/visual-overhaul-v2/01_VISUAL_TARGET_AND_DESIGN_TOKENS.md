# 01 — Visual Target, Art Direction and Design Tokens V2

**Status: IN PROGRESS — T01.0–T01.11 and T01.13 done (2026-09-30); Gate G1 (product-owner approval) is PENDING and blocks T01.12 (global theme switch), plans 03/04 and the final color grading of plan 02. Open decisions were answered by the product owner on 2026-09-30 (see the Decisions section).**

| Field | Value |
| --- | --- |
| Plan ID | V2-01 |
| Depends on | — |
| Blocks | V2-03, V2-04 (fully); V2-02 (only its color-grading task) |
| Parallel with | V2-02 technical tasks (quality tiers, shadows, budget recovery) |
| Suggested branch | `visual-v2/01-visual-target` |
| Size | M (about 8–12 agent working sessions) |
| Owner profile | UI designer + front-end engineer (an AI agent can do all engineering tasks; G1 needs a human) |
| Primary code areas | `apps/client/src/design-system/**`, `apps/client/src/dev/**`, `apps/client/src/settings/**` (reduced-motion bridge only), root Playwright config |

Read first: [README.md](README.md) (program rules, decision record, local run
guide), then this file.

---

## 1. Description

This plan defines the V2 visual language of Own the Block and turns it into code
that later plans can consume without making taste decisions:

1. An **art direction brief**, "Tabletop Toy Vietnam": pillars, references,
   anti-goals.
2. **Design tokens v2**: a primitive craft palette, a semantic token layer,
   contrast-verified pairs, a display + UI type system, shape/depth, and motion
   tokens.
3. **Primitives v2** in the design system (tactile buttons, icon buttons,
   panels, chips, badges, segmented control, switch, slider, money text, delta
   chip, player avatar, group pips) and a central **action icon registry**.
4. A dev-only **Design Lab** inside the existing UAT harness that renders the
   tokens, primitives, and concept screens, with a v1/v2 theme toggle.
5. A reproducible **screenshot capture tool** used as evidence by every later
   plan.
6. **Gate G1**: the product owner approves the direction from Design Lab
   screenshots; only then is the v2 theme switched on globally.

It changes no gameplay, protocol, persistence, or server code, and it does not
re-layout production screens (plans 03 and 04 do that).

---

## 2. Context

- The product owner judged the current UI "average, not beautiful" and asked
  for a better overall look, HUD, and UI/UX (see README §1, root causes R4 and R7).
- Phase 1 (`project-document/ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md`)
  created a token system and a few primitives. The palette is a generic
  mint/teal + pink-red scheme with no brand identity; there is no display font;
  tokens have no specification document (`Client/README.md` points to
  `PHASE_1_IMPLEMENTATION_PLAN.md`, which lists no tokens).
- Plans 03 (HUD) and 04 (modals and pre-game screens) will rebuild many
  surfaces. If they each invent styles, the result is inconsistent. This plan
  gives them one shared vocabulary and ready primitives.
- Live review findings that belong to this plan:
  - Surfaces look like web forms; accents compete (teal borders, pink CTAs,
    navy chips, pastel board).
  - The in-app "Giảm chuyển động" setting does not reach CSS: CSS only reacts to
    the OS `prefers-reduced-motion`, so CSS transitions still run when a player
    enables reduced motion in the game.
  - The `warning` Badge has low contrast; `IconButton` and `GamePanel` exist but
    are unused; `motionTokens.ts` is unused; many buttons are ad-hoc CSS classes;
    the icon convention (commit `4e7fe5e`) exists only implicitly in imports.
  - The UAT harness has no URL parameter to choose a scenario, so screenshots
    cannot be reproduced automatically.
- Decision record items that apply: DR-01 (Liquid Glass rejected), DR-02
  (stylized PBR), DR-07 (Vietnamese identity). See README §4.

---

## 3. Current State

### 3.1 What the player sees

- `baseline/01-landing.jpg`: a white card on a mint/yellow radial gradient, a
  pink-red title that wraps as "Cờ Tỷ Phú Việt / Nam", teal-bordered inputs.
- `baseline/02-lobby.jpg`: mint panels with teal borders, pink "Bắt đầu"/"Sẵn
  sàng" buttons, cream mascot stage.
- `baseline/05`, `09`, `11`, `12`: white modals with a teal hairline under the
  title, pink primary button, mint secondary button, a native `<select>`.
- In-game background: flat teal (`--color-canvas-deep: #55dcc8`); WebGL clear color
  `#62ddcc`.

### 3.2 Code map (verified 2026-09-29)

| Area | File(s) | Facts |
| --- | --- | --- |
| Token entry | `apps/client/src/design-system/tokens/index.css` (imported by `apps/client/src/index.css:1`) | Imports 7 token files. |
| Colors | `tokens/colors.css` | `--color-canvas #f7fffd`, `--color-canvas-deep #55dcc8`, surfaces `#fff`/`#d5fbf4`, text `#123244`/`#285364`/`#5b7780`, accent primary `#ff315f`/`#d91348`, accent secondary `#00c8b5`/`#007f79`, success/warning/danger/info (+ soft; no `--color-warning-strong`), border `#8be2d3`/`#00a892`, focus `#2455e8`, overlay, shadow. |
| Typography | `tokens/typography.css` | Imports `@fontsource/be-vietnam-pro` 400/500/600/700/800; `--font-family-body`; sizes xs–xl (`xl = clamp(1.75rem,4vw,3.5rem)`); weights regular=500, semibold=700, bold=800; line heights 1.15/1.5. No display font. |
| Spacing / radius / shadows | `tokens/spacing.css`, `radius.css`, `shadows.css` | `--space-1…8` (0.25–4rem); radius small .5 / medium .875 / large 1.25 / extra-large 1.75rem / pill; shadows panel/raised/card/modal/floating/focus (teal-tinted `rgb(17 54 66 / …)`). |
| Z-index | `tokens/zIndex.css` | base 0, hud 10, action-surface 20, orientation-notice 30, floating-control 40, dropdown 50 (unused), modal 60, card-overlay 70 (unused; the card overlay hard-codes 1000), toast 80, connection-overlay 90. |
| Motion | `tokens/motion.css`, `design-system/motion/motionTokens.ts` | 120/200/320 ms + one ease; zeroed only by the OS media query. `motionTokens.ts` is unused (Modal/Toast repeat numbers). |
| Board font | `design-system/typography/gameFonts.ts` | Unsubsetted `BeVietnamPro-ExtraBold.ttf` for Troika SDF text. Do not change in this plan. |
| Components | `design-system/components/{Button,Modal,ConfirmationDialog,Badge,IconButton,GamePanel,Toast}` | `Button`: variants primary/secondary/danger/ghost, `busy`, `icon`, **no default `type`**. `Modal`: portal, focus trap, Escape/X only with `onClose`, enter animation only. `Badge` warning variant low contrast. `IconButton`, `GamePanel` unused. |
| Toast provider | `apps/client/src/components/Toast.tsx` | `useToast().show(msg,{variant})`, 5 s. |
| Settings | `apps/client/src/settings/{SettingsProvider.tsx,selectors.ts,types.ts,defaults.ts,storage.ts}` | `useEffectiveReducedMotion()` = setting OR OS query; key `own-the-block.settings.v1`. No DOM attribute is set for CSS. |
| Player colors | `apps/client/src/game/ui/playerVisualColors.ts` | 10 colors (`red #f2384a` … `charcoal #334155`) with foreground/accentDark; Phase 3 contract. Keep values. |
| District colors (DOM) | `apps/client/src/game/ui/propertyVisualColors.ts` | 8 groups + railroad with `color`, `tint`, `motif`, `label`. |
| Scene tokens | `apps/client/src/game/scene/board/boardVisualTokens.ts` | 92 tokens incl. `sceneBackground #62ddcc` (locked by `phase25eVisualContracts.test.ts` and `tileVisualRegistry.test.ts`). Plan 02 owns scene changes. |
| Global CSS | `apps/client/src/index.css`, `App.css` | Custom cursor `url('./cursor.png')`, body `--color-canvas`, fluid font size, global `:focus-visible` 3px outline, `.action-icon`, `.sr-only`. |
| Page meta | `apps/client/index.html`, `apps/client/public/manifest.json` | `theme-color #9b101b`, manifest `background_color #152727` (off-palette). |
| Icons | `lucide-react` 1.37.0 imported per component | Convention (see §8.8) but no registry file. `apps/client/public/icons/` holds 9 legacy rasters used only by the legacy board CSS. |
| UAT harness | `apps/client/src/dev/phase4-uat/Phase4UatHarness.tsx` (+ `.css`) | Compile-time gate `VITE_PHASE4_UAT=1` (`vite.config.ts`, `.env.phase4-uat`), URL `?phase4-uat=1`; 48 scenarios selectable only through a `<select aria-label="Kịch bản">`; `&card-gallery=1`; renders `Board` + card overlay, not the App toolbar/Lobby/JoinForm/Settings/Winner. |
| E2E | `playwright.config.ts`, `playwright.global-setup.ts`, `e2e/mobile-host.spec.ts` | Mobile Chromium + WebKit, legacy board (WebGL disabled), managed PostgreSQL. |

### 3.3 Gaps this plan closes

1. No brand identity; palette not contrast-verified in code.
2. No display typeface; Vietnamese headline rendering not reviewed.
3. In-app reduced motion is ignored by CSS.
4. Primitives incomplete; buttons ad-hoc; `Button` without default `type`.
5. Icon mapping implicit.
6. No reviewable design surface; screenshots not reproducible.

---

## 4. Purpose

1. Give the product one coherent, ownable visual language that fits a toy board
   game with Vietnamese identity.
2. Remove taste decisions from plans 02–05: they consume tokens and primitives
   defined here.
3. Make the direction reviewable (and cheap to change) before expensive work
   starts.
4. Fix foundation defects (reduced-motion bridge, contrast, button type, icon
   registry, reproducible evidence).

---

## 5. Desired Outcome

### 5.1 Player-facing (after G1 and the theme switch)

- Warm paper surfaces, ink text, lacquer-red primary actions, jade secondary
  actions, gold for money and "your turn" highlights.
- Headlines, money, and CTA labels in a rounded Vietnamese-capable display face
  (Baloo 2); body and UI text stay in Be Vietnam Pro.
- Buttons feel physical (a visible bottom lip, press-down on click).
- Turning on "Giảm chuyển động" in settings also stops CSS transitions.

### 5.2 Engineering

- `tokens/palette.css` + `tokens/palette.ts` (primitive palette, parity-tested).
- Semantic token layer v2, with legacy `--color-*` names kept as aliases during
  the migration.
- Primitives v2 and `ActionIcon` registry with unit tests.
- Design Lab route (`?phase4-uat=1&design-lab=1`) with v1/v2 toggle.
- Harness URL params `scenario` and `uat-controls`.
- `pnpm visual:capture` producing evidence PNGs deterministically.
- New AS-IS document `Client/design-system.instruction.md`.

### 5.3 Success metrics

| Metric | Target |
| --- | --- |
| Text/background token pairs used by primitives | 100% ≥ 4.5:1 (normal text) or ≥ 3:1 (large text ≥ 24px regular / 18.66px bold), asserted by a unit test |
| Focus indicator vs adjacent colors | ≥ 3:1 on paper, lacquer, jade, table |
| Product-owner approval | Recorded in §18 with date and notes |
| Gameplay/protocol/server diff | Zero lines |
| `pnpm test`, `pnpm test:e2e:mobile` | Green |

---

## 6. Scope

**In scope**

- Art direction brief, palette, typography, shape/depth, iconography, motion, copy tone.
- Token files, TS mirror, contrast utility + tests.
- Display font dependency (`@fontsource/baloo-2`).
- Primitives v2 + icon registry.
- Reduced-motion DOM bridge.
- Harness URL params, Design Lab, concept screens.
- Capture tooling and evidence set.
- G1 review; global theme switch; `theme-color`/manifest color update.
- Docs for the design system.

**Out of scope (owned elsewhere)**

- Re-layout of the in-game HUD (plan 03).
- Redesign of modals, deed card, lobby, landing, launcher, victory (plan 04).
- Scene lighting, table, WebGL colors, `boardVisualTokens.ts` (plan 02).
- 3D models (plan 05).
- Dark mode (not planned).
- Changing player color hex values (Phase 3 contract; keep).
- Changing the board SDF font.

---

## 7. Constraints and Invariants

1. Tokens stay centralized in `design-system/tokens/*.css` (including z-index layers,
   which later plans add to `tokens/zIndex.css`); no hard-coded hex in new component CSS
   (Phase 1 rule).
2. "Không dùng màu player làm màu UI global": player colors are used only on
   elements that belong to that player (avatar ring, owned-tile marker, name
   underline), never as global chrome.
3. Avoid decorative gradients (Phase 1). Allowed: subtle lighting gradients on
   tactile buttons and the paper grain texture.
4. All fonts local through Fontsource; no CDN or Google Fonts URL (packaged
   Electron CSP is `font-src 'self' data:`).
5. `Button` public API stays compatible (`variant`, `busy`, `icon`, `children`,
   HTML attributes). Existing tests (`Button.test.tsx`, Lobby/Board/App tests,
   `e2e/mobile-host.spec.ts`) must keep passing or be updated with an explicit
   reason in the commit.
6. Central `Modal`/`ConfirmationDialog`/`Toast` remain the only prompt primitives.
7. The UAT harness is extended, not duplicated (Phase 4 rule). The Design Lab is a
   view inside the same gate and must never ship in production builds (the
   virtual module stub stays empty without `VITE_PHASE4_UAT=1`).
8. Player-facing copy is Vietnamese. The Design Lab may use English section
   labels because it is a dev tool.
9. Touch targets ≥ 44×44 CSS px for primary controls (Phase 7.2 rule; e2e asserts it).
10. No new runtime dependency except the display font package. The capture tool
    uses the existing `@playwright/test` dev dependency.

---

## 8. Design Specification

### 8.1 Art direction brief — "Tabletop Toy Vietnam"

> A premium toy board game on a warm wooden table, lit like a product photo,
> with Vietnamese craft accents. Calm when idle, joyful at key moments, always
> readable.

**Pillars**

| # | Pillar | Meaning in practice |
| --- | --- | --- |
| P1 | Physical and tactile | Everything reads as an object: thickness, bevels, soft contact shadows, glossy toy plastic, paper cards, wooden table. Buttons have a lip and press down. |
| P2 | Readable first (the 1-second rule) | In one second a player can answer: whose turn, how much money everyone has, who owns this tile, what just happened. Decoration never competes with these answers. |
| P3 | Vietnamese warmth | Palette from Vietnamese crafts: sơn mài lacquer red and black, vàng lá gold leaf, giấy dó paper, gốm Bát Tràng cobalt blue, ngọc jade. Vietnamese landmarks and tube houses (plan 05). Tết-like celebration only for big wins. |
| P4 | Calm board, loud moments | Idle state is quiet: no loops, no glow. Emphasis is spent on buy, build, card, jail, bankruptcy, victory, and turn start. |
| P5 | One system for DOM and WebGL | Scene colors and UI colors come from the same palette (`palette.ts` mirrors `palette.css`). |

**Reference board** (learn from, never copy assets)

| Reference | What to learn |
| --- | --- |
| Business Tour | Corner player panels, center dice zone, landmark as the top development tier. |
| Monopoly GO | Chunky tactile buttons, juicy money counters, big celebratory money moments. |
| Mario Party Jamboree | Toy-diorama lighting, soft shadows, bold turn banners. |
| Animal Crossing: New Horizons UI | Warm paper panels, friendly rounded type, calm idle UI. |
| Supercell UI (Clash Royale) | Button depth language that stays readable over busy scenes. |
| Rento Fortune | Board on a table, deed cards as physical cards. |
| Sơn mài, tranh Đông Hồ, gốm Bát Tràng, đèn lồng Hội An | Palette, paper texture, pattern motifs, lantern warmth. |

**Anti-goals**: Liquid Glass / glassmorphism as primary surfaces (DR-01), neon,
photorealism, heavy gradients, dark UI, generic web-form look, English
player-facing copy, decoration that hides tiles or money.

### 8.2 Primitive palette (`--otb-*`)

All values were contrast-checked on 2026-09-29 (WCAG 2.x relative luminance).

| Token | Hex | Role |
| --- | --- | --- |
| `--otb-paper-50` | `#FFFBF3` | Primary surface (panels, cards, modals) |
| `--otb-paper-100` | `#FBF3E4` | Secondary surface, list rows |
| `--otb-paper-200` | `#F2E4CC` | Tertiary fill, disabled fill, dividers |
| `--otb-paper-300` | `#E6D2B2` | Strong border on paper |
| `--otb-ink-900` | `#2B1D14` | Primary text, icons |
| `--otb-ink-700` | `#5A4636` | Secondary text |
| `--otb-ink-500` | `#7A6553` | Muted text (only on paper-50/100/white) |
| `--otb-ink-alpha-12` | `rgb(43 29 20 / 12%)` | Hairline borders |
| `--otb-lacquer-600` | `#C4302B` | Primary action fill, danger, money loss text |
| `--otb-lacquer-700` | `#A32520` | Primary lip/pressed, text on lacquer-100 |
| `--otb-lacquer-100` | `#FBE3DF` | Soft red background |
| `--otb-gold-400` | `#F2B632` | Money/turn highlight fill, active-turn ring |
| `--otb-gold-700` | `#8C6200` | Gold text on paper |
| `--otb-gold-100` | `#FDF0CF` | Soft gold background |
| `--otb-jade-600` | `#177A63` | Secondary action fill |
| `--otb-jade-700` | `#0F5E4C` | Secondary lip, text on jade-100 |
| `--otb-jade-100` | `#DDF3EC` | Soft jade background |
| `--otb-blue-600` | `#1F4E9C` | Info, links, focus ring |
| `--otb-blue-100` | `#E1EAF8` | Soft info background |
| `--otb-gain-600` | `#1E7F3C` | Money gain text on paper |
| `--otb-gain-700` | `#166B31` | Gain text on gain-100 |
| `--otb-gain-100` | `#DDF3E3` | Soft gain background |
| `--otb-warn-400` | `#FFB020` | Warning fill (ink text) |
| `--otb-warn-700` | `#8A4F00` | Warning text |
| `--otb-warn-100` | `#FFF0CC` | Soft warning background |
| `--otb-white` | `#FFFFFF` | Text on lacquer/jade/blue |
| `--otb-table-oak` | `#DDBB8F` | Scene: light oak table base (OD-01-2 = B; plan 02 starting value) |
| `--otb-table-oak-dark` | `#B08A5F` | Scene: table grain, plank seams, table edge |
| `--otb-backdrop` | `#F4E6D0` | DOM behind the canvas before first frame |

**Verified contrast pairs** (must be encoded in the contrast test):

| Foreground on background | Ratio | Level |
| --- | --- | --- |
| ink-900 on paper-50 / paper-100 | 15.79 / 14.78 | AAA |
| ink-700 on paper-50 / paper-100 / paper-200 | 8.61 / 8.05 / 7.08 | AAA |
| ink-500 on paper-50 / paper-100 / white | 5.33 / 4.99 / 5.51 | AA |
| ink-500 on paper-200 | 4.39 | **Large text only**: never use muted text on paper-200 |
| white on lacquer-600 / lacquer-700 | 5.52 / 7.39 | AA / AAA |
| lacquer-700 on lacquer-100 | 6.03 | AA |
| ink-900 on gold-400 / gold-100 | 8.93 / 14.39 | AAA |
| gold-700 on paper-50 / gold-100 | 5.27 / 4.80 | AA |
| white on jade-600 / jade-700 | 5.25 / 7.70 | AA / AAA |
| jade-700 on jade-100 | 6.64 | AA |
| white on blue-600; blue-600 on blue-100 | 7.99; 6.59 | AAA; AA |
| gain-600 on paper-50 / paper-100 | 4.90 / 4.58 | AA |
| gain-700 on gain-100 | 5.66 | AA |
| lacquer-600 (loss) on paper-50 / paper-100 | 5.35 / 5.00 | AA |
| warn-700 on paper-50 / warn-100 | 6.36 / 5.81 | AA |
| ink-900 on warn-400 | 8.91 | AAA |
| blue-600 focus ring vs paper-50 / table-oak (`#DDBB8F`) | 7.74 / 4.41 | ≥ 3:1 non-text |
| ink-900 on table-oak (`#DDBB8F`) | 8.99 | AAA (any text drawn directly on the table color) |

Note: paper-50 panels on the light oak table are only 1.76:1 apart, so HUD panels over
the table must always carry `--elevation-2` and the 1px `--color-border` to separate
from the background (plan 03 player cards, action dock).

### 8.3 Semantic tokens v2

Semantic names are what components use. Keep every existing `--color-*` name as
an alias so current CSS keeps working, and add the new names:

| Semantic token | v2 value | Replaces / notes |
| --- | --- | --- |
| `--color-canvas` | paper-50 | was `#f7fffd` |
| `--color-canvas-deep` | `--otb-backdrop` | was teal `#55dcc8`. Its in-game uses (`.game-board` in `BoardShell.css`, `.game-scene` in `GameScene.css`, legacy `.Board` in `Board.css`) are moved by plan 02 to a new `--color-scene-backdrop` token (table mid tone); this plan does not edit those files |
| `--color-surface` / `--color-surface-raised` | paper-50 | |
| `--color-surface-soft` | paper-100 | was mint `#d5fbf4` |
| `--color-surface-sunken` (new) | paper-200 | inputs, wells |
| `--color-text-primary` / `-secondary` / `-muted` | ink-900 / ink-700 / ink-500 | |
| `--color-text-inverse` | white | |
| `--color-accent-primary` / `-strong` / `-soft` | lacquer-600 / lacquer-700 / lacquer-100 | was pink `#ff315f` |
| `--color-accent-secondary` / `-strong` / `-soft` | jade-600 / jade-700 / jade-100 | was teal `#00c8b5` |
| `--color-success` / `-strong` / `-soft` | gain-600 / gain-700 / gain-100 | |
| `--color-warning` / `--color-warning-strong` (new) / `-soft` | warn-400 / warn-700 / warn-100 | adds the missing strong token |
| `--color-danger` / `-strong` / `-soft` | lacquer-600 / lacquer-700 / lacquer-100 | |
| `--color-info` / `-strong` / `-soft` | blue-600 / blue-600 / blue-100 | |
| `--color-border` / `--color-border-strong` | ink-alpha-12 / paper-300 | was teal borders |
| `--color-focus` | blue-600 | |
| `--color-overlay` | `rgb(43 29 20 / 38%)` | warm dim, no blur |
| `--color-shadow` | `rgb(43 29 20 / 18%)` | warm shadows |
| `--color-money-gain` / `--color-money-loss` (new) | gain-600 / lacquer-600 | |
| `--color-turn-active` (new) | gold-400 | active-turn ring/highlight |
| `--color-action-primary-{face,lip,text}` (new) | lacquer-600 / lacquer-700 / white | tactile button |
| `--color-action-secondary-{face,lip,text}` (new) | jade-600 / jade-700 / white | |
| `--color-action-neutral-{face,lip,text}` (new) | paper-50 / paper-300 / ink-900 | ghost-like tactile |

Usage rules:

- Money gains use `--color-money-gain`; losses use `--color-money-loss` **plus a sign
  and icon** (never color alone).
- Gold is for money and "your turn"; it is never a button face.
- District colors (§8.4) appear only where a property is identified (deed header,
  group pip, tile swatch).
- Player colors (§8.5) appear only on player-owned elements.

### 8.4 District colors (DOM) — replace values in `propertyVisualColors.ts`

Header text color is chosen for ≥ 4.5:1. The hue identity of each group is kept
(classic Monopoly order), tuned to the craft palette.

| Group | `color` | Header text | Ratio | Motif (unchanged) |
| --- | --- | --- | --- | --- |
| brown | `#8D5B3E` | white | 5.68 | brick |
| lightblue | `#6EC3E8` | ink-900 | 8.25 | water |
| pink | `#E97BAA` | ink-900 | 6.11 | shopping |
| orange | `#F2913A` | ink-900 | 6.90 | market |
| red | `#C9402F` | white | 4.93 | downtown |
| yellow | `#F2C230` | ink-900 | 9.73 | nightlife |
| green | `#3FA35B` | ink-900 | 5.12 | eco |
| blue | `#2F5FB8` | white | 6.09 | luxury |
| railroad | `#3D3A36` | white | 11.31 | rail |
| utility (new entry) | `#7C8A93` | ink-900 | 4.59 | — |

Add a `headerText` field to `PropertyGroupVisualStyle` so consumers never guess.
Keep `tint` values but re-derive them as 12–16% mixes of `color` over paper-50.
The 3D district textures are not changed by this plan (plan 02 harmonizes them).

### 8.5 Player colors

Keep the 10 Phase 3 values in `playerVisualColors.ts` (they are part of the
appearance contract and appear in snapshots only as IDs, but tests pin them).
Rules for v2:

- Render player identity as **mascot + name + color ring**, never color alone.
- Confusable pairs under color-vision deficiency: red/pink/orange, blue/cyan,
  green/lime, yellow/orange. The HUD must always show the mascot next to the
  color (plan 03 enforces this).
- Ring width 3px on avatars; owned-tile markers use the player color plus the
  owner's mascot glyph (plan 03/05).

### 8.6 Typography

| Role | Family | Weights | Where |
| --- | --- | --- | --- |
| Display | **Baloo 2** (`@fontsource/baloo-2`, OFL-1.1, subsets include `vietnamese`, verified via the Fontsource API on 2026-09-29) | 600, 700, 800 | Screen titles, room code, money in player cards, CTA labels, turn banner, deed card title, victory |
| UI / body | Be Vietnam Pro (installed) | 500, 600, 700, 800 | Everything else |
| Board SDF | Be Vietnam Pro ExtraBold TTF (unchanged) | 800 | Troika tile text |

Do not use Fredoka: it has no Vietnamese subset. Fallback candidates if Baloo 2
is rejected at G1: Nunito, Quicksand, Paytone One (all have Vietnamese subsets).

Tokens:

```css
--font-family-display: 'Baloo 2', 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif;
--font-family-body: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; /* unchanged */
```

Type scale (rem at 16px root; line-height in px):

| Token | Size / line | Family / weight | Use |
| --- | --- | --- | --- |
| `--type-caption` | 12 / 16 | body 600 | badges, meta |
| `--type-small` | 14 / 20 | body 500 | secondary text |
| `--type-body` | 16 / 24 | body 500 | default |
| `--type-label` | 16 / 20 | body 700 | buttons (UI), field labels |
| `--type-title-s` | 20 / 26 | display 700 | panel titles |
| `--type-title-m` | 24 / 30 | display 700 | modal titles |
| `--type-title-l` | 32 / 40 | display 800 | screen titles |
| `--type-display` | 40 / 48 | display 800 | room code, victory name |
| `--type-money-l` | 28 / 34 | display 800 | player-card money |
| `--type-hero` | 56 / 66 | display 800 | landing hero |

Rules:

- Vietnamese stacked diacritics need room: display line-height ≥ 1.18. Test
  string, which must render without clipping at every display size:
  `Cờ Tỷ Phú Việt Nam · Buôn Ma Thuột · Đà Nẵng · Phú Quốc · Ỷ Ẫ Ự Ữ Ỹ ở ổ ỡ ợ`.
- All-caps only for short eyebrow labels (≤ 3 words) with `letter-spacing: 0.08em`.
- Money uses `font-variant-numeric: tabular-nums`. If Baloo 2 does not support
  `tnum`, animated counters must use Be Vietnam Pro 800 (tabular) and static
  large numbers may use Baloo 2. The Design Lab must show both and the choice is
  recorded in §18.
- Import only the needed subsets/weights, e.g.
  `@fontsource/baloo-2/vietnamese-700.css` and `latin-700.css` (verify the exact
  file names in the installed package).

### 8.7 Shape, depth and surfaces

| Token | Value |
| --- | --- |
| `--radius-xs` / `-sm` / `-md` / `-lg` / `-xl` / `-pill` | 6 / 10 / 14 / 20 / 28 px / 999px (keep old names as aliases: small→sm, medium→md, large→lg, extra-large→xl) |
| `--elevation-1` | `0 1px 0 rgb(43 29 20 / 12%), 0 2px 6px rgb(43 29 20 / 10%)` (chips) |
| `--elevation-2` | `0 2px 0 rgb(43 29 20 / 10%), 0 8px 24px rgb(43 29 20 / 16%)` (panels, cards) |
| `--elevation-3` | `0 4px 0 rgb(43 29 20 / 8%), 0 24px 64px rgb(43 29 20 / 28%)` (modals) |
| `--focus-ring` | `0 0 0 2px var(--otb-paper-50), 0 0 0 5px var(--otb-blue-600)` (double ring, visible on any background) |

**Tactile button recipe** (Button v2):

- Face: `--color-action-*-face`; lip: `box-shadow: 0 4px 0 var(--color-action-*-lip)`;
  inner highlight `inset 0 1px 0 rgb(255 255 255 / 30%)`; plus `--elevation-1`.
- Hover: face `filter: brightness(1.04)`, translateY(-1px).
- Active: translateY(3px), lip 1px.
- Disabled: face paper-200, text ink-700 (7.08:1; ink-500 on paper-200 is only 4.39:1
  and is forbidden by §8.2), no lip, 70% opacity on the icon, `cursor: not-allowed`.
- Focus-visible: `--focus-ring` in addition to the lip.
- Sizes: `sm` 36px tall (desktop chrome only), `md` 44px (default), `lg` 56px (primary
  CTAs in dialogs), `xl` 64px (the single hero CTA, e.g. plan 03's "Đổ xúc xắc").
- Label: `--type-label`; `lg`/`xl` use display 700 at 18–22px.

**Panel recipe**: paper-50 fill, 1px `--color-border`, `--elevation-2`,
`--radius-lg`; optional paper grain (inline SVG noise data URI at 3–4% opacity
as `background-image`; must be under 2 KB and disabled for `low` quality if
plan 02 introduces tiers).

**Frosted exception (DR-01)**: only the chat drawer backdrop and tooltips may
use `backdrop-filter: blur(12px)` over a ≥ 72%-opaque paper fill; numbers and
decision text never sit on frosted surfaces.

### 8.8 Iconography

- UI chrome keeps `lucide-react` (stroke 2, rounded), sizes 16/20/24.
- Add `apps/client/src/design-system/icons/actionIcons.ts`: the **single
  registry** of semantic action names to Lucide components, and
  `ActionIcon.tsx` (`<ActionIcon name="roll" />`, `aria-hidden` by default).
  It encodes the current convention:

| Semantic name | Lucide icon |
| --- | --- |
| `settings` | Settings |
| `leave` | LogOut |
| `forfeit` | Flag |
| `close`, `cancel`, `unready`, `decline` | X |
| `confirm`, `accept`, `ready` | Check |
| `start` | Play |
| `retry`, `refresh` | RefreshCw |
| `reset`, `playAgain` | RotateCcw |
| `join` | LogIn |
| `back` | ArrowLeft |
| `host`, `stopHost`, `configuredServer` | Server, Square, Plug |
| `copy` | Copy |
| `send`, `chat` | Send, MessageCircle |
| `roll` | Dices |
| `buy` | ShoppingCart |
| `build`, `buildHotel` | HousePlus, Building2 |
| `skip` | SkipForward |
| `bail`, `jailCard` | Unlock, TicketCheck |
| `sellToBank`, `propose` | Landmark, Handshake |
| `view`, `sellHouse`, `reject` | Eye, CircleMinus, CircleX |
| `offline` | WifiOff |
| `previous`, `next` | ChevronLeft, ChevronRight |

- Existing components are migrated to the registry only when a later plan
  touches them (no churn in this plan).
- Game glyphs (coin, deed, house, hotel, jail, card decks) as colored SVG are
  optional work for plans 03/04; if added, they live in
  `design-system/icons/game/` and follow the card-art safety rules (no scripts,
  no external refs).

### 8.9 Motion

| Token | Value | Use |
| --- | --- | --- |
| `--motion-duration-micro` | 120ms | hover, press |
| `--motion-duration-ui` | 200ms | toggles, chips |
| `--motion-duration-panel` | 280ms | drawers, sheets, modals |
| `--motion-duration-emphasis` | 480ms | turn banner in/out, money counter |
| `--motion-duration-celebration` | 900ms | victory, landmark completion (never longer than 1200ms) |
| `--motion-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | enter |
| `--motion-ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | move |
| Framer spring (TS mirror) | `{ stiffness: 520, damping: 32 }` | pops |

Rules:

- **Chrome motion** (hover, press, modal enter, drawer) is not scaled by the
  gameplay animation speed.
- **Presentation-linked HUD motion** (money counters, turn banner, dice callout)
  takes its duration from the existing presentation timing config and the speed
  multiplier; it never uses ad-hoc `setTimeout` chains.
- Reduced motion (effective = setting OR OS): transforms are removed, opacity
  fades ≤ 120ms, no bounce/particles; information still appears.
- **Bridge**: set `document.documentElement.dataset.reducedMotion = 'true' | 'false'`
  from `useEffectiveReducedMotion()`; `motion.css` zeroes durations under
  `:root[data-reduced-motion='true']` in addition to the media query.
- `design-system/motion/motionTokens.ts` becomes the TS mirror of these tokens
  (it is currently unused); Modal and Toast import from it.

### 8.10 Copy and tone

- Vietnamese, short, verb-first on buttons: "Đổ xúc xắc", "Mua ngay", "Bỏ qua",
  "Xây nhà", "Đóng".
- Numbers always via `formatMoney` (`1.500.000 ₫`).
- Disabled controls explain why nearby ("Cần ít nhất 2 người chơi sẵn sàng").
- No English in player-facing UI (current exceptions such as `Dog`,
  `Host Game`, and `Join Game` are fixed in plan 04).

### 8.11 Layout foundations

- 4px base grid; spacing tokens unchanged (`--space-1…8`).
- Safe areas: honor `env(safe-area-inset-*)` on every fixed element.
- HUD safe insets (used by plan 03): desktop 16px from viewport edges, phone
  landscape 8px plus safe-area insets.

---

## 9. Technical Approach

### 9.1 Theme switch strategy (side-by-side, low risk)

1. Add primitive tokens in a new `tokens/palette.css` (loaded by
   `tokens/index.css`), always present.
2. Put v2 semantic values under `:root[data-visual-theme='v2'] { … }` in
   `colors.css`, `typography.css`, `radius.css`, `shadows.css`, and `motion.css`.
   v1 values stay under `:root`.
3. Primitive v2 styles key off the same attribute (e.g.
   `:root[data-visual-theme='v2'] .ds-button { … }`). Wrap v2 selectors in
   `:where()` so specificity stays at one class and the existing cascade-order
   hazard between `Dashboard.css` and `Button.css` is not changed.
4. The Design Lab sets the attribute locally and offers a v1/v2 toggle.
5. After G1, task T01.12 sets `data-visual-theme="v2"` on `<html>` at startup
   (`apps/client/src/index.tsx` or `AppBootstrap.tsx`) and in `index.html` to
   avoid a first-paint flash.
6. When plans 03/04 finish, a cleanup task removes the v1 values (tracked in §18).

### 9.2 TS mirror and contrast utility

- `design-system/tokens/palette.ts` exports `OTB_PALETTE` (same hex values) and
  `CONTRAST_REQUIREMENTS` (the pairs from §8.2 with the minimum ratio).
- `design-system/tokens/contrast.ts` exports `relativeLuminance(hex)` and
  `contrastRatio(a, b)`.
- `palette.test.ts` parses `palette.css` as text and asserts every `--otb-*`
  value equals `OTB_PALETTE`; asserts every `CONTRAST_REQUIREMENTS` entry passes.
- Plan 02 imports `OTB_PALETTE` for scene colors (single source for DOM and WebGL).

### 9.3 Fonts

- `pnpm --filter @monopoly/client add @fontsource/baloo-2`.
- Import only the needed weights and subsets in `typography.css`.
- The Electron MIME map already serves `.woff2` (`apps/desktop/src/rendererContentType.ts`).
- Verify in the packaged build that the Baloo 2 files are present under the
  renderer `assets/` directory (`pnpm desktop:package`, then inspect).

### 9.4 Primitives v2 (all in `apps/client/src/design-system/components/`)

| Component | API (TypeScript) | Notes |
| --- | --- | --- |
| `Button` (update) | existing props + `size?: 'sm'\|'md'\|'lg'\|'xl'`; `type` defaults to `'button'` | Audit every `Button` inside a `<form>` and add `type="submit"` where it submits; add a test for the default. |
| `IconButton` (update) | `{ label: string; icon: ActionIconName \| ReactNode; size?: 'md'\|'lg'; pressed?: boolean; badge?: string \| number } & ButtonHTMLAttributes` | Tactile round button; `aria-label` = label, `title` = label; badge for unread counts. Used by plan 03 toolbar. |
| `Panel` (rename `GamePanel` → `Panel`, keep a re-export) | `{ title?: ReactNode; tone?: 'paper'\|'soft'\|'sunken'; padding?: 'sm'\|'md'\|'lg'; as?: 'section'\|'div'\|'aside'; children }` | Panel recipe §8.7. |
| `Badge` (update) | variants unchanged + contrast-safe colors | warning uses warn-100/warn-700. |
| `Chip` (new) | `{ tone: 'neutral'\|'gain'\|'loss'\|'info'\|'gold'; icon?; children }` | Small pill for status. |
| `SegmentedControl` (new) | `{ label: string; options: {value,label}[]; value; onChange }` | Radiogroup semantics, arrow keys; used by Settings (plan 04) for speed. |
| `Switch` (new) | `{ label; checked; onChange; description? }` | `role="switch"`; used for reduced motion/fullscreen. |
| `Slider` (new) | `{ label; value; min; max; step; onChange; formatValue? }` | Styled `input[type=range]` + `<output>`; keeps native semantics. |
| `MoneyText` (new) | `{ amount: number; size?: 'sm'\|'md'\|'lg'; tone?: 'default'\|'gain'\|'loss'; signed?: boolean }` | Always uses `formatMoney`; tabular numerals; sign + icon for tones. |
| `DeltaChip` (new) | `{ delta: number; reducedMotion: boolean }` | `+100.000 ₫` / `−6.000 ₫` with icon; pure presentational (plan 03 drives lifecycle). |
| `PlayerAvatar` (new) | `{ characterId; colorId; size?: number; active?: boolean; status?: 'online'\|'offline'\|'bankrupt'\|'left' }` (px; presets used by plans 03/04: 32, 36, 44, 48, 56, 64, 128; ring scales 2–4px) | Uses `colorizeCharacterSvg`/`characterSvgDataUri`; 3px color ring; gold turn ring when `active`; greyscale for bankrupt/left. `alt` = `Mascot <accessibleLabel>` (Vietnamese, e.g. "Mascot Chó"; plan 04 OD-04-1: mascot names are never visible text, no `title`). |
| `GroupPips` (new) | `{ groups: Array<{ group: string; owned: number; total: number }> }` | 8 small squares in district colors; filled count; full outline when complete; `aria-label` summary. |

Every primitive: CSS in the component folder, tokens only, reduced-motion
respected, unit test for rendering, accessible name, and disabled state where
applicable.

### 9.5 Harness extensions (dev-only)

In `Phase4UatHarness.tsx`:

- `?scenario=<key>` selects the initial scenario (validate against the scenario
  list; ignore unknown keys).
- `?uat-controls=collapsed` starts with controls collapsed.
- Add a stable readiness marker that survives collapsed controls: set
  `data-uat-ready="true"` (and `data-scenario`, already present) on `main.phase4-uat`
  once the scenario has settled. Today the visible `[data-testid="renderer-metrics"]`
  output sits inside the collapsible controls block, so it cannot be used as a wait
  condition for clean screenshots.
- `?design-lab=1` renders `apps/client/src/dev/design-lab/DesignLab.tsx` instead of
  the board (same pattern as `card-gallery=1`), with `&section=<id>` optional.

### 9.6 Design Lab content

`apps/client/src/dev/design-lab/` with sections:

1. **Tokens**: swatches (name, hex, role) and a live contrast matrix computed with
   `contrastRatio`.
2. **Typography**: both families, every scale step, the Vietnamese stress string,
   money counter demo (tabular vs proportional), line-height clipping check.
3. **Components**: every primitive in every state (default, hover via
   `:hover`-forcing class, active, focus, disabled, busy), sizes, both themes.
4. **Game UI concepts**: static player cards (idle, active turn, in jail,
   disconnected, bankrupt, left), delta chips, turn banner concept, deed card
   concept, action dock concept.
5. **Scene palette**: light oak table/backdrop swatches next to district and player
   colors (input for plan 02).
6. **Screens (concepts)**:
   - *HUD concept*: the real `Board` from the harness `stations-4` fixture with an
     absolutely positioned overlay of the concept player cards, status pill, and
     action dock (static data from the fixture). Label it "Concept — not the
     final HUD".
   - *Purchase concept*: concept deed card + two actions on a dimmed background.
   - *Lobby concept*: four seat cards + mascot stage + color swatches.
   - *Landing concept*: hero lockup + join card.

The concepts reuse the primitives; they are review material, not production
components. Plans 03/04 build the production versions.

### 9.7 Capture tool

- `playwright.visual.config.ts` (root): `webServer` runs
  `pnpm --filter @monopoly/client exec vite --mode phase4-uat` on
  `http://127.0.0.1:5173`; no global setup (no database); Chromium only;
  `use.launchOptions.args` include `--use-angle=swiftshader`,
  `--enable-unsafe-swiftshader`, and `--ignore-gpu-blocklist` so WebGL2 works headless
  (verify; if WebGL is unavailable, run headed with `--headed`).
- `e2e/visual/captures.ts`: a typed manifest
  `{ id, plan, url, viewport, waitFor, name }[]`.
- `e2e/visual/capture.visual.ts`: for each entry, open the URL, wait for
  `main.phase4-uat[data-uat-ready="true"]` (or the Design Lab's
  `[data-design-lab-ready="true"]`), and in WebGL mode also wait until
  `window.__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__` is defined (or the
  `own-the-block-renderer` event fired); legacy-board captures skip the diagnostics
  wait. Then wait for network idle + two animation frames, save
  `project-document/visual-overhaul-v2/evidence/<plan>/<name>-<w>x<h>.png`, and write a
  sidecar JSON with the renderer diagnostics (when present).
- Root script: `"visual:capture": "playwright test -c playwright.visual.config.ts"`.
  It is not part of `pnpm test` (capture, not assertion).

---

## 10. Execution Guide

Do the tasks in order. Each task is one commit (or a small series) with its ID
in the message.

### T01.0 — Preflight

1. Create the branch; read README, this plan, `CLAUDE.md`,
   `monopoly.client.instructions.md` (rule 7), `Client/README.md`.
2. Run `pnpm typecheck && pnpm lint && pnpm test` and record the baseline result
   in §18 (if something fails before you change anything, record it and do not
   fix unrelated failures).
3. Start the harness (README §7.4) and confirm `?phase4-uat=1` renders.

**Accept when:** baseline results recorded.

### T01.1 — Harness URL parameters

1. Implement `scenario` and `uat-controls` params and the `data-uat-ready` marker (§9.5).
2. Unit test: rendering the harness with `?phase4-uat=1&scenario=rent` selects
   `rent`; an unknown scenario falls back to the default; `uat-controls=collapsed`
   hides the panel; `data-uat-ready` becomes `"true"` after the scenario settles and
   resets while a scenario replays.

**Accept when:** tests pass; production build still contains no harness code
(check the `dist` bundle for a harness string such as `Kịch bản`).

### T01.2 — Capture tooling and baseline evidence

1. Add the Playwright visual config, manifest, and spec (§9.7).
2. Add baseline captures: `stations-4`, `board-readability`, `purchase`, `rent`,
   `chance`, `jail`, `stress` at 1920×1080, 1440×900, 1280×720, 812×375.
3. Run `pnpm visual:capture`; commit the PNGs under `evidence/01/baseline/`.

**Accept when:** two consecutive runs produce the same file set; sidecar JSON
contains draw calls/triangles.

### T01.3 — Primitive palette, TS mirror, contrast utility

1. Create `tokens/palette.css`, `tokens/palette.ts`, `tokens/contrast.ts`.
2. Create `palette.test.ts` (parity + contrast requirements from §8.2).

**Accept when:** tests pass; no visual change in the app (tokens unused yet).

### T01.4 — Semantic tokens v2 (theme-scoped)

1. Add v2 semantic values under `:root[data-visual-theme='v2']` (§8.3, §8.7),
   including the new names (`--color-money-*`, `--color-turn-active`,
   `--color-action-*`, `--color-surface-sunken`, `--color-warning-strong`,
   `--elevation-*`, `--focus-ring`, new radius names with aliases).
2. Add `headerText` to `propertyVisualColors.ts` and the v2 district values
   behind a small theme-aware accessor (`getPropertyGroupVisualStyle(color, theme)`
   or a v2 table selected by the attribute); keep v1 output unchanged by default.

**Accept when:** with no attribute set, the app renders exactly as before
(compare evidence captures); with the attribute set in the Lab, v2 values apply.

### T01.5 — Typography

1. Add `@fontsource/baloo-2`; import the needed weights/subsets.
2. Add `--font-family-display` and the type scale tokens (§8.6).
3. Lab typography section including the stress string and the tabular test.

**Accept when:** stress string renders unclipped at all display sizes in
Chromium and WebKit (capture both); the `tnum` decision is recorded in §18.

### T01.6 — Motion tokens and reduced-motion bridge

1. Update `motion.css` with the v2 duration/easing tokens (keep old names as aliases).
2. Implement the DOM bridge (§8.9) in the settings layer (e.g., a
   `ReducedMotionDocumentSync` component mounted inside `SettingsProvider`).
3. Turn `motionTokens.ts` into the TS mirror; make `Modal` and `ToastView` import it.
4. Tests: toggling the setting sets `data-reduced-motion`; CSS token override exists
   (text assertion on `motion.css`).

**Accept when:** tests pass; `e2e/mobile-host.spec.ts` reduced-motion assertions
still pass.

### T01.7 — Primitives v2

1. Implement/upgrade the components in §9.4.
2. `Button` default `type="button"`: grep all `<Button` usages inside forms and add
   explicit `type="submit"` where they submit (verify with the tests of those
   components).
3. Unit tests for every primitive (render, accessible name, disabled/busy,
   keyboard for SegmentedControl/Switch, `MoneyText` formatting and sign).

**Accept when:** tests pass; with the v1 theme the existing screens are unchanged
(capture comparison); v2 styles only apply under the attribute.

### T01.8 — Action icon registry

1. Add `actionIcons.ts` (§8.8) and `ActionIcon.tsx`.
2. Test: every name renders an `svg` with `aria-hidden="true"`; names are unique;
   the registry type is exhaustive (`satisfies Record<ActionIconName, LucideIcon>`).

**Accept when:** tests pass; no existing component changed.

### T01.9 — Design Lab: tokens, typography, components, game UI concepts

1. Implement sections 1–5 of §9.6 with a sticky v1/v2 toggle and a section nav.
2. Add Lab captures to the capture manifest (each section at 1440×900 and 812×375).

**Accept when:** Lab renders without console errors; captures reproducible.

### T01.10 — Design Lab: concept screens

1. Implement the four concept screens (§9.6 item 6).
2. Capture each at 1920×1080, 1440×900, 1280×720, 812×375.

**Accept when:** concept screens render over the real harness board where
specified; no production component was modified to build them.

### T01.11 — Gate G1 review package (blocking)

1. Assemble `evidence/01/g1/` (Lab sections + concepts + baseline for comparison).
2. Fill the review checklist in §18 ("G1 checklist") with links to the images.
3. Ask the product owner to review the rendered result (the design choices themselves were decided on 2026-09-30, see §16).
4. Record the verdict (APPROVED / CHANGES REQUESTED) with date and notes in §18.
   If changes are requested, iterate T01.3–T01.10 and repeat T01.11.

**Accept when:** verdict APPROVED is recorded by a human. An agent must never
record approval on its own.

### T01.12 — Switch on the v2 theme (after G1 only)

1. Set `data-visual-theme="v2"` on `<html>` in `index.html` and at bootstrap.
2. Update `theme-color` and manifest `background_color` to paper/backdrop values.
3. Remove the custom `cursor.png` body cursor (OD-01-4 decided: OS default cursor);
   delete the `cursor` rule in `apps/client/src/index.css` and the unused
   `apps/client/src/cursor.png` if nothing else references it.
4. Run the full capture set; review every baseline surface for token-level
   regressions (contrast, invisible borders, wrong text color on new surfaces).
   Fix with token-level changes only; layout redesign stays in plans 03/04.
5. Run the common Definition of Done (README §9) including `pnpm test:e2e:mobile`.

**Accept when:** DoD green; capture set committed under `evidence/01/theme-v2/`.

### T01.13 — Documentation

1. Create `project-document/monopoly-websockets/Client/design-system.instruction.md`
   (AS-IS): token layers, semantic names, usage rules, primitives and their APIs,
   icon registry, motion rules, reduced-motion bridge, Design Lab and capture tool
   usage. Keep it in Vietnamese or English consistent with the neighboring
   Client docs (Client docs are Vietnamese: write it in Vietnamese).
2. Update `Client/README.md` (link the new doc; replace the pointer to
   `PHASE_1_IMPLEMENTATION_PLAN.md` for tokens).
3. Update `monopoly.client.instructions.md` rule 7 (list the primitives and the icon
   registry as the required building blocks).
4. Add a status pointer to this program in
   `project-document/ui-ux-overhaul/00_MASTERPLAN_UI_UX_OVERHAUL.md` §11.
5. Add testcase rows to
   `project-document/monopoly-websockets/testcase/client-state-sync-motion-and-accessibility.md`
   for: contrast test `[CLIENT][AUTOMATED]`, reduced-motion bridge
   `[CLIENT][AUTOMATED]`, Lab visual review `[MANUAL-E2E]`.

**Accept when:** docs updated in the same branch; links valid.

---

## 11. Testing and Verification

| Check | Type | Command / file |
| --- | --- | --- |
| Palette parity + contrast | AUTOMATED | `design-system/tokens/palette.test.ts` |
| Primitive behavior | AUTOMATED | `design-system/components/**/**.test.tsx` |
| Icon registry | AUTOMATED | `design-system/icons/actionIcons.test.tsx` |
| Reduced-motion bridge | AUTOMATED | settings test |
| Harness params | AUTOMATED | harness test |
| No harness in production bundle | AUTOMATED (script) or MANUAL | grep `dist` after `pnpm build` |
| Existing suites | AUTOMATED | `pnpm test`, `pnpm test:e2e:mobile` |
| Vietnamese diacritics, visual quality | MANUAL | Lab captures (Chromium + WebKit) |
| G1 approval | MANUAL (human only) | §18 |

---

## 12. Accessibility

- Contrast pairs enforced by test (§8.2).
- Focus ring double outline on every interactive primitive.
- `SegmentedControl` (radiogroup, arrow keys), `Switch` (`role="switch"`,
  `aria-checked`), `Slider` (native range + `<output>`).
- Color never the only signal: `MoneyText` tones carry sign + icon; `PlayerAvatar`
  status carries a text label (`aria-label` or visible).
- Reduced motion via the DOM bridge.
- Touch targets ≥ 44px for `md`/`lg`; `sm` only for desktop-only secondary chrome.

---

## 13. Documentation Updates (summary)

`Client/design-system.instruction.md` (new), `Client/README.md`,
`monopoly.client.instructions.md` rule 7, masterplan §11 pointer, testcase rows.
No change to CLAUDE.md is required by this plan.

---

## 14. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Direction rejected at G1 | Everything is theme-scoped; iterate tokens and concepts only. |
| Vietnamese diacritics clip in the display font | Line-height ≥ 1.18; stress test in Lab on Chromium and WebKit. |
| Baloo 2 lacks tabular figures | Use Be Vietnam Pro for animated counters (rule in §8.6). |
| `Button` default `type` breaks a form submit | Audit usages in forms; tests for JoinForm-like flows; explicit `type="submit"`. |
| CSS cascade order flips (Dashboard.css vs Button.css) | `:where()` wrappers keep specificity; do not import `Button` earlier in the `Board.tsx` chain. |
| Theme switch lowers contrast somewhere | Full capture sweep in T01.12; token-level fixes. |
| Headless WebGL unavailable for captures | SwiftShader flags; fall back to headed runs; document the machine used. |
| Fonts increase bundle size | Import only needed weights/subsets. |

---

## 15. Dependencies on Other Plans

- Plan 02 reads `OTB_PALETTE` for scene colors and uses the capture tool.
- Plans 03/04 use all primitives, tokens, and icon registry; they must not add
  parallel primitives.
- Plan 05 uses the capture tool and scene palette.

---

## 16. Decisions

All open decisions of this plan were answered by the product owner on 2026-09-30.
They are binding for implementation; change them only with a new product-owner
decision recorded here. G1 (T01.11) is still required: it approves the rendered
result in the Design Lab, not these choices.

| ID | Question | Options considered | Decision (product owner, 2026-09-30) |
| --- | --- | --- | --- |
| OD-01-1 | Display typeface | Baloo 2 / Nunito / Quicksand / Paytone One | **DECIDED: Baloo 2** |
| OD-01-2 | Table look (feeds plan 02) | A: warm oak table + jade felt mat; B: light oak table only | **DECIDED: B — light oak table only, no felt mat** (`--otb-table-oak #DDBB8F`, grain `#B08A5F`) |
| OD-01-3 | Primary action color | Lacquer red `#C4302B` / keep current pink `#ff315f` | **DECIDED: Lacquer red `#C4302B`** |
| OD-01-4 | Custom mouse cursor (`cursor.png`) | Remove (OS default) / redesign | **DECIDED: Remove** (OS default cursor) |
| OD-01-5 | Paper grain texture on panels | On / Off | **DECIDED: On (subtle), automatically off in the `low` graphics tier** |

---

## 17. Definition of Done

- [ ] T01.0–T01.13 complete and recorded in §18.
- [ ] G1 verdict APPROVED recorded by the product owner.
- [ ] v2 theme on globally; capture sweep committed.
- [ ] README §9 commands green, including `pnpm test:e2e:mobile` and desktop checks.
- [ ] No gameplay/server/protocol/persistence diff (`git diff --stat` limited to client
  design system, dev harness, settings bridge, docs, visual tooling).
- [ ] Documentation updated (§13).

---

## 18. Progress Log and Approval Record

| Date | Task | Commit | Evidence | Result / notes |
| --- | --- | --- | --- | --- |
| 2026-09-30 | T01.0 | — | — | Baseline on Node 24.21.0 / pnpm 11.15.1: typecheck OK, lint OK, test OK (client 562, server 173 passed + 11 skipped without PostgreSQL, desktop 77). Harness confirmed at `?phase4-uat=1` (WebGL, 227 draw calls on board-readability). |
| 2026-09-30 | T01.1 | eddb803 | — | Harness `scenario`, `uat-controls` (+ `hidden` extra) and `data-uat-ready`; `Phase4UatHarness.test.tsx`; production bundle has no `Kịch bản` (stub chunk 0.04 kB). |
| 2026-09-30 | T01.2 | 58e354f, b510dea | `evidence/01/baseline/` (28 PNG + JSON) | `pnpm visual:capture`; two consecutive runs gave the same file set; re-runs are byte-identical except the transient `stress` fixture. Chromium via the installed Chrome (`VISUAL_BROWSER_CHANNEL=chrome`); WebKit is not installed (NOT RUN). |
| 2026-09-30 | T01.3 | 8a84d95 | — | `palette.css/ts`, `contrast.ts`, `palette.test.ts` (66 assertions; every recorded contrast ratio within 0.02 of §8.2). |
| 2026-09-30 | T01.4 | 1e51658 | baseline re-run: 23/28 byte-identical, rent-1920x1080 differs by 1 px, stress non-deterministic | Semantic v2 tokens under `data-visual-theme="v2"`; theme-aware district colors with `headerText` (ratios within 0.02 of §8.4). |
| 2026-09-30 | T01.5 | 5cb3e84 | `evidence/01/lab/01-lab-typography-v2-*` | Baloo 2 700/800 through the combined CSS (per-subset files carry no unicode-range). Stress string renders unclipped in Chromium; WebKit NOT RUN. **tnum decision:** Baloo 2 tnum works (0 px vs 48 px proportional), Be Vietnam Pro tnum does not (58 px), so money uses Baloo 2 everywhere. |
| 2026-09-30 | T01.6 | 2880c7e | — | Motion tokens + `ReducedMotionDocumentSync`; tests for CSS/TS parity and the bridge. `e2e/mobile-host.spec.ts` (OS media query only) not run: PostgreSQL binaries were not approved for download. |
| 2026-09-30 | T01.7 | 8ec2eba | baseline re-run as T01.4 | Primitives v2 + tests; v1 unchanged. Audit: no design-system `Button` sits inside a `<form>`. Added an additive `accessibleLabel` to the character registry. |
| 2026-09-30 | T01.8 | 83accce | — | `actionIcons.ts`, `ActionIcon`, 42 assertions. |
| 2026-09-30 | T01.9–T01.10 | 125ca1d, 0def128 | `evidence/01/lab/`, `evidence/01/concepts/` | Design Lab sections + Purchase/Lobby/Landing/HUD concepts (HUD over the real board: 212 draw calls, 64,684 triangles). Committed as one change because the Lab shell imports every section. |
| 2026-09-30 | T01.11 | — | `evidence/01/g1/README.md` | G1 package assembled; verdict PENDING (human only). |
| 2026-09-30 | T01.13 | — | — | `Client/design-system.instruction.md` (new), Client README, client rule 7, masterplan §11 pointer, testcase rows. |

**G1 checklist** (product owner fills in):

- [x] Palette approved as rendered in the Lab (or changes listed)
- [x] Baloo 2 headlines render well in Vietnamese (choice decided in OD-01-1)
- [x] Light oak table swatch looks right next to the UI (choice decided in OD-01-2)
- [x] Lacquer-red primary buttons look right (choice decided in OD-01-3)
- [x] Button/panel depth language approved
- [x] HUD concept direction approved (details are decided in plan 03)
- [x] Deed card concept direction approved (details in plan 04)
- [x] Lobby/landing concept direction approved (details in plan 04)

| Reviewer | Date | Verdict | Notes |
| --- | --- | --- | --- |
| tvghung | 30/09/2026 | Approved | — |

---

## 19. Agent Handoff Prompt

```text
You are implementing plan V2-01 "Visual Target, Art Direction and Design Tokens V2"
in the Own the Block repository.

Read first, in order:
1. project-document/visual-overhaul-v2/README.md
2. project-document/visual-overhaul-v2/01_VISUAL_TARGET_AND_DESIGN_TOKENS.md
3. CLAUDE.md and project-document/monopoly-websockets/monopoly.client.instructions.md

Work on branch visual-v2/01-visual-target. Execute tasks T01.0 to T01.10 in order,
one commit per task with the task ID in the message. Follow the design
specification in section 8 exactly (token names, hex values, rules). Keep all v2
styles scoped under :root[data-visual-theme='v2'] until gate G1 is approved.
Do not change gameplay, server, protocol, persistence, scene lighting, or
production screen layouts. Player-facing text stays Vietnamese.

After T01.10, prepare the G1 package (T01.11) and stop: G1 approval must be given
by a human. Record progress, commits, evidence paths and test results in section 18.
Run pnpm typecheck, pnpm lint, pnpm test after every task; run pnpm test:e2e:mobile
before finishing. If you hit an invariant conflict or need a product decision,
add it to section 16 with a recommended default and continue with independent tasks.
```
