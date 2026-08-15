# Phase 6 — Polish & Distribution

## 1. Mục tiêu

Biến overhaul thành build desktop ổn định, có thể dùng thực tế trên Windows và macOS.

Focus:

- performance
- stability
- preload
- reconnect
- packaging
- release QA

---

# 2. Asset loading

Phân loại assets:

## Critical

Load trước khi vào gameplay:

- board textures
- character sprites của players trong room
- dice assets
- core SFX
- fonts

## Deferred

- unused character sprites
- extra music
- non-critical decorative assets

Không để gameplay bắt đầu khi critical assets chưa ready.

---

# 3. Loading screen

Show:

- logo
- progress
- current stage
- error/retry nếu asset fail

Không fake progress vô nghĩa nếu có thể đo thật.

---

# 4. Performance audit

Kiểm tra:

- FPS
- memory
- React rerenders
- draw calls
- geometry/material reuse
- texture memory
- particle count
- audio object lifecycle
- animation queue growth
- event listener cleanup

---

# 5. Quality settings

Nếu cần:

- High
- Balanced
- Low

Có thể điều khiển:

- shadows
- particles
- decorative props
- antialiasing/render scale

Không làm quality system quá phức tạp.

---

# 6. Long-session stability

Test trận dài.

Quan sát:

- FPS giảm dần?
- memory tăng liên tục?
- duplicate audio?
- duplicate character?
- stale event queue?
- reconnect nhiều lần?
- modal leak?
- event feed leak?

---

# 7. Reconnect hardening

Scenarios:

- reconnect khi idle
- reconnect khi dice đang animation
- reconnect khi movement
- reconnect khi card modal
- reconnect khi payment
- reconnect khi bankruptcy

Behavior:

- reset presentation queue
- fetch/use authoritative state
- snap visual state
- restore correct UI/action availability
- không replay stale animation

---

# 8. Desktop packaging

Windows:

- installer / executable
- app icon
- version metadata
- clean uninstall
- launch behavior

macOS:

- `.app`
- `.dmg` nếu pipeline hỗ trợ
- icon
- bundle metadata
- signing/notarization plan nếu distribute rộng

---

# 9. Auto-update

Nếu project cần:

- define update channel
- versioning
- update check
- safe restart

Có thể để post-v1 nếu chưa cần public distribution.

---

# 10. Crash/error handling

Cần:

- top-level error boundary
- renderer failure fallback
- socket failure UI
- asset failure fallback
- logging strategy
- safe recovery

Không show raw stack trace cho player production.

---

# 11. Accessibility / comfort

- reduced motion
- animation speed
- readable text
- color + icon, không chỉ color
- keyboard focus cơ bản
- sound controls
- fullscreen/windowed

---

# 12. Release QA Matrix

## Windows

- Windows 10
- Windows 11
- 1080p
- 1440p
- scaling 100/125/150%

## macOS

- Apple Silicon
- Intel nếu support là requirement
- Retina
- fullscreen/windowed

---

# 13. Multiplayer QA

Test:

- 2 players
- 3 players
- 4 players

Scenarios:

- normal game
- reconnect
- bankruptcy
- multiple builds
- rapid actions
- long game
- leave/rejoin
- finished room behavior

---

# 14. Final Regression

Bắt buộc chạy:

- typecheck
- lint
- full test suite
- persistence tests
- restart/recovery tests
- WebSocket tests
- multiplayer manual test

Overhaul không được phá các rule đã hoàn thành trước đó.

---

# 15. Acceptance Criteria

- [ ] Windows build cài/chạy được.
- [ ] macOS build chạy được.
- [ ] Critical assets preload đúng.
- [ ] Không có asset pop-in nghiêm trọng.
- [ ] Long-session performance ổn.
- [ ] Reconnect ổn ở các action quan trọng.
- [ ] Animation queue không leak.
- [ ] Audio không leak.
- [ ] Reduced motion hoạt động.
- [ ] Quality/performance settings nếu cần hoạt động.
- [ ] End-to-end 2–4 player test pass.
- [ ] Typecheck pass.
- [ ] Lint pass.
- [ ] Full tests pass.
- [ ] Không có game-rule regression.

---

# 16. Release Definition of Done

Chỉ release overhaul khi:

1. Desktop build ổn.
2. Gameplay rules giữ nguyên.
3. 2.5D board ổn.
4. Character selection/movement ổn.
5. Dice/buy/build/money/card/jail/bankruptcy presentation ổn.
6. Sound/effects không gây mệt.
7. Reconnect ổn.
8. Performance ổn.
9. End-game ổn.
10. Full regression pass.
