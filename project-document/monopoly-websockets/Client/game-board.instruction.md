# Game board và canonical tile presentation

## Entry/code

Board nằm tại `/` cho activated Player hoặc Spectator. `Board.tsx` giữ gameplay
overlays, semantic
tile controls, property dialog và chọn WebGL/fallback. WebGL code chính nằm trong
`game/scene/`: `GameScene.tsx`, `board/Board3D.tsx`, `boardRenderModel.ts`, tile
batches/materials/motion và local SDF text. Không có detail route hay permission key.

Fallback và accessibility boundary: `apps/client/src/components/rendererMode.ts` chọn `webgl`/`legacy` lúc đầu theo
`supportsWebGL()` (`apps/client/src/game/scene/fallback/webglSupport.ts`); lỗi renderer (`apps/client/src/game/scene/fallback/SceneErrorBoundary.tsx`)
hoặc mất WebGL context chuyển hẳn sang board DOM `apps/client/src/components/legacy-board/` (`LegacyBoardView.tsx`, `LegacyTile.tsx`,
`LegacyDiceOverlay.tsx`). Ở chế độ WebGL, 40 nút ô ngữ nghĩa (`sr-only`, `data-tile-index`) nằm trong
`apps/client/src/components/BoardAccessibilityControls.tsx`; nhãn truy cập dùng chung `legacy-board/tileAccessibility.ts`.
Pipeline display state: [presentation-pipeline.instruction.md](./presentation-pipeline.instruction.md).

## Canonical data

- Map đúng 40 tile index từ `packages/shared/src/tileState.ts`; canonical names stay
  Vietnamese in [Shared board data](../Shared/board-and-card-data.instruction.md),
  while client display names and compact special-tile labels follow VI/EN preference.
- Board face và property detail derive name/type/color/price/rent tiers/house cost
  từ shared tile. `BoardInitState.ts`/`backOfCards.ts` không còn là
  metadata source.
- Presentation-only icon/orientation is mapped by `tileType`/index; translated labels
  do not change tile identity or index. Index 17 is Community Chest, 20 Free Parking,
  and 28 Water Works in English.
- Center branding preserves “Own the Block”; title, alt/title/tooltip and status follow VI/EN preference.

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
  với rear sheet xám đậm hơn và five red placeholder marks nằm trong front sheet; stack là
  bản in phẳng (hai sheet dày `0.008`/`0.010`, mark dày `0.006`, tổng cao `0.022` kể từ mặt
  clearance của ô, đỉnh cách mặt ô `0.030` — thấp hơn badge SVG `TILE_ICON_FACE_Y_OFFSET`
  `0.032`) vì quân đứng ở tâm ô mà stack phủ tâm đó: art cao hơn đỉnh đế standee (`0.058`
  trên mặt ô) sẽ che đế tròn màu người chơi trên ô Thuế. Art đặt ở tâm ô giữ đỉnh thấp hơn
  đế ít nhất `0.02` (`special/taxStandeeClearance.test.ts`); START dùng
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
  `auto` (mặc định) → `balanced`, hoặc `low` khi thiết bị cảm ứng nhỏ, mobile profile (`coarsePointer && hoverNone`), `MAX_TEXTURE_SIZE <
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
- **Tầng bố cục (responsive layout tiers, overhaul mobile/tablet 2026-10-08)**: màn hình ván có ba tầng, cùng media text ở CSS và
  `design-system/useMediaQuery.ts`:
  - *phone* — cao ≤ 500 px **hoặc** rộng ≤ 720 px (`COMPACT_HUD_QUERY`): điện thoại cầm ngang, kể cả Safari iPhone còn thanh tab (cửa sổ
    chỉ ~280 px cao, đo từ ảnh người dùng). Mọi ghế là chip nhỏ, phím 34 px, một hàng dưới duy nhất; xem các mục bên dưới.
  - *tablet* — rộng ≤ 1279 px hoặc cao ≤ 719 px, ngang **hoặc dọc**: card 220×72, phím 44 px.
  - *desktop* — lớn hơn: card 272×96 (của mình 300×108), status pill có mã phòng.
  - Dọc được chơi từ 600 px chiều rộng (máy tính bảng, cửa sổ desktop); dưới 600 px (điện thoại cầm dọc) mới hiện "Hãy xoay ngang thiết bị"
    (`PORTRAIT_BLOCKED_QUERY` = `(orientation: portrait) and (max-width: 599px)`, cùng text với `BoardShell.css`). Ở tablet dọc camera fit theo
    chiều ngang nên bàn cờ rộng gần hết màn hình; card nằm ở bốn góc trên/dưới bàn, không che ô.
  - **Vùng chạm 44 px ở tầng phone**: phím nhìn thấy 34 px (toolbar phòng, phím camera, nút "Tài sản", phím header dialog 32 px) có viền chạm vô hình
    5 px (pseudo-element `::after` của chính nút) và cách nhau 10 px nên viền chạm không chạm nhau; tab "Nhật ký" rộng 30 px có viền chạm 14 px sang trái
    (bên phải là mép cửa sổ). e2e mobile (`expectTouchTarget`) đo vùng chạm thật bằng `elementFromPoint` dọc mỗi trục qua tâm, không chỉ khung vẽ.
- **Player card** (`PlayerCard`, `PlayerCardList`, `playerCardSelectors.ts`): bốn góc theo
  `resolvePlayerStationSlots` (BOTTOM dưới-trái, TOP trên-phải, LEFT trên-trái, RIGHT dưới-phải).
  Tiền lấy `displayBalances[id] ?? money` và đếm số bằng `useAnimatedNumber` (480 ms / speed; reduced motion
  hoặc đổi `presentationResetEpoch` thì nhảy ngay); chip biến động từ `balanceDeltas` qua
  `useBalanceDeltaFeed` (cursor theo sequence, tối đa 2 chip, 1600 ms / speed, không replay lịch sử);
  lượt hiện tại theo `displayActivePlayerId` (vòng vàng + chip "Đang đi"); nhà/khách sạn theo
  `displayDevelopmentLevels`; pips theo tám nhóm. Trạng thái luôn có chữ + icon: "Bạn", "Ở tù n/2",
  "Mất kết nối" (+ "Tự bỏ lượt sau m:ss" từ `turnRecovery.deadlineAt`), "Phá sản", "Đã rời". Cạnh tên chỉ hiện
  tối đa hai tag theo ưu tiên Mất kết nối > Ở tù > Đang đi > Bạn (tên không bao giờ bị ép còn một chữ); phần còn
  lại nằm trong tóm tắt sr-only. Hàng đếm ngược hồi phục thay cho footer; card tablet/phone không đủ chỗ nên
  đếm ngược nằm trong tag "Mất kết nối". Ở tầng phone chỉ có badge icon cho Ở tù/Mất kết nối; lượt hiện tại đọc được ở
  vòng vàng của card và ở center stage. Vòng pulse (`player-card--pulse`) chỉ chạy khi lượt đổi
  trong live presentation, không chạy khi mount hay sau reset/snap.
  Mặt card `aria-hidden`; mỗi `li[data-player-id][data-current-turn]` có một câu tóm tắt sr-only
  (`describePlayerCard`: tiền, tài sản, nhà, khách sạn, ga tàu, công ty điện nước, ở tù, mất kết nối, đang đi).
  `section.player-card-list[aria-label="Người chơi"] > ol[role=list]` thay roster sr-only cũ.
- **Chỉ một nơi nói "lượt của ai"** (yêu cầu của chủ dự án 2026-10-08: nhãn lượt từng lặp lại hai lần). Status pill trên cùng không còn nhãn
  lượt và không còn avatar; **Turn banner** ("Đến lượt bạn!" / "Lượt của <tên>") đã bị xóa (`TurnBanner.tsx` không còn). Lượt của mình = nút
  "Đổ xúc xắc" ở center stage + vòng vàng trên card; lượt người khác = pill "<tên> đang đi…" ở center stage (ở mọi tầng, kể cả phone) + vòng
  vàng. Trình đọc màn hình vẫn nghe "Đến lượt bạn." / "Lượt của <tên>." một lần từ vùng `role="status"` của roll control.
  **Status pill** (`StatusPill`, chỉ desktop; ẩn ≤ 1279 × 719): `p.status-pill` chỉ có "Phòng <mã>"; không có mã phòng thì không vẽ gì.
- **Center stage** (`CenterStage`, `RollControl`): nút "Đổ xúc xắc" (đang gửi: "Đang đổ…") ở tâm bàn; lượt
  đối thủ hiện pill "<tên> đang đi…"; cả hai ẩn khi xúc xắc đang lăn, khi có thẻ trên màn hình và sau khi có
  người thắng. Nút có một lần pop khi xuất hiện (reduced motion: fade) và lệch phải 64 px (tablet 40 px, phone 20 px) / xuống vài px so với tâm
  (`--hud-center-offset-x/-y`) để không đè xúc xắc đã dừng (phía trên-phải tâm) và khay ngân hàng (dưới-trái tâm). Ở phone nút cao 40 px
  (viền chạm 3 px) và pill dùng avatar 22 px, chữ 12 px.
  Quyền lăn vẫn từ `canRollForState` (authoritative). `Space` kích hoạt nút khi đang bật và focus không nằm trong
  input/textarea/select/button/link/contenteditable hay ngăn nhật ký, không có dialog, không có modifier hay repeat.
  **Dice callout**: "4 + 3" và tổng lớn khi `displayRollSequence` tăng và xúc xắc đã dừng (1200 ms / speed),
  chip "Đổ đôi" chỉ để thông tin; 3D `DiceResultTotal` đã bỏ. Ở phone callout nhỏ (xúc xắc 20 px, tổng 20 px) và luôn nằm dưới card trên-phải
  (`top: max(inset + toolbar + card + 8 px, 50% − 64 px)`), không còn chui dưới nút "Hướng dẫn chơi". Thông báo đọc màn hình duy nhất vẫn là vùng
  `role="status"` trong roll control; vùng này cũng đọc "Đến lượt bạn." / "Lượt của <tên>." một lần khi lượt hiển thị
  đổi trong live presentation (`useTurnAnnouncement`, không đọc khi first render hay sau reset/snap).
- **Nhóm thoát tù** (`CenterStage` + `RollControl` + `JailPanel`, **mọi tầng**). Lỗi cũ (ảnh người dùng, iPhone ngang ~760×280): trên cửa sổ thấp mà rộng hơn
  720 px `JailPanel` nằm ở context stack của `BottomDock`, được định vị độc lập với nút roll ở tâm và phủ lên nó. Bây giờ `CenterStage` luôn vẽ
  `JailPanel` ngay dưới `RollControl` và `BottomDock` không vẽ nó nữa: lúc nào cũng chỉ có **một** `RollControl` (một handler gửi `roll dice`) và
  **một** `JailPanel` (một handler cho `pay bail` / `use jail card`), mount ở một chỗ cố định nên đổi cỡ cửa sổ hay xoay máy không còn mount lại
  panel (giới hạn "vòng quay đang gửi bắt đầu lại ở mốc 720 px" của bản trước đã hết). Nhóm là một cột `width: max-content`: [Đổ xúc xắc] rồi panel
  (tối đa 26rem; ở cửa sổ ngang trừ đi bề rộng hai card để không chạm card; ở cửa sổ dọc dùng gần hết bề rộng). Desktop/tablet giữ panel đầy đủ (icon,
  dòng gợi ý, hai nút có glyph). Phone: panel 17,5rem gồm hàng tiêu đề (ổ khóa nhỏ, "Bạn đang ở Nhà Tù", chip vòng chờ) và một hàng nút cao 32 px chữ 12 px
  không glyph; nút thẻ hiện nhãn ngắn "Dùng thẻ (N)" / "Use card (N)" nhưng tên truy cập vẫn là nhãn đầy đủ (`aria-label`); dòng gợi ý ẩn, dòng chờ/lỗi
  thay chỗ hàng tiêu đề, cảnh báo thiếu tiền chỉ còn cho trình đọc màn hình (nút bảo lãnh trỏ tới nó bằng `aria-describedby`). Trong lúc xúc xắc lăn
  hoặc thẻ đang hiện (`data-stage-busy`) panel chỉ `visibility: hidden` (không unmount) để request đang chờ và dòng lỗi không mất, và không che xúc xắc.
  Không đổi: `canRollForState`, điều kiện hiện `JailPanel`, các lệnh socket, số tiền bảo lãnh, luật tù.
- **Cột dưới** (`BottomDock`): ticker (dòng hoạt động mới nhất; ẩn ở phone), context stack (`DebtPanel` trạng thái nợ cho người xem, `RevivePanel`) và
  action dock (nút "Tài sản của tôi (N)" + phím camera; tên truy cập giữ nguyên). Ở phone cả tầng dùng **một hàng dưới**: card của mình ở góc
  dưới-trái, ngay bên phải là phím "Tài sản" (icon + số, cao 34 px, dấu ngoặc của số do CSS vẽ ở tầng khác) và ba phím camera 34 px; context stack nổi
  ngay trên hàng đó, giới hạn giữa hai card dưới (`right` = card dưới-phải). Không còn cách xếp riêng cho ≤ 720 px (pill dưới card, cột trên card, phím
  camera `position: fixed`).
- **Responsive gameplay (landscape-first, tablet dọc được chơi)** — kết quả kiểm toán: ở 568×320–896×414 bàn cờ đã chiếm khoảng 52–63% cửa sổ (camera framing gồm cả bốn bệ người chơi, nên
  bị giới hạn bởi chiều cao), HUD 15–33%; muốn đọc ô cờ thì phải phóng to. Đợt overhaul mobile/tablet thu nhỏ HUD phone thêm (ảnh người dùng cho thấy HUD
  vẫn chiếm quá nhiều ở cửa sổ ~280 px). Quyết định thiết kế:
  - **Camera người chơi** (`game/scene/camera/boardView.ts`, `useBoardGestures.ts`, `CameraAutoFocus.tsx`, `FixedBoardCamera.applyBoardView`; chỉ trình bày, không chạm state game hay socket):
    `boardViewStore` giữ `{ zoom, panX, panY }` ngoài React nên pinch/kéo không render component nào. Zoom 1 = tổng quan cũ (cả bàn + bệ), giới hạn 1–3,5×;
    pan tính theo trục phải/lên của camera (hướng camera không đổi) và bị kẹp để cửa sổ nhìn không vượt khỏi vùng tổng quan, nên không thể làm mất bàn cờ; ở zoom 1 không có pan.
    Cử chỉ (gắn vào `.game-scene`, `touch-action: none` trên canvas): một ngón kéo khi đã zoom, hai ngón pinch (zoom quanh điểm giữa + kéo theo), con lăn chuột zoom quanh con trỏ.
    Một lần chạm/kéo vượt 8 px kết thúc bằng `click` bị chặn ở pha capture (350 ms) nên kéo không mở thẻ ô đất; ở zoom 1 một cú chạm luôn là chạm.
    Phím trong `action-dock` (`CameraControls`: phóng to, thu nhỏ, "Về góc nhìn toàn bàn" chỉ hiện khi khác tổng quan; chỉ vẽ khi có bàn 3D; 44 px, phone 34 px + viền chạm) là đường
    dùng bàn phím/chuột. Reset là chuyển động 280 ms (tức thời khi reduced motion). Camera không đổi trong đợt overhaul (chủ dự án: "tạm ổn").
  - **Tự động theo token** (`CameraAutoFocus`): chỉ khi đang zoom > 1,15, cách lần chạm/zoom/reset của người chơi ≥ 6 s (`MANUAL_PRECEDENCE_MS`) và không có dialog mở
    (`.ds-modal__overlay` không `hidden`); khi đó một lần ease 450 ms tới ô mới của token vừa di chuyển (vị trí hiển thị đã có sẵn từ presentation). Ở tổng quan camera không tự di chuyển.
    Khi một dialog bị ẩn bằng "Xem bàn cờ" camera vẫn được phép theo token. Người chơi luôn thắng: mọi thao tác tay hủy hoạt ảnh đang chạy.
  - **Chip người chơi** (`hud.css`, tầng phone): mọi ghế là chip 132×40 (avatar 28 px viền 2 px, tên 11 px ≤ 9 ký tự, số dư 13 px đậm); ghế đang `playing`, không phải lượt và
    không phải người của mình nhỏ thêm còn 112×34 (avatar 24 px). Vòng lượt vàng thu còn 2 + 3 px. Trạng thái là badge icon (chữ nằm trong tóm tắt). Chip tiền của **mình**
    nổi ngay ngoài card về phía giữa màn hình (trên card dưới, dưới card trên) thay vì xuống dòng thứ hai trong card (lỗi cũ: chip "−14.000 ₫" treo dưới mép cửa sổ); chip tiền
    của người khác không hiện (Nhật ký có dòng đó). Mở chi tiết = bấm chip (cùng nút "Tài sản của <tên>"). Card đổi cỡ bằng ease ngắn (không có khi reduced motion). 2v2: chip nhỏ
    bỏ dải tên đội (khung màu đội vẫn còn, viền trái 4 px), card của mình/người đang đi giữ dải 10 px; card "có thể hồi sinh" cao lên theo nội dung và bỏ chip chữ "Có thể hồi sinh".
  - **Nhật ký trên điện thoại**: tab "Nhật ký" giữ nguyên chỗ, nhãn và số tin nhắn chưa đọc, ở phone rộng 30 px cao 72 px (chữ 11 px) và nằm dưới card trên-phải; thêm một
    chấm vàng "Có diễn biến mới trong nhật ký" khi có dòng gameplay mới lúc ngăn đang đóng (chỉ vẽ ở `COMPACT_HUD_QUERY`, ở desktop chỉ là mô tả cho trình đọc màn hình),
    mở ngăn là xóa. Đây là nơi các sự kiện thường lệ không còn bật lên trên bàn cờ.
  - **Phân cấp thông báo** (tầng phone, `COMPACT_HUD_QUERY`): *cần hành động* — hộp thoại quyết định, nợ, đề nghị, mất kết nối, nút "Đổ xúc xắc" — không bị thu nhỏ quá mức hay tự đóng;
    *quan trọng nhưng không chặn* — pill "<tên> đang đi…" giữa bàn (nơi duy nhất nói lượt của người khác), banner khánh thành, xúc xắc, chip tiền của **mình**, trạng thái trên
    card; *thường lệ* — chip +/- tiền của người khác, ticker — không còn hiện nổi, vẫn nằm trong Nhật ký (không thay đổi nguồn `activityFeed`). Toast trong ván (`App.tsx`: có
    đề nghị giao dịch tới mình, kết quả đề nghị của mình, lỗi ACK, "không thể thao tác", rời ván) đều thuộc nhóm cần hành động/ảnh hưởng tới chính người chơi nên giữ nguyên ở mọi cỡ.
  - **Dọc (portrait)**: chỉ điện thoại (dưới 600 px chiều rộng) hiện thông báo "Hãy xoay ngang thiết bị" phủ bàn cờ (z `--z-orientation-notice`: toolbar phòng — Cài đặt, Bỏ cuộc,
    Hướng dẫn — vẫn bấm được như e2e mobile yêu cầu, dialog vẫn nằm trên) với biểu tượng điện thoại nghiêng; phần bàn bên dưới là `inert` (không chạm, không bàn phím) nhưng
    vẫn mounted nên xoay lại không mất ván. Máy tính bảng và cửa sổ desktop từ 600 px chơi được ở cả hai hướng (e2e có 768×1024).
- **Ngăn nhật ký** (`Log`): xem [activity-log-and-chat.instruction.md](./activity-log-and-chat.instruction.md).
- **Toolbar** (`App.tsx`): `IconButton` v2 44 px cho "Hướng dẫn chơi" (ô đầu, sau FPS dev; xem
  [how-to-play.instruction.md](./how-to-play.instruction.md)), "Cài đặt" và "Bỏ cuộc"/"Rời phòng", vẫn ngoài `.game-board`;
  `data-hud-region="toolbar"` để bộ kiểm tra chồng lấn đo nó như một vùng HUD (rộng 148 px, góc phải trên; card người chơi
  trên-phải đứng dưới nó). Ở tầng phone toolbar cách góc 6 px, phím 34 px cách nhau 10 px (viền chạm 5 px), rộng 122 px. Toast nằm giữa-trên, tối đa 3 cái.
- **Vị trí không được che ô cờ**: status pill (desktop) đứng sau card trên-trái, cột dưới đứng sau card dưới-trái, tab ngăn
  nhật ký đứng dưới card trên-phải; ở phone nhóm thoát tù ở tâm bàn và context stack nổi giữa hai card dưới.
  `TileScreenRectsPublisher` (chỉ dev/UAT) xuất hình chiếu 40 ô ra
  `window.__OWN_THE_BLOCK_TILE_SCREEN_RECTS__` và `pnpm visual:capture` (`overlapCheck`) báo mọi vùng
  `data-hud-region` che quá 4% một ô, tách vùng cố định khỏi vùng tạm (`data-hud-transient`: panel quyết định,
  banner, callout, ticker, bong bóng, panel ngăn nhật ký). Vùng cố định phải bằng 0 ở 1440×900, 1280×720,
  1024×768, 812×375 và 667×375. Nhóm thoát tù ở tâm bàn che một phần ô trong lúc đang mở (đó là quyết định đang chờ người chơi).
  Cùng công cụ báo `regionOverlaps`: hai vùng HUD chồng lên nhau (ví dụ panel quyết định
  che nút lăn) — phải rỗng ở mọi ảnh G3.
- Camera fit không đổi: HUD không thêm inset vào `cameraMath.ts`.

## State/rendering

- Ownership, buildings, player position và pending landing/payment state từ
  committed `PublicRoomState`; stable IDs điều khiển token/owner.
- `pendingCardInteraction` cũng là committed public state cho card interaction:
  a new Chance/Khí Vận landing is immediately `REVEALED` with
  `revealedCardId`, and the effect waits for the acting player to send
  `dismiss card`. A legacy `AWAITING_DRAW` stage remains only as protocol-9
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
  `{ tileId, landmarkName, landmarkNameEn, artUrl }` (`landmarkName` là tên tiếng Việt gốc, `landmarkNameEn` lấy từ `nameEn` của
  `LANDMARK_PLAN`; `getLandmarkName(visual, language)` là nơi duy nhất chọn tên theo ngôn ngữ, bảng 22 cặp ở
  [language-system.instruction.md](./language-system.instruction.md)). `PropertyDeedCard` hiển thị tranh trong slot art 64 px (rơi về motif của nhóm màu
  nếu ảnh không tải được) và dòng "Khách sạn · <tên landmark>" / "Hotel · <landmark name>" dưới tên ô (theo ngôn ngữ đang chọn, đổi ngay khi đổi ngôn ngữ); dòng đó mô tả
  thẻ cho assistive technology, và nhãn truy cập của ô cờ khi có Khách sạn là "Có Khách sạn · <landmark>" / "Hotel · <landmark name>".
  Tên ô phố ("Hội An"…) không phải landmark và không dịch. Validator
  `apps/client/scripts/validateLandmarkArtwork.mjs` (phủ đúng 22 ô phố, an toàn SVG, file thừa, SHA-256 bản build,
  `--build-output`) chạy trong `pnpm build`; bản đóng gói kiểm bằng
  `pnpm --filter @monopoly/desktop proof:packaged:landmarks`.
- **Banner khánh thành (OD-05-4):** `LandmarkBanner` trong HUD (dùng chung khung `.turn-banner`; banner lượt không còn): khi một phố lên bậc Khách sạn lúc
  trình bày trực tiếp thì hiện "Khánh thành <landmark>!" / "Hotel opened: <landmark name>!" kèm tranh 2D (2,2 giây chia theo tốc độ animation, bản mới
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
  tròn `r 0.30` cao `0.05` (một `InstancedMesh`, matrix theo anchor trong body group, đọc ở `onBeforeRender`; đế
  nằm trên mặt ô `+0.008`, đỉnh `+0.058`, nên art phẳng ở tâm ô như Tax stack phải thấp hơn mức này). Mặt thẻ là
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

- Exact 40 canonical tiles, localized display labels and accessible full names in both locales.
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
