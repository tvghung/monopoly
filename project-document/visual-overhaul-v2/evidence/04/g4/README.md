# G4 review package — modals, cards and pre-game screens

Captured 2026-10-01 with `VISUAL_BROWSER_CHANNEL=chrome pnpm visual:capture --grep "04-g4"` (Chrome 154, SwiftShader,
deterministic) at commit `b80a347` (the last code commit of this package is `644cf15`; later commits only add documentation and
this manifest). The verdict belongs to the product owner and is recorded in `../../../04_MODALS_CARDS_AND_PREGAME_SCREENS.md`
§17; an agent never records it. Every image has a `.json` sidecar with the browser, the viewport and `consoleErrors`.
All **224 captures ran with zero console errors**.

Every dialog and screen below is the production component rendered on fixture state (no server): the Design Lab `surfaces`
section. `cards/` is different: the real game board (WebGL) with the card dialog over it, from the harness scenarios.

## 1. What is where

| Folder | What | Sizes |
| --- | --- | --- |
| `./` (`04-surface-<id>-<W>x<H>.png`) | 54 surfaces, listed in section 2 | 1440×900 (laptop), 1280×720 (minimum), 812×375 (phone landscape), 667×375 (smallest phone landscape) |
| `cards/` (`04-cards-<scenario>-<W>x<H>.png`) | Harness scenarios `chance`, `chest`, `reconnect-revealed`, `spectator-revealed`: the card over the live board | 1440×900, 812×375 |
| `../baseline/` | 17 surfaces *before* the restyle, for side-by-side comparison | 1440×900, 812×375 |

## 2. Surfaces by cluster

| Cluster | Ids |
| --- | --- |
| Landing and launcher | `landing`, `landing-prefilled`, `landing-public`, `landing-busy`, `launcher`, `launcher-running`, `launcher-host`, `launcher-join` |
| Lobby | `lobby-host`, `lobby-guest`, `lobby-alone`, `lobby-full`, `lobby-start-blocked`, `lobby-lan` |
| Settings | `settings`, `settings-desktop` (with the "Cửa sổ" section), `settings-reduced-motion` |
| Decisions | `buy`, `buy-short` (cannot afford: the reason is written), `development-houses`, `development-hotel`, `jail`, `debt-debtor`, `debt-debtor-sale-open`, `debt-observer`, `forced-sale-buyer`, `forced-sale-seller`, `trade`, `incoming-offers` |
| Deed, inspection, portfolios | `deeds` (every kind of tile), `inspection-street`, `inspection-own-street`, `inspection-railroad`, `inspection-unowned`, `inspection-special`, `assets`, `assets-empty`, `player-portfolio` |
| Card reveal | `card-chance`, `card-chest`, `card-waiting` (an observer: "Đang chờ người chơi đóng thẻ") |
| Victory | `winner-host`, `winner-guest`, `winner-spectator`, `winner-many-players` |
| Screens | `confirm-forfeit`, `toasts`, `loading`, `loading-restoring`, `bootstrap-error`, `failure-replaced`, `failure-error`, `connection`, `spectator` |

## 3. Checklist and where to look

| G4 checklist row (plan 04 §5.3 / §11 / §15) | Look at |
| --- | --- |
| Dead ends: every blocking dialog offers a way forward or out for every role | `winner-guest`, `winner-spectator` ("Rời phòng"), `debt-debtor` ("Bỏ cuộc"), `failure-replaced`, `failure-error` |
| Disabled primary actions say why | `buy-short`, `lobby-start-blocked`, `landing` ("Nhập tên của bạn để vào phòng."), `launcher-host` |
| Surfaces use the design-system primitives | any image; `grep` review in section 4 |
| Visual quality and Vietnamese typography | `deeds`, `inspection-*`, `landing`, `winner-host` (diacritics are not clipped) |
| Phone landscape is usable | every `*-812x375.png` and `*-667x375.png`; in particular `debt-debtor`, `trade`, `settings-desktop`, `winner-many-players`, `launcher-running` |
| V1 card contract | section 5 |
| WebKit rendering | **not in this package** (Chromium only); `pnpm test:e2e:mobile` runs the lobby and settings flow on WebKit (passed) |

## 4. Numbers and checks

- **Captures**: 224 PNG + 224 JSON, 0 console errors, about 33 MB.
- **English player-facing strings**: a grep review of the production components (`components/`, `app/`, `game/ui/`, `design-system/`,
  `settings/`, `App.tsx`) finds none; the only ASCII-only text is the brand mark "OWN THE BLOCK" (`aria-hidden`) and the
  development-only card gallery. Mascots show no name at all (image only).
- **Client tests**: 1438 passed in 179 files; **desktop tests**: 77 passed; `pnpm typecheck`, `pnpm lint`, `pnpm build` and
  `pnpm test:card-art` pass.
- **`pnpm test:e2e:mobile`**: 4 passed (Chromium and WebKit). One check changed: at 667×375 the lobby is taller than the screen, so the
  host scrolls to "Bắt đầu" before the 44 px touch-target check.
- **Not run in this environment**: `pnpm desktop:package` (a packaged launcher needs the Electron binary) and `pnpm db:status`
  (no `DATABASE_URL`). The launcher is therefore only reviewed in the web preview (`launcher*`).

## 5. V1 card contract review (human only)

Open `cards/` and `04-surface-card-*`:

| Clause | Look at |
| --- | --- |
| The card is shown at once, no flip or spin, no Draw button | `cards/04-cards-chance-1440x900.png`, `cards/04-cards-chest-*` |
| Badge, title, artwork and message are readable | `04-surface-card-chance-*`, `04-surface-card-chest-*` at 812×375 and 667×375 |
| Only the acting player has an enabled "Đóng" | `04-surface-card-chance-*` (actor) vs `04-surface-card-waiting-*`, `cards/04-cards-spectator-revealed-*` (disabled + the waiting line) |
| Reconnect keeps the open card | `cards/04-cards-reconnect-revealed-*` |
| Escape and the backdrop do not close it | unit tests (`CardInteractionOverlay.test.tsx`); try it live in the harness (`scenario=chance`) |

## 6. Confetti and motion (human only)

Still images cannot show the victory confetti (one burst of about 1 second, only when the winner arrives live) or the dialog entrance.
Check them live: harness scenario for a finished game, or play a game to the end; then repeat with "Giảm chuyển động" on (no confetti,
a fade only).

## 7. Known limits (for the reviewer)

- **Settings** at 1280×720 needs scrolling to reach "Đồ họa" and "Cửa sổ" (the body scrolls; the footer stays).
- **Phone landscape** dialogs scroll inside their body when the content is taller than 375 px (deed, inspection, assets, trade, victory with
  four seats); their actions stay in the footer.
- **Rent doubling for a complete group** is a rule note on the deed, not a computed number (the client helper does not compute it).
- **The jail strip** in the HUD is not part of this package (it lives on the live board; see the plan 03 package); the `jail` surface here is the
  panel in its full-size form.
- **Packaged launcher** is unchecked (section 4).
