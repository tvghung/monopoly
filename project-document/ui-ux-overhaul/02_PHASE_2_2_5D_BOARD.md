# Phase 2 — 2.5D Board

## 1. Mục tiêu

Thay board gameplay hiện tại bằng một board 2.5D/3D đơn giản nhưng rõ ràng, render bằng React Three Fiber + Three.js.

Target:

- fixed isometric camera
- board đọc được ngay
- ownership rõ
- tiles rõ
- buildings có chiều sâu
- lighting/shadow vừa đủ
- không cần external 3D models

---

# 2. Core rendering stack

Thêm:

- Three.js
- React Three Fiber

Chỉ thêm helper libraries khi thực sự cần.

Không thêm physics engine chỉ để board render.

---

# 3. GameScene

Tạo scene root.

Ví dụ:

```tsx
<GameScene>
  <Board />
  <CharactersLayer />
  <DiceLayer />
  <EffectsLayer />
</GameScene>
```

Ở Phase 2:

- CharactersLayer có thể placeholder
- DiceLayer chưa cần hoàn thiện
- EffectsLayer tối thiểu

---

# 4. Camera

Camera policy:

- fixed perspective/isometric
- player không rotate
- player không orbit
- no automatic follow
- board luôn nằm trong vùng nhìn hợp lý

Cần responsive camera framing khi window resize.

Không dùng camera movement làm core feedback.

---

# 5. Board Layout Registry

Tạo một nguồn duy nhất chứa transform của từng tile.

Ví dụ:

```ts
interface BoardTileLayout {
  tileId: number;
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
}
```

Không hardcode tile coordinate trong:

- character
- house
- effect
- dice
- ownership marker

Mọi subsystem phải lookup từ board layout registry.

---

# 6. Tile rendering

Tile phải hỗ trợ:

- name
- type
- price nếu cần
- color group
- owner
- building state
- highlighted
- active/landed state

Không cần nhét toàn bộ property card text lên mặt board.

Ưu tiên readability.

---

# 7. Board geometry

Dựng bằng code:

- platform/base
- tile slabs
- center area
- borders
- corner tiles

Style:

- toy-board
- soft bevel nếu hợp lý
- material không quá bóng
- shadows nhẹ

---

# 8. Ownership visualization

Khi property có owner phải thấy ngay.

Design:

- owned purchasable tiles use a small planted 3D ownership flag
- flag cloth uses the owning player's canonical display color
- the flag derives from authoritative ownership/render-model data and coexists
  with houses, hotel and selection feedback
- unowned tiles have no ownership flag

The clean district surfaces remain unchanged; do not restore a full-width owner
strip or `OwnerTab`.

Không chỉ đổi một màu khó thấy.

Player color phải consistent với HUD.

---

# 9. House & Hotel placeholders

Dựng geometry đơn giản bằng code.

House:

- box body
- roof

Hotel:

- taller box
- roof/sign

Cần support đúng building count theo luật hiện tại.

Không cần final animation trong phase này.

---

# 10. Jail / Chance / Khí vận

Jail:

- simple 3D bars / platform
- recognizable

Chance/Khí vận:

- deck/cards dạng stacked planes
- decorative only ở Phase 2

---

# 11. Lighting

Tối thiểu:

- ambient/hemisphere-style light
- main directional light
- soft shadow

Không dùng lighting làm tile text khó đọc.

---

# 12. Decorative environment

Chỉ thêm nhẹ:

- trees
- lamps
- small props

Dựng bằng primitive geometry.

Không làm mini city quá chi tiết.

Gameplay readability > decoration.

---

# 13. Interaction

Board cần support:

- hover tile
- click tile
- selected tile
- property inspection trigger

React UI sẽ render detail panel.

Không dựng property modal bằng 3D text.

---

# 14. Responsive behavior

Board phải:

- fit laptop screens
- fit desktop monitors
- không bị HUD che các tile quan trọng
- scale hợp lý khi resize

---

# 15. Testing

## Automated

- board layout registry
- tile → world position lookup
- ownership render mapping
- building count mapping
- selected tile state

## Manual

- tất cả tile đúng thứ tự
- corner orientation đúng
- text không đảo
- player colors dễ phân biệt
- 2–4 player ownership dễ nhìn
- resize không mất board
- performance ổn

---

# 16. Acceptance Criteria

- [ ] Board render bằng R3F/Three.js.
- [ ] Camera fixed.
- [ ] Không cần orbit để chơi.
- [ ] 100% tile map đúng game state.
- [ ] Tile ownership đọc được.
- [ ] Buildings hiển thị đúng.
- [ ] Jail nhận diện được.
- [ ] Chance/Khí vận deck có visual representation.
- [ ] Property inspection hoạt động.
- [ ] Existing game logic không đổi.
- [ ] 60 FPS target đạt trên dev machine hợp lý.
- [ ] Typecheck pass.
- [ ] Lint pass.
- [ ] Tests pass.

---

# 17. Không làm ở Phase 2

- Final character art
- full dice animation
- sound pass
- rich particles
- final build animation
- end-game cinematic
