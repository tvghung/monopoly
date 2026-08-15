# Monopoly UI/UX Super Overhaul — Masterplan

## 1. Mục tiêu

Đợt overhaul này nhằm biến game từ một web Monopoly có UI chức năng thành một **desktop board game có game feel rõ ràng, dễ theo dõi, bắt mắt và đủ “đã” khi chơi nhiều người**.

Target trải nghiệm:

> **Business Tour-inspired cute 2.5D desktop board game**

Không cố clone Business Tour 1:1 và không đặt mục tiêu làm game full 3D AAA.

Ưu tiên:

- Board có chiều sâu và góc nhìn isometric/top-down xéo.
- Camera gần như cố định, hạn chế tối đa pan/rotate/zoom.
- Nhân vật cute, dễ phân biệt, không cần rig/animation 3D phức tạp.
- Dice, movement, buy/build, money, Chance/Khí vận, jail và bankruptcy đều có feedback rõ.
- Game chạy như desktop app trên Windows và macOS.
- Giữ nguyên server/GameCore authoritative.
- Presentation layer phải tách biệt khỏi game logic.
- Các animation có thể skip/fast-forward mà không làm sai state.
- Không yêu cầu Blender artist.
- Không phụ thuộc vào external 3D production pipeline để hoàn thành v1.

---

# 2. Hướng kỹ thuật chốt

## 2.1 Desktop shell

Sử dụng:

- Electron
- React
- TypeScript
- Existing WebSocket client
- Existing server/GameCore

Desktop targets:

- Windows `.exe`
- macOS `.app` / `.dmg`

Electron chỉ đóng vai trò desktop shell. Không chuyển game logic sang Electron main process.

---

## 2.2 Rendering

Sử dụng:

- Three.js
- React Three Fiber
- WebGL
- Fixed isometric camera

Không dùng full 3D character rigs trong scope hiện tại.

---

## 2.3 Visual model

### 3D thật bằng code

- Board platform
- Tiles
- Tile borders
- Property color strips
- Houses
- Hotels
- Jail
- Dice
- Chance/Khí vận deck
- Trees
- Lamps
- Simple decorative props
- Shadows
- Lighting

### 2D trong 3D world

Nhân vật dùng transparent PNG sprite/billboard:

- Shiba
- Capybara
- Panda
- Cat
- Penguin
- Fox
- Rabbit
- Duck

Character không cần:

- skeleton
- rigging
- walk cycle
- Blender pipeline
- GLB animation

Movement dùng tween + hop + squash/stretch + shadow.

### React/HTML UI

- Lobby
- Character selector
- Player HUD
- Buttons
- Property cards
- Chance/Khí vận modal
- Event feed
- Settings
- End-game screen
- Reconnect screen
- Loading screen

---

# 3. Nguyên tắc kiến trúc bắt buộc

## 3.1 Server owns truth — Client owns presentation

Server quyết định:

- dice result
- position
- payment
- purchase
- ownership
- building count
- bankruptcy
- winner
- turn state

Client không được tự quyết định game result thông qua physics hoặc animation.

Ví dụ:

```text
SERVER
dice = [4, 3]
position = 17

CLIENT
animate dice → show 4 + 3
animate player tile-by-tile → 17
```

Nếu animation bị skip, state cuối vẫn phải là tile 17.

---

## 3.2 Presentation Event Layer

Không để UI subscribe state rồi tự chạy hàng loạt `setTimeout()`.

Phải có pipeline:

```text
Server Event / State Change
        ↓
Game Event Adapter
        ↓
Presentation Event
        ↓
Animation Queue
        ↓
3D World + React UI
```

Ví dụ:

```text
PLAYER_ROLLED
PLAYER_MOVED
PROPERTY_LANDED
RENT_PAID
```

được convert thành:

```text
ROLL_DICE
MOVE_CHARACTER
LAND_TILE
TRANSFER_MONEY
```

---

## 3.3 Animation Queue

Animation queue phải:

- chạy tuần tự khi cần
- cho phép event song song khi an toàn
- cancel/reset khi reconnect
- skip khi user chọn fast mode
- không block authoritative state
- không gửi command ngược lên server chỉ để hoàn thành animation

Không dùng architecture kiểu:

```ts
setTimeout(...)
setTimeout(...)
setTimeout(...)
```

rải rác trong component.

---

# 4. Camera policy

Camera là **fixed isometric camera**.

Mặc định:

- không rotate theo player
- không orbit
- không follow character liên tục
- không cinematic camera mỗi action

Cho phép rất hạn chế:

- micro zoom 5–10% ở một số event quan trọng
- optional focus effect bằng depth/glow thay vì camera movement
- user có thể disable camera effects

Ưu tiên tạo impact bằng:

- tile glow
- shadow
- bounce
- particle
- sound
- HUD
- floating text

thay vì di chuyển camera.

---

# 5. Art direction

Target:

- cute
- colorful
- fresh
- toy-like
- soft
- clean
- readable
- low-poly-inspired
- pastel nhưng đủ contrast

Không dùng quá nhiều neon.

Không làm board quá nhiều chi tiết khiến gameplay khó đọc.

Board phải trả lời ngay được:

- Ai sở hữu đất?
- Có bao nhiêu nhà?
- Có hotel chưa?
- Player đang ở đâu?
- Đến lượt ai?
- Player nào đang thiếu tiền?
- Tile nào vừa được tác động?

---

# 6. Character strategy

## V1

8 character sprite:

1. Shiba
2. Capybara
3. Panda
4. Cat
5. Penguin
6. Fox
7. Rabbit
8. Duck

Character chỉ là cosmetic.

Không có:

- stat bonus
- special ability
- gameplay advantage

Mỗi character chỉ cần một base sprite.

Reaction dùng:

- scale
- rotation
- bounce
- particles
- emoji bubble
- color glow

Không cần nhiều sprite sheet trong v1.

---

# 7. Game-feel priorities

Ưu tiên theo thứ tự:

1. Turn clarity
2. Dice roll
3. Character movement
4. Landing feedback
5. Money transfer
6. Property purchase
7. Build / Hotel
8. Chance / Khí vận
9. Jail
10. Bankruptcy
11. Victory
12. Emotes
13. Ambient decoration

Nếu phải cắt scope, cắt decoration trước, không cắt feedback gameplay.

---

# 8. Sound direction

Sound là một phần quan trọng của overhaul.

Cần audio groups:

- UI
- dice
- movement
- money
- property
- build
- Chance/Khí vận
- jail
- bankruptcy
- victory
- reactions
- ambience
- music

Mỗi group phải có independent volume hoặc ít nhất:

- Master
- Music
- SFX

Không để sound effect kéo dài làm chậm game.

---

# 9. Desktop UX

Desktop app cần:

- splash/loading screen
- preload critical assets
- border/window behavior hợp lý
- fullscreen/windowed setting
- resolution scaling
- persistent settings
- audio settings
- animation speed
- reduced motion
- reconnect handling
- quit confirmation khi đang trong game nếu cần

Không phụ thuộc browser navigation.

---

# 10. Performance budget

Target:

- 60 FPS trên laptop/desktop phổ thông hiện đại
- không cần ultra graphics
- không dùng post-processing nặng nếu không cần
- giới hạn particle count
- texture size hợp lý
- lazy load non-critical assets
- preload gameplay-critical assets trước khi vào game
- tránh rerender React không cần thiết
- không recreate Three.js materials/geometries mỗi frame

---

# 11. Phase breakdown

## Phase 1 — Desktop & Visual Foundation

Mục tiêu:

- Electron shell
- design system mới
- HUD/lobby/card foundations
- presentation event architecture
- animation queue
- settings/loading foundation

File:

`01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md`

---

## Phase 2 — 2.5D Board

Mục tiêu:

- React Three Fiber
- fixed isometric camera
- board geometry
- tiles
- ownership
- building placeholders
- lighting/shadow

File:

`02_PHASE_2_2_5D_BOARD.md`

---

## Phase 3 — Character System

Mục tiêu:

- character selector
- sprite registry
- billboard rendering
- hop movement
- shadow
- player color
- reactions

File:

`03_PHASE_3_CHARACTER_SYSTEM.md`

---

## Phase 4 — Gameplay Actions & Animations

Mục tiêu:

- dice
- movement sequence
- landing
- purchase
- money
- build
- Chance/Khí vận
- jail
- bankruptcy

File:

`04_PHASE_4_GAMEPLAY_ACTIONS.md`

---

## Phase 5 — Game Feel, Audio & Effects

Mục tiêu:

- sound design
- particles
- glow
- floating money
- micro feedback
- turn transitions
- event feed
- emotes
- victory presentation

File:

`05_PHASE_5_GAME_FEEL_AUDIO_EFFECTS.md`

---

## Phase 6 — Polish & Distribution

Mục tiêu:

- performance
- preload
- settings
- reconnect
- accessibility
- installer
- Windows EXE
- macOS APP/DMG
- release verification

File:

`06_PHASE_6_POLISH_DISTRIBUTION.md`

---

# 12. Execution strategy với Codex

Không chạy cả 6 phase trong một prompt.

Flow:

```text
Current rules refactor complete
        ↓
Run tests
        ↓
Create overhaul branch
        ↓
Phase 1
        ↓
Review + tests
        ↓
Commit checkpoint
        ↓
Phase 2
        ↓
Review + tests
        ↓
...
        ↓
Phase 6
```

Mỗi phase cần:

1. Inspect code liên quan.
2. Viết implementation plan cụ thể theo repo thật.
3. Implement.
4. Typecheck.
5. Lint.
6. Unit/integration tests.
7. Manual QA checklist.
8. Không tiếp tục phase kế nếu core acceptance criteria chưa pass.

---

# 13. Rules khi Codex implement

Codex không được:

- rewrite GameCore nếu không cần
- thay luật game trong overhaul
- đưa animation timing vào server logic
- để renderer quyết định dice
- dùng physics để quyết định result
- block server state vì animation
- tạo duplicate source of truth
- hard-code player positions rải rác
- hard-code tile coordinates trong nhiều component
- thêm camera movement mạnh
- bắt buộc Blender/GLB assets để game chạy
- làm toàn bộ UI thành 3D
- dùng setTimeout chain làm animation architecture

Codex phải:

- giữ strict TypeScript
- giữ shared schemas nếu có
- dùng centralized board layout
- dùng centralized character registry
- dùng centralized sound registry
- dùng centralized animation timing/config
- có reduced-motion path
- có fallback nếu asset lỗi
- preserve reconnect behavior
- preserve persistence behavior
- maintain deterministic authoritative game state

---

# 14. Suggested directory direction

Ví dụ, tùy repo thực tế:

```text
apps/client/src/
├── desktop/
├── game/
│   ├── presentation/
│   │   ├── events/
│   │   ├── queue/
│   │   └── timings/
│   ├── scene/
│   │   ├── GameScene.tsx
│   │   ├── camera/
│   │   ├── board/
│   │   ├── characters/
│   │   ├── dice/
│   │   ├── buildings/
│   │   └── effects/
│   ├── audio/
│   ├── assets/
│   └── ui/
├── design-system/
└── settings/
```

Đây chỉ là direction. Trước khi implement phải map vào repo thật.

---

# 15. Definition of Done cho toàn bộ overhaul

Overhaul chỉ được coi là hoàn thành khi:

- [ ] Windows desktop build chạy được.
- [ ] macOS desktop build chạy được.
- [ ] Board 2.5D thay thế board cũ trong gameplay chính.
- [ ] Camera fixed và dễ quan sát.
- [ ] Player chọn character trong lobby.
- [ ] Character hiển thị đúng trên board.
- [ ] Character movement dễ theo dõi.
- [ ] Dice roll có impact rõ.
- [ ] Ownership/property development đọc được trực tiếp trên board.
- [ ] Buy/build/money/Chance/jail/bankruptcy có presentation rõ.
- [ ] Audio có Master/Music/SFX.
- [ ] Animation queue hoạt động đúng.
- [ ] Fast animation mode hoạt động.
- [ ] Reduced motion hoạt động.
- [ ] Reconnect không làm sai state.
- [ ] Skip animation không làm sai state.
- [ ] Không có game rule regression.
- [ ] Typecheck pass.
- [ ] Lint pass.
- [ ] Automated tests pass.
- [ ] Manual gameplay test 2–4 players pass.
- [ ] Không có memory leak/render degradation rõ sau một trận dài.
- [ ] Asset loading không gây pop-in nghiêm trọng.
- [ ] End-game screen hoàn thiện.

---

# 16. Out of scope cho overhaul v1

Không làm trong scope này:

- full 3D animated character rigs
- Blender production pipeline
- procedural facial animation
- complex camera cinematics
- advanced physics-based movement
- destructible environment
- ray-traced graphics
- photorealistic materials
- custom multiplayer voice chat
- character abilities
- cosmetic shop
- battle pass
- mobile native app
- console support

Những phần này chỉ xem xét sau khi v1 hoàn thành và gameplay thực tế chứng minh cần thiết.

---

# 17. Thành công của overhaul được đo bằng gì?

Không đo bằng số lượng animation.

Đo bằng việc:

- game dễ hiểu hơn
- người chơi luôn biết đang xảy ra gì
- mỗi turn có nhịp rõ
- dice roll thú vị
- movement dễ nhìn
- tiền và ownership dễ đọc
- build có impact
- lobby có personality
- board nhìn giống game desktop thật
- chơi 30–60 phút không thấy animation gây khó chịu
- performance ổn định
- reconnect không phá trải nghiệm

Nếu đạt các điểm trên, overhaul thành công.
