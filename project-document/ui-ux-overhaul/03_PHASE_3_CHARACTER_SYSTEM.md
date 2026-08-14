# Phase 3 — Character System

## 1. Mục tiêu

Cho phép player chọn mascot trong lobby và hiển thị mascot đó trên board.

Không sử dụng 3D rig.

Character = transparent 2D sprite/billboard nằm trong 3D world.

---

# 2. Initial roster

V1:

- Shiba
- Capybara
- Panda
- Cat
- Penguin
- Fox
- Rabbit
- Duck

Character cosmetic only.

---

# 3. Character data model

Shared/player state cần có character ID.

Ví dụ:

```ts
type CharacterId =
  | "shiba"
  | "capybara"
  | "panda"
  | "cat"
  | "penguin"
  | "fox"
  | "rabbit"
  | "duck";
```

Server phải validate selection.

Nếu character phải unique trong room thì rule phải được chốt và enforce server-side.

Khuyến nghị V1:

- mỗi character chỉ một player trong room
- nếu reconnect thì giữ character
- nếu character unavailable thì UI disable

---

# 4. Character Registry

Central registry:

```ts
interface CharacterDefinition {
  id: CharacterId;
  name: string;
  sprite: string;
  scale: number;
  verticalOffset: number;
}
```

Không import sprite rải rác.

---

# 5. Character selector

Lobby UI:

- grid mascot
- selected state
- unavailable state
- preview
- name
- ready integration

Không cần 3D preview.

Có thể animate preview bằng:

- bounce
- scale
- rotate 2–3 độ

---

# 6. Billboard rendering

Sprite phải:

- luôn readable từ fixed camera
- có consistent scale
- có world anchor
- không bị tile geometry che sai
- có blob shadow bên dưới

---

# 7. Character positioning

Không đặt nhiều character cùng tile trùng hoàn toàn.

Cần per-tile player offsets.

Ví dụ:

- 1 player: center
- 2 players: left/right
- 3 players: triangle
- 4 players: four corners

Offsets phải centralized.

---

# 8. Movement

Không cần walk animation.

Movement sequence:

```text
tile N
↓
hop
↓
tile N+1
↓
hop
↓
...
↓
destination
```

Mỗi hop:

- tween X/Z
- small Y arc
- subtle squash/stretch
- shadow shrink/grow
- optional tiny rotation

---

# 9. Landing feedback

Khi đến destination:

- short squash
- tile pulse
- small impact particle
- optional SFX hook

Không move camera.

---

# 10. Character reactions

Không tạo nhiều animation asset.

Reaction API:

```ts
playReaction("happy")
playReaction("sad")
playReaction("jail")
playReaction("bankrupt")
playReaction("emote")
```

Implementation có thể chỉ dùng:

- scale
- rotation
- vertical bounce
- emoji bubble
- color flash

---

# 11. Reconnect

Khi reconnect:

- character phải snap vào authoritative current tile
- không replay toàn bộ movement cũ
- current animation queue reset đúng cách
- character ID giữ nguyên

---

# 12. Testing

## Automated

- character selection validation
- registry mapping
- reconnect persistence
- tile offset assignment
- movement path generation

## Manual

- 2–4 players cùng tile
- character không overlap khó nhìn
- sprite không blur quá mức
- movement dễ theo dõi
- resized window vẫn scale ổn
- reconnect không clone character

---

# 13. Acceptance Criteria

- [ ] Player chọn được character trong lobby.
- [ ] Character selection được sync multiplayer.
- [ ] Character hiển thị đúng trên board.
- [ ] 2–4 player cùng tile vẫn phân biệt được.
- [ ] Character movement tile-by-tile.
- [ ] Hop animation mượt.
- [ ] Landing feedback rõ.
- [ ] Reconnect đúng character và position.
- [ ] Character không ảnh hưởng gameplay.
- [ ] Typecheck pass.
- [ ] Lint pass.
- [ ] Tests pass.

---

# 14. Không làm ở Phase 3

- Rigged 3D model
- walk cycle
- facial animation
- custom animation clip cho từng mascot
- cosmetic shop
