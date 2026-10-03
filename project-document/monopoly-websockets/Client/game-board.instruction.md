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
- Scene dùng fixed orthographic camera và `frameloop="demand"` (callback async như SDF
  text, texture hay post chain phải `invalidate`). Ánh sáng, môi trường, bàn và preset
  chất lượng nằm ở mục **Lighting, environment và graphics tiers** bên dưới. Budget:
  main pass target 210 draw calls, stress ceiling 240, target 80k triangles và hard
  ceiling 100k; định nghĩa main/shadow/post ở mục đó.
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

## Lighting, environment và graphics tiers

Visual Overhaul V2 plan 02 (`project-document/visual-overhaul-v2/02_LIGHTING_ENVIRONMENT_AND_TABLETOP.md`).
Code nằm trong `game/scene/render/`; camera, `BoardRenderModel` boundary, WebGL fallback
và 40 semantic tile buttons không đổi.

- **Tone mapping**: Khronos PBR Neutral, exposure 1 (`render/toneMapping.ts`). Chỉ trên
  localhost hoặc UAT harness mới có `?tonemap=aces|agx|neutral` để chụp so sánh. Tier
  `high` áp dụng Neutral ở bước cuối post chain nên Canvas `gl.toneMapping` là
  `NoToneMapping` cho tier đó (R3F áp lại prop của Canvas ở mỗi render, nên prop phải khớp).
- **Light rig** (`render/lighting/lightRigSpec.ts` là nguồn duy nhất): key directional ấm
  `#FFF1DE` cường độ 2.2 tại `(-9, 16, 5)` có shadow; fill hemisphere sky `#FFF8EC` /
  ground `table-oak` 0.55; rim lạnh `#DDE9FF` 0.6 tại `(8, 10, -12)`, không shadow.
- **Environment**: một PMREM studio procedural (`render/environment/`), không file HDR,
  dùng chung cho `scene.environment` và coin materials. Cường độ 0.6 / 0.7 / 0.8 cho
  low / balanced / high.
- **Bàn và trạm**: `Tabletop` là mặt bàn gỗ sồi sáng procedural (texture canvas
  512² / 1024²) phủ các aspect 1 → 2.4 (test `tabletopCoverage`); `BoardGroundShadow`
  là decal bóng dưới board; khay người chơi (`PlayerTrays`) là instanced lacquer tray với
  viền màu người chơi; bank treasury đặt trên nền riêng, tiếp đất bằng shadow thật.
- **Shadow**: key light PCF, map 1024 (balanced) hoặc 2048 (high), tắt ở low; khi có
  real shadow thì nhà/khách sạn không render blob shadow. Caster: foundation, nhà, khách sạn,
  deck, coin pile, khay và (chỉ high) dice; receiver: mặt và footer tile, tile body, center
  platform, bàn và khay. Text và decal trong suốt không cast.
- **Optional layer**: environment và bàn nằm trong `OptionalSceneLayer` (Suspense +
  error boundary). Lỗi của một layer chỉ cảnh báo một lần và bỏ layer, không kéo board
  sang legacy; chỉ lỗi renderer thật hoặc mất WebGL context mới chuyển sang legacy.
- **Graphics tiers** (`render/renderQuality.ts`, `GameSettings.graphicsQuality`):
  `auto` (mặc định) → `balanced`, hoặc `low` khi thiết bị cảm ứng nhỏ, `MAX_TEXTURE_SIZE <
  8192` hay `hardwareConcurrency <= 4`; `auto` không bao giờ chọn `high`.

  | Tier | DPR | Shadow | Environment | Decal | Post |
  | --- | --- | --- | --- | --- | --- |
  | low | 1–1.25 | tắt | 0.6 | 0.35 | không |
  | balanced | 1.25–1.5 | PCF 1024 | 0.7 | 0.18 | không |
  | high | 1.25–2 | PCF 2048 | 0.8 | 0.18 | N8AO + bloom + vignette + MSAA |

  Đổi tier lúc chạy không cần reload (Canvas `dpr`/`shadows`/`gl.toneMapping` cập nhật,
  post chain mount hoặc unmount). Control nằm trong Settings, nhóm “Đồ họa”, tên
  “Chất lượng đồ họa”.
  Invariants của việc đổi tier (V1.1, lỗi “board và trạm biến mất”):
  - Camera của Canvas là `manual` (`BOARD_CANVAS_CAMERA` trong `camera/FixedBoardCamera.tsx`). R3F mặc định ghi đè frustum của
    camera orthographic về ±size/2 pixel mỗi khi size **hoặc pixel ratio** đổi; tier đổi `dpr` nên board co lại còn vài chục pixel
    (HUD DOM vẫn thấy, board và trạm tiền 3D thì mất) vì `FixedBoardCamera` chỉ áp lại frustum khi size đổi. `FixedBoardCamera` là nơi
    duy nhất ghi frustum.
  - `SceneLightRig` bỏ shadow map của key light khi `shadows.enabled`/`mapSize` đổi (three.js chỉ cấp phát map một lần), nếu không bóng
    ở balanced ↔ high bị sai tỉ lệ; `Tabletop` truyền `roughnessMap={… ?? null}` (R3F bỏ qua `undefined`, material sẽ giữ texture vừa
    dispose).
  - `OptionalSceneLayer` nhận `resetKey={quality.tier}`: layer đã lỗi ở tier này được thử lại khi đổi tier.
  - Diagnostics (`__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__`) có thêm `cameraFrustum`.
- **Post chain (chỉ high)**: `render/post/ScenePostEffects.tsx` là lazy chunk, tier khác
  không tải. Thứ tự: N8AO (half res, aoRadius 0.8, distanceFalloff 0.6, intensity 1.6,
  màu AO ấm) → Bloom (mipmapBlur, ngưỡng 1.5 trên HDR buffer, intensity 0.22) →
  Vignette (0.3 / 0.3) → ToneMapping Neutral. Không có hiệu ứng temporal vì demand
  rendering dừng sau invalidate cuối. N8AO tự render scene vào buffer của nó nên
  `transparencyAware` phải tắt (nếu không scene bị render thêm hai lần và main pass tăng gấp đôi).
  Blend alpha của SDF text diễn ra trong không gian tuyến tính nên chữ ở tier high mảnh và
  nhạt hơn một chút so với balanced.
- **Budget definitions** (`render/diagnostics/rendererInfo.ts`, `FrameCounter`): *main* là
  draw call của pass màu scene, *shadow* là draw call của shadow map trong cùng frame,
  *post* là số pass full-screen của composer (`postPasses`) cùng số lần render full-screen
  nội bộ (`postRenders`). Diagnostics chỉ chạy trên localhost/UAT và tắt `gl.info.autoReset`.
  Harness `benchmark=<giây>` ghi median/p95 frame time; `quality=<tier>` chọn preset.

## Game HUD (Visual Overhaul V2 plan 03)

Code: `game/ui/hud/` (`GameHud.tsx`, `hud.css`), gắn trong `.game-board__renderer` cho cả WebGL và legacy
board. Mọi phần tử là DOM; `inert={!connected}` của `.game-board` vẫn áp dụng, toolbar nằm ngoài nó.

- **Trạm 3D chỉ còn khay + đống xu**: `StationInformation`/`StationMoneyAmounts` (tên, số dư, ± tiền) đã bị bỏ.
  Trạm vẫn là anchor bay xu và điểm fit camera. Tên/tiền nằm ở player card (DOM); main pass giảm 16 draw
  (169 → 153 ở `board-readability`, balanced).
- **Player card** (`PlayerCard`, `PlayerCardList`, `playerCardSelectors.ts`): bốn góc theo
  `resolvePlayerStationSlots` (BOTTOM dưới-trái, TOP trên-phải, LEFT trên-trái, RIGHT dưới-phải).
  Tiền lấy `displayBalances[id] ?? money` và đếm số bằng `useAnimatedNumber` (480 ms / speed; reduced motion
  hoặc đổi `presentationResetEpoch` thì nhảy ngay); chip biến động từ `balanceDeltas` qua
  `useBalanceDeltaFeed` (cursor theo sequence, tối đa 2 chip, 1600 ms / speed, không replay lịch sử);
  lượt hiện tại theo `displayActivePlayerId` (vòng vàng + chip "Đang đi"); nhà/khách sạn theo
  `displayDevelopmentLevels`; pips theo tám nhóm. Trạng thái luôn có chữ + icon: "Bạn", "Ở tù n/2",
  "Mất kết nối" (+ "Tự bỏ lượt sau m:ss" từ `turnRecovery.deadlineAt`), "Phá sản", "Đã rời". Cạnh tên chỉ hiện
  tối đa hai tag theo ưu tiên Mất kết nối > Ở tù > Đang đi > Bạn (tên không bao giờ bị ép còn một chữ); phần còn
  lại nằm trong tóm tắt sr-only. Hàng đếm ngược hồi phục thay cho footer; card compact/điện thoại không đủ chỗ nên
  đếm ngược nằm trong tag "Mất kết nối". Điện thoại ngang (cao ≤ 500 px) chỉ hiện badge icon cho Ở tù/Mất kết nối;
  lượt hiện tại vẫn đọc được bằng chữ ở status pill. Vòng pulse (`player-card--pulse`) chỉ chạy khi lượt đổi
  trong live presentation, không chạy khi mount hay sau reset/snap.
  Mặt card `aria-hidden`; mỗi `li[data-player-id][data-current-turn]` có một câu tóm tắt sr-only
  (`describePlayerCard`: tiền, tài sản, nhà, khách sạn, ga tàu, công ty điện nước, ở tù, mất kết nối, đang đi).
  `section.player-card-list[aria-label="Người chơi"] > ol[role=list]` thay roster sr-only cũ.
- **Status pill** (`StatusPill`): mã phòng + avatar + `p.game-board__turn-label` ("Lượt của bạn" /
  "<tên> đang chơi" / "Đang chờ lượt chơi"), theo `displayActivePlayerId`; người vừa phá sản/rời vẫn được gọi
  tên qua `finishedPlayers` (`resolveDisplayedPlayer`). **Turn banner**: "Đến lượt bạn!" hoặc
  "Lượt của <tên>" khi lượt hiển thị đổi trong live presentation (280 + 900 + 280 ms / speed, thay thế thay vì
  xếp hàng, không chạy khi first render/snap/reset, `aria-hidden`).
- **Center stage** (`CenterStage`, `RollControl`): nút "Đổ xúc xắc" (đang gửi: "Đang đổ…") ở tâm bàn; lượt
  đối thủ hiện pill "<tên> đang đi…"; cả hai ẩn khi xúc xắc đang lăn, khi có thẻ trên màn hình và sau khi có
  người thắng. Nút có một lần pop khi xuất hiện (reduced motion: fade) và lệch phải 40 px / lên 6 px so với tâm
  (`--hud-center-offset-x/-y`) để không đè xúc xắc đã dừng (phía trên-phải tâm) và khay ngân hàng (dưới-trái tâm).
  Quyền lăn vẫn từ `canRollForState` (authoritative). `Space` kích hoạt nút khi đang bật và focus không nằm trong
  input/textarea/select/button/link/contenteditable hay ngăn nhật ký, không có dialog, không có modifier hay repeat.
  **Dice callout**: "4 + 3" và tổng lớn khi `displayRollSequence` tăng và xúc xắc đã dừng (1200 ms / speed),
  chip "Đổ đôi" chỉ để thông tin; 3D `DiceResultTotal` đã bỏ. Thông báo đọc màn hình duy nhất vẫn là vùng
  `role="status"` trong roll control; vùng này cũng đọc "Đến lượt bạn." / "Lượt của <tên>." một lần khi lượt hiển thị
  đổi trong live presentation (`useTurnAnnouncement`, không đọc khi first render hay sau reset/snap).
- **Cột dưới** (`BottomDock`): ticker (dòng hoạt động mới nhất), context stack (`JailPanel`, `DebtPanel`) và
  action dock (nút "Tài sản của tôi (N)", tên truy cập giữ nguyên; điện thoại chỉ hiện "Tài sản (N)"). Ở điện thoại
  ngang (cao ≤ 500 px) `JailPanel` thu thành dải hai hàng (tiêu đề + vòng chờ, rồi hai nút); từ 720 px chiều rộng
  trở xuống context stack nằm ở khoảng giữa hai card dưới, nên không bao giờ che nút "Đổ xúc xắc".
- **Ngăn nhật ký** (`Log`): xem [activity-log-and-chat.instruction.md](./activity-log-and-chat.instruction.md).
- **Toolbar** (`App.tsx`): `IconButton` v2 44 px cho "Hướng dẫn chơi" (ô đầu, sau FPS dev; xem
  [how-to-play.instruction.md](./how-to-play.instruction.md)), "Cài đặt" và "Bỏ cuộc"/"Rời phòng", vẫn ngoài `.game-board`;
  `data-hud-region="toolbar"` để bộ kiểm tra chồng lấn đo nó như một vùng HUD (rộng 148 px, góc phải trên; card người chơi
  trên-phải đứng dưới nó). Toast nằm giữa-trên dưới status pill, tối đa 3 cái.
- **Vị trí không được che ô cờ**: status pill đứng sau card trên-trái, cột dưới đứng sau card dưới-trái, tab ngăn
  nhật ký đứng dưới card trên-phải; từ 720 px chiều rộng trở xuống pill xếp dưới card trên-trái và cột dưới
  xếp trên card dưới-trái. `TileScreenRectsPublisher` (chỉ dev/UAT) xuất hình chiếu 40 ô ra
  `window.__OWN_THE_BLOCK_TILE_SCREEN_RECTS__` và `pnpm visual:capture` (`overlapCheck`) báo mọi vùng
  `data-hud-region` che quá 4% một ô, tách vùng cố định khỏi vùng tạm (`data-hud-transient`: panel quyết định,
  banner, callout, ticker, bong bóng, panel ngăn nhật ký). Vùng cố định phải bằng 0 ở 1440×900, 1280×720,
  1024×768, 812×375 và 667×375; panel Nhà tù trong context stack có thể che một số ô gần Xuất Phát khi đang mở
  (plan 04 thu gọn nội dung). Cùng công cụ báo `regionOverlaps`: hai vùng HUD chồng lên nhau (ví dụ panel quyết định
  che nút lăn) — phải rỗng ở mọi ảnh G3.
- Camera fit không đổi: HUD không thêm inset vào `cameraMath.ts`.

## State/rendering

- Ownership, buildings, player position và pending landing/payment state từ
  committed `PublicRoomState`; stable IDs điều khiển token/owner.
- `pendingCardInteraction` cũng là committed public state cho card interaction:
  a new Chance/Khí Vận landing is immediately `REVEALED` with
  `revealedCardId`, and the effect waits for the acting player to send
  `dismiss card`. Persisted `AWAITING_DRAW` remains only as protocol-9
  compatibility for legacy snapshots; the current client has no Draw action.
  Commands are operation-scoped and do not expose deck order. Public
  `gameplayEvents` and private player semantic events đi qua cùng
  `PresentationController → AnimationQueue → PresentationStore`; thiếu semantic
  sequence thì reset/snap về snapshot thay vì dựng cause.
- Level 1–4 render Nhà; level 5 render Khách Sạn. Forced-sale gross values come
  from the public shortfall projection; không client-counter.
- **Nhà ống (plan 05, thay Nhà hộp phẳng):** mọi Nhà của board là ba `InstancedMesh` dùng chung
  (`TubeHouseInstances`): thân `bevelBox 0.30 × 0.50 × 0.36` (instance color = màu pastel phố, chọn xác định
  theo `(tileId × 7 + slot) % 6`), trim (cửa sổ, cửa chính, lan can; vertex color, trên cả hai mặt dài) và mái
  gable thấp có ridge dọc X (instance color = **màu chủ sở hữu**). Tối đa 4 Nhà xếp một hàng giữa panel nghệ thuật
  phía trên (70%) của ô, cách nhau `0.06`; hình học tối đa 180 tam giác/nhà (thực tế 72). Ba mesh này tốn 3 draw
  chính + 3 draw shadow cho toàn board (88 instance tối đa). Pop/puff theo lịch Phase 4 cố định chạy trên instance
  matrix; `TilePressRoot` offset được áp theo từng frame. Nếu lớp instanced lỗi, `OptionalSceneLayer onFail` đặt
  `houseRenderMode = 'legacy'` và `BuildingLayer` vẽ lại Nhà hộp cũ từng ô (placeholder, plan 05 §7.7).
- **Landmark = bậc Khách sạn (plan 05):** cả 22 phố có landmark riêng (bảng `LANDMARK_PLAN` trong
  `buildings/landmarks/plan.ts`, dữ liệu thuần không three.js; `registry.ts` dựng hình học). Một phố mà builder lỗi vẫn
  hiển thị Khách sạn hộp cũ `0.92 × 0.60 × 0.78` (`hasLandmark`, fail-soft). Landmark là hình học low-poly (≤ 900 tam
  giác — trung bình khoảng 380 gồm bệ —, ≤ 3 draw: opaque + glass + emissive, chân đế ≤ 1.30 × 1.30, nằm trọn trong bệ
  và không chìm dưới mặt bệ) trên bệ sơn mài `1.36 × 1.36 × 0.08` có viền màu chủ (rim được tô lại khi đổi chủ, không
  thêm draw). `LandmarkShadowProxy` gộp hình học mọi landmark đang hiển thị thành một mesh world-space chỉ để đổ bóng
  (1 draw shadow). Builder nằm ở `buildings/landmarks/<tên>.ts`, dựng bằng `buildings/kit/lowPolyKit.ts` (primitive
  faceted, vertex color, merge; có `arcadeWall`, `prism`, `blob`, `dome`) và các mảnh dùng chung `landmarks/parts.ts`,
  với ba material dùng chung `kitMaterials.ts`.
- **Tranh 2D của landmark và thẻ tài sản (plan 05 §8.5):** 22 SVG phẳng `public/art/landmarks/<tileId>.svg`
  (`viewBox 0 0 160 160`, không text/script/image/href); registry `game/ui/property/landmarkVisuals.ts`
  `{ tileId, landmarkName, artUrl }`. `PropertyDeedCard` hiển thị tranh trong slot art 64 px (rơi về motif của nhóm màu
  nếu ảnh không tải được) và dòng "Khách sạn · <tên landmark>" dưới tên ô; dòng đó mô tả thẻ cho assistive technology,
  và nhãn truy cập của ô cờ khi có Khách sạn là "Có Khách sạn · <landmark>". Validator
  `scripts/validateLandmarkArtwork.mjs` (phủ đúng 22 ô phố, an toàn SVG, file thừa, SHA-256 bản build,
  `--build-output`) chạy trong `pnpm build`; bản đóng gói kiểm bằng
  `pnpm --filter @monopoly/desktop proof:packaged:landmarks`.
- **Banner khánh thành (OD-05-4):** `LandmarkBanner` trong HUD, cạnh `TurnBanner`: khi một phố lên bậc Khách sạn lúc
  trình bày trực tiếp thì hiện "Khánh thành <landmark>!" kèm tranh 2D (2,2 giây chia theo tốc độ animation, bản mới
  thay bản cũ). Dùng chung shell, keyframes và fade reduced-motion của turn banner; không bao giờ hiện cho trạng thái có
  sẵn khi mount HUD hay sau snap/reconnect/reset (đổi `presentationResetEpoch`); reduced motion chỉ còn chữ, không có
  tranh; `aria-hidden` vì activity log đã thông báo.
- **Vật phẩm trên bàn (plan 05 §8.6):** cà phê phin, nón lá, bát sen, tiền chơi dựng bằng kit
  (`props/tablePropGeometry.ts`: mỗi vật một geometry gộp = 1 draw; tổng ≤ 4 draw và ≤ 3.000 tam giác, thực tế +4 draw
  main, +4 draw shadow, +1.560 tam giác). Đặt cạnh góc trái/phải của board (`props/tablePropLayout.ts`) và chỉ hiện khi
  mép bàn đủ rộng và không bị HUD che (≥ 30 px mỗi đơn vị, trong dải giữa các thẻ người chơi, cách mép ≥ 12 px, bên phải
  nằm dưới tab nhật ký): hiện cả bốn từ 1280×720 trở lên, ẩn cả bốn ở tablet và phone landscape, và ẩn ở tier low;
  không bao giờ dời xuống dưới HUD. Là trang trí, không có accessible name. Overlap checker của plan 03 kiểm cả vật
  phẩm (`PropScreenRectsPublisher`, `findHudPropOverlaps`, `findPropTileOverlaps`; sidecar `hudOverlap.props`).
- **Standee linh vật (plan 05):** quân cờ là thẻ die-cut đứng thẳng (texture 320² gồm viền trắng 6 px quanh art 256²)
  quay theo azimuth camera, cao `1.22 / cos(41.5°) ≈ 1.63` trong thế giới để cao bằng sprite cũ trên màn hình, trên đế
  tròn `r 0.30` (một `InstancedMesh`, matrix theo anchor trong body group, đọc ở `onBeforeRender`). Mặt thẻ là
  `MeshBasicMaterial` unlit alpha-test `toneMapped: false`; bóng có hình dáng mascot nhờ `customDepthMaterial`;
  contact shadow chỉ còn ở tier low. Hop, lean, reaction, slot reflow, jail transfer và snap vẫn do body group
  (`CharacterBillboard`) điều khiển, không đổi; body group dùng `rotation.order = 'YXZ'` với heading cố định nên
  lean là nghiêng ngang thẻ.
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
  orthographic camera/tone mapping (Neutral), quality resolution per tier, tabletop
  coverage, diagnostics counting (main/shadow/post) và SDF sync invalidation. HUD: view model của card, các hook
  đếm số/chip/countdown/transient, banner, callout, ticker, bong bóng, phím tắt Space và hình học overlap checker.
- Special art contracts cover approved Chance question mark, simplified pointer-free
  fortune wheel, locomotive/one-wagon silhouette, light bulb, large faucet, tax paper stack, START
  sign, parking lot/cars, handcuffs, jail bars and airport center theme; ownership
  layer exposes no `OwnerTab` and seven legacy accent-line tiles expose no accent channel.
- Owner/house/hotel/inventory/token update theo revision.
- Normal/pass-GO/jail/card movement; buy/development/payment settlement.
- Card modal artwork/message, actor-only `Đóng`, no outside close, reduced-motion,
  reconnect/no-duplicate.
- `Phase4UatHarness` board-readability fixture at `1280×720`, `1440×900` and
  `1920×1080`, covering four corners, all four runs, short/two-line Vietnamese
  names, special icons, unowned/owned/1–4 Nhà/Khách sạn and flag+building states.
