# Phase 4 — Gameplay Actions & Animations

## 1. Mục tiêu

Biến các hành động gameplay chính thành presentation sequence dễ theo dõi và có impact.

Không thay game rules.

Mọi action chạy qua Presentation Event Layer + Animation Queue.

---

# 2. Dice Roll

Flow:

```text
Turn active
↓
Roll button enabled
↓
Click
↓
3D dice animation
↓
Result settle
↓
Movement begins
```

Dice result do server quyết định.

Client animation phải kết thúc đúng face/result server trả về.

Effects:

- shake
- roll/spin
- bounce
- board impact
- subtle shadow
- SFX hook

Không dùng physics để tính kết quả.

---

# 3. Movement

Sau dice:

```text
from tile
↓
tile-by-tile hops
↓
pass GO event nếu có
↓
destination
↓
landing feedback
```

Movement speed theo animation setting.

---

# 4. Pass GO

Nếu có reward:

- GO tile pulse
- floating +money
- short SFX
- HUD money update presentation

Không block movement quá lâu.

---

# 5. Property landing

Khi land property:

- tile highlight
- property panel xuất hiện
- owner state rõ
- action buttons rõ

Nếu unowned:

- Buy
- Decline / related action theo rules hiện tại

Nếu owned:

- show owner
- rent/payment presentation

---

# 6. Property purchase

Sequence:

```text
confirm buy
↓
money transfer visual
↓
ownership marker appears
↓
tile ownership color activates
↓
character small happy reaction
```

Không cần camera zoom.

---

# 7. Money Transfer

Đây là reusable system.

Support:

- player → player
- player → bank
- bank → player

Presentation:

- floating amount
- direction cue
- HUD count-up/count-down
- coin/cash particle nhẹ
- receiver feedback

Không cần mô phỏng từng đồng tiền.

---

# 8. Building

Build house:

```text
confirm
↓
payment
↓
house scale 0 → overshoot → settle
↓
dust/pop
↓
tile pulse
```

Hotel tương tự nhưng impact lớn hơn.

Nếu nhiều building được tạo trong một action:

- sequential pop ngắn
- không kéo dài quá mức

---

# 9. Chance / Khí vận

Flow:

```text
land tile
↓
deck pulse
↓
show DRAW button
↓
player confirms
↓
card reveal
↓
show text/result
↓
CONTINUE
↓
execute/present resulting state
```

Game effect do server/GameCore quyết định.

UI chỉ presentation.

---

# 10. Jail

Khi vào jail:

- character hop/snap vào jail slot
- bars/lock effect
- clang SFX hook
- HUD jail state update

Không cần camera cinematic.

---

# 11. Bankruptcy

Sequence:

- warning/critical state nếu applicable
- final bankruptcy event
- money/property resolution đã do server xử lý
- character desaturate/shrink/fade hoặc sad reaction
- HUD bankrupt state
- event feed entry

Không kéo dài quá 1–2 giây.

---

# 12. Turn transition

Mỗi turn:

- previous active highlight off
- compact banner/toast
- next player HUD glow
- Roll button enable nếu local player
- audio cue

Không full-screen interruption lâu.

---

# 13. Skip / speed behavior

All action animations phải support:

- 1x
- 1.5x
- 2x
- reduced motion

Skip phải:

- snap visual tới authoritative state
- complete queue safely
- không gửi fake action lên server

---

# 14. Testing

## Automated

- presentation sequence mapping
- dice result mapping
- movement path
- money transfer event
- purchase event
- build event
- card reveal flow
- jail flow
- bankruptcy queue
- skip/fast-forward

## Manual

Test 2–4 players:

- buy
- decline
- pay rent
- pass GO
- build
- hotel
- Chance
- Khí vận
- jail
- bankrupt
- reconnect giữa animation
- resize giữa animation

---

# 15. Acceptance Criteria

- [ ] Dice roll có presentation rõ.
- [ ] Dice result luôn match server.
- [ ] Movement dễ theo dõi.
- [ ] Buy property dễ hiểu.
- [ ] Money flow dễ hiểu.
- [ ] Build có impact.
- [ ] Chance/Khí vận có confirm draw.
- [ ] Jail feedback rõ.
- [ ] Bankruptcy feedback rõ.
- [ ] Turn transition rõ.
- [ ] Speed 1x/1.5x/2x hoạt động.
- [ ] Reduced motion hoạt động.
- [ ] Reconnect không phá queue/state.
- [ ] Game rule không regression.
- [ ] Typecheck/lint/tests pass.
