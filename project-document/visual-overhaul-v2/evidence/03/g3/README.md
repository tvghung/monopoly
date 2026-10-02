# G3 review package — HUD restructure

Captured 2026-10-01 with `pnpm visual:capture --grep "03-g3"` (Chrome 154, SwiftShader, deterministic) after the plan 03
review fixes (last code commit of this package: `git log --grep "T03.4 card tags never clip"`). The verdict belongs to the
product owner and is recorded in `../../../03_HUD_RESTRUCTURE.md` §17. Verdict: Approved by the product owner on 01/10/2026, written by the agent at the product owner's explicit request. The 5-second test was not run.
Every image has a `.json` sidecar with the renderer diagnostics (draw calls, tier, console errors) and, for the WebGL
captures, `hudOverlap` (see section 3). All 50 captures ran with zero console errors.

The HUD is the new DOM HUD over the WebGL board: four player cards in the corners, a status pill next to the top-left
card, the roll button in the middle of the board, the assets button and the jail / debt panels in a bottom column, and
the activity log as a drawer tab on the right edge. Judge the layout and readability; the surface dialogs (buy, rent,
cards) are still the v1 look until plan 04.

## 1. What is where

| Folder | What | Sizes |
| --- | --- | --- |
| `./` (`03-hud-<fixture>-<W>x<H>.png`) | 14 fixtures: `stations-2`, `stations-3`, `stations-4`, `rent`, `balance-gate`, `jail`, `opponent-turn`, `bankrupt`, `reconnect-revealed`, `spectator-revealed`, `offline`, `turn-recovery`, `purchase`, `reduced-motion` | 1440×900 (laptop), 1280×720 (minimum), 812×375 (phone landscape) |
| `responsive/` | `stations-4` and `jail` at the smallest phone landscape and at tablet landscape | 667×375, 1024×768 |
| `legacy/` | `stations-4` and `jail` with WebGL refused, so the legacy DOM board renders | 1440×900, 667×375 |
| `../baseline/` | The HUD *before* the restructure (9 fixtures × 1440×900 and 812×375) | for side-by-side comparison |

`stations-2/3/4` are 2, 3 and 4 seated players. `opponent-turn` and `spectator-revealed` show somebody else's turn;
`reconnect-revealed` is a session sync that must not animate, and together with `spectator-revealed` it shows the card dialog (still the v1 look until plan 04) over the dimmed HUD; `offline` and `turn-recovery` show a disconnected player
(with the "Tự bỏ lượt sau m:ss" countdown); `bankrupt` shows a bankrupt seat; `reduced-motion` runs with the app setting on.

## 2. Checklist and where to look

| G3 checklist row (plan 03 §17) | Look at |
| --- | --- |
| Every player's name and money are visible in every game-state capture, WebGL and legacy | any image; `legacy/*` for the fallback |
| Turn change is visible at a glance (gold ring, "Đang đi" tag, status pill) | `03-hud-stations-4-1440x900.png`, `03-hud-opponent-turn-*.png` (pill + center pill name the player) |
| No persistent HUD element covers a tile | `hudOverlap.findings` is empty in every sidecar (section 3) |
| The call to action is easy to find and does not fight the dice or the bank tray | `03-hud-jail-*.png`, `03-hud-rent-*.png`, `03-hud-stations-4-*.png` |
| Phone landscape is usable | `*-812x375.png`, `responsive/*-667x375.png` (the jail panel is a compact strip there and never covers the roll button) |
| Reduced-motion shows the same information | `03-hud-reduced-motion-*.png` |
| Legacy fallback acceptable | `legacy/*` (see the known limits) |
| 5-second test | section 4 |

## 3. Numbers

- **Overlap checker** (`hudOverlap` in each sidecar, 4% of a tile): persistent HUD regions cover **0** tiles in all 50 captures;
  HUD regions covering **each other** (`regionOverlaps`): **0** in all 50. Only the jail panel, a *transient* decision panel,
  covers tiles while it is open: 5 tiles at 1440×900, 9 at 1280×720, 15 at 812×375, 9 at 1024×768 and 9 at 667×375 (`*jail*.json`, `transientFindings`).
- **Draw calls** (main pass, balanced / low tier): removing the 3D station labels saves 16 draws in every 4-player fixture
  (`balance-gate` 149 → 133, `stations-4` 159 → 143, `jail` 155 → 138); `board-readability` 169 → 153. All captures are
  inside the plan 02 limits.
- **Console errors**: 0 in all 50 captures. (The `spectator-revealed-1440x900` sidecar reports 121 main-pass draws, the other sizes 133: a single-frame diagnostics sample taken behind the card dialog.)

## 4. The 5-second test (human only)

1. Open a mid-game image, for example `03-hud-stations-4-1440x900.png` or `03-hud-rent-1440x900.png`.
2. Show it to a participant for five seconds, then hide it.
3. Ask: "Whose turn is it?" and "Who has the most money?" Write the answers in plan 03 §17 (3 participants, target 3 of 3).

## 5. Known limits (for the reviewer)

- **Jail panel.** While a player is in jail the panel sits in the bottom column and can cover several tiles near Start; it
  is transient and never covers the roll button. Plan 04 restyles the panel and should compact it.
- **Legacy board.** Without WebGL the corner cards overlap the legacy board's corner tiles; the legacy board is a
  fallback and was not re-laid out.
- **Phone cards** keep an icon badge for jail and offline only; whose turn it is stays readable as text in the status pill.
- **High tier text** is slightly lighter (plan 02 finding), not part of this gate.
- **File size.** This package is about 32 MB of PNG.
