# 04 — Modals, Cards and Pre-Game Screens

**Status: PLANNED — not started. Open decisions answered by the product owner on 2026-09-30 (see the Decisions section). Requires plan 01 gate G1 before production styling.**

| Field | Value |
| --- | --- |
| Plan ID | V2-04 |
| Depends on | V2-01 (tokens v2, primitives, icon registry, Design Lab, capture tool, G1) |
| Blocks | — (plan 03 OD-03-4 "player portfolio" uses a component from this plan; plan 05 fills the deed card's landmark art slot) |
| Parallel with | V2-02, V2-03 |
| Suggested branch | `visual-v2/04-surfaces` |
| Size | L (about 14–20 agent working sessions) |
| Owner profile | React + TypeScript engineer with UI craft; human review at G4 |
| Primary code areas | `apps/client/src/design-system/components/{Modal,ConfirmationDialog,Toast}`, `apps/client/src/components/dashboard/**`, `apps/client/src/game/ui/property/**`, `apps/client/src/game/ui/events/CardInteractionOverlay.*`, `apps/client/src/settings/SettingsPanel.*`, `apps/client/src/components/{JoinForm,Lobby,DesktopMultiplayerLauncher,HostLanSharing}.*`, `apps/client/src/components/lobby/**`, `apps/client/src/app/screens/**`, `apps/client/src/game/characters/characterRegistry.ts` (mascot labels only) |

Read first: [README.md](README.md), [01](01_VISUAL_TARGET_AND_DESIGN_TOKENS.md) §8,
then this file. Coordinate with [03](03_HUD_RESTRUCTURE.md): plan 03 owns
`components/Board.tsx` and the positions of the context stack and action dock;
this plan owns the contents of every dialog and panel.

---

## 1. Description

Redesign every surface that opens on demand, and every screen before and after a
game, so that they look like parts of a premium board game instead of web forms:

| Area | Deliverable |
| --- | --- |
| Dialog system | `Modal` v2 (sizes, center/sheet placement, dim/clear backdrop, exit animation, sticky footer slot, layer prop), `ConfirmationDialog` v2, `Toast` v2 visuals |
| Property identity | New `PropertyDeedCard` (full, compact, chip variants) for streets, railroads, utilities; special-tile info cards |
| Decisions | Buy, Development, Jail, Debt (debtor and observer), Forced sale, Trade offer, Incoming offers, with clear money math and explained disabled states |
| Inspection | Property inspection, "Tài sản của tôi" portfolio, read-only player portfolio (for plan 03 card clicks) |
| Card reveal | Chance / Khí Vận overlay restyled as a physical card, inside the V1 card contract |
| Victory | End-of-game screen with winner hero, stats, other players, and actions for everyone |
| Settings | Sectioned settings with sliders, segmented speed control, switches, graphics tier (plan 02), fullscreen |
| Pre-game | Landing/join, desktop launcher, lobby (seats, mascot stage, colors, start reasons, LAN share), unified loading, failure and connection screens, spectator banner |
| Copy and hygiene | No visible mascot names (English names deleted; Vietnamese accessible labels only) and Vietnamese launcher labels; `MascotPicker` honors the in-app reduced-motion setting; removal of the `Dashboard.css`/`Button.css` cascade hazard; card overlay z-index token |

No gameplay rule, command, payload, or server behavior changes.

---

## 2. Context

- Root causes R4 and R7 (README §1): generic white modals, a purchase prompt with
  only a title and two buttons, native controls, a form-first landing and lobby,
  English strings.
- The deed card is the most reused game object (buy, build, inspect, portfolio,
  debt, trade). Designing it once and reusing it everywhere gives the biggest
  consistency gain.
- UX defects found during the review that this plan fixes:
  - A non-host player on the victory screen has no way to leave (the modal has no
    buttons for them, and the modal overlay covers the toolbar).
  - A debtor inside the "Cần thanh toán" alert dialog cannot forfeit or open settings
    (overlay covers the toolbar; focus is trapped).
  - The victory modal appears as soon as the authoritative winner exists, so it can
    cover the final bankruptcy/coin animations.
  - The Settings sticky footer depends on a negative margin tied to Modal padding.
  - `MascotPicker` and legacy components use framer-motion's OS-only
    `useReducedMotion()` instead of `useEffectiveReducedMotion()`.
  - `Dashboard.css` `.button__purchase--yes/--no` rules style the `BuyPrompt` buttons
    (which only look right because `Button.css` comes later in the bundle) and the
    plain `JailPanel` buttons (which depend on them). `IncomingOffers` uses its own
    `trade-offers-modal__button--*` classes.
  - The modal focus-restore logic (`Modal.tsx`) skips restoring focus while any
    `[aria-modal="true"]` element exists; exit animations and nested dialogs (e.g. a
    confirmation over the debt dialog) would break focus return.
  - The card overlay hard-codes `z-index: 1000`, so it sits above the reconnect
    overlay (90).

---

## 3. Current State

### 3.1 What the player sees

`baseline/01` (landing), `02` (lobby), `05` (purchase), `08` (card), `09` (assets),
`10` (special tile), `11` (property inspection), `12` (settings).

### 3.2 Code map (verified 2026-09-29)

| Surface | File | Facts to preserve |
| --- | --- | --- |
| Modal | `design-system/components/Modal/Modal.tsx` | Props `{open, title, children, onClose?, closeOnEscape=true, closeOnOutsideClick=false, role='dialog'\|'alertdialog', className?}`; portal with `aria-modal`; `h2` title; X button labelled "Đóng" only when `onClose`; autofocus `[data-modal-autofocus]` else first focusable; focus trap; Escape; focus restore; enter animation only; reduced motion via `useEffectiveReducedMotion`. |
| ConfirmationDialog | `design-system/components/ConfirmationDialog/` | `alertdialog`; Cancel (secondary, autofocus) first, then danger Confirm. Used for "Bỏ cuộc khỏi ván chơi?" (`App.tsx:917-929`). |
| Toast | `components/Toast.tsx`, `design-system/components/Toast/ToastView.tsx` | `useToast().show(msg,{variant})`, 5 s; variants info/success/warning/error. Position moves in plan 03. |
| Buy | `components/dashboard/BuyPrompt.tsx` | Shown when `canMutate`, your turn, pending PURCHASE, token arrived. No `onClose`. Title `Mua <tile> với giá <price>?`. Buttons "Mua tài sản" (primary, autofocus, disabled if authoritative balance < price) and "Không mua". Request-generation guard; resets on operation change/reset epoch. |
| Development | `components/dashboard/DevelopmentPrompt.tsx` | Modal `Phát triển <tile>`; "Xây N Nhà", "Nâng cấp Khách sạn", "Bỏ qua"; gated on `tokenArrived`. |
| Jail | `components/dashboard/JailPanel.tsx` | Inline `section.jail-panel[role=status]`: "Bạn đang ở Nhà Tù", hint "…hoặc bấm **Chơi** để thử đổ đôi", "Vòng chờ: X/2", plain buttons "Trả 25.000 ₫" and "Dùng thẻ Thoát Tù Miễn Phí (N)" (styled by `Dashboard.css` green). |
| Debt | `components/dashboard/DebtPanel.tsx` | Observers: inline `debt-panel--status`. Debtor: alertdialog "Cần thanh toán", no close; per property "Bán X cho Ngân hàng", "Đề nghị người chơi mua X" → buyer radio list → "Gửi đề nghị bán"; 1 s countdown. |
| Forced sale | `components/dashboard/ForcedSaleProposalPanel.tsx` | Modal "Đề nghị bán bắt buộc"; buyer "Chấp nhận"/"Từ chối"; seller "Hủy đề nghị". |
| Trade | `components/dashboard/TradeOfferModal.tsx` | Modal `Giao dịch với <name>`; fieldsets "Bạn giao"/"Bạn nhận"; inputs `#private-offer-cash`, `#private-request-cash`; "Gửi đề nghị". |
| Incoming offers | `components/dashboard/IncomingOffers.tsx`, `useIncomingOffers.ts` | Modal "Đề nghị giao dịch", no close; "Chấp nhận"/"Từ chối". |
| Victory | `components/dashboard/WinnerBanner.tsx` | `Modal open={state.loaded}` title "Ván chơi kết thúc", `alertdialog`, no `onClose`; mascot (alt "Mascot X"), "Người chiến thắng", name in player color, color label; `dl` "Tiền mặt cuối ván", "Tài sản sở hữu", "Nhà", "Khách sạn"; host-only plain `<button data-modal-autofocus>` "Chơi lại"/"Đang chuẩn bị ván mới…" (RotateCcw). Not presentation-gated. `finishedPlayers` is a `Record` without a reliable elimination order. |
| Property inspection | `game/ui/property/PropertyInspectionModal.tsx`, `PropertyCard.tsx`, `propertyDetails.ts` | Modal titled with the tile name, closes on outside click; `PropertyCard` (header = tile name); "Giá mua", "Phát triển"; current rent row `.property-inspection__detail--current` (streets: `details[min(houses,5)]`; railroads/utilities: by owned count); `<details>` "Xem bảng giá thuê"; actions "Đề nghị mua" (non-owner, via `tradePromptContext`) and "Bán Nhà" (owner). `getTileDetails(tile)` produces all display strings (railroad rents `[25,50,100,200]` and utility ×4/×10 are presentation constants here). |
| Assets | `game/ui/property/OwnedPropertiesControl.tsx` | Modal "Tài sản của tôi", outside click closes; "Số dư hiện tại" (authoritative); items `li.owned-properties-list__item` with swatch and "Xem <tile>". |
| Card reveal | `game/ui/events/CardInteractionOverlay.tsx`, `.css`, `cardVisuals.ts` | Custom portal (not `Modal`): `div.card-modal[data-testid=card-interaction-overlay][data-card-stage]` › `section.card-modal__dialog[role=dialog][aria-modal]`; badge "CƠ HỘI"/"KHÍ VẬN"; artwork (28 SVGs, `public/art/cards/**`, validator `scripts/validateCardArtwork.mjs`); title; message; exactly one "Đóng" (enabled only for the acting player, sends `dismissCard` once); others see "Đang chờ người chơi đóng thẻ"; no Escape/backdrop close; `z-index: 1000`; two-column layout for landscape heights ≤ 620px. |
| Settings | `settings/SettingsPanel.tsx`, `.css` | Modal "Cài đặt"; "Âm thanh" sliders "Âm lượng tổng"/"Nhạc nền"/"Hiệu ứng" (0–1, step 0.05, `output` %); "Hiển thị": select "Tốc độ chuyển động" (0.75/1/1.5/2), checkbox "Giảm chuyển động" + hint; desktop "Toàn màn hình"; footer "Khôi phục mặc định", "Xong" (sticky via negative margins tied to Modal padding). No unit test. |
| Landing | `components/JoinForm.tsx`, `style/JoinForm.css` | Eyebrow "OWN THE BLOCK" (aria-hidden), `h1#join-title` "Cờ Tỷ Phú Việt Nam", `.join__error` (alert), `.join__connection` (status), `#join-name` "Tên của bạn" (max 20, autofocus), `#join-room` "Mã phòng" (max 20, placeholder mentions empty = public room), button "Vào phòng"/"Đang vào phòng…" (disabled until name, not busy, connected). Empty room → `LOBBY`. `?room=` prefill (`runtime/lanSharing.ts`), no auto-submit. |
| Launcher | `components/DesktopMultiplayerLauncher.tsx`, `.css` | Electron only (`window.ownTheBlockDesktop`); renders outside Settings/Audio/Toast providers; "Tiếp tục Host đang chạy", "Dừng Host", **"Host Game"**, **"Join Game"**, "Máy chủ đã cấu hình"; host: select `#desktop-lan-interface` "Mạng dùng để chia sẻ", "Tạo và vào phòng"; join: `#desktop-lan-address` "Địa chỉ Host", `#desktop-lan-room` "Mã phòng", "Kết nối và vào phòng"; no focus style for `select`. Electron minimum window 1280×720. |
| Lobby | `components/Lobby.tsx`, `lobby/MascotPicker.tsx`, `HostLanSharing.tsx`, `style/Lobby.css` | Header eyebrow "Mã phòng" + `h1#lobby-title`; "Cài đặt" (ghost), "Rời phòng" (immediate), host "Bắt đầu" (disabled without explanation); 4 seats (`li`): color disc, recolored mascot or "?", name + " (bạn)", Badge "Chủ phòng", ready dot (`lobby-player__ready-dot--ready/--not-ready`, labels "Đã sẵn sàng"/"Chưa sẵn sàng"), `WifiOff` "Mất kết nối", own ready button "Sẵn sàng"/"Hủy sẵn sàng" (disabled with title "Chọn mascot trước để sẵn sàng"); empty seat "Chỗ trống N". Start rule (client UX, server authoritative): host, 2–4 players, all ready/connected/with mascot, unique `mascot:color` pairs. MascotPicker: carousel `role=group` `tabIndex=0` "Mascot đang xem: X…", arrows "Mascot trước"/"Mascot tiếp theo", thumbnails group "Chọn mascot" (8, `aria-pressed`), colors group "Chọn màu người chơi" (10; disabled "(đã dùng với X)"); uses OS-only `useReducedMotion()`. LAN share (host): QR (`qrcode`, alt "Mã QR tham gia phòng X", `data-qr-payload`), "Sao chép liên kết"/"Đã sao chép.", "Mạng chia sẻ", "Làm mới mạng". |
| Mascot names | `game/characters/characterRegistry.ts` | `Dog`, `Capybara`, `Panda`, `Mèo`, `Chim cánh cụt`, `Elephant`, `Thỏ`, `Vịt` (four English names). |
| Screens | `app/screens/LoadingScreen.tsx` (bootstrap), internal `LoadingScreen` in `App.tsx:111-120` (restoring), `FailureScreen` (REPLACED/ERROR), `BootstrapErrorScreen`, connection overlay ("Đã mất kết nối"), `SpectatorBanner` ("Chế độ Khán Giả") | Two different loading screens; off-palette `theme-color`. |

### 3.3 Tests and e2e that constrain this plan

See the full inventory in plan 01 §3.2 and the lists below; update deliberately.

- `components/Lobby.test.tsx`: many exact names/classes (see §3.2 Lobby row); exactly
  4 `listitem`s; exactly one `.lobby-player .ds-badge`; zero `.lobby-player__character`;
  `'OWN THE BLOCK'`, `'Dog'`, `'Panda'`, `'Xem trước trong phòng'`, `/Đang chờ Chủ Phòng/`
  must be absent as text; mascot `img` src contains `%23f2384a`.
- `components/DesktopMultiplayerLauncher.test.tsx`, `app/bootstrap/AppBootstrap.test.tsx`:
  `/Host Game/`, `/Join Game/`, labels, "Tạo và vào phòng", "Kết nối và vào phòng",
  "Thử lại", "Không thể khởi động trò chơi".
- `components/HostLanSharing.test.tsx`: exact URL text, QR alt + `data-qr-payload`,
  copy labels.
- `App.test.tsx`: join prefill, lobby heading, "Đã mất kết nối", failure headings,
  spectator texts, confirmation flow.
- `components/dashboard/*.test.tsx` (DecisionPrompts, DebtPanel, WinnerBanner,
  IncomingOffers, TradeOfferModal), `game/ui/property/*.test.tsx`,
  `components/Board.test.tsx` (Escape closes dialog 'Cà Mau'; one dialog at a time;
  focus to `#private-offer-cash`), `game/ui/events/CardInteractionOverlay.test.tsx`
  (exactly one "Đóng"; Escape/backdrop ignored), `settings/*.test.ts(x)`,
  `game/characters/characterRegistry.test.ts` (`'Dog'`, `'Elephant'`),
  `PresentationFreezeChain.test.tsx`.
- `e2e/mobile-host.spec.ts`: join heading "Cờ Tỷ Phú Việt Nam", `getByLabel('Mã phòng')`,
  "Vào phòng" disabled until name and ≥ 44px tall; mascot buttons by exact name
  (`'Dog'`, `'Capybara'`), `getByText('Dog',{exact:true})` count 0; "Sẵn sàng"/"Bắt đầu"
  (substring matching → no other button may contain these texts); 44×44 targets at
  667×375; lobby has no horizontal scroll at 360/390/667; settings dialog fits the
  viewport and `.ds-modal__body` scrolls at 667×280; "Đóng" ≥ 40px; forfeit dialog
  "Bỏ cuộc khỏi ván chơi?" → "Hủy"; music never plays in the lobby; zero console errors.

---

## 4. Purpose

1. Make every decision understandable at a glance (what am I buying, what does it
   earn, what will I have left, why is this disabled).
2. Give the product a recognizable object language (deed cards, physical game cards,
   seat pedestals) consistent with the tabletop direction.
3. Remove dead ends and inconsistencies (victory, debt, reduced motion, cascade
   hazard, z-index).
4. Make the first impression (landing, launcher, lobby) feel like a game.

---

## 5. Desired Outcome

### 5.1 Player-facing

- Landing on an unowned street shows a sheet with its deed card (group color header,
  rent ladder, build cost, group progress), the price, the balance after purchase,
  and two clear buttons; if you cannot afford it, the reason is written.
- Inspecting any tile shows a proper deed or an illustrated rule card.
- The Chance/Khí Vận card looks like a real printed card with a deck-colored frame,
  appears immediately (no flip), and only its owner can press "Đóng".
- The victory screen celebrates the winner and lets every player either play again
  (host) or leave.
- Settings feel native to the game (segmented speed, switches, graphics tier).
- The landing page has a hero with the mascots and a clear choice between a room code
  and the public room; the launcher and lobby are fully Vietnamese, and the lobby shows
  four seat pedestals with ready stamps and a start button that explains what is missing.

### 5.2 Engineering

- `Modal` v2 API (backward compatible), `ConfirmationDialog` v2, `Toast` v2.
- `PropertyDeedCard` + `deedCardModel.ts` adapter reusing existing helpers.
- All touched surfaces use design-system primitives; `Dashboard.css` purchase-button
  rules removed; card overlay uses a z-index token.
- Real-component fixtures for pre-game surfaces in the Design Lab (for captures).
- A `SettingsPanel.test.tsx`.

### 5.3 Success metrics (gate G4)

| Metric | Target |
| --- | --- |
| Dead ends | Every blocking dialog offers a way forward or out for every role |
| Disabled controls with visible reason | 100% of primary actions |
| English player-facing strings | 0 |
| Surfaces using primitives (no ad-hoc button CSS) | 100% of surfaces touched by this plan |
| e2e + unit suites | Green |
| Card contract (V1) | All clauses still true (checked in §11) |

---

## 6. Scope

**In scope**: everything in §1.

**Out of scope**:

- In-game layout positions (plan 03 owns where the dock, context stack, drawer,
  toasts, and cards sit).
- Scene/WebGL (plans 02, 05). The deed card only reserves a slot for plan 05's 2D
  landmark art.
- Gameplay, commands, schemas, economy values (the rent doubling for complete
  groups is shown as text only; see §8.3).
- Audio changes (buttons keep the global click SFX via real `<button>` elements).
- New languages.

---

## 7. Constraints and Invariants

1. Prompts use the central `Modal`/`ConfirmationDialog`/`Toast`; no `window.confirm`;
   focus trap/restore and z-index stay inside the primitives.
2. **V1 card contract** (`project-document/ui-ux-overhaul/V1_RELEASE_CONTRACT.md`,
   "Card presentation contract"): DOM modal; real artwork, title, deck badge,
   authoritative message; no Draw step, face-down wait, flip, spin, or WebGL card
   canvas; only the acting player can press the visible `Đóng`; dismissal applies the
   effect exactly once; waits indefinitely; survives reconnect; spectators see but
   cannot close. The redesign changes styling and entrance motion only.
3. Decisions stay gated as today (`tokenArrived`, `canMutate`, request-generation
   guards, reset on `presentationResetEpoch`). Enable/disable logic stays on
   authoritative state.
4. Server remains authoritative for lobby rules; client disabled states are UX only.
5. No economy duplication: display strings come from `getTileDetails` and shared
   `tileState`/`colorGroups`; the current-rent selection is extracted from
   `PropertyInspectionModal` into one helper and reused.
6. Chat/offer/free text is rendered as text only.
7. Vietnamese copy; `formatMoney` for all money; never color-only signals.
8. Touch targets ≥ 44px; dialogs fit the viewport and scroll inside
   `.ds-modal__body` (e2e); no horizontal overflow at 360–1920px.
9. Reduced motion (effective) respected everywhere, including `MascotPicker`.
10. Launcher stays outside app providers (no `useSettings`/`useToast` there).
11. Keep asserted ids/labels unless §8 changes them explicitly; then update tests,
    e2e, and docs in the same task.

---

## 8. Design Specification

### 8.1 Modal v2

Backward-compatible additions:

```ts
interface ModalProps {
  // existing: open, title, children, onClose?, closeOnEscape?, closeOnOutsideClick?, role?, className?
  size?: 'sm' | 'md' | 'lg' | 'xl';          // 400 / 520 / 680 / 880 px max-width; default 'md'
  placement?: 'center' | 'sheet';            // sheet = docked above the bottom edge (desktop) / full-width bottom sheet (phone)
  backdrop?: 'dim' | 'clear';                // clear = transparent pointer-blocking layer (board stays visible)
  eyebrow?: ReactNode;                       // small label above the title
  footer?: ReactNode;                        // sticky footer slot (replaces negative-margin hacks)
  tone?: 'default' | 'danger' | 'celebration';
  layer?: 'modal' | 'card';                  // z-index token: modal 60, card 70
  headerAccent?: string;                     // optional color band (deed header color)
}
```

- Visuals: paper-50 surface, `--elevation-3`, `--radius-xl`; title in display 700
  (`--type-title-m`); body `--type-body`; footer separated by a 1px border; X button
  becomes `IconButton` (label "Đóng").
- Motion: enter 280ms (`--motion-ease-out`) scale 0.96→1 + fade (center) or
  translateY 24px→0 (sheet); exit 200ms via `AnimatePresence`; reduced motion: fade
  120ms.
- Backdrop `dim` = `--color-overlay` (no blur); `clear` = transparent but blocks
  pointer events (prevents clicking tiles behind a pending decision).
- Keep: portal, `aria-modal`, focus trap, Escape only with `onClose` and
  `closeOnEscape`, outside click only with `closeOnOutsideClick`, focus restore,
  `[data-modal-autofocus]`.

**ConfirmationDialog v2**: tone `danger`, warning icon, title, message, Cancel first
(autofocus, secondary), confirm (danger). Labels unchanged.

**Toast v2**: paper chip with a left accent bar and icon per variant (info blue,
success gain, warning warn, error lacquer); max-width 420px; text-only.

### 8.2 PropertyDeedCard

Variants:

| Variant | Size | Used by |
| --- | --- | --- |
| `full` | 320×auto (min 420 tall) | Property inspection, Buy (desktop), Development |
| `compact` | 260×auto | Buy (phone), portfolio grid, Debt sell list, Forced sale |
| `chip` | 1 line, 40px tall | Trade offer selectors, incoming offers summary, lists |

Anatomy (`full`, street):

```text
┌──────────────────────────────────┐
│ ▓▓ NHÓM XANH NHẠT        [art] ▓▓ │ header band in district color (headerText color), landmark art slot (plan 05)
│ ▓▓ Cần Thơ                     ▓▓ │ tile name, display 800
├──────────────────────────────────┤
│ Giá mua                 100.000 ₫ │
│ ───────────────────────────────── │
│ Tiền thuê cơ bản          6.000 ₫ │ ← current tier highlighted (gold-100 row + "Hiện tại" chip)
│ Có 1 Nhà                 30.000 ₫ │ ← next tier marked "Sau khi xây" in the Development prompt
│ Có 2 Nhà                 90.000 ₫ │
│ Có 3 Nhà                270.000 ₫ │
│ Có 4 Nhà                400.000 ₫ │
│ Có Khách Sạn            550.000 ₫ │
│ ───────────────────────────────── │
│ Giá mỗi Nhà / Khách Sạn  50.000 ₫ │
│ Sở hữu cả nhóm: tiền thuê cơ bản gấp đôi │ (text note, see below)
├──────────────────────────────────┤
│ Chủ: (avatar) Minh      ▪▪▫ 2/3   │ owner row + group progress pips (owners' colors)
└──────────────────────────────────┘
```

- Railroad variant: header railroad color, "Ga tàu"; rows "Sở hữu 1–4 Ga Tàu" from
  `getTileDetails`; highlight by owned count (same logic as today).
- Utility variant: rows "Sở hữu 1 Công Ty: Tổng xúc xắc ×4", "Sở hữu cả 2 Công Ty: ×10".
- Header colors and header text colors from plan 01 §8.4 (`propertyVisualColors.ts`
  with `headerText`).
- The rows come from `getTileDetails(tile)`; the highlighted row comes from a new
  shared helper `getCurrentRentDetailIndex(tile, ownership, state)` extracted from
  `PropertyInspectionModal` (behavior identical: streets `min(houses, 5)`, others by
  owned count). The complete-group doubling is **not computed** (the current helper
  does not compute it); show the rule as the text note above, sourced from the
  existing rule comment in `packages/shared/src/tileState.ts`. Record this as a known
  limitation in §17 rather than inventing rule logic in the client.
- Owner row: `PlayerAvatar` 32 + name, or "Chưa có chủ" when unowned.
- Group progress: one pip per tile in the group (`colorGroups`), filled with the
  owner's player color, empty when unowned; label "Minh sở hữu 2/3".
- Landmark art slot: 64×64 area in the header; empty in this plan (motif icon from
  `propertyVisualColors.ts` `motif` as a placeholder glyph); plan 05 supplies the art.
- Accessibility: `article` with `aria-labelledby` the tile name; the rent ladder is a
  `<table>` with a caption "Bảng giá thuê"; the current row has `aria-current="true"`.
- Keep `PropertyCard.tsx` as a thin wrapper or replace its usages; keep the
  `.property-inspection__detail--current` class on the highlighted row (test).

Special-tile info card (start, jail, go-to-jail, parking, tax, chance, chest, and the
railroad/utility "rule" view): header with an icon on a neutral paper header, the tile
name, and the rule text.

- Icons: only six board SVGs exist (`game/scene/special/boardIconAssets.ts`:
  `railroad-train`, `handcuffs`, `water-faucet`, `electric-bulb`, `chance-question`,
  `fortune-wheel`). Reuse them where they match. Start, jail/visiting, parking, and tax
  are 3D meshes in code (`SpecialTileVisual.tsx`) and have no icon: create four new
  small SVG glyphs under `design-system/icons/game/` (flat, no text, same safety rules
  as card art) or use `ActionIcon` glyphs, and record the choice in §17.
- Rule text: from `getTileDetails`. It has **no branch for `expense` (tax) tiles** today,
  so it returns `[]` for "Thuế Thu Nhập" and "Thuế Xa Xỉ". Add an `expense` branch that
  formats `tile.expenseAmount` from shared `tileState` (e.g. "Nộp {formatMoney(amount)}
  cho Ngân hàng khi dừng tại đây.") and test it in `propertyDetails.test.ts`. This is
  display text for an existing shared value, not new rule logic.

### 8.3 Decision surfaces

**Buy** (`BuyPrompt`): `Modal` `placement="sheet"`, `backdrop="clear"`, size `lg`.

- Layout desktop: deed `full` on the left; right column: eyebrow "Ô đất trống",
  title `Mua Cần Thơ?`, price (display 800, `--type-display`), line "Số dư sau khi mua:
  1.400.000 ₫" (authoritative balance − price), hint "Sở hữu 2/3 nhóm Xanh nhạt sau khi
  mua" (only when true), actions: primary `lg` "Mua tài sản" (autofocus; keep the exact
  name), secondary `lg` "Không mua" (keep).
- Cannot afford: primary disabled + reason "Bạn còn thiếu 20.000 ₫" (computed from
  authoritative balance).
- Phone landscape: deed `compact` + actions stacked on the right.
- Remove the `button__purchase--yes/--no` classes from `BuyPrompt`. Delete the
  `Dashboard.css` rules only in T04.7, after `JailPanel` has migrated to `Button` v2
  (otherwise the jail buttons lose their styling in between).

**Development** (`DevelopmentPrompt`): sheet, deed `full` with the current row and the
next row marked "Sau khi xây"; cost line "Chi phí: 50.000 ₫ / nhà"; buttons keep labels
("Xây N Nhà", "Nâng cấp Khách sạn", "Bỏ qua"); disabled reasons if unaffordable.

**Jail** (`JailPanel`, inline in plan 03's context stack): status sheet with jail icon,
"Bạn đang ở Nhà Tù", "Vòng chờ: X/2" as a chip, actions as `Button` v2 ("Trả 25.000 ₫"
secondary, "Dùng thẻ Thoát Tù Miễn Phí (N)" secondary). The hint copy that names the roll
button is owned by plan 03 (OD-03-1); keep whatever text plan 03 set.

**Debt** (`DebtPanel`):

- Debtor alertdialog "Cần thanh toán", size `lg`, tone `danger`:
  header amount "Cần trả 250.000 ₫" (loss), creditor avatar/name or "Ngân hàng",
  "Còn thiếu" and available cash, countdown chip (existing 1 s tick), sellable properties
  as `compact` deeds with "Bán cho Ngân hàng · +X ₫" and "Đề nghị người chơi mua" (keep
  labels "Bán X cho Ngân hàng", "Đề nghị người chơi mua X", "Gửi đề nghị bán").
- **New**: footer ghost-danger button "Bỏ cuộc" → `ConfirmationDialog` "Bỏ cuộc khỏi ván
  chơi?" → the existing leave/forfeit handler used by the toolbar (`handleLeave` path in
  `App.tsx`; expose it through context rather than duplicating socket calls). No new
  server command.
- Observer status (inline): "Minh đang thiếu 250.000 ₫" with creditor and countdown.

**Forced sale**: deed `compact` + price + role-specific actions (labels unchanged).

**Trade offer** (`TradeOfferModal`): size `xl`; two columns "Bạn giao"/"Bạn nhận" with
selectable deed `chip`s (checkbox semantics) and cash inputs (keep ids
`#private-offer-cash`, `#private-request-cash`) showing formatted money previews;
summary line "Bạn giao 2 tài sản + 50.000 ₫ · Bạn nhận 1 tài sản"; primary "Gửi đề nghị".
Phone: columns stack.

**Incoming offers**: summary card with both sides as deed chips + cash, sender avatar,
"Chấp nhận"/"Từ chối" (unchanged labels).

### 8.4 Inspection and portfolios

- **Property inspection**: `Modal` size `md`, `closeOnOutsideClick` (unchanged), deed
  `full` or special card; actions row ("Đề nghị mua", "Bán Nhà") as `Button` v2. Keep
  Escape closing (test "Cà Mau") and focus return to `[data-tile-index]`.
- **"Tài sản của tôi"**: size `lg`; header "Số dư hiện tại" (authoritative, unchanged) +
  counts (tài sản, nhà, khách sạn); grid grouped by district of deed `compact` cards; each
  keeps the "Xem <tile>" button and the `.owned-properties-list__item` class.
- **Player portfolio (new, read-only)**: `PlayerPortfolioModal({ playerId })` with the same
  grid for any player; opened by plan 03 player cards (OD-03-4).

### 8.5 Card reveal (Chance / Khí Vận)

- Physical card on the table: paper-50 card (aspect 5:7 on portrait phones, 16:10 art
  area), deck frame 10px (Cơ Hội: lacquer-600 frame + gold "?" emblem; Khí Vận: jade-600
  frame + gold chest emblem), deck badge "CƠ HỘI"/"KHÍ VẬN", artwork (existing SVG), title
  (display 700), message (body, 18px), primary `lg` "Đóng" (acting player) or waiting text
  "Đang chờ người chơi đóng thẻ" (others).
- Entrance: translateY 32px→0 + fade + rotation −2°→0°, 320ms; **no flip, no spin**;
  reduced motion: fade 120ms.
- Implementation: migrate to `Modal` with no `onClose` (so no X), `closeOnEscape={false}`,
  `closeOnOutsideClick={false}`, `layer="card"` (z 70) — OD-04-3. Keep the wrapper
  `data-testid="card-interaction-overlay"` and `data-card-stage` attributes and exactly one
  "Đóng" button. Keep the two-column landscape layout for heights ≤ 620px.
- The development-only gallery (`?phase4-uat=1&card-gallery=1`) renders the new card.

### 8.6 Victory

- `Modal` size `xl`, tone `celebration`, `alertdialog`, title "Ván chơi kết thúc".
- Winner hero: large `PlayerAvatar` 128 (gold ring), crown icon, eyebrow "Người chiến
  thắng", name (display 800, player-color underline), color label; stats as four tiles
  ("Tiền mặt cuối ván", "Tài sản sở hữu", "Nhà", "Khách sạn").
- Other players: list with avatar, name, status ("Phá sản"/"Đã rời") and final cash if
  known (`FinishedPlayer.accountBalance`); **no ranks**, because `finishedPlayers` has no
  reliable order.
- Actions: host primary `lg` "Chơi lại" (keep text, `data-modal-autofocus`, busy text
  "Đang chuẩn bị ván mới…"); **everyone** gets secondary "Rời phòng" (existing leave flow).
  Non-host hint "Đang chờ chủ phòng bắt đầu ván mới".
- Celebration (OD-04-4): one DOM/SVG confetti burst (≤ 60 pieces, ≤ 1200ms, lacquer/gold/
  jade/paper colors) on first appearance during live presentation; none on reconnect/
  snap; none with reduced motion.
- Appearance gating (OD-04-5): during live presentation show the victory modal only when
  the presentation queue is idle (`status === 'idle'`), so final bankruptcy/coin
  animations finish first; after a snap (`SESSION_SYNC`/`SPECTATOR_SYNC`/reconnect) show it
  immediately. Add tests for both paths.

### 8.7 Settings

`Modal` size `md` with the `footer` slot (remove negative-margin CSS):

| Section | Controls (labels unchanged unless noted) |
| --- | --- |
| Âm thanh | `Slider` "Âm lượng tổng", "Nhạc nền", "Hiệu ứng" (value shown as %) |
| Hiển thị | `SegmentedControl` "Tốc độ chuyển động" (0.75x, 1x, 1.5x, 2x); `Switch` "Giảm chuyển động" + dynamic hint |
| Đồ họa | `SegmentedControl` "Chất lượng đồ họa" (Tự động, Cao, Cân bằng, Thấp) + hint — only if plan 02's `graphicsQuality` exists; otherwise omit the section |
| Cửa sổ (desktop only) | `Switch` "Toàn màn hình" |
| Footer | ghost "Khôi phục mặc định", primary "Xong" |

Keep the dialog name "Cài đặt", the "Đóng" X, and body scrolling for short viewports.
Add `settings/SettingsPanel.test.tsx` (renders all controls, keyboard operation of the
segmented control and switches, reset, desktop-only section).

### 8.8 Pre-game screens

**Landing (`JoinForm`)**

- Desktop (≥ 1024 wide): two columns. Left hero: eyebrow "OWN THE BLOCK" (aria-hidden),
  `h1` "Cờ Tỷ Phú Việt Nam" in `--type-hero` on **one line** at ≥ 1200px (no "Việt / Nam"
  wrap; allow a balanced two-line wrap below that), subtitle, and a hero composition of
  the 8 mascots standing in a row on a stylized mini board (SVG/CSS composition from the
  existing mascot SVGs; no new external art required). Right: join card.
- Join card: "Tên của bạn"; mode `SegmentedControl` "Loại phòng": "Có mã phòng" (default)
  / "Phòng chung"; when "Có mã phòng", show the "Mã phòng" field (label unchanged) with a
  cleaner placeholder "Ví dụ: GAME-1234"; when "Phòng chung", hide the field and submit
  `LOBBY` (same semantics as today's empty field). `?room=` prefill selects "Có mã phòng".
  Primary `lg` "Vào phòng" (keep label and disabled rules). Connection status line and
  error alert keep their roles.
- Phone: single column; compact hero (mascot row scaled).
- Background: the paper/backdrop gradient of the table color (plan 01 tokens), not the
  mint radial gradient.

**Launcher (`DesktopMultiplayerLauncher`)**

- Title "Chơi qua mạng LAN"; three choice cards with icons: "Tạo phòng trên máy này"
  (replaces "Host Game"; `host` icon; description "Máy này làm chủ phòng, người khác vào
  qua Wi-Fi"), "Tham gia phòng LAN" (replaces "Join Game"; `join` icon), "Máy chủ đã cấu
  hình" (unchanged, when configured). "Tiếp tục Host đang chạy"/"Dừng Host" stay.
- Forms use primitives; add a visible focus style for `select`.
- Update `DesktopMultiplayerLauncher.test.tsx` and `AppBootstrap.test.tsx` (`/Host Game/`,
  `/Join Game/`).
- The launcher renders outside providers: use plain CSS from tokens and the primitives
  that do not require providers (verify `Button` has no provider dependency).

**Lobby**

- Header: eyebrow "Mã phòng", room code in `--type-display` with a copy `IconButton`
  ("Sao chép mã phòng"), actions "Cài đặt" (ghost), "Rời phòng" (secondary), host "Bắt đầu"
  (primary `lg`); under "Bắt đầu" a reason line when disabled: "Cần ít nhất 2 người chơi",
  "Chờ mọi người sẵn sàng", "Có người chưa chọn mascot", "Có người đang mất kết nối",
  "Hai người đang trùng mascot và màu" (derived from the same client checks that disable
  the button). Make sure no other button text contains "Sẵn sàng" or "Bắt đầu" (e2e
  substring matching).
- Seats: four seat cards in a row (desktop) or 2×2 (compact/phone). Each: mascot on a
  pedestal disc in the player color, name + " (bạn)", Badge "Chủ phòng" (still exactly one
  `.ds-badge` per lobby-player), ready stamp that keeps the element and classes
  `lobby-player__ready-dot--ready/--not-ready` with labels "Đã sẵn sàng"/"Chưa sẵn sàng",
  offline icon "Mất kết nối", own ready button "Sẵn sàng"/"Hủy sẵn sàng". Empty seat:
  dashed outline, "Chỗ trống N", hint "Chia sẻ mã phòng để mời bạn".
- Mascot stage: warm spotlight disc, carousel (labels unchanged), thumbnails and color
  swatches as tactile chips; switch to `useEffectiveReducedMotion()`.
- LAN share card (host): QR on a paper card, URL, "Sao chép liên kết", "Mạng chia sẻ",
  "Làm mới mạng" (labels unchanged).

**Mascot names (OD-04-1, decided 2026-09-30: "delete the English names; the image is
enough")**:

- **No mascot name is shown anywhere in the UI.** Mascots are identified visually only
  (lobby stage, thumbnails, avatars, victory hero). Do not add captions, labels, or
  tooltips with the mascot's name. Do not use the `title` attribute for mascot names
  (it renders a visible tooltip).
- **The English names are deleted** from `game/characters/characterRegistry.ts`. Rename
  the field `displayName` to `accessibleLabel` and give each mascot a Vietnamese value
  used **only** for assistive technology (`aria-label` on mascot buttons, `alt` on mascot
  images, the carousel's `aria-label`, the disabled color-swatch label "(đã dùng với …)"):
  `dog` "Chó", `capybara` "Capybara", `panda` "Gấu trúc", `cat` "Mèo", `penguin` "Chim cánh
  cụt", `elephant` "Voi", `rabbit` "Thỏ", `duck` "Vịt", `legacy` "Mascot cũ" (IDs unchanged).
  Screen-reader and keyboard users need these names (every icon-only button must have an
  accessible name), and the tests/e2e select mascots by them, so they cannot be removed
  entirely.
- Update `characterRegistry.test.ts` (no English values; `accessibleLabel` present for all
  9 entries), `Lobby.test.tsx` (button names "Chó", "Gấu trúc"…; the assertions that no
  mascot name appears as visible text stay and now cover the Vietnamese labels too),
  `WinnerBanner.test.tsx` (alt "Mascot Chó"), and `e2e/mobile-host.spec.ts` (select
  `getByRole('button', { name: 'Chó', exact: true })` / `'Capybara'` instead of
  `'Dog'`/`'Capybara'`, and assert `getByText('Chó', { exact: true })` has count 0).
- Add a grep check to the G4 review that no English mascot name (`Dog`, `Panda`,
  `Elephant`, `Cat`, `Penguin`, `Rabbit`, `Duck`) remains in `apps/client/src` outside
  test fixtures that deliberately check their absence.

**Loading, failure, connection, spectator**

- One `LoadingScreen` component for bootstrap and restoring: brand lockup, mascot row,
  stage text ("Đang tải tài nguyên…", "Đang khôi phục ván chơi…"), progress dots
  (reduced motion: static).
- `FailureScreen`/`BootstrapErrorScreen`: illustration (a mascot looking puzzled, from the
  existing SVGs), title, message, actions as primitives (labels unchanged).
- Connection overlay: paper card with spinner and "Đã mất kết nối"/reconnect status (text
  unchanged); z 90 above the card overlay (now 70).
- `SpectatorBanner`: pill "Chế độ Khán Giả" + "Rời phòng" (labels unchanged).

### 8.9 Hygiene items

- Remove `.button__purchase--yes/--no` rules and classes (rules deleted in T04.7, after
  `BuyPrompt` and `JailPanel` both use `Button` v2); remove these dead `Dashboard.css`
  selectors (found unused during the 2026-09-29 review; re-verify with a grep before
  deleting): `.player-card__tag`, `.bank-building-inventory`, `.button__start-game`,
  `.trade-offer-modal__title`, `.trade-offer-form__input--container`.
- `CardInteractionOverlay.css` hard-coded hex colors → tokens.
- `IconButton`/`Button` everywhere in touched files; migrate their Lucide imports to the
  plan 01 `ActionIcon` registry.

---

## 9. Technical Approach

- **Fixtures for real components**: extend the plan 01 Design Lab with a "Surfaces"
  section that renders the real `JoinForm`, `Lobby` (with `LobbyPlayerView` fixtures),
  `SettingsPanel` (inside a `SettingsProvider` with test settings),
  `DesktopMultiplayerLauncher` (with a mock `window.ownTheBlockDesktop` bridge), `WinnerBanner`
  and dashboard prompts (inside `stateContext`/`presentationContext` providers built from
  `game/presentation/testFixtures.ts`), `CardInteractionOverlay` (existing harness
  scenarios). Selection by `&surface=<id>` for the capture tool. Dev-only; production
  builds unchanged.
- **Deed model**: `game/ui/property/deedCardModel.ts` builds a presentational model from
  `tileId`, `state`, and `roomPlayers` (group, header colors, rows from `getTileDetails`,
  current index from the extracted helper, owner, group progress). Unit-tested; the
  component is pure.
- **Leave/forfeit access for dialogs**: expose the existing leave flow via a small context
  (e.g. `roomExitContext` provided in `App.tsx` next to `stateContext`) so `DebtPanel` and
  `WinnerBanner` can trigger it; the confirmation remains the central `ConfirmationDialog`.
- **Victory gating**: `useVictoryVisibility()` hook. When `presentationResetEpoch`
  changes (a snap: session/spectator/replay sync or reconnect) and a winner already
  exists, show the victory screen immediately. Otherwise (the winner arrived through a
  live update) show it once `presentation.status === 'idle'`. Once shown, it stays shown
  until the room leaves `FINISHED`. The winner itself always comes from authoritative
  state. Unit-test both paths and the "queue already idle" case.

---

## 10. Execution Guide

### T04.0 — Preflight

Branch; read README, plans 01/04, `CLAUDE.md`, `monopoly.client.instructions.md` rule 7,
`Client/{join-room,game-status,turn-actions,property-management,trade-offers}.instruction.md`,
`V1_RELEASE_CONTRACT.md` (card contract). Baseline tests and captures of every surface in
§3.2 (`evidence/04/baseline/`).

### T04.1 — Surface fixtures in the Design Lab

Implement §9 fixtures and capture ids; verify each surface renders without a server.

### T04.2 — Modal v2, ConfirmationDialog v2, Toast v2

Implement §8.1; tests for new props (placement, backdrop blocking, footer, layer
z-index, exit animation with reduced motion, backward compatibility of existing props).

Fix focus restore for exit animations and nested dialogs: a dialog that is exiting must
drop `aria-modal` (and become `inert`) as soon as it starts closing, and the restore logic
must return focus to the element that opened *this* dialog, or to the topmost remaining
open dialog when one is still open (a small modal stack in the primitive), instead of
skipping restore whenever any `[aria-modal="true"]` exists. Tests: close with exit
animation restores focus; a `ConfirmationDialog` opened over the debt `alertdialog`
returns focus into the debt dialog when cancelled.

### T04.3 — PropertyDeedCard

`deedCardModel.ts` + `PropertyDeedCard` variants + special-tile card; extract
`getCurrentRentDetailIndex`; tests (streets at 0–5 houses, railroad counts, utilities,
unowned, owner, group progress).

### T04.4 — Buy and Development

Implement §8.3 Buy/Development; keep gating/guards; remove purchase CSS hazard; update
`DecisionPrompts` tests (names unchanged; new reason text).

### T04.5 — Inspection and special-tile cards

Implement §8.4 inspection; keep Escape/outside click/focus return; update tests.

### T04.6 — Portfolio and player portfolio

Implement "Tài sản của tôi" v2 and `PlayerPortfolioModal`; tests.

### T04.7 — Jail, Debt, Forced sale, Trade, Incoming offers

Implement §8.3 remaining surfaces, the forfeit path in the debtor dialog (via the exit
context), and hygiene removals (migrate `JailPanel` to `Button` v2 first, then delete the
`.button__purchase--yes/--no` rules); update tests.

### T04.8 — Card reveal

Implement §8.5 (migrate to `Modal`, OD-04-3 decided); run the V1 card checks (§11); update
`CardInteractionOverlay.test.tsx`; capture the gallery (all 28 cards) and portrait/landscape
phone layouts.

### T04.9 — Victory

Implement §8.6 including leave-for-everyone, gating hook, optional confetti; tests
(host/non-host actions, gating live vs snap, reduced motion).

### T04.10 — Settings

Implement §8.7; add `SettingsPanel.test.tsx`; verify e2e settings assertions (fit, scroll,
44px, reduced-motion icon transition).

### T04.11 — Landing

Implement §8.8 landing; update `App.test.tsx` and e2e join steps only where the mode
toggle requires it (default mode keeps the room field visible).

### T04.12 — Launcher

Implement §8.8 launcher; update launcher/bootstrap tests.

### T04.13 — Lobby and mascot names

Implement §8.8 lobby, `MascotPicker` reduced-motion fix, LAN share card, and the mascot
name change (no visible names; English names deleted; Vietnamese `accessibleLabel` for
assistive technology only); update `Lobby.test.tsx`, `characterRegistry.test.ts`,
`WinnerBanner.test.tsx`, `HostLanSharing.test.tsx`, e2e.

### T04.14 — Loading, failure, connection, spectator

Unify loading screens; restyle failure/connection/spectator; update `App.test.tsx` if
structure changes (texts unchanged).

### T04.15 — Responsive and engine pass

Every surface at the standard viewports in Chromium and WebKit; `pnpm test:e2e:mobile`;
fix overflow, fit, scroll, and target sizes.

### T04.16 — Gate G4

Evidence set `evidence/04/g4/`; walk the §11 manual checklist; human verdict in §17.

### T04.17 — Documentation

- `Client/join-room.instruction.md` (landing modes, launcher labels, loading/failure/
  connection screens), `Client/game-status.instruction.md` (lobby seats/start reasons,
  victory actions and gating, spectator banner), `Client/turn-actions.instruction.md`
  (buy/development/jail surfaces), `Client/property-management.instruction.md` (deed card,
  inspection, portfolios, debt forfeit), `Client/trade-offers.instruction.md` (trade and
  incoming offers), `Client/README.md` (surface map), `monopoly.client.instructions.md`
  rule 7 (Modal v2 props).
- `V1_RELEASE_CONTRACT.md` card section: note the restyle (frame, entrance motion) and that
  every clause still holds; `V1_FINAL_MANUAL_ACCEPTANCE.md`: the card and lobby checks now
  refer to the V2 visuals.
- Testcase rows: `join-room-and-player-lifecycle.md`, `game-status-bankruptcy-and-winner.md`
  (victory leave/gating `[CLIENT][AUTOMATED]`), `property-economy.md` (deed model
  `[CLIENT][AUTOMATED]`), `payment-shortfall-and-forced-sale.md` (debtor forfeit path
  `[CLIENT][AUTOMATED]`), `trading-market-and-private-offers.md`, `turn-movement-buy-and-jail.md`,
  `shared-contracts-and-board-data.md` (mascot accessible labels, no visible names), and
  `client-state-sync-motion-and-accessibility.md` (Modal v2, reduced motion in the picker).

---

## 11. Testing and Verification

| Check | Type | Where |
| --- | --- | --- |
| Modal v2 props and compatibility | AUTOMATED | `Modal.test.tsx` (new or extended) |
| Deed model and current-rent helper | AUTOMATED | `deedCardModel.test.ts`, `propertyDetails.test.ts` |
| Decision surfaces (names, disabled reasons, guards) | AUTOMATED | dashboard tests |
| Debtor forfeit path uses the existing leave flow + confirmation | AUTOMATED | `DebtPanel.test.tsx` |
| Victory actions and gating | AUTOMATED | `WinnerBanner.test.tsx` + gating hook test |
| Card overlay single "Đóng", no Escape/backdrop, acting-player only | AUTOMATED | `CardInteractionOverlay.test.tsx` |
| Settings controls | AUTOMATED | `SettingsPanel.test.tsx` |
| Landing modes, launcher labels, lobby rules/reasons, mascot names | AUTOMATED | updated component tests |
| Mobile layout contract | AUTOMATED | `pnpm test:e2e:mobile` |
| Card artwork validator unchanged | AUTOMATED | `pnpm test:card-art` |
| V1 card contract review (immediate reveal, no flip/spin, Đóng only for actor, reconnect keeps the card, spectators cannot close) | MANUAL | harness scenarios `chance`, `chest`, `reconnect-revealed`, `spectator-revealed` |
| Visual quality, Vietnamese typography, WebKit rendering | MANUAL | G4 captures |

---

## 12. Accessibility

- Deed card: `article` + `table` with caption and `aria-current` row.
- Segmented controls and switches from plan 01 (keyboard operable).
- Every disabled primary action has a visible reason (not only `title`).
- Dialog titles are real headings; `alertdialog` for blocking decisions keeps an
  accessible description.
- Confetti and entrance motion are decorative and suppressed by reduced motion.
- Color never the only signal (ready stamps have text; group pips have labels).

---

## 13. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| e2e substring matching breaks on new texts ("Sẵn sàng", "Bắt đầu") | Audit every new label; run e2e early (T04.13). |
| Card contract violated by the new entrance | Motion limited to translate/fade/slight rotation; manual contract review in G4. |
| Victory gating hides the modal forever (queue never idle) | Gate on idle **or** snap; add a safety fallback (show after the presentation reset or after the queue resolves); tests. |
| Forfeit inside Debt triggers unexpected server behavior | Reuse the existing leave flow only; no new command; confirmation dialog. |
| Rent doubling misunderstood | Text note only; recorded limitation; no invented numbers. |
| Mascot rename breaks e2e/tests | Update in one task with the e2e run. |
| Launcher outside providers | Use provider-free primitives; test in isolation. |
| Modal migration of the card overlay changes focus behavior | Keep `[data-modal-autofocus]` on "Đóng" for the actor; test focus. |

---

## 14. Decisions

Answered by the product owner on 2026-09-30; binding for implementation. The
specification in §8 reflects these choices.

| ID | Question | Options considered | Decision (product owner, 2026-09-30) |
| --- | --- | --- | --- |
| OD-04-1 | Mascot names | Vietnamese names / keep current (partly English) | **DECIDED: delete the English names; show no mascot name at all (image only).** Keep Vietnamese accessible labels for assistive technology only (details in §8.8, "Mascot names") |
| OD-04-2 | Buy/Development placement | Sheet with clear backdrop / centered dimmed modal | **DECIDED: Sheet sliding up from the bottom, clear (non-dimming, pointer-blocking) backdrop** |
| OD-04-3 | Migrate the card overlay to `Modal` | Yes (layer card) / keep custom portal | **DECIDED: Yes** (`layer="card"`, no X, no Escape/backdrop close) |
| OD-04-4 | Victory confetti | One burst / none | **DECIDED: One burst** on first live appearance; none on reconnect/snap or with reduced motion |
| OD-04-5 | Gate victory on presentation idle | Yes / no | **DECIDED: Yes** (live: wait for the queue to be idle; snap/reconnect: show immediately) |
| OD-04-6 | Landing room mode toggle | Explicit toggle / keep empty-field semantics | **DECIDED: Explicit toggle "Có mã phòng" / "Phòng chung", default "Có mã phòng"** |
| OD-04-7 | Hero art | Mascot composition now, V2 board render later / commission | **DECIDED: Composition of the existing mascot SVGs** (no commissioned art) |
| OD-04-8 | "Bỏ cuộc" inside the debtor dialog | Yes / no | **DECIDED: Yes** (existing leave flow + `ConfirmationDialog`; no new server command) |
| OD-04-9 | Read-only player portfolio | Yes / no | **DECIDED: Yes** (`PlayerPortfolioModal`, used by plan 03 player cards) |

---

## 15. Definition of Done

- [ ] T04.0–T04.17 complete and logged in §17.
- [ ] G4 verdict recorded by a human; V1 card contract review recorded.
- [ ] README §9 commands green including `pnpm test:e2e:mobile`, `pnpm test:card-art`, and
  desktop checks (launcher in the packaged app).
- [ ] No English player-facing strings (grep review recorded).
- [ ] Docs and testcase rows updated (§T04.17).

---

## 16. Dependencies and Coordination

- Plan 03 positions the context stack (Jail/Debt observer) and toasts; this plan styles
  their contents.
- Plan 03 player cards call `PlayerPortfolioModal` (OD-03-4).
- Plan 02 provides `graphicsQuality`; if not merged yet, T04.10 omits the "Đồ họa" section
  and plan 02 adds it later.
- Plan 05 fills the deed card landmark art slot (2D art) and may add landmark names to the
  deed header.

---

## 17. Progress Log

| Date | Task | Commit | Evidence | Result / notes |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

Known limitations: complete-group rent doubling is shown as a rule note, not computed
(the existing client helper does not compute it).

**G4 verdict**: PENDING — reviewer, date, notes.

---

## 18. Agent Handoff Prompt

```text
You are implementing plan V2-04 "Modals, Cards and Pre-Game Screens" in the Own the
Block repository.

Read first, in order:
1. project-document/visual-overhaul-v2/README.md
2. project-document/visual-overhaul-v2/01_VISUAL_TARGET_AND_DESIGN_TOKENS.md (section 8)
3. project-document/visual-overhaul-v2/04_MODALS_CARDS_AND_PREGAME_SCREENS.md
4. CLAUDE.md, project-document/monopoly-websockets/monopoly.client.instructions.md,
   project-document/ui-ux-overhaul/V1_RELEASE_CONTRACT.md (card contract)

Plan 01 gate G1 must be APPROVED before production styling; if not, stop and report.
Work on branch visual-v2/04-surfaces. Execute tasks T04.0 to T04.15 in order, one
commit per task with its ID. Do not restructure components/Board.tsx (plan 03 owns it).
Keep all decision gating, request guards and authoritative enable/disable logic; add
no server commands (the debtor forfeit path reuses the existing leave flow). Respect
the V1 card contract exactly: immediate reveal, no flip/spin/draw, one "Đóng" for the
acting player only, no Escape/backdrop close. Do not compute rent rules that the client
does not already compute. Player-facing text is Vietnamese. Update tests and e2e only
where section 8 changes a label or structure, listing each change in the commit message.
Run pnpm typecheck, pnpm lint, pnpm test after each task and pnpm test:e2e:mobile before
finishing. Prepare the G4 package (T04.16) and stop for a human verdict; then do T04.17.
```
