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
  thành tám district instanced batches và một special batch; footer và eligible
  divider dùng hai instanced layers chung, còn bốn corner tiles giữ treatment riêng.
- District identity nằm trong các pattern nền textless, sáng và thưa, có tuning
  density/contrast/seam/spacing. Không còn accent inlay, emblem nhỏ hoặc raised
  continuous color rail trên property tile. Ownership không còn top-surface owner
  strip; owner state vẫn nằm trong `BoardRenderModel` cho property inspection, HUD,
  houses/hotel và state presentation.
- Mỗi edge tile có upper art panel 60%, footer nền sáng 40% và divider near-black;
  một side-aware `TilePanelLayout` duy nhất cung cấp kích thước, offset, divider,
  upper-art/upper-label anchors, footer text và content rotation cho surface batch,
  text và special art. Divider chỉ render cho `normal`, `railroad`, `company`; các
  tile `chance`, `chest`, `expense` vẫn giữ logical panel geometry nhưng bỏ divider.
- Surface, chassis, text và prop dùng cùng tile motion controller. Matrix mặt ô
  compose từ translation + quaternion XZ orientation + scale, giữ normal hướng lên
  ở cả bốn cạnh và footprint khớp tile thật.
- Property thường chỉ in tên, không in giá trên mặt ô. Cỡ local SDF adaptive là
  `0.30`/`0.26`/`0.22`: một dòng cho tên ngắn, hai dòng cho tên dài thông thường,
  ba dòng chỉ khi thật sự cần; maxWidth bằng 96% vùng usable upper panel. Special tile
  dùng upper-label anchor, icon-bearing art dùng upper-art anchor; price không render
  trên mặt tile. Text dùng một canonical inward-facing rule theo side, gồm cả hai run
  sát Parking; hai run `LEFT`/`TOP` dùng cùng một camera-facing half-turn cho text và
  flat art. START/Jail/Vào Tù/Parking không render generic edge/corner label khi
  landmark riêng đã là label chính. SDF dùng font Be Vietnam Pro Vietnamese 800 và
  callback sync invalidate demand frame.
- Scene dùng fixed orthographic camera, ACES filmic tone mapping, contact shadows,
  DPR clamp `1.25..1.5` và `frameloop="demand"`. Budget hiện hành: target 210 draw
  calls, stress ceiling 240, target 80k triangles và hard ceiling 100k.
- Foundation/rim trung tính bao quanh center airport field recessed. Center có
  field xanh, runway/taxiway strips, marking nhẹ, deterministic pebbles/worn paths
  và planted `MatchTimerSign`, không có airplane model hay red center ring.
  Chance dùng continuous extruded question mark đỏ; Khí Vận dùng fortune wheel có
  số lát lấy từ `chestCards.length`, có separator/ring/hub và không có horizontal
  pointer line; railroad dùng locomotive + hai wagon 2.5D; Công Ty Điện dùng bulb
  pear-shape với socket xám và Công Ty Nước dùng faucet/tap lớn với water drop; tax
  dùng stacked paper lớn; START dùng planted left-pointing `Start` sign; Parking dùng
  asphalt runway-gray với lane marks và deterministic parked cars; Go To Jail dùng
  handcuffs còn Jail dùng cell bars. District art không tràn sang special tile.
- Beach district dùng shoreline uốn lượn với wave contour thứ hai; palette board/UI
  tăng saturation nhưng giữ upper/footer sáng để text đen vẫn rõ.
- Edge tile nominal width là `1.60`, depth là `2.58` (corner `2.46`); center boundary
  derive từ inward tile-surface boundary và clearance nên field nhỏ hơn nhưng vẫn
  đồng tâm. Outer board size và orthographic fit tự derive từ layout nên camera vẫn
  frame đủ board.

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
  upper 60% text anchors, selective divider eligibility, 60/40 panel ratio,
  side-aware Parking-adjacent orientation, widened edge/corner dimensions, frame
  dimensions, scene budget, orthographic camera/tone mapping
  và SDF sync invalidation.
- Special art contracts cover continuous Chance question mark, deck-sized pointer-free
  fortune wheel, locomotive/wagons, light bulb, large faucet, tax paper stack, START
  sign, parking lot/cars, handcuffs, jail bars and airport center theme; ownership
  layer exposes no `OwnerTab` and seven legacy accent-line tiles expose no accent channel.
- Owner/house/hotel/inventory/token update theo revision.
- Normal/pass-GO/jail/card movement; buy/development/payment settlement.
- Card flip, outside close, multiple token, reduced-motion, reconnect/no-duplicate.
