# Game board và canonical tile presentation

## Entry/code

Board nằm tại `/` cho activated Player hoặc Spectator. `Board.tsx` giữ HUD, semantic
tile controls, property dialog và chọn WebGL/fallback. WebGL code chính nằm trong
`game/scene/`: `GameScene.tsx`, `board/Board3D.tsx`, `boardRenderModel.ts`, tile
batches/materials/motion và local SDF text. Không có detail route hay permission key.

## Canonical data

- Map đúng 40 tile index từ `packages/shared/src/tileState.ts`; mapping tiếng Việt
  nằm tại [Shared board data](../Shared/board-and-card-data.instruction.md).
- Board face và property detail derive name/type/color/price/rent tiers/house cost
  từ shared tile. `BoardInitState.ts`/`backOfCards.ts` không còn là
  metadata source.
- Presentation-only icon/orientation được map theo `tileType`/index; không hard-code
  English label. Index 17 là Khí Vận, 20 Bãi Đỗ Xe, 28 Công Ty Nước.
- Center branding, alt/title/tooltip và status là “Cờ Tỷ Phú Việt Nam”/tiếng Việt.

## WebGL board surface

- `buildBoardRenderModel(authoritativeState, presentationState)` là boundary duy
  nhất trước scene: authoritative ownership/buildings kết hợp display position,
  active turn và tile-impact presentation; scene không viết ngược gameplay state.
- Chassis property dùng nền đá trung tính. District identity nằm trong tám
  `surfaceKey`: `oldTownStone`, `harborCeramic`, `coolGranite`, `terracottaBrick`,
  `metroConcrete`, `sandstoneTerrazzo`, `ecoSlate`, `premiumBrownStone`.
- Mỗi key giữ đúng một 512×512 sRGB albedo `DataTexture`, một non-color bump
  `DataTexture` và một `MeshStandardMaterial`; tài nguyên được dùng chung theo
  batch, không tạo lại khi hover/select. Upper art của 36 edge tiles được chia
  thành tám district instanced batches và một special batch; footer/divider dùng
  hai instanced layers chung, còn bốn corner tiles giữ treatment riêng.
- District identity nằm trong các pattern nền textless, sáng và thưa, có tuning
  density/contrast/seam/spacing. Không còn accent inlay, emblem nhỏ hoặc raised
  continuous color rail trên property tile. Ownership có marker riêng và không
  dùng district accent làm owner state.
- Mỗi edge tile có upper art panel 60%, footer nền sáng 40% và divider line hình
  học; upper/footer/divider dùng cùng tile-motion matrix với chassis.
- Surface, chassis, text và prop dùng cùng tile motion controller. Matrix mặt ô
  compose từ translation + quaternion XZ orientation + scale, giữ normal hướng lên
  ở cả bốn cạnh và footprint khớp tile thật.
- Property thường chỉ in tên, không in giá trên mặt ô. Cỡ local SDF adaptive là
  `0.255`/`0.225`/`0.195`: một dòng cho tên ngắn, hai dòng cho tên dài thông thường,
  ba dòng chỉ khi thật sự cần; maxWidth bằng 96% vùng usable footer. Special tile
  chỉ in một footer label; price không render trên mặt tile. Text dùng một
  canonical inward-facing rule theo side, gồm cả hai run sát Parking; hai run
  `LEFT`/`TOP` dùng cùng một camera-facing half-turn cho text và flat art. Jail
  và Vào Tù không render footer text, chỉ giữ bars/police icon. SDF dùng font
  local và callback sync invalidate demand frame.
- Scene dùng fixed orthographic camera, ACES filmic tone mapping, contact shadows,
  DPR clamp `1.25..1.5` và `frameloop="demand"`. Budget hiện hành: target 210 draw
  calls, stress ceiling 240, target 80k triangles và hard ceiling 100k.
- Foundation/rim trung tính bao quanh center airport field recessed. Center có
  field xanh, runway/taxiway strips và marking nhẹ, không có airplane model.
  Chance dùng treasure chest 2D; Khí Vận dùng fortune wheel 12 lát màu không có
  pointer line; railroad dùng train icon 2D; Công Ty Điện dùng light bulb và
  Công Ty Nước dùng water-valve icon; tax dùng stacked paper, jail chỉ dùng cell
  bars và Vào Tù chỉ dùng police icon. District art không tràn sang special tile.
- Beach district dùng shoreline uốn lượn với wave contour thứ hai; palette board/UI
  tăng saturation nhưng giữ upper/footer sáng để text đen vẫn rõ.
- Edge tile nominal width là `1.55` (corner vẫn `2.4`); outer board size và
  orthographic fit tự derive từ layout nên camera vẫn frame đủ board.

## State/rendering

- Ownership, buildings, player position và pending landing/payment state từ
  committed `PublicRoomState`; stable IDs điều khiển token/owner.
- Level 1–4 render Nhà; level 5 render Khách Sạn. Forced-sale gross values come
  from the public shortfall projection; không client-counter.
- Tất cả amounts dùng shared client money formatter VNĐ.
- Exact deck order/next card không có trong public state hoặc DOM.

## Motion/turn UX

- Token presentation có thể trễ authoritative position; normal move tối đa 12 bước,
  pass 39→0 đúng. Jail/teleport/backward dùng explicit animation/snap behavior.
- Buy/development/payment/turn marker đợi token settled. The marker remains until
  the committed landing/payment resolution is complete; doubles never extra-roll.
- Reconnect snapshot không replay mutation/animation timer; reduced-motion vẫn dùng
  state settlement đúng.
- Spectator/reconnecting thấy board nhưng không có mutation action.

## Tests

- Exact 40 Vietnamese tiles, canonical derivation và không English board labels.
- Quaternion surface normal/footprint tại tile 1, 11, 21, 31; canonical 40-tile
  assignment vào đúng tám district batches cộng một special batch.
- Tám registry/material descriptors distinct; 512² albedo/bump color-space,
  resource reuse và StrictMode-safe deferred disposal; beach descriptor có water
  region và premium green district dùng paver pattern.
- Property name-only typography (short/canonical/long), textless jail/go-to-jail,
  60/40 panel ratio, inward Parking-adjacent orientation, widened edge/corner
  dimensions, frame dimensions, scene budget, orthographic camera/tone mapping
  và SDF sync invalidation.
- Special art contracts cover treasure chest, larger pointer-free fortune wheel,
  train, light bulb, water valve, tax paper stack, jail bars/police, parking and
  airport center theme; seven legacy accent-line tiles expose no accent channel.
- Owner/house/hotel/inventory/token update theo revision.
- Normal/pass-GO/jail/card movement; buy/development/payment settlement.
- Card flip, outside close, multiple token, reduced-motion, reconnect/no-duplicate.
