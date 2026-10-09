# Client — Design system V2

Phạm vi: `apps/client/src/design-system/**`, cầu nối reduced motion trong `settings/`,
Design Lab trong `dev/design-lab/` và công cụ chụp evidence. Tài liệu AS-IS; kế hoạch
và quyết định nằm ở `project-document/visual-overhaul-v2/` (plan 01).

## Hai lớp token

| Lớp | File | Quy tắc |
| --- | --- | --- |
| Primitive palette `--otb-*` | `tokens/palette.css`, mirror `tokens/palette.ts` | Luôn có, không phụ thuộc theme. Component **không** đọc trực tiếp; scene WebGL đọc `OTB_PALETTE`. `palette.test.ts` giữ CSS ↔ TS đồng bộ và kiểm tra mọi cặp contrast đã ghi. |
| Semantic `--color-*`, `--elevation-*`, `--focus-ring`, `--radius-*`, `--type-*`, `--motion-*` | `tokens/colors.css`, `shadows.css`, `radius.css`, `typography.css`, `motion.css`, `surface.css` | Component chỉ dùng lớp này. Tên cũ (`--color-canvas`, `--radius-medium`, `--shadow-panel`, `--motion-fast`…) được giữ làm alias. |

Không hard-code hex trong CSS component mới. Z-index tập trung ở `tokens/zIndex.css`.

## Theme `data-visual-theme`

- Giá trị v1 nằm trong `:root`; giá trị v2 nằm trong `:root[data-visual-theme='v2']`.
- Tên token mới (`--color-money-gain/loss`, `--color-turn-active`, `--color-action-*`,
  `--color-surface-sunken`, `--color-warning-strong`, `--color-gold-*`, `--elevation-*`,
  `--radius-xs…xl`, `--paper-grain`) tồn tại ở mọi theme để không có biến chưa định nghĩa.
- Style v2 của primitive bọc bằng `:where(:root[data-visual-theme='v2'])` để độ đặc hiệu
  vẫn bằng một class; các rule v2 luôn đứng sau rule v1 trong cùng file.
- Trạng thái hiện tại: theme v2 được bật toàn cục (T01.12, sau khi product owner duyệt G1 ngày
  2026-09-30): `index.html` đặt `<html data-visual-theme="v2">` để lần paint đầu đã đúng token, và
  `index.tsx` áp lại qua `design-system/theme/visualTheme.ts` (`DEFAULT_VISUAL_THEME`,
  `applyVisualTheme`). v1 là trạng thái không có thuộc tính; Design Lab dùng `?theme=v1` để so sánh và
  trả về v2 khi thoát. `theme-color` và manifest dùng màu palette (`backdrop`, `paper-50`); con trỏ
  chuột tùy chỉnh đã bị bỏ (OS default). Giá trị v1 sẽ được dọn khi plan 03/04 hoàn tất.
- `--paper-grain` (noise SVG dưới 1 KB, alpha khoảng 3–4%) chỉ tồn tại ở v2 và tắt khi
  `<html data-graphics-quality="low">` (plan 02).

## Quy tắc màu

- Tiền thắng dùng `--color-money-gain`, tiền thua dùng `--color-money-loss` **kèm dấu và
  icon**; không bao giờ chỉ dùng màu.
- Vàng (`--color-turn-active`, `--color-gold-*`) dành cho tiền và "lượt của bạn", không
  làm nền nút.
- Màu district (`getPropertyGroupVisualStyle(color, theme)`) chỉ xuất hiện nơi định danh
  tài sản; mỗi style có `headerText` đạt ≥ 4.5:1. Theme lấy từ `<html data-visual-theme>`
  nếu không truyền tham số.
- Màu người chơi chỉ dùng trên phần tử thuộc người chơi đó (viền avatar, marker sở hữu).
- Panel giấy trên bàn gỗ sáng chỉ tách nền 1,76:1: luôn cần viền 1px và `--elevation-2`.

## Typography

Baloo 2 (`--font-family-display`, 700/800, import `@fontsource/baloo-2/700.css` và
`800.css` để `unicode-range` chỉ tải subset latin + vietnamese) cho tiêu đề, tiền, nhãn CTA,
banner lượt; Be Vietnam Pro cho phần còn lại; SDF trên board giữ nguyên.
Mỗi `--type-*` là một shorthand `font` đầy đủ: `font: var(--type-title-m)`. Line-height
display ≥ 1.18 để dấu tiếng Việt không bị cắt. `font` shorthand reset
`font-variant-numeric`, nên khai báo `tabular-nums` **sau** nó.

Kết quả đo trong Design Lab: Baloo 2 có `tnum` thật (chênh lệch bề rộng chữ số 0 px khi
`tabular-nums`, 48 px khi proportional); Be Vietnam Pro **không** có (58 px). Vì vậy
`MoneyText`, `Slider` readout và mọi bộ đếm tiền dùng Baloo 2.

## Primitive (`design-system/components/`)

| Component | API chính | Ghi chú |
| --- | --- | --- |
| `Button` | `variant` (primary/secondary/danger/ghost), `size` (sm/md/lg/xl), `busy`, `icon`; `type` mặc định `'button'` | Recipe v2: mặt màu + lip 4px, nhấn xuống, disabled không lip. Chưa có `Button` nào nằm trong `<form>`; submit phải khai báo `type="submit"`. |
| `IconButton` | `label`, `icon` (tên registry hoặc node), `size`, `pressed`, `badge` | `aria-label` gồm cả badge; `title` = label. |
| `Panel` (`GamePanel` re-export) | `title`, `tone`, `padding`, `as` | Grain giấy ở v2. |
| `Badge`, `Chip` | variant/tone | Mọi cặp màu là cặp đã kiểm contrast. |
| `SegmentedControl` | `label`, `options`, `value`, `onChange` | `radiogroup`, phím mũi tên chọn và di chuyển focus, Home/End, một tab stop. |
| `Switch` | `label`, `checked`, `onChange`, `description`, `describedBy` | Checkbox native `role="switch"`; `aria-describedby` gộp `description` và `describedBy`. |
| `Slider` | `label`, `value`, `min`, `max`, `step`, `formatValue` | `input[type=range]` native + `<output aria-hidden>` (giá trị được đọc qua `aria-valuetext`, không đọc hai lần). |
| `MoneyText` | `amount`, `size`, `tone`, `signed` | Luôn qua `formatMoney`; gain/loss có dấu + icon. |
| `DeltaChip` | `delta`, `reducedMotion` | Thuần trình bày; vòng đời do HUD điều khiển. |
| `PlayerAvatar` | `characterId`, `colorId`, `size`, `active`, `status` | localized `alt` label from VI/EN catalog, no `title` and no visible mascot name. |
| `GroupPips` | `groups` | Rỗng / một phần / đủ bộ; `aria-label` tóm tắt. |
| `Modal` | `open`, `title`, `eyebrow`, `size` (`sm/md/lg/xl` = 400/520/680/880 px), `placement` (`center/sheet`), `backdrop` (`dim/clear`), `footer`, `tone` (`default/danger/celebration`), `layer` (`modal` z 60 / `card` z 70), `headerAccent`, `describedBy`, `role`, `onClose`, `closeOnEscape`, `closeOnOutsideClick`, `peek` (`decision`/`view`), `peekKey`, `peekSummary` | Xem mục "Modal v2" và "Xem bàn cờ (peek)". Vẫn là primitive prompt duy nhất. |
| `ConfirmationDialog`, `ToastView` | `ConfirmationDialog`: `title`, `message` (nối `aria-describedby`), `confirmLabel`/`confirmIcon`, `cancelLabel`/`cancelIcon`, `tone` (`danger` mặc định / `neutral`), `icon` (tên trong registry, mặc định `warning`), `busy`; nút dùng `Button` v2 | `ConfirmationDialog` luôn nằm trên mọi dialog khác; thời lượng lấy từ `motionTokens`. `tone="neutral"` (lời mời đổi chỗ ở lobby) dùng `Modal` tone `default`, nút xác nhận `primary` và biểu tượng nền info; `peek` (cùng giá trị với `Modal`) cho phép đặt câu hỏi sang một bên để xem bàn cờ (App dùng `peek="view"` cho xác nhận rời phòng khi đang chơi); `busy` disable cả hai nút, bỏ Escape và nút đóng ở header (không có lần trả lời thứ hai) và bỏ `data-modal-autofocus` để Modal tự giữ focus. Mời người ra khỏi phòng dùng `danger`. |

`PlayerAvatar` reads localized accessible labels from the client catalog; the character registry only supplies the illustration. `displayName` remains absent (plan 04, OD-04-1): mascots are identified by image, with no visible character name.

`design-system/useMediaQuery.ts` cung cấp `useMediaQuery(query)` (`useSyncExternalStore`, false khi không có `matchMedia`) và `SHORT_VIEWPORT_QUERY` (`(orientation: landscape) and (max-height: 31rem)`): chỉ dùng để chọn biến thể component (deed `compact`, nút `md`, ảnh 64 px), còn style nằm trong CSS. `COMPACT_HUD_QUERY` (`(max-width: 720px), (max-height: 500px)`) là tầng phone của màn hình ván và `PORTRAIT_BLOCKED_QUERY` (`(orientation: portrait) and (max-width: 599px)`) là điện thoại cầm dọc; ba tầng phone/tablet/desktop được mô tả ở [game-board.instruction.md](./game-board.instruction.md) "Tầng bố cục". `NARROW_HUD_QUERY` đã bỏ: `JailPanel` luôn nằm trong `CenterStage`.

**Vùng chạm**: nút nhỏ hơn 44 px chỉ được phép khi vùng chạm vẫn 44 px — một pseudo-element `::after` (`position: absolute; inset: -5px; content: ''`) của chính nút, nút cách nhau ≥ 10 px để viền chạm không chồng nhau, và không đặt viền chạm ra ngoài phần tử cha có `overflow: hidden` (tab "Nhật ký" chỉ mở viền sang trái). e2e mobile đo vùng chạm bằng `elementFromPoint`.

## Modal v2

- `Modal` render qua portal với `AnimatePresence` (exit 200 ms, 120 ms fade khi reduced motion). Mọi dialog mở nằm trong một stack ở mức module: **chỉ dialog trên cùng** nhận Escape/Tab; dialog đang đóng mất `aria-modal`, thành `inert` và không còn giữ focus.
- Focus ban đầu: `[data-modal-autofocus]`, nếu không có thì phần tử tab được đầu tiên, nếu không có thì chính card. Phần tử cần focus nhưng không phải tab stop dùng `tabIndex={-1}` kèm `data-modal-autofocus`; Tab/Shift+Tab từ phần tử nằm ngoài vòng tab vẫn quay lại trong dialog.
- Khi đóng, focus quay lại phần tử đã mở dialog (chụp một lần, không bị React StrictMode ghi đè), hoặc vào dialog bên dưới nếu phần tử đó nằm trong nó (ví dụ `ConfirmationDialog` mở từ nút trong dialog nợ).
- `placement="sheet"` + `backdrop="clear"` là cách dựng bottom sheet cho quyết định mua/phát triển: bàn cờ vẫn nhìn thấy, nhưng nền chặn pointer. `layer="card"` (z 70) dành cho thẻ Cơ Hội/Khí Vận: nằm trên dialog thường, dưới toast và `ConnectionOverlay`.
- `describedBy` bắt buộc cho `alertdialog` (nợ, thắng). `headerAccent` là màu dải trên header (màu district của deed).
- **Hộp thoại "Hướng dẫn chơi"** (`howToPlay/`, V1.1) là một consumer của `Modal` `lg` (một provider gốc sở hữu đúng một
  instance, mọi nút `HowToPlayButton` mở nó): thân là các `<details>`/`<summary>` gốc của trình duyệt đóng sẵn (summary 44 px
  là phần tử focus; `Modal` tính `summary` vào vòng Tab; summary đầu mang `data-modal-autofocus`), bảng cuộn ngang trong vùng
  `role="region"` có tên. Khi `ConnectionOverlay` (z 90) đang hiện, lớp phủ của hộp thoại này được nâng lên z 91 bằng một
  luật `:has()` trong `howToPlay.css` (không thêm `layer` mới cho `Modal`). Hộp thoại **không** có bề mặt Design Lab nên
  danh sách `surfaces` không đổi (57 id, xem bên dưới) và `PLAN04_SURFACES` không đổi; xem
  [how-to-play.instruction.md](./how-to-play.instruction.md).

### Modal trên màn hình ngang thấp

`@media (orientation: landscape) and (max-height: 31rem)` (`Modal.css`): thẻ cao tối đa bằng cửa sổ, thân cuộn riêng (`overscroll-behavior: contain`) và footer dính, nên
nút hành động luôn với tới. Overhaul mobile/tablet (2026-10-08, cửa sổ Safari iPhone ngang chỉ ~280 px): header một dòng (eyebrow 10 px chạy trước tiêu đề 15 px),
phím header 32 px + viền chạm 5 px cách nhau 10 px, thân 14 px, footer mỏng, mọi `.ds-button` trong dialog cao 36 px chữ 13 px. Deed (`PropertyDeedCard.css`) nhỏ một bậc
ở mọi dòng; quyết định mua/phát triển đặt giá và số dư cùng một hàng, nút xây là hai dòng ngắn ("Xây 2 Nhà" / số tiền; tên truy cập vẫn là "Xây 2 Nhà (100.000 ₫)");
dialog nợ liệt kê mỗi tài sản bán được một dòng (deed `chip` + "Bán cho Ngân hàng +N" + "Đề nghị…") thay cho deed compact, tóm tắt nợ chữ nhỏ hơn. Đo lại ở 760×280 và 667×375. Bản này thêm: nút của quyết định mua/phát triển (`DecisionSheet.css`) bỏ glyph và không xuống dòng ("Mua tài sản" / "Buy property" một dòng trong nút 130 px),
tóm tắt nợ (`DebtPanel.css`) dành riêng một hàng cho hai ô số liệu khi cửa sổ cũng hẹp (≤ 44rem) để avatar chủ nợ không đè lên chúng.
Sheet (`placement="sheet"`) trừ khoảng cách đáy khỏi chiều cao tối đa, nên sheet cao (đầu tư cho đồng đội) không bắt đầu phía trên cửa sổ ở 1024×768.
Đã đo bằng probe (không commit) ở 568×320, 667×375, 740×360 và 1024×768 (VI và EN): 24 bề mặt Design Lab (mua, phát triển, nợ, bán ép, giao dịch, đề nghị đến, thẻ ô đất, danh mục, thẻ Cơ Hội/Khí Vận, xác nhận, thắng, cài đặt, cứu trợ)
nằm trọn trong cửa sổ và không có nút nào nằm ngoài vùng cuộn được.

### Xem bàn cờ (peek)

Mục đích: một quyết định (mua, nợ, thẻ…) hay một hộp thoại thông tin che bàn cờ; người chơi muốn nhìn tài sản, chủ sở hữu, tiền thuê rồi quay lại **đúng** quyết định đó.

- **Opt-in**: `<Modal peek="decision" | "view">`. `decision` là quyết định đang chờ của game (xem [turn-actions.instruction.md](./turn-actions.instruction.md)); `view` là hộp thoại
  thông tin/công cụ. Dialog không truyền `peek` không đổi gì (DOM header cũ giữ nguyên). Header có thêm `IconButton` hình mắt "Xem bàn cờ" / "View Board" (`data-modal-peek`)
  đứng trước nút đóng.
- **Chủ sở hữu trạng thái**: `peeking` là `useState` cục bộ của `ModalSurface` — không nằm trong state game, context hay socket. Ẩn = đặt `hidden` trên lớp phủ
  (`.ds-modal__overlay[hidden] { display: none }`): nền, thẻ và mọi pointer input biến mất cùng lúc, nên không còn lớp vô hình nào chặn click; **nội dung không bị unmount**, vì vậy
  lựa chọn, chữ đã gõ, request đang chờ, dòng lỗi và deed đã dựng còn nguyên (test dùng cùng phần tử `input` trước và sau). Không có lệnh socket, không gọi `onClose`.
- **Registry** `Modal/modalPeek.ts` (module-level, chỉ trình bày) biết dialog nào đang ẩn: (1) chỉ dialog **ẩn sau cùng** vẽ nút khôi phục (`useOwnsRestoreKey`); khôi phục nó thì nút của dialog ẩn
  trước đó hiện ra; (2) `useDecisionHidden()` là true khi có dialog `decision` đang ẩn.
- **Một nút bật/tắt, cùng chỗ**: nút ẩn trong header dùng icon `hideDialog` (EyeOff). Bấm nó, `Modal` đo vị trí nút
  (`getBoundingClientRect`) và **nút khôi phục** (`ModalPeekRestore`, portal riêng vào `body`, không chịu opacity/transform của
  dialog đang ẩn) vẽ đúng chỗ đó: chỉ icon `showDialog` (Eye), không có chữ hiển thị (tên "Hiện quyết định" / "Show Decision" chỉ ở
  `aria-label`/tooltip), cùng tâm, tối thiểu 44 px, giữ trong cửa sổ khi resize; không đo được (jsdom) thì về giữa-trên. z
  `--z-floating-control` (40) < dialog (60/70) < toast < `ConnectionOverlay`. Chỉ nút (và `peekSummary` đặt bên trái nút) bắt pointer.
  Test: `Modal.peek.test.tsx` "Modal peek toggle (MP)".
- **Focus & bàn phím**: bấm mắt → focus vào nút khôi phục; bấm khôi phục → focus về nút mắt. Dialog đang ẩn bị bỏ qua khi tìm "dialog trên cùng" (`activeEntry()`): Escape/Tab và trả focus
  thuộc về dialog hiển thị bên dưới; Escape không đóng một quyết định đang ẩn.
- **Nhiều dialog xếp chồng**: ẩn dialog trên cùng để thấy dialog dưới là hợp lệ; nút khôi phục chỉ của dialog ẩn sau cùng. Mở thẻ ô đất khi đang ẩn quyết định: thẻ nằm trên, đóng bằng Escape/nút Đóng,
  rồi nút khôi phục dùng lại được.
- **Quyết định đổi / hết hạn**: dialog tự biến mất cùng quyết định (`open` false hoặc component không render Modal, ví dụ máy chủ đã giải quyết, mất kết nối → `canMutate` false); registry bỏ mục ngay khi dialog
  bắt đầu thoát nên không để lại nút khôi phục hay cờ "đang ẩn". Mở lại là dialog hiển thị bình thường. Nếu quyết định **khác** thay thế khi đang ẩn (`peekKey` đổi: `operationId` mua/phát triển, `claimId`
  nợ, `rescueId`, `proposalId`, thẻ `operationId`, tập `offerId` của đề nghị đến), dialog tự hiện và focus vào bên trong. Sau reconnect, dialog đọc lại state có thẩm quyền (nội dung luôn render từ state hiện tại).
- **Nợ và hạn chót**: ẩn không dừng và không kéo dài gì; hạn chót là tuyệt đối của server. `DebtPanel` truyền `peekSummary` = chip "Còn N giây" từ cùng nhịp 1 giây, `RescuePanel` chip đếm ngược tới `expiresAt`.
- **Bàn cờ chỉ đọc khi quyết định đang ẩn**: với `useDecisionHidden()` true, `PropertyInspectionModal` giấu "Bán Nhà" / "Đề nghị mua" và hiện ghi chú "Bạn đang xem bàn cờ. Hãy hiện lại quyết định đang chờ…";
  còn lại (thẻ ô đất, tài sản, người chơi) chỉ để xem. Lăn xúc xắc, bảo lãnh… vẫn bị chặn như thường vì cổng của chúng đọc state có thẩm quyền (`canRollForState` sai khi có `pendingLandingDecision` hoặc
  `paymentShortfall`), không phụ thuộc dialog đang hiện hay ẩn; server vẫn là nơi quyết định cuối.
- Giới hạn đã biết: chưa có phím tắt cho nút mắt; nút khôi phục cố định giữa-trên nên có thể che một phần góc trên của bàn cờ (không có control HUD nào ở đó); dialog ngoài game
  (Cài đặt, Hướng dẫn chơi, cập nhật, launcher, Lobby) và `ForfeitChoiceDialog` không có nút mắt.

## Icon registry

`icons/actionIcons.ts` là nơi duy nhất ánh xạ tên hành động → icon Lucide (`ACTION_ICONS`,
`ACTION_ICON_NAMES`); `ActionIcon` render `aria-hidden`. Component cũ chỉ chuyển sang
registry khi plan sau chạm vào. `help` (Lucide `CircleQuestionMark`) là nút "Hướng dẫn chơi".

## Motion và reduced motion

- Token: `--motion-duration-micro/ui/panel/emphasis/celebration` (120/200/280/480/900 ms),
  `--motion-ease-out`, `--motion-ease-in-out`; `design-system/motion/motionTokens.ts` là mirror
  cho framer-motion (giây). `motionTokens.test.ts` giữ hai bên đồng bộ.
- Chrome motion (hover, press, modal, drawer) không nhân với tốc độ animation gameplay;
  motion gắn presentation của HUD lấy thời lượng từ presentation timing.
- `ReducedMotionDocumentSync` (trong `SettingsProvider`) ghi
  `<html data-reduced-motion="true|false">` từ `useEffectiveReducedMotion()` (setting **hoặc**
  OS). `motion.css` đưa mọi duration về `0ms` cho cả media query và thuộc tính này; hover/press
  của `Button`/`IconButton` bỏ transform khi thuộc tính là `true`.

## Design Lab (dev-only)

`?phase4-uat=1&design-lab=1[&section=<id>][&theme=v1|v2][&surface=<id>][&chrome=hidden]` trong harness (build cần
`VITE_PHASE4_UAT=1`; bản production chỉ chứa stub rỗng). Section: `tokens`, `typography`,
`components`, `game-ui`, `scene-palette`, `purchase`, `lobby`, `landing`, `hud` (HUD vẽ concept
lên board thật của fixture `stations-4`), `surfaces` (plan 04: **component production thật** với provider/fixture, không
cần server). Concept là tài liệu review, không phải component production; `surfaces` thì ngược lại.

`surfaces` render từng bề mặt đứng một mình qua `&surface=<id>` (`&chrome=hidden` bỏ thanh Lab để chụp): registry `surfaceRegistry.tsx` gồm 57 id theo cụm — `buy*`/`development-*`, `deeds`, `inspection-*`, `assets*`, `player-portfolio`, `jail`, `debt-*`, `forced-sale-*`, `trade`, `incoming-offers`, `card-*`, `winner-*`, `settings*`, `landing*` (gồm `landing-desktop-failed`: form vào phòng của app desktop sau khi vào thất bại, có "Quay lại"), `launcher*` (menu chính, có `SettingsProvider` giống thật để thấy nút "Cài đặt"), `lobby-*`, `confirm-forfeit`, `toasts`, `loading*`, `bootstrap-error`, `failure-*`, `connection`, `spectator`. `SurfaceProviders` dựng state/settings giả và khôi phục `localStorage` cài đặt khi surface đóng; fixture desktop cài `window.ownTheBlockDesktop` giả rồi gỡ khi unmount. Thư viện `DeedGallery` hiển thị mọi ô (street, nhà ga, tiện ích, ô đặc biệt) bằng `PropertyDeedCard`. Sidecar `data-design-lab-ready="true"` báo đã sẵn sàng chụp.

Tham số harness khác: `scenario=<key>`, `uat-controls=collapsed|hidden`, và
`main.phase4-uat[data-uat-ready="true"]` (hàng đợi presentation idle + mọi bước đã chạy).

## Công cụ chụp evidence

`pnpm visual:capture [--grep "<regex id>"]` (`playwright.visual.config.ts`, `e2e/visual/captures.ts`,
`e2e/visual/capture.visual.ts`; nhóm `04/g4` = 57 surface của Design Lab + kịch bản harness thẻ bài, `surfaceCaptures.test.ts` giữ manifest bằng registry) chụp từng mục manifest thành PNG + JSON diagnostics vào
`project-document/visual-overhaul-v2/evidence/<plan>/`. Không thuộc `pnpm test`.

- `VISUAL_BROWSER_CHANNEL=chrome|msedge` dùng trình duyệt cài sẵn; `VISUAL_HEADED=1` nếu
  headless không có WebGL; `VISUAL_EVIDENCE_DIR` đổi thư mục ra (để so byte với evidence đã commit).
- Chụp bằng SwiftShader nên deterministic: cùng code cho PNG giống hệt byte, trừ fixture
  `stress` (hiệu ứng tạm thời phụ thuộc thời gian).
- Chạy harness ngoài Playwright cần `VITE_PHASE4_UAT=1` vì `.env.phase4-uat` bị gitignore.

## Kiểm tra

```bash
pnpm --filter @monopoly/client test
pnpm typecheck
pnpm lint
pnpm visual:capture
```
