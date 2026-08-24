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

# 9. House & Hotel visual authoring

Buildings remain procedural client presentation derived from the existing
authoritative building count. The authored pass keeps the existing slots,
anchors, dimensions, contact shadows, level mapping and construction timing.

House:

- neutral plaster body `0.48 × 0.39 × 0.36`, approximately `#d9d2c2`, roughness
  `0.76`, metalness `0`
- one shared opaque sRGB façade `DataTexture` applied to the body; every
  vertical face reads as one row of two four-pane windows
- one genuine pitched/gable roof mesh with approximately `0.56 × 0.47`
  footprint and `0.18` rise; only the roof uses the owner's canonical display
  color

Hotel:

- neutral facade `0.92 × 0.60 × 0.78`, approximately `#d5d8d6`, roughness
  `0.68`, metalness `0`
- one shared opaque sRGB façade `DataTexture`; every vertical face reads as
  two columns × three floors, with four panes per panel
- the existing separate crown/roof keeps its footprint and height and uses the
  owner's canonical display color

Window grids are procedural texture detail, not individual frame/window
meshes. No external model or second presentation path is introduced; the
existing `TileAssembly → TileDevelopmentLayer → BuildingLayer` ownership path
remains the source of the visual owner color and building level.

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
- house/hotel facade texture layout, material profiles and canonical roof color
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

## Corrective pre-Phase-5 board proportion/readability contract (2026-08-23)

The board remains a client-only projection of the canonical shared 40-tile
registry. This corrective pass changes no server rule, protocol,
authority boundary, movement baseline or presentation queue.

- Canonical geometry is `EDGE_TILE_WIDTH=1.6`, `EDGE_TILE_DEPTH=2.58`,
  `CORNER_SIZE=2.46`, `TILE_GAP=0.05`. `TileBodyBatch`, `TileSurfaceBatch`,
  `TileSocket`, `BoardFoundation`, `BoardFrame` and `outerBoardAccent` consume
  these values through `boardLayout`; there are no per-tile geometry hacks.
- `CENTER_PLATFORM_SIZE` derives directly from
  `INNER_TILE_SURFACE_BOUNDARY * 2`; the distorted-layout compensation
  `CENTER_PLATFORM_INSET=0.6` is removed. Restoring the shorter depth
  naturally enlarges the center through that formula; the
  `CENTER_ORTHOGONAL_PATH_WIDTH=0.44` path remains unchanged.
  The `BOARD_FRAME_WIDTH=0.14` frame and the continuous top-deck gutter
  emphasize the ring while retaining a connected foundation. Foundation
  layers are lower `0.16`, middle `0.20`, top `0.12`, total `0.48`; the middle
  neutral grey is `#858d90`.
- Property typography is local SDF, inward-facing and hard-capped at two lines:
  manual fitting chooses the lines and font size, Troika receives
  `whiteSpace='nowrap'`, and the safe width is `90%` of the usable panel.
  Normal/special starting sizes remain `0.40/0.33` and `0.36/0.30`; normal
  fitting floors at approximately `0.29` and two-line text also fits the
  30% footer height. The regression set includes `Cà Mau`, `Huế`,
  `Nguyễn Huệ`, `Buôn Ma Thuột`, `Phú Mỹ Hưng`, `Landmark 81`,
  `Công Ty Điện` and `Công Ty Nước`.
  The shared 70/30 upper/footer panel contract remains the source for text and
  raised SVG icon placement; individual icon safe ratios are unchanged.
- Ownership uses the existing authoritative `ownedProps → BoardRenderModel →
  TileOwnershipLayer` path. The planted pole/cloth is enlarged to
  `0.56/0.48×0.25` with canonical player colors and remains separate from
  houses, hotel, divider, text and selection feedback. No `OwnerTab` or full
  width strip is reintroduced.
- Start derives its scale from tile `0`'s actual usable corner surface and
  targets `92%` of that width. Only the yellow arrow face is vertically
  scaled `1.20×`; posts, text, orientation and horizontal footprint remain
  planted in the corner panel. Approved House/Hotel dimensions are preserved and
  `tileAnchors` remain synchronized with those dimensions; levels `1–4` and `5`
  continue to map to Nhà and Khách Sạn.
- House/hotel bodies use the authored neutral facades and shared procedural
  window grids described in Section 9. Roof/crown owner color uses the same
  canonical display color as the HUD; no individual window/frame mesh is added.
- Visible dice use one instanced two-shadow batch. Each shadow stays on the
  airport field and interpolates from approximately `0.21` opacity at rest
  to `0.07` at the existing maximum lift, with a maximum `1.35×` footprint;
  both shadows use the shared die vertical-offset helper, including the
  first drop, reroll lift, tumble/bounce, settled and hidden states.
- Fixed orthographic camera direction, distance and board/dice/station fit
  points remain unchanged. `FixedBoardCamera` applies one centralized
  `ORTHOGRAPHIC_READABILITY_ZOOM=1.08`; the board remains uncropped at
  `1280×720`, `1440×900` and `1920×1080`. Normal/stress budgets remain
  `≤210/<240` draw calls and `≤80,000/<100,000` triangles.

- Corner-specific art is tuned without a global SVG multiplier: Jail uses
  `72%` width and `68%` depth, Parking cars use a `1.18×` geometry scale with
  tighter spacing, and Go To Jail handcuffs use `89%` width and `82%` height.

The existing `Phase4UatHarness` now includes `board-readability` for the static
board sweep and `dice-contact-shadows` for the animated first-roll/reroll
shadow sweep. Automated tests cover canonical transforms, surface and
center-frame clearance, adaptive text, flag footprint, Start ratio, foundation
layers, dice shadow interpolation, building anchors, corner-art ratios and
camera fit. Visual evidence and any unavailable live or Electron checks remain
reported separately.
