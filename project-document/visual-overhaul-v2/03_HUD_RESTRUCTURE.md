# 03 — HUD Restructure

**Status: IMPLEMENTED (T03.0–T03.16) — G3 Approved by the product owner on 01/10/2026 (§17); the 5-second test (three real participants) has not been run, and an agent never records its answers. Plan 01 gate G1 was approved by the product owner on 2026-09-30.**

| Field | Value |
| --- | --- |
| Plan ID | V2-03 |
| Depends on | V2-01 (tokens v2, primitives, icon registry, capture tool, G1) |
| Blocks | — (plan 02 budget item BR-3 is completed by this plan) |
| Parallel with | V2-02, V2-04 |
| Suggested branch | `visual-v2/03-hud` |
| Size | L (about 14–20 agent working sessions) |
| Owner profile | React + TypeScript engineer with UX sense; human usability check at G3 |
| Primary code areas | `apps/client/src/components/Board.tsx` (this plan owns it), `apps/client/src/game/ui/hud/**`, `apps/client/src/game/ui/stations/**`, `apps/client/src/components/Log.tsx`, `apps/client/src/App.tsx` + `App.css` (toolbar only), `apps/client/src/game/scene/stations/PlayerStationLayer.tsx` (label removal), `apps/client/src/game/presentation/**` (selector hook only) |

Read first: [README.md](README.md), [01](01_VISUAL_TARGET_AND_DESIGN_TOKENS.md) §8
(tokens, primitives, motion rules), then this file.

---

## 1. Description

Replace today's minimal in-game HUD with a readable, layered game HUD that
answers the four "1-second" questions (whose turn, everyone's money, who owns
what, what just happened) without covering the board:

| Element | Replaces | Summary |
| --- | --- | --- |
| **Player cards** (4 screen corners) | 3D station name/money labels, sr-only roster | DOM cards with mascot avatar, name, animated money, delta chips, status (turn, jail, offline, bankrupt, left), group pips, building counts. Works in WebGL and legacy mode. |
| **Center stage** | Bottom "Chơi" button + small text | Big "Đổ xúc xắc" CTA at the board center on your turn; "Lan đang đi…" pill otherwise; large dice-result callout after the dice settle. |
| **Status pill** (top center) | Bottom turn label | Room code + turn text ("Lượt của bạn" / "<tên> đang chơi"). |
| **Turn banner** | nothing | Short, non-blocking "Lượt của Lan" / "Đến lượt bạn!" announcement on turn change. |
| **Action dock** (bottom center) | "Tài sản của tôi" floating button | Secondary actions (assets, optional trade) and the context stack (jail/debt status) above it. |
| **Activity drawer + ticker + chat bubbles** | Top-left log overlay that fades to 20% | Right-edge collapsible drawer (log + chat), one-line activity ticker, chat bubbles next to the sender's card. |
| **Toolbar** (top right) | Current toolbar | Same actions, tactile `IconButton` v2, stays outside the inert board subtree. |
| **Toasts** | Bottom center over the roll button | Top center under the status pill. |

The 3D stations keep their coin piles (and plan 02 trays), coin-flight anchors,
and camera fit points; only their text labels are removed.

---

## 2. Context

- Root causes R1, R5, R6 (README §1): money and turn are the weakest elements;
  feedback is tiny; the log overlays the board and fades to 20% opacity; toasts
  cover the roll button; on phones the log covers a quarter of the board; in the
  legacy board no money is visible at all.
- Decision DR-03 (README §4): a visible DOM HUD returns. This supersedes
  `04_PHASE_4_GAMEPLAY_ACTIONS.md` §7.2 ("side HUD/right rail and top player strip
  are gone") and §18.2 (stations carry name and money). The Phase 4 reasons
  (do not cover the board, keep one presentation pipeline, keep the stations as
  world anchors) remain valid and are honored by this design.
- Business Tour-style corner panels fit this board naturally: the fixed camera
  renders the board as a diamond, so the four screen corners are mostly empty
  table, and the stations already sit in those quadrants.

---

## 3. Current State

### 3.1 What the player sees

- `baseline/03-board-idle.jpg`: names/money as small SDF text at the board
  corners; log panel top-left; roll button bottom-center with small white text.
- `baseline/06-turn-handoff.jpg`: a turn change only changes the bottom text to
  "Lan đang chơi".
- `baseline/07-rent-feedback.jpg`: rent shows as small "-6.000 ₫" text at the far station.
- `baseline/14-mobile-landscape.jpg`: log covers the upper-left board; the roll
  button and assets button overlap the lower board.

### 3.2 Component map (verified 2026-09-29)

```text
main.App
├ SpectatorBanner? · div.room-toolbar (fixed, outside .game-board)            App.tsx:860-885
└ Board (components/Board.tsx)
  ├ tradePromptContext / displayPositionsContext providers
  └ section.game-board[data-testid=game-board][aria-busy][inert={!connected}]
    ├ aside.game-board__orientation-notice  (portrait gate, CSS-only)
    ├ section.game-board__renderer[data-renderer-mode]  (position:relative; z-index:0 → stacking context)
    │  ├ GameScene (lazy WebGL) | LegacyBoardView
    │  ├ PlayerStations (sr-only roster)
    │  ├ Dashboard (gameplay-action-layer: DebtPanel, JailPanel, BuyPrompt,
    │  │            DevelopmentPrompt, ForcedSaleProposalPanel, TradeOfferModal,
    │  │            IncomingOffers, WinnerBanner)
    │  ├ RollControl · OwnedPropertiesControl · Log
    ├ BoardAccessibilityControls (WebGL only: 40 sr-only tile buttons)
    └ PropertyInspectionModal
CardInteractionOverlay (portal)                                                 App.tsx:931
```

| Element | File | Behavior to preserve |
| --- | --- | --- |
| Roll control | `game/ui/hud/RollControl.tsx`, `rollControlLogic.ts` | Root `section.game-board__roll-controls[data-testid=roll-control][aria-label="Điều khiển lượt chơi"]`; label `p.game-board__turn-label` uses `displayActivePlayerId ?? currentPlayer.id` ("Lượt của bạn" / "<name> đang chơi" / "Đang chờ lượt chơi"); button `[data-testid=roll-button]` shown when it is your authoritative turn (`shouldShowRollButton`), enabled by `canRollForState` (connected, `canMutate`, not pending, your turn, `!hasMoved`, tokens settled, presentation `idle`, no pending landing decision, no payment shortfall, no winner); pending lock cleared on `rollSequence` advance, turn change, reset epoch, disconnect; sr-only live region announces the dice result; error in `p.game-board__roll-error[role=alert]`. |
| Assets | `game/ui/property/OwnedPropertiesControl.tsx` | Button "Tài sản của tôi (N)"; modal "Tài sản của tôi" (authoritative balance). |
| Log | `components/Log.tsx`, `components/style/Log.css` | `section.center__room[data-testid=board-log-overlay][data-idle]`; toggle with `aria-expanded`, `aria-controls="board-log-panel"`, labels "Ẩn/Hiện nhật ký và trò chuyện"; unread badge "N tin nhắn chưa đọc" (99+ cap, others' chat only while closed); `section.center__log[role=log][aria-label="Nhật ký ván chơi"]`; chat input "Tin nhắn", button "Gửi"; uses `displayActivity`/`displayLogs` when a presentation provider exists; idle after 3000 ms → opacity 0.2. |
| Toolbar | `App.tsx:861-885`, `App.css` | FPS badge (dev/UAT only), icon-only "Cài đặt" (`aria-expanded`, class `room-settings-button--open`, icon rotates 45°), exit button "Bỏ cuộc" (Flag, in-progress player) / "Rời phòng" (LogOut) → `ConfirmationDialog` "Bỏ cuộc khỏi ván chơi?". Outside `.game-board`, so not inert while reconnecting. Not rendered by the UAT harness. |
| Stations (3D) | `game/scene/stations/PlayerStationLayer.tsx`, `stationWorld.ts`, `MoneyTransferLayer.tsx` | Anchors at the board edge midpoints (about ±11.91); `StationInformation` (name at y 1.92, balance at y 1.4) and `StationMoneyAmounts` (± label at y 2.35) are Troika SDF billboards; coin flights between anchors. Anchors are camera fit points (`camera/cameraMath.ts`). |
| Slots | `game/ui/stations/stationSlots.ts` (`resolvePlayerStationSlots`) | Local player BOTTOM; opponents TOP, LEFT, RIGHT by join order (cyclic); spectators by join order; LEFT/BANKRUPT keep their slot. On screen: BOTTOM = lower-left, TOP = upper-right, LEFT = upper-left, RIGHT = lower-right. |
| HUD selectors | `game/ui/hud/playerHudSelectors.ts` (`selectPlayerHudViewModels`) | Money, property/house/hotel counts (from authoritative `ownedProps`), connected/bankrupt/left/jail flags, `jailFreeCardCount`. |
| sr-only roster | `game/ui/stations/PlayerStations.tsx` | `section.player-stations-accessibility.sr-only`, `li[data-player-id][data-current-turn]`; reads **authoritative** balances (inconsistent with the displayed 3D money). |
| Toasts | `components/Toast.tsx`, `Toast.css` | Fixed bottom 30px center (over the roll area). |
| Card overlay | `game/ui/events/CardInteractionOverlay.tsx` | Hard-coded `z-index: 1000` (plan 04 fixes). |

### 3.3 Presentation state available to the HUD (`game/presentation/store/types.ts`)

`displayActivePlayerId`, `displayBalances`, `balanceDeltas` (`{id, sequence,
consequenceOrder, playerId, from, to, delta, durationMs}`, capped at 64, not
auto-cleared), `moneyTransfers` (auto-removed), `displayDevelopmentLevels`,
`displayDice`, `displayRollSequence`, `diceRoll` (`{lifecycle:'rolling', dice,
fromDice?, rollSequence, durationMs}` or `null`), `displayActivity`, `displayLogs`,
`cardPresentation`, `status`, `animationSpeedMultiplier`, `reducedMotion`,
`presentationResetEpoch`, `settledPositions`.

Event order within one live update (`events/derivePresentationEvents.ts`): dice →
closing card → move/land → money transfer/property transfer/pass GO/jail →
opening card → **balance change** → ownership/development/jail state → player
finished → **turn change** → game finished.

`usePresentation()` (`PresentationProvider.tsx`) has no selector: every consumer
re-renders on every store change.

### 3.4 Constraints found in tests (must be handled deliberately)

- `components/Board.test.tsx` (structure test around L165-186): requires
  `.gameplay-action-layer`, `.player-stations-accessibility.sr-only`,
  `[data-testid=roll-control]`, exactly one `.center__room` inside
  `.game-board__renderer`, exactly 40 `[data-tile-index]`; forbids `.player-stations`,
  `.game-board__left-rail`, `.game-board__right-rail`, `.game-board__center-ui`,
  `.game-board__ui`, `.center`, `.dice`. Accessible names used: "Chơi", "Đang chờ…",
  "Tài sản của tôi (1)", "Xem Cà Mau", "Đề nghị mua", "Bán Nhà"; turn text
  "An đang chơi"/"Lượt của bạn"; roster `data-player-id`/`data-current-turn`.
- `App.test.tsx`: FPS text, icon-only settings/forfeit (empty `textContent`),
  `aria-expanded`, `room-settings-button--open`, alertdialog.
- `components/Log.test.tsx`: `data-idle` after 3000 ms, "Tin nhắn", toggle labels,
  `#board-log-panel`, unread badge + 99+, `.activity-entry--chat`.
- `e2e/mobile-host.spec.ts` (legacy board, 9 viewports 360×800…1440×900): no
  horizontal overflow; "Cài đặt"/"Bỏ cuộc" ≥ 44×44 and on screen at every viewport
  (portrait included, above the rotate gate); rotate gate text only in portrait
  ≤ 768 wide; exactly one exact `'Chơi'` button across both clients; settings icon
  transform/transition checks; chat labels; zero console errors.
- `board/tiles/sdfTextConfig.test.ts` reads the source of `PlayerStationLayer`
  (`SdfBillboardText`, name prefixes) and `DiceLayer` (`name="DiceResultTotal"`).
- CSS order hazard: `Dashboard.css` `.button__purchase--yes/--no` vs `Button.css`
  (bundle order). Do not import `Button` earlier in the `Board.tsx` import chain than
  `./Dashboard`.

---

## 4. Purpose

1. Make the game state legible at a glance for every player, on every viewport, in
   both render modes.
2. Give turns a rhythm (banner, center stage, callout) without blocking play.
3. Keep the board visible: HUD lives in the empty screen corners and edges.
4. Stay inside the single presentation pipeline, reconnect rules, accessibility
   boundary, and test contracts (updated deliberately where the design changes).

---

## 5. Desired Outcome

### 5.1 Player-facing

- Four player cards in the screen corners, each next to its coin tray; the local
  player's card is lower-left with a "Bạn" tag.
- The active player's card has a gold ring and a "Đang đi" chip; a short banner
  announces every turn change.
- Money counts up/down after the coin flight lands; a "+100.000 ₫" / "−6.000 ₫" chip
  appears on the right card at the right time.
- On your turn a large "Đổ xúc xắc" button waits at the center of the board; after
  the dice settle a big "4 + 3 = 7" callout appears next to them.
- The log/chat lives in a drawer at the right edge with an unread badge; a one-line
  ticker shows the latest event; chat messages pop up next to the sender's card.
- Toasts appear at the top, never over the roll button.
- The same HUD appears when WebGL is unavailable (legacy board).

### 5.2 Engineering

- `GameHud` layout shell with HUD z-order tokens and breakpoints.
- `PlayerCard`, `CenterStage`, `DiceResultCallout`, `StatusPill`, `TurnBanner`,
  `ActionDock`, `ActivityTicker`, `ChatBubbles`, drawer-mode `Log`.
- `usePresentationSelector` hook to avoid HUD-wide re-renders.
- 3D station labels removed (≥ 16 main-pass draws saved; plan 02 BR-3).
- Tests and e2e updated to the new, intentional contract.

### 5.3 Success metrics (gate G3)

| Metric | Target |
| --- | --- |
| All seated players' money visible (WebGL and legacy) | 100% of the time in game states |
| Turn change visible (banner + card ring) | Within one presentation step after `TURN_CHANGED` |
| HUD covering any tile at standard viewports | 0 overlaps reported by the overlap checker (T03.14) |
| 5-second test (3 people, mid-game screenshot) | ≥ 3/3 answer "whose turn" and "who has the most money" correctly |
| Primary controls | ≥ 44×44 px at every e2e viewport |
| Main-pass draws saved by label removal | ≥ 16 in `board-readability` |
| `pnpm test`, `pnpm test:e2e:mobile` | Green |

---

## 6. Scope

**In scope**: all elements in §1; HUD selectors and hooks; responsive layout for
desktop, compact desktop, tablet landscape, phone landscape; portrait gate
interplay; legacy-mode parity; overlap checker; test and doc updates.

**Out of scope**:

- Contents and visual design of modals and dialogs (Buy/Development/Debt/Jail
  controls, deed card, inspection, assets modal, card reveal, settings, victory):
  plan 04. This plan only positions the context stack and dock.
- Lobby, landing, launcher: plan 04.
- Scene lighting, trays, table: plan 02 (this plan relies on trays for spatial
  association but works without them).
- New gameplay commands or server data.
- Emotes/reactions between players (masterplan deferral stays).

---

## 7. Constraints and Invariants

1. **Presentation gating**: visible turn text follows `displayActivePlayerId`; roll
   permission stays on authoritative state (`canRollForState`); prompts wait for
   `settledPositions` (`tokenArrived`); displayed money = `displayBalances[id] ?? money`;
   building counts follow `displayDevelopmentLevels`; the activity ticker and log
   follow `displayActivity`/`displayLogs`; chat is not gated.
2. **Reset/snap**: every transient HUD element (banner, callout, delta chips, ticker,
   bubbles, counters) clears or snaps when `presentationResetEpoch` changes, and
   nothing animates on `SESSION_SYNC`/`SPECTATOR_SYNC`/`REPLAY_SYNC`.
3. **One announcement source** for turn and dice results (the existing sr-only live
   region in the roll control or a single successor). Cards, banner, ticker, and
   bubbles are `aria-hidden` or non-live to avoid duplicate announcements; the drawer's
   `role=log` stays the accessible activity history.
4. `inert={!connected}` stays on `.game-board`; the toolbar stays outside it.
5. Stations remain world anchors and camera fit points; do not move them.
6. No `setTimeout` chains as animation architecture: transient lifetimes derive from
   presentation signals (`durationMs`, sequence changes) and use a single
   hook-managed timer or framer-motion; durations scale with
   `animationSpeedMultiplier`; reduced motion removes transforms.
7. Central `Modal`/`ConfirmationDialog`/`Toast` stay; this plan adds no dialogs.
8. Vietnamese copy; money via `formatMoney`; do not rely on color alone
   (every status has text or an icon).
9. Touch targets ≥ 44 px; no horizontal overflow at 360–1920 px widths.
10. Keep test ids and accessible names unless this plan explicitly changes them
    (§8.3, OD-03-1), and then update tests, e2e, docs, and copy that references them
    (`JailPanel` says "bấm **Chơi**").
11. The HUD must not cover tiles (checked by T03.14). If it would, compact the HUD
    first; changing camera fit is the last resort and requires doc updates.

---

## 8. Design Specification

### 8.1 Layout zones

```text
┌────────────────────────────────────────────────────────────────────────┐
│ [LEFT player card]        [ Status pill ]            [⚙][⚑] toolbar   │
│                           [ Turn banner ]            [TOP player card] │
│                           [ Toasts      ]                              │
│                                                                        │
│                          ◇  board diamond  ◇                     ┃drawer│
│                           [ Center stage ]                       ┃ tab │
│                                                                        │
│                           [ Ticker line  ]                             │
│ [BOTTOM card = Bạn]       [Context stack ]           [RIGHT player card]│
│                           [ Action dock  ]                              │
└────────────────────────────────────────────────────────────────────────┘
```

- Corner mapping follows `resolvePlayerStationSlots`: BOTTOM → lower-left,
  TOP → upper-right, LEFT → upper-left, RIGHT → lower-right. A card is therefore
  in the same quadrant as its coin tray.
- 2 players use lower-left + upper-right (diagonal balance); 3 players add upper-left.
- Spectators: no "Bạn" tag; slot mapping as today.
- Insets: 16px from viewport edges (desktop), 8px + safe-area insets (phones).
- The TOP card sits below the toolbar: `top = 16px + toolbar height (44px) + 8px`.

HUD z-order inside `.game-board__renderer` (add these as `--z-hud-*` tokens in
`design-system/tokens/zIndex.css`, the central token file; `hud.css` only consumes
them): scene 0 < cards 10 < center stage 12 < dock/context 14 < ticker 16 <
banner 18 < drawer 20. Outside the renderer (unchanged tokens):
accessibility layer 10, orientation gate 30, toolbar 40, modal 60, card overlay 70
(plan 04 replaced the hard-coded 1000: the card is a `Modal` with `layer="card"`), toast 80, connection overlay 90.

### 8.2 Player card

| Breakpoint | Size | Content |
| --- | --- | --- |
| Desktop (≥ 1280 wide and ≥ 720 tall) | opponents 272×96, local 300×108 | avatar 56, name row, money row, footer row |
| Compact (961–1279 wide or 600–719 tall) | 220×72 | avatar 44, name + money, status chip; footer hidden |
| Phone landscape (height ≤ 500) | 168×52 | avatar 36, money (name truncated to 10 chars, full name in `title`/accessible name); status as icon badge |

Anatomy (desktop):

```text
┌──────────────────────────────────────────┐
│ (avatar)  Lan          [Đang đi] [📶✕]    │  name row: name (body 700, ellipsis) + status chips
│  ring     1.494.000 ₫   ▲ +100.000 ₫      │  money row: MoneyText (display, tabular) + DeltaChip
│           ▪▪▫▫▫▫▫▫  🏠3 🏨1 · 4 đất       │  footer: GroupPips + building counts + property count
└──────────────────────────────────────────┘
```

- Surface: plan 01 Panel (paper-50), `--elevation-2`, `--radius-lg`.
- Avatar: `PlayerAvatar` (mascot recolored with the player color, 3px color ring).
- **Active turn**: gold ring (`--color-turn-active`, 3px) around the whole card plus a
  gold outer glow (`0 0 0 4px rgb(242 182 50 / 35%)`), chip "Đang đi" (gold), a single
  entrance pulse (scale 1 → 1.03 → 1, 480 ms × speed); reduced motion: no pulse.
- **In jail**: warning chip "Ở tù" + jail icon; if the public state exposes the jail
  wait count, show "Ở tù · 1/2".
- **Disconnected**: chip "Mất kết nối" + `offline` icon, avatar at 60% opacity. If
  `boardState.turnRecovery?.playerId` is this player, show "Tự bỏ lượt sau m:ss"
  computed from `turnRecovery.deadlineAt` (display only, 1 s tick owned by one hook).
- **Bankrupt**: card desaturated (filter grayscale 0.8), money replaced by chip "Phá sản".
- **Left**: card at 50% opacity, chip "Đã rời".
- **Local**: "Bạn" tag next to the name.
- Money: `displayBalances[playerId] ?? viewModel.money`; animated counter (§8.6).
- GroupPips: 8 district groups; filled squares = owned tiles in the group; full
  outline when the group is complete (monopoly). Railroads and utilities as counts
  in the accessible summary (visually optional).
- Building counts from `displayDevelopmentLevels` (5 = hotel), not from
  authoritative `ownedProps`, so numbers match the 3D buildings.
- Accessible structure: `<section aria-label="Người chơi">` containing `<ol>` of cards;
  each `<li data-player-id data-current-turn>` has a visually hidden summary, e.g.
  "Lan, 1.494.000 ₫, 4 tài sản, 3 nhà, 1 khách sạn, đang đi". This list **replaces**
  the sr-only `PlayerStations` roster (update `Board.test.tsx`). Do not use the class
  `player-stations` (negative assertion); use `player-card-list`.
- Decided (OD-03-4): clicking a card opens that player's read-only portfolio (plan 04
  `PlayerPortfolioModal`). Until plan 04 provides it, cards are not interactive (no
  hover affordance). **Done in plan 04 (2026-10-01):** a card with `onSelectPlayer` renders a real
  button "Xem tài sản của <tên>" (forced-colors safe focus ring); `GameHud`/`PlayerCards` take
  `onSelectPlayer` as optional and without it no button renders.

### 8.3 Center stage

- Position: centered in `.game-board__renderer` in both render modes. The
  board center projects to the canvas center; card decks sit above and below the
  center on the Parking→Start diagonal and the dice arena sits up-right of center,
  so the CTA does not collide with them (verify in captures; adjust with the
  `--hud-center-offset-y` custom property if needed).
- **Your turn, can roll**: `Button` v2 `lg` primary with the `roll` icon, label
  **"Đổ xúc xắc"** (OD-03-1), `Button` size `xl` (64px tall), min-width 220px, display font; a single
  entrance pop (reduced motion: fade).
- **Roll pending**: same button `busy`, label "Đang đổ…" (update tests that expect
  "Đang chờ…").
- **Not your turn**: non-interactive pill with the active player's avatar and
  "Lan đang đi…" (follows `displayActivePlayerId`).
- **Hidden** while `diceRoll` is rolling and while any prompt/overlay is open.
- The roll logic (`rollControlLogic.ts`), test ids (`roll-control`, `roll-button`),
  error line, pending lock, and the sr-only dice announcement stay as they are; only
  presentation and position change. Keep the element `section.game-board__roll-controls`
  (tests query it) and move it into the center stage.
- Keyboard shortcut (OD-03-5): `Space` triggers the CTA when it is enabled and focus is
  not inside an input, textarea, select, contenteditable, or open dialog.

### 8.4 Dice result callout

- Trigger: `displayRollSequence` advances **and** `diceRoll === null` (settled), during
  live presentation (not after a reset epoch change or a snap).
- Content: two die glyphs + "4 + 3" + large total "7" (display 800, 40px); doubles add
  a chip "Đổ đôi" (informational only; doubles do not grant extra turns in this ruleset).
- Position: anchored near the dice arena (up-right of center), offset so it does not
  cover the dice.
- Lifetime: 1200 ms / `animationSpeedMultiplier`; reduced motion: no scale/translate,
  fade 120 ms, same hold.
- The 3D `DiceResultTotal` SDF text is removed (OD-03-7 decided: DOM callout only;
  update `sdfTextConfig.test.ts`); the sr-only announcement is unchanged.
- Legacy mode: `LegacyDiceOverlay` keeps showing dice; the callout also appears (same
  trigger), positioned at the overlay's side.

### 8.5 Status pill and turn banner

- **Status pill** (top center, inside the renderer): "Phòng UIUX-1" (caption) ·
  mini avatar + turn text. The turn text keeps today's strings and element
  (`p.game-board__turn-label`): "Lượt của bạn", "<tên> đang chơi", "Đang chờ lượt chơi".
- **Turn banner**: when `displayActivePlayerId` changes during live presentation
  (not on snap/reset/first render), show below the status pill: large avatar +
  "Đến lượt bạn!" (local, gold accent) or "Lượt của <tên>" (opponent). Enter 280 ms,
  hold 900 ms, exit 280 ms, all divided by `animationSpeedMultiplier`; reduced motion:
  fade only. `pointer-events: none`, `aria-hidden="true"` (the live region already
  announces). Rapid successive turn changes (e.g., bankruptcies) replace the banner
  instead of queueing.

### 8.6 Money feedback

- **Counter**: when the displayed balance changes, animate the number from the
  previous displayed value to the new one over 480 ms / speed with framer-motion
  (`animate` on a `MotionValue`, formatted each frame through `formatMoney`).
  Reduced motion or a reset epoch change: jump immediately.
- **Delta chips**: consume `balanceDeltas` by `sequence`: keep a per-card cursor of the
  last seen sequence; on mount and on each reset epoch, set the cursor to the current
  maximum so history never replays. Show at most 2 chips per card (newest on top),
  each for 1600 ms / speed; gain chips use `--color-money-gain` + "▲"/plus icon, loss
  chips `--color-money-loss` + "▼"/minus icon; `aria-hidden`.
- **3D**: remove `StationInformation` and `StationMoneyAmounts` from
  `PlayerStationLayer.tsx`; coin flights (`MoneyTransferLayer`) stay.

### 8.7 Action dock and context stack

- **Action dock** (bottom center, 16px from bottom + safe area): `Button` v2 `md`
  "Tài sản của tôi (N)" (keep the accessible name). No "Giao dịch" button (OD-03-6
  decided: no). The existing `OwnedPropertiesControl` renders its button here (move
  the element; keep its modal).
- **Context stack** (above the dock, max-width 520px): hosts `JailPanel` and the
  non-debtor `DebtPanel` status (today inside `Dashboard`'s `__context` stack). Plan 03
  owns the container position; plan 04 restyled the panel contents (jail strip: a pending or failed line replaces the title row and the balance warning is only read, so the strip never grows toward the roll button). Update the
  `JailPanel` copy if the CTA label changes ("…hoặc bấm **Đổ xúc xắc** để thử đổ đôi").

### 8.8 Activity drawer, ticker, chat bubbles

- **Drawer**: `Log` becomes a right-edge drawer inside the renderer. Collapsed by
  default; a vertical tab handle ("Nhật ký" icon + unread badge) stays visible at the
  right edge, vertically centered but below the TOP card. Open width
  `min(360px, 40vw)` (desktop), full height minus insets; phones: full-height overlay
  `min(92vw, 360px)`. Surface: opaque paper-50 (frosted edge allowed per DR-01).
  Remember open/closed per viewer in `localStorage` key `own-the-block.hud.drawer.v1`
  (wrap in try/catch; default closed).
- Keep: exactly one `.center__room` inside the renderer, `data-testid=board-log-overlay`,
  `#board-log-panel`, toggle `aria-expanded`/`aria-controls` and labels
  "Ẩn nhật ký và trò chuyện"/"Hiện nhật ký và trò chuyện", unread badge semantics and
  label "N tin nhắn chưa đọc", `role=log` region, "Tin nhắn", "Gửi".
- Remove the idle fade (`LOG_IDLE_TIMEOUT_MS`, `data-idle`, opacity 0.2) and update
  `Log.test.tsx` and `Client/activity-log-and-chat.instruction.md`.
- **Activity ticker**: one line directly above the context stack (bottom center),
  max-width 560px, showing the newest `displayActivity` gameplay entry
  (not chat, not DICE_ROLL) using the existing Vietnamese activity text; visible for
  4000 ms / speed, then fades; hidden while the drawer is open; clicking it opens the
  drawer; `aria-hidden="true"`.
- **Chat bubbles**: when another player's chat entry arrives while the drawer is closed,
  show a speech bubble attached to the sender's player card (max 80 characters,
  ellipsis, text-only rendering exactly like the log: no HTML), 4000 ms, newest per card
  wins; `aria-hidden` (the unread badge and log remain the accessible path).

### 8.9 Toolbar and toasts

- Toolbar: `IconButton` v2 (44px) for "Cài đặt" and "Bỏ cuộc"/"Rời phòng"; keep empty
  `textContent`, `aria-label`, `title`, `aria-expanded`, `room-settings-button--open`,
  `.room-settings-button__icon` rotation, the confirmation flow, and placement outside
  `.game-board`. FPS badge stays dev/UAT-only.
- Toasts: move the toast region to top center under the status pill (`Toast.css`);
  max-width 420px; at most 3 visible (a queue/limit in `components/Toast.tsx`, owned by
  this plan; plan 04 only restyles `ToastView`).

### 8.10 Responsive rules

| Viewport class | Rule |
| --- | --- |
| Desktop L (≥ 1600×900) | Full cards; drawer 360px; ticker visible |
| Desktop M (1280–1599) | Full cards; drawer 320px |
| Compact (961–1279 wide or 600–719 tall; e.g. the 961×956 pane) | Compact cards; status pill without room code; ticker max 420px |
| Tablet landscape (769–960) | Compact cards; drawer overlay |
| Phone landscape (height ≤ 500, e.g. 812×375, 667×375) | Phone cards; center CTA height 52px; dock shows icon + short label; ticker hidden; drawer overlay full height |
| Portrait ≤ 768 wide | Rotate gate (unchanged); toolbar stays visible above it |

### 8.11 Legacy-mode parity

All HUD elements are DOM and render identically over `LegacyBoardView`. The e2e suite
runs in legacy mode, so every new element is covered there (44px targets, no overflow).

---

## 9. Technical Approach

### 9.1 New and changed files

| File | Change |
| --- | --- |
| `game/presentation/usePresentationSelector.ts` (new) + `PresentationProvider.tsx` (change) | `usePresentationSelector(selector, isEqual = Object.is)` on the store, which the provider must newly expose through a memoized context value (see T03.1). HUD components use it instead of `usePresentation()`. |
| `game/ui/hud/playerCardSelectors.ts` (new) | `selectPlayerCardViewModels(state, presentation, roomPlayers, localPlayerId, role)` → `{ playerId, slot, name, colorId, characterId, displayMoney, isActive, isLocal, status, jail, groupPips, houses, hotels, propertyCount, recoveryDeadlineAt }[]`, built on `selectPlayerHudViewModels` + `resolvePlayerStationSlots` + `displayDevelopmentLevels` + `colorGroups`. Pure; unit-tested. |
| `game/ui/hud/GameHud.tsx` + `hud.css` (new), `design-system/tokens/zIndex.css` (change) | Layout shell and breakpoints; `--z-hud-*` tokens live in `zIndex.css`; mounted inside `.game-board__renderer` for both modes. |
| `game/ui/hud/PlayerCard.tsx`, `PlayerCardList.tsx` (new) | §8.2. |
| `game/ui/hud/useAnimatedNumber.ts` (new) | Framer-motion counter respecting reduced motion, speed, reset epoch. |
| `game/ui/hud/useBalanceDeltaFeed.ts` (new) | Sequence cursor per player; reset handling (§8.6). |
| `game/ui/hud/CenterStage.tsx` (new) | Hosts the moved `RollControl` and the opponent pill. |
| `game/ui/hud/RollControl.tsx` | Restyle, label change (OD-03-1); logic untouched. |
| `game/ui/hud/DiceResultCallout.tsx` (new) | §8.4. |
| `game/ui/hud/StatusPill.tsx`, `TurnBanner.tsx` (new) | §8.5; the turn label element moves into the pill. |
| `game/ui/hud/ActionDock.tsx` (new) | §8.7. |
| `game/ui/hud/ActivityTicker.tsx`, `ChatBubbles.tsx` (new) | §8.8. |
| `components/Log.tsx`, `style/Log.css` | Drawer mode, no idle fade, preference persistence. |
| `components/Board.tsx` | Compose `GameHud`; remove `PlayerStations`; keep providers, accessibility controls, inspection modal, `inert`. |
| `components/Dashboard.tsx` | Context stack container moves into `GameHud` (keep `.gameplay-action-layer` for prompts). |
| `game/ui/stations/PlayerStations.tsx` | Delete (replaced by the card list). |
| `game/scene/stations/PlayerStationLayer.tsx` | Remove `StationInformation` and `StationMoneyAmounts`. |
| `game/scene/dice/DiceLayer.tsx` | Remove `DiceResultTotal` (if kept removed after G3). |
| `App.tsx`, `App.css` | Toolbar restyle with `IconButton` v2. |
| `components/style/Toast.css` | Top-center placement. |
| `dev/phase4-uat/Phase4UatHarness.tsx` | Optional flag `&hud-toolbar=1` to render a copy of the toolbar for screenshots (dev only). |

### 9.2 Overlap checker (dev-only)

- Add a dev/UAT-only diagnostic that publishes the screen rectangles of the 40 tiles
  (project each tile's four surface corners with the active camera) to
  `window.__OWN_THE_BLOCK_TILE_SCREEN_RECTS__` whenever the camera/size changes (same
  gating as `RendererDiagnostics`).
- The capture tool (plan 01) gets an assertion mode for this plan: for each HUD element
  with `data-hud-region`, compute its bounding box and report any intersection with a
  tile rect larger than 4% of the tile area. Output a JSON report next to the screenshots.

---

## 10. Execution Guide

### T03.0 — Preflight

1. Branch; read README, plans 01/03, `Client/game-board.instruction.md`,
   `turn-actions.instruction.md`, `activity-log-and-chat.instruction.md`,
   `game-status.instruction.md`, `monopoly.client.instructions.md`.
2. Baseline tests; baseline captures of `stations-2`, `stations-4`, `rent`,
   `balance-gate`, `jail`, `opponent-turn`, `bankrupt`, `reconnect-revealed`,
   `spectator-revealed` at the standard viewports (`evidence/03/baseline/`).
3. Harness fixtures this plan needs but that do not exist yet: `createRoom` in
   `Phase4UatHarness.tsx` only supports 2 or 4 players (`playerCount: 2 | 4`). Add
   `stations-3` (3 players), `offline` (one opponent disconnected), and `turn-recovery`
   (the active player disconnected with a `turnRecovery` deadline) as small dev-only
   scenario additions, in a separate commit.

### T03.1 — `usePresentationSelector`

Today `PresentationProvider.tsx` exposes only `{ state, queue }` through context, rebuilds
that value on every store change, and `Board.tsx` itself calls `usePresentation()`, so a
selector hook alone would not stop re-renders. Do all of the following:

1. Expose the store (subscribe + getState) through the context alongside `state` and
   `queue`, and memoize the context value so it only changes when the store instance or
   queue changes (keep `usePresentation()` working for existing consumers).
2. Implement `usePresentationSelector(selector, isEqual = Object.is)` with
   `useSyncExternalStore` on the store and a memoized selector result.
3. Move `usePresentation()` out of `Board.tsx` (select only what `Board` needs, e.g. via the
   new hook), or memoize the HUD subtree so it does not re-render with `Board`.
4. Tests: a selector consumer does not re-render when unrelated fields change; it does
   re-render when its slice changes; reset epoch changes propagate; `presentationContext`
   test injection (used by `Board.test.tsx`) still works.

### T03.2 — Player card selectors

Implement `selectPlayerCardViewModels` + tests: slots (2/3/4 players, spectator,
left/bankrupt keep slot), displayed money preference, development from display levels,
group pips (complete groups), jail/offline/recovery fields.

### T03.3 — `GameHud` shell

Mount the shell in `Board.tsx` for both render modes with empty regions
(`data-hud-region="card-top-left"` etc.), HUD z tokens, breakpoints. Nothing removed yet.

**Accept when:** no visual change except empty containers; tests green.

### T03.4 — Player cards

1. `PlayerCard`, `PlayerCardList` (§8.2).
2. Remove `PlayerStations` sr-only roster; update `Board.test.tsx` structure and turn
   assertions to the card list (keep `data-player-id`/`data-current-turn`).
3. Captures for 2/3/4 players, spectator, bankrupt, left, offline, jail.

### T03.5 — Money counter and delta chips

1. `useAnimatedNumber`, `useBalanceDeltaFeed`, `DeltaChip` integration.
2. Tests with an injected presentation state: no chips on snap; chips on new
   sequences; reset epoch clears; reduced motion jumps; speed scaling.
3. Harness `balance-gate` and `rent` captures (chip timing matches the coin landing).

### T03.6 — Remove 3D station labels

1. Remove `StationInformation`/`StationMoneyAmounts`; update `sdfTextConfig.test.ts`
   and station tests.
2. Record draw-call savings in §17 and in plan 02's budget table (BR-3).

### T03.7 — Center stage and CTA

1. Move `RollControl` into `CenterStage`; apply §8.3; opponent pill.
2. Label change (OD-03-1): update `Board.test.tsx`, `rollControl` tests if they assert
   text, `e2e/mobile-host.spec.ts` (exact button name), `JailPanel` copy, docs.
3. `Space` shortcut (OD-03-5 decided: yes) with guard tests.

### T03.8 — Dice result callout

Implement §8.4; remove the 3D total (OD-03-7); tests for trigger conditions (live
advance only; not after snap; reduced motion).

### T03.9 — Status pill and turn banner

Implement §8.5; tests: banner on live turn change, not on snap/first render; replaces on
rapid changes; reduced motion; strings unchanged in the pill.

### T03.10 — Action dock and context stack

Move `OwnedPropertiesControl`'s button into the dock; move the context stack container;
update copy/tests.

### T03.11 — Drawer, ticker, bubbles

1. `Log` drawer mode; remove idle fade; preference persistence; unread badge unchanged.
2. `ActivityTicker`, `ChatBubbles` (text-only; truncated).
3. Update `Log.test.tsx`; add tests for ticker/bubble gating and reset.
4. The log is open by default today (`Log.tsx`, `panelOpen` initial `true`), and
   `e2e/mobile-host.spec.ts` relies on it: it types into "Tin nhắn" and then clicks
   "Ẩn nhật ký và trò chuyện" (around lines 300–310). With the drawer collapsed by
   default, update those e2e steps to open the drawer first ("Hiện nhật ký và trò
   chuyện"), then type, then close. Search the whole e2e spec for other chat/log steps
   and update them the same way. Clear the `own-the-block.hud.drawer.v1` preference in
   e2e setup so runs are deterministic.

### T03.12 — Toolbar and toasts

Restyle toolbar with `IconButton` v2 (keep every asserted attribute); move toasts.

### T03.13 — Responsive pass and legacy parity

Implement §8.10 at all e2e viewports; run `pnpm test:e2e:mobile`; fix overflow/target
sizes; capture legacy mode at 1440×900 and 667×375.

### T03.14 — Overlap checker

Implement §9.2; run it for all fixtures/viewports; fix overlaps by compacting the HUD.
Only if overlaps remain at a standard viewport, propose `hudInsets` for the camera fit
as an open decision (do not change `cameraMath.ts` without approval).

### T03.15 — Gate G3

1. Evidence set `evidence/03/g3/` (all fixtures × viewports; legacy; reduced motion;
   spectator).
2. 5-second test with 3 people (record answers in §17).
3. Human verdict in §17.

### T03.16 — Documentation

- `Client/game-board.instruction.md`: stations without labels; HUD cards as the money
  display; center stage.
- `Client/turn-actions.instruction.md`: CTA label/position; dice callout; shortcut.
- `Client/activity-log-and-chat.instruction.md`: drawer, no idle fade, ticker, bubbles,
  preference key.
- `Client/game-status.instruction.md`: player card statuses (turn, jail, offline,
  recovery countdown, bankrupt, left).
- `Client/README.md`: HUD map.
- Supersession notes in `04_PHASE_4_GAMEPLAY_ACTIONS.md` §7.2 and §18.2.
- Testcase rows: `testcase/client-state-sync-motion-and-accessibility.md` (cards,
  counters, chips, banner, callout `[CLIENT][AUTOMATED]`; overlap checker and 5-second
  test `[MANUAL-E2E]`), `testcase/chat-log-and-input-safety.md` (bubbles text-only
  `[CLIENT][AUTOMATED]`), `testcase/turn-movement-buy-and-jail.md` (CTA label/permission
  unchanged `[CLIENT][AUTOMATED]`).

---

## 11. Testing and Verification

| Check | Type | Where |
| --- | --- | --- |
| Card view models (slots, money source, pips, statuses) | AUTOMATED | `playerCardSelectors.test.ts` |
| Selector hook re-render behavior | AUTOMATED | `usePresentationSelector.test.tsx` |
| Delta feed (no replay on snap, reset, caps) | AUTOMATED | `useBalanceDeltaFeed.test.ts` |
| Counter reduced motion/reset | AUTOMATED | `useAnimatedNumber.test.ts` |
| Banner and callout gating | AUTOMATED | component tests with injected presentation state |
| Board structure contract (updated) | AUTOMATED | `Board.test.tsx` |
| Roll permission unchanged | AUTOMATED | `rollControl.test.ts` (logic untouched) |
| Log drawer semantics | AUTOMATED | `Log.test.tsx` |
| Toolbar semantics | AUTOMATED | `App.test.tsx` |
| Mobile layout contract | AUTOMATED | `pnpm test:e2e:mobile` |
| Overlap report | MANUAL (tool-assisted) | T03.14 JSON |
| 5-second test, visual quality | MANUAL | G3 |

---

## 12. Accessibility

- The card list is the accessible roster (named section, ordered list, text summaries).
- Single live announcement source for turn/dice; decorative HUD motion is `aria-hidden`.
- Status never color-only (chips carry text and icons).
- Drawer: focusable toggle, `aria-expanded`, focus moves into the drawer on open and
  back to the toggle on close; Escape closes the drawer when focus is inside it (but not
  when a modal is open).
- Keyboard shortcut guarded; documented in the settings/help text if added.
- Reduced motion: no pulse, no slide, no counter animation; information unchanged.

---

## 13. Performance

- Use `usePresentationSelector` everywhere in the HUD; memoize card view models.
- One timer hook per transient family (banner, callout, ticker, bubbles, chips) rather
  than one timer per element.
- Label removal saves ≥ 16 main-pass draws (plan 02 BR-3).
- No new WebGL objects in this plan.

---

## 14. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Cards cover tiles at some aspect ratios | Overlap checker; compact breakpoints; last resort camera-fit insets (approval). |
| Test churn hides a real regression | Change tests only where §8 changes the contract; list each changed assertion in the commit message. |
| Duplicate screen-reader announcements | Single live region rule; `aria-hidden` on decorative elements. |
| Banner/chip spam during chained events | Replace, don't queue; cap chips at 2 per card. |
| Chat bubble injection | Text-only rendering shared with the log; truncate; no links. |
| Re-render cost on every presentation tick | Selector hook + memoization. |
| Legacy mode differences | All HUD is DOM; e2e covers legacy. |
| Spectator/replay edge cases | Selector tests for spectator and LEFT/BANKRUPT slots; `REPLAY_SYNC` snap tests. |
| Mobile landscape crowding | Phone card variant; ticker hidden; dock compact. |

---

## 15. Decisions

Answered by the product owner on 2026-09-30; binding for implementation. The
specification in §8 already reflects these choices.

| ID | Question | Options considered | Decision (product owner, 2026-09-30) |
| --- | --- | --- | --- |
| OD-03-1 | Roll CTA label | "Đổ xúc xắc" / keep "Chơi" | **DECIDED: "Đổ xúc xắc"** (update tests, e2e, `JailPanel` hint copy, and docs in T03.7) |
| OD-03-2 | Roll CTA position | Board center / bottom center | **DECIDED: Board center** (center stage, §8.3) |
| OD-03-3 | Drawer default | Collapsed / open on ≥ 1600 wide | **DECIDED: Collapsed everywhere, remembered per viewer** (`own-the-block.hud.drawer.v1`) |
| OD-03-4 | Clicking a player card | Opens the player's portfolio (plan 04) / no action | **DECIDED: Opens that player's read-only portfolio once plan 04 ships `PlayerPortfolioModal`; no action (and no hover affordance) before that** |
| OD-03-5 | `Space` to roll | Yes (guarded) / no | **DECIDED: Yes**, guarded (not while typing in inputs/textarea/select/contenteditable or while a dialog is open) |
| OD-03-6 | "Giao dịch" in the dock (player picker → existing trade modal) | Yes / no | **DECIDED: No** (not in this plan) |
| OD-03-7 | Keep the 3D dice total as well as the DOM callout | Keep both / DOM only | **DECIDED: DOM callout only** (remove the 3D `DiceResultTotal`) |

---

## 16. Definition of Done

- [x] T03.0–T03.16 complete and logged in §17.
- [x] G3 verdict recorded (tvghung, 01/10/2026, Approved; written by the agent at the product owner's request).
- [ ] 5-second test results recorded. _(Not run.)_
- [x] Overlap report shows zero persistent overlaps and zero region overlaps at the standard viewports (transient jail panel: see the known limits in §17).
- [x] README §9 commands green including `pnpm test:e2e:mobile` and desktop checks. _(Green 2026-10-01: `pnpm typecheck`, `pnpm lint`, `pnpm test` (client 1,003, server 173 + 11 skipped without PostgreSQL, desktop 77), `pnpm build`, desktop typecheck, `pnpm test:e2e:mobile` (4 passed). Not runnable here: `pnpm db:status` (no `DATABASE_URL`; this plan changes no persistence) and `pnpm desktop:package` (no Electron binary was approved for download).)_
- [x] Draw-call savings recorded here and in plan 02's budget table (169 → 153, −16).
- [x] Docs and testcase rows updated (§T03.16).

---

## 17. Progress Log

| Date | Task | Commit | Evidence | Result / notes |
| --- | --- | --- | --- | --- |
| 2026-09-30 | T03.0 | f4d26f2 462ff36 40dae64 | `evidence/03/baseline/` | Baseline HUD captures (9 fixtures × 1440×900 and 812×375) before the restructure; harness fixtures `stations-3`, `offline`, `turn-recovery`; the settings-modal e2e scroll check now follows scrollability (plan 02's graphics section made the dialog taller). |
| 2026-09-30 | T03.1 | 23d3c8e | — | `usePresentationSelector`. `PresentationProvider` now supplies only a stable store / queue context, so it no longer re-renders per presentation tick; `usePresentation()` subscribes per consumer; the static `presentationContext` stays injection-only (tests) and wins over the live store. |
| 2026-09-30 | T03.2 | b618287 | — | `playerCardSelectors`: seats from `resolvePlayerStationSlots`, displayed money / turn / building counts, district pips, jail, offline + recovery deadline, bankrupt, left. |
| 2026-09-30 | T03.6 | b40821d | `evidence/03/g3/*.json` | Station name, balance and money labels removed. **Draw calls: `board-readability`, balanced, 1440×900: 169 → 153 main-pass draws (−16); shadow pass 25; triangles 68,932.** Every 4-player HUD fixture shows the same −16 (`balance-gate` 149 → 133, `stations-4` 159 → 143). Recorded in plan 02's budget table (BR-3). |
| 2026-09-30 | T03.3 T03.4 T03.5 | bacab20 | — | `GameHud`, player cards, animated money counter, delta chips, the single HUD timer (`useTransientList`), icons `jail` / `bankrupt` / `house` / `hotel`; the sr-only `PlayerStations` roster is replaced by `section.player-card-list`. |
| 2026-09-30 | T03.7 | 695c62a | — | Center stage with the "Đổ xúc xắc" call to action (OD-03-1, OD-03-2), Space shortcut (OD-03-5), status pill; state context carries `roomCode`. |
| 2026-09-30 | T03.8 T03.9 | 16c12a7 | — | Dice result callout and turn banner; the 3D `DiceResultTotal` is removed (OD-03-7). |
| 2026-09-30 | T03.10 T03.11 | bdc2f37 | — | Bottom column (context stack + action dock), right-edge activity drawer (closed by default, `own-the-block.hud.drawer.v1`, OD-03-3), ticker, chat bubbles. Idle fade removed. |
| 2026-09-30 | T03.12 | 36b4198 677119f | — | Toolbar on `IconButton` v2, toasts top-center (max 3), bubbles clear when the drawer opens; the e2e touch-target check tolerates 0.05 px of layout rounding. |
| 2026-09-30 | T03.14 | a6d93a3 | `evidence/03/g3/*.json` (`hudOverlap`) | Dev / UAT overlap checker (`TileScreenRectsPublisher`, exact convex-quad clipping). Its first run found real overlaps (pill on the Parking corner, dock on the Start corner); the pill, the bottom column and the drawer tab moved. |
| 2026-09-30 | T03.13 | d196d94 86e977a | `evidence/03/g3/responsive/`, `evidence/03/g3/legacy/` | Compact chips, small-phone stacking (≤ 720 px wide), drawer tab under the top-right card, 667×375 / 1024×768 / legacy captures. |
| 2026-09-30 | T03.15 | e47dd47, `git log --grep T03.15` | `evidence/03/g3/` (50 captures + README) | The G3 package. See its README for the checklist mapping and the 5-second test script. |
| 2026-09-30 | T03.16 | c781136 | — | AS-IS docs (`Client/game-board`, `activity-log-and-chat`, `turn-actions`, `game-status`, `Client/README`), testcase rows and supersession notes in the Phase 4 document. |
| 2026-10-01 | Review | b59b014 af0906d | — | 46-agent adversarial review (presentation gating, accessibility, tests, performance, spec conformance; every finding verified). Fixed: fractional-lifetime timer bug (entries could stay on screen forever at 0.75x / 1.5x speed); chat no longer gated by the presentation queue; turn changes spoken once; Space ignored inside the drawer; stale chat draft; unread count exposed to assistive technology; bankrupt / left player still named in the pill; at most two tags beside the name; recovery countdown layout; phone icon badges; pulse only on a live turn change; chip pop follows the speed; 56 px avatar; railroads / utilities in the summary; `role="list"`; CTA pop and ticker fade-out; `Log` on `usePresentationSelector`; e2e touch-target checks for the tab, dock and CTA; reduced-motion CSS contract test. **The G3 captures also showed that at 812×375 and 667×375 the jail panel covered the roll button; it is now a compact strip (and sits between the two bottom cards up to 720 px wide), and the capture tool reports `regionOverlaps`.** |

**Checks** (2026-10-01, this branch): `pnpm typecheck`, `pnpm lint`, `pnpm --filter @monopoly/client test` (1,003 tests) green; `pnpm test:e2e:mobile` 4 passed (mobile-chromium and mobile-webkit, two tests each) including the new 44 px checks; the G3 capture run (50 captures, zero console errors) reports zero persistent HUD overlaps and zero region overlaps. See §16 for the remaining checks.

**Changed assertions** (only where §8 changes the contract; each is also in its commit message): `sdfTextConfig.test.ts` (station layer no longer contains `SdfBillboardText` / `PlayerStationName` / `Balance` / `Amount`; `DiceLayer` no longer contains `DiceResultTotal`); `stationWorld.test.ts` (removed helper); `Board.test.tsx` (roster is `section.player-card-list` > `ol`; the button is "Đổ xúc xắc" in 13 places, "Đang đổ…" while pending); `Log.test.tsx` (the five idle-fade tests became drawer tests; "opens by default" became "counts only new other-player chat while closed"); `PlayerCardList.test.tsx` ("Ở tù 1/2"); `mobile-host.spec.ts` (exact button name, chat steps open the drawer first, drawer preference cleared in setup); `JailPanel` hint copy.

**Deviations and decisions taken while implementing** (none changes gameplay, protocol or persistence):

- **Placement (§8.1).** The status pill sits after the top-left card, the bottom column after the bottom-left card, and the drawer tab under the top-right card instead of at the top / bottom center and the right edge: the overlap checker showed that the board's Parking and Start corners project there. Up to 720 px wide the pill stacks under the top-left card and the bottom column above the bottom-left card.
- **Center stage.** The call to action sits 64 px right and 6 px below the board center (40 / 24 px on compact / phone cards) so it clears the bank tray and the settled dice; the dice callout keeps its own offset. The dice arena constants stay (they still size the logical arena; camera fit is untouched).
- **Card tags.** At most two status tags beside the name (priority: Mất kết nối > Ở tù > Đang đi > Bạn); the rest live in the screen-reader summary. Phone cards keep icon badges for jail and offline only; whose turn it is stays readable as text in the status pill.
- **Avatar** is 56 px on desktop as specified (an interim 52 px was reverted after review).
- **Not implemented, on purpose:** a 320 px drawer for Desktop M and a 420 px ticker cap for compact (§8.10 contradicts §8.8; one drawer rule `min(360px, 40vw)` applies above 960 px); a help text for the Space shortcut (the client has no help or shortcut screen; `aria-keyshortcuts="Space"` is the only disclosure).
- **Known limits, for the G3 reviewer.** (1) While a player is in jail the jail panel is a *transient* region that can cover 5 to 15 tiles near Start depending on the viewport (it never covers the roll button); plan 04 restyles the panel and should compact it. (2) On the legacy (no WebGL) board the HUD cards overlap the legacy corner tiles; the legacy board is a fallback and was not re-laid out. (3) High-tier text is slightly lighter (plan 02 finding).

**5-second test** (fill in — human only): show each participant a mid-game screenshot from `evidence/03/g3/` (for example `03-hud-stations-4-1440x900.png`) for five seconds, hide it, and ask the two questions. Target: 3 of 3 answer both correctly (§5.3).

| Participant | Screenshot | "Whose turn is it?" | "Who has the most money?" | Correct? |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

**G3 checklist** (tick only after looking; see `evidence/03/g3/README.md` for where to look):

- [x] Every seated player's name and money are visible in every game-state capture, in WebGL and legacy.
- [x] Turn change is visible at a glance (gold ring, "Đang đi" tag, status pill).
- [x] No persistent HUD element covers a tile (`hudOverlap.findings` empty in every sidecar); the transient jail panel is acceptable or needs work in plan 04.
- [x] The call to action is easy to find and does not fight the dice or the bank tray (jail, rent, stations captures).
- [x] Phone landscape (812×375 and 667×375) is usable: nothing important is hidden, targets are comfortable.
- [x] Reduced-motion capture shows the same information without motion.
- [x] Legacy fallback (no WebGL) is acceptable for a fallback.
- [ ] The 5-second test above passed with 3 of 3. _(Not run: it needs three real participants; the table above stays empty.)_

**G3 verdict**: Approved — tvghung, 01/10/2026. Approved by the product owner in chat on 01/10/2026 ("tôi duyệt tất cả"); written into this file by the agent at the product owner's explicit request, in the same form as the G1 record. The 5-second test was not run (no participants); its table is left empty and its checklist row unticked.

---

## 18. Agent Handoff Prompt

```text
You are implementing plan V2-03 "HUD Restructure" in the Own the Block repository.

Read first, in order:
1. project-document/visual-overhaul-v2/README.md
2. project-document/visual-overhaul-v2/01_VISUAL_TARGET_AND_DESIGN_TOKENS.md (section 8)
3. project-document/visual-overhaul-v2/03_HUD_RESTRUCTURE.md
4. CLAUDE.md, project-document/monopoly-websockets/monopoly.client.instructions.md and the
   Client docs listed in T03.0

Plan 01 gate G1 must be APPROVED before you apply production styling; if it is not,
stop and report. Work on branch visual-v2/03-hud. Execute tasks T03.0 to T03.14 in
order, one commit per task with its ID. Keep all gameplay permissions on
authoritative state and all displayed consequences on presentation state
(displayActivePlayerId, displayBalances, displayDevelopmentLevels, balanceDeltas,
displayActivity). Nothing may animate or replay on SESSION_SYNC, SPECTATOR_SYNC or
REPLAY_SYNC; clear transient UI on presentationResetEpoch changes. Keep the toolbar
outside the inert .game-board subtree, keep 3D stations as anchors, and keep a single
live announcement source. Update tests only where section 8 changes the contract and
list each changed assertion in the commit message. Run pnpm typecheck, pnpm lint,
pnpm test after each task and pnpm test:e2e:mobile before finishing. Prepare the G3
package (T03.15) and stop for a human verdict; then do T03.16 documentation.
```
