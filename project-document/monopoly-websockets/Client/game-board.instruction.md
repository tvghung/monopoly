# Game board và canonical tile presentation

## Entry/code

Board nằm tại `/` cho activated Player hoặc Spectator. `Board.tsx` giữ gameplay
overlays, semantic
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
  continuous color rail trên property tile. Ownership không còn full-width owner
  strip/`OwnerTab`; owned purchasable tiles render một planted `OwnershipFlag` nhỏ,
  với cloth dùng canonical player display color. Flag derive từ authoritative
  `ownedProps` qua `BoardRenderModel`, coexist với houses/hotel/selection và không
  xuất hiện trên tile unowned. Owner state vẫn nằm trong `BoardRenderModel` cho
  property inspection, world-space player stations, houses/hotel và state
  presentation.
- Mỗi edge tile có upper art panel 70%, footer nền sáng 30% và divider near-black;
  một side-aware `TilePanelLayout` duy nhất cung cấp kích thước, offset, divider,
  upper-art/footer anchors, footer text và content rotation cho surface batch,
  text và special art. Divider chỉ render cho `normal`, `railroad`, `company`; các
  tile `chance`, `chest`, `expense` vẫn giữ logical panel geometry nhưng bỏ divider.
- Surface, chassis, text và prop dùng cùng tile motion controller. Matrix mặt ô
  compose từ translation + quaternion XZ orientation + scale, giữ normal hướng lên
  ở cả bốn cạnh và footprint khớp tile thật.
- Property thường chỉ in tên, không in giá trên mặt ô. Cỡ local SDF adaptive là
  `0.40`/`0.33` cho normal và `0.36`/`0.30` cho special: một dòng cho tên ngắn,
  tối đa hai dòng cho tên dài; manual fitting là source of truth, Troika nhận
  `whiteSpace='nowrap'`, safe width bằng 90% vùng usable footer/corner và
  vertical fit kiểm tra theo footer height. Normal/company và nhãn Chance/Chest/Tax/Railroad đều
  dùng footer anchor; raised SVG art dùng top-biased upper anchor; price không render trên
  mặt tile. Text dùng một canonical inward-facing rule theo side, gồm cả hai run
  sát Parking; hai run `LEFT`/`TOP` dùng cùng một camera-facing half-turn cho text và
  flat art. START/Jail/Vào Tù/Parking không render generic edge/corner label khi
  landmark riêng đã là label chính. DOM dùng các weight local của Be Vietnam Pro;
  board/Troika dùng một local full-coverage ExtraBold TTF và callback sync invalidate
  demand frame. Các mẫu kiểm tra gồm `Cà Mau`, `Buôn Ma Thuột`, `Đà Nẵng`, `Phú Quốc`,
  `Công Ty Nước`, `Khí vận` và `Cơ hội`.
- Scene dùng fixed orthographic camera, ACES filmic tone mapping, contact shadows,
  DPR clamp `1.25..1.5` và `frameloop="demand"`. Budget hiện hành: target 210 draw
  calls, stress ceiling 240, target 80k triangles và hard ceiling 100k.
- Foundation/rim trung tính bao quanh center airport field recessed. Outer accent là
  một continuous rounded-square loop near-white; center có field xanh, runway/taxiway
  strips, marking nhẹ và một authored orthogonal S-path deterministic, không có
  pebbles, random trails, timer sign, airplane model hay red center ring.
  Chance dùng approved coral question-mark SVG; Khí Vận dùng approved simplified
  fortune-wheel SVG không pointer/separator/outer border; railroad dùng local SVG
  locomotive + một wagon; Công Ty Điện dùng local SVG bulb với socket xám và Công Ty
  Nước dùng local SVG faucet/tap lớn với water drop. Sáu nguồn SVG được bundle local,
  rasterize nguyên vẹn thành texture cho top face và dùng lại một shallow darker SVG
  backing bên dưới; `TILE_ICON_DEPTH` là `0.018` world units, không dùng
  `SVGLoader → ShapeGeometry` để tái dựng mặt icon. Icon backing/face dùng elevation
  contract chung trên tile surface, depth test và alpha test để tránh chìm hoặc
  z-fight; icon footprint giữ divider của upper 70% clear. Tax dùng paper stack nhỏ hơn
  với rear sheet xám đậm hơn và five red placeholder marks nằm trong front sheet; START dùng
  planted left-pointing `Start` sign rộng 92% usable corner surface; Parking dùng
  asphalt runway-gray với lane marks và deterministic parked cars; Go To Jail dùng
  handcuffs còn Jail dùng cell bars. District art không tràn sang special tile.
- Beach district dùng shoreline uốn lượn với wave contour thứ hai; palette board/UI
  tăng saturation nhưng giữ upper/footer sáng để text đen vẫn rõ.
- Corrective pre-Phase-5 readability geometry dùng edge width `1.6`, depth `2.58`,
  corner `2.46`, gap `0.05`; mọi body/surface/socket/foundation đều derive từ
  registry. Center platform dùng `INNER_TILE_SURFACE_BOUNDARY * 2`, không còn
  inset `0.6`; shorter depth tự nhiên mở rộng center, `BoardFrame` rộng `0.14`
  và center path rộng `0.44` giữ gutter liên tục. Foundation là lower `0.16`,
  middle `0.20`, top `0.12`, tổng `0.48`; middle layer là `boardBase #858d90`,
  giữa lower dark layer và upper light layer. Text tile dùng manual fitting,
  hard tối đa 2 dòng, Troika `whiteSpace='nowrap'`, safe width `90%` và floor
  normal khoảng `0.29`; Start chỉ kéo cao mặt mũi tên vàng `1.20×`. Dice dùng
  một instanced two-shadow batch, ground-locked, opacity khoảng `0.21 → 0.07`
  và footprint tối đa `1.35×`, dùng chung vertical-offset helper. Camera giữ hướng cố định, dùng
  `ORTHOGRAPHIC_READABILITY_ZOOM=1.08`, không bỏ fit point của board/dice/stations.

## State/rendering

- Ownership, buildings, player position và pending landing/payment state từ
  committed `PublicRoomState`; stable IDs điều khiển token/owner.
- `pendingCardInteraction` cũng là committed public state cho card interaction:
  `AWAITING_DRAW` chờ player gửi `draw card`, `REVEALED` giữ `revealedCardId` cho
  tới `dismiss card`; cả hai command đều operation-scoped và không làm lộ deck order.
  Public `gameplayEvents` và private player semantic events đi qua cùng
  `PresentationController → AnimationQueue → PresentationStore`; thiếu semantic
  sequence thì reset/snap về snapshot thay vì dựng cause.
- Level 1–4 render Nhà; level 5 render Khách Sạn. Forced-sale gross values come
  from the public shortfall projection; không client-counter.
- Nhà giữ body `0.48 × 0.39 × 0.36` với facade plaster trung tính khoảng
  `#d9d2c2`, một shared opaque sRGB procedural texture cho hai cửa sổ bốn ô
  trên mỗi vertical face, và một pitched roof riêng khoảng `0.56 × 0.47` với
  rise `0.18`; chỉ roof dùng canonical owner display color. Khách sạn giữ body
  `0.92 × 0.60 × 0.78` với facade khoảng `#d5d8d6`, shared texture hai cột × ba
  tầng, mỗi panel bốn ô, và crown/roof riêng dùng canonical owner display color.
  Đây là texture detail trên body, không phải các mesh frame/window riêng; slot,
  anchor, shadow và timing hiện hữu không đổi.
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
  upper 70% art/footer 30% text anchors, top-biased raised-icon placement with divider
  clearance, selective divider eligibility, 70/30 panel ratio,
  side-aware Parking-adjacent orientation, restored canonical edge/corner geometry
  (`1.6 × 2.58`, corner `2.46`) with natural center derivation,
  1.5–1.7× ownership flag proportions, Start width ratio, enlarged
  house/hotel geometry plus canonical anchors, neutral facade/window-grid textures,
  pitched roof/crown owner-color split, frame dimensions, scene budget,
  orthographic camera/tone mapping
  và SDF sync invalidation.
- Special art contracts cover approved Chance question mark, simplified pointer-free
  fortune wheel, locomotive/one-wagon silhouette, light bulb, large faucet, tax paper stack, START
  sign, parking lot/cars, handcuffs, jail bars and airport center theme; ownership
  layer exposes no `OwnerTab` and seven legacy accent-line tiles expose no accent channel.
- Owner/house/hotel/inventory/token update theo revision.
- Normal/pass-GO/jail/card movement; buy/development/payment settlement.
- Card flip, outside close, multiple token, reduced-motion, reconnect/no-duplicate.
- `Phase4UatHarness` board-readability fixture at `1280×720`, `1440×900` and
  `1920×1080`, covering four corners, all four runs, short/two-line Vietnamese
  names, special icons, unowned/owned/1–4 Nhà/Khách sạn and flag+building states.
