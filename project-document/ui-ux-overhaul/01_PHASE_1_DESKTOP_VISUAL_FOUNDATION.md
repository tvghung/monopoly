# Phase 1 — Desktop & Visual Foundation

## 1. Mục tiêu

Tạo nền móng cho toàn bộ overhaul trước khi chuyển gameplay sang 2.5D.

Phase này **chưa cần board 3D hoàn chỉnh**.

Kết quả cần đạt:

- Game chạy được trong Electron.
- Existing web/client flow vẫn hoạt động.
- Design system mới được áp dụng.
- Lobby/HUD/cards/buttons có visual direction thống nhất.
- Presentation Event Layer được tạo.
- Animation Queue được tạo.
- Settings/loading/audio foundation được tạo.
- Không thay đổi game rule.

---

# 2. Scope

## 2.1 Electron desktop shell

Implement:

- Electron main process
- preload bridge nếu cần
- renderer = existing React app
- dev mode
- production build
- Windows package foundation
- macOS package foundation

Không đưa:

- game state
- socket state
- business logic

vào Electron main process.

---

## 2.2 Desktop behavior

Cần có:

- app title/icon placeholder
- default window size hợp lý
- minimum window size
- fullscreen toggle
- maximize support
- safe quit
- devtools chỉ development
- external links mở bằng system browser
- browser navigation shortcuts không làm hỏng game

---

# 3. Design system

Tạo centralized tokens:

```text
colors
spacing
radius
shadow
font-size
font-weight
z-index
animation durations
```

Visual target:

- colorful
- soft
- readable
- playful
- desktop-game-like

Không sử dụng quá nhiều gradient.

Không dùng màu player làm màu UI global.

---

# 4. Core UI components

Refactor/tạo:

- PrimaryButton
- SecondaryButton
- IconButton
- GamePanel
- Modal
- Toast
- Badge
- PlayerCard
- PropertyCard
- ConfirmationDialog
- SettingsPanel
- LoadingScreen

Mục tiêu:

- states rõ: hover / active / disabled / focus
- keyboard accessible cơ bản
- không duplicate style

---

# 5. Lobby redesign foundation

Lobby phải hỗ trợ layout cho:

- room code
- host
- player slots
- player color
- character selection placeholder
- ready state
- start game
- leave room

Chưa cần character art cuối cùng.

Có thể dùng placeholder.

---

# 6. Player HUD foundation

Mỗi player HUD cần support:

- name
- avatar/character
- color
- money
- property count
- building count
- current turn
- disconnected
- bankrupt
- jail
- ready/loading state nếu cần

Active player phải nhìn ra ngay.

---

# 7. Presentation Event Layer

Tạo type riêng cho presentation.

Ví dụ:

```ts
type PresentationEvent =
  | RollDiceEvent
  | MoveCharacterEvent
  | LandTileEvent
  | TransferMoneyEvent
  | PurchasePropertyEvent
  | BuildPropertyEvent
  | DrawCardEvent
  | EnterJailEvent
  | BankruptcyEvent;
```

Không reuse trực tiếp server event nếu làm vậy khiến presentation phụ thuộc quá chặt vào transport layer.

---

# 8. Animation Queue

Cần một centralized queue.

Capabilities:

- enqueue
- sequential execution
- priority/reset
- skip current
- skip all
- speed multiplier
- reconnect reset
- abort/cancel token
- await completion
- no direct server mutation

Suggested status:

```text
idle
playing
paused
skipping
resetting
```

---

# 9. Timing configuration

Tất cả animation timing phải centralized.

Ví dụ:

```ts
export const animationTiming = {
  diceRoll: 900,
  tileHop: 180,
  landing: 220,
  moneyTransfer: 450,
  propertyPurchase: 500,
  buildPop: 350,
};
```

Không hardcode 300/500/1000 ở nhiều component.

---

# 10. Settings foundation

Tạo settings model:

- masterVolume
- musicVolume
- sfxVolume
- animationSpeed
- reducedMotion
- fullscreen
- maybe graphicsQuality

Persist local.

V1 có thể dùng localStorage hoặc desktop-safe persistence phù hợp architecture.

---

# 11. Loading foundation

Tạo loading lifecycle:

```text
App boot
↓
Load config
↓
Load critical UI assets
↓
Initialize socket/client
↓
Ready
```

Phase sau sẽ thêm 3D/sound preload.

---

# 12. Testing

## Automated

- settings persistence
- animation queue order
- queue skip
- queue reset
- presentation event mapping
- lobby state rendering
- HUD state rendering

## Manual

- app open/close
- resize
- maximize
- fullscreen
- join room
- ready/unready
- reconnect
- start game
- leave room

---

# 13. Acceptance Criteria

- [ ] Electron dev mode chạy được.
- [ ] Production desktop build foundation chạy được.
- [ ] Existing multiplayer flow không bị phá.
- [ ] Existing game rules không thay đổi.
- [ ] New design tokens được sử dụng.
- [ ] Lobby visual foundation mới hoàn tất.
- [ ] HUD foundation mới hoàn tất.
- [ ] Presentation Event Layer tồn tại độc lập.
- [ ] Animation Queue có unit tests.
- [ ] Animation speed setting hoạt động.
- [ ] Reduced motion flag tồn tại.
- [ ] Fullscreen/windowed hoạt động.
- [ ] Typecheck pass.
- [ ] Lint pass.
- [ ] Tests pass.

---

# 14. Không làm ở Phase 1

- Không implement full 3D board.
- Không làm dice 3D.
- Không implement final character sprites.
- Không build house/hotel animation.
- Không thêm nhiều particles.
- Không thay đổi GameCore rules.
