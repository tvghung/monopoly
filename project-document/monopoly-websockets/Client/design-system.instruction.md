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
| `PlayerAvatar` | `characterId`, `colorId`, `size`, `active`, `status` | `alt` = "Mascot <accessibleLabel>" (tiếng Việt), không có `title`, không có tên hiển thị. |
| `GroupPips` | `groups` | Rỗng / một phần / đủ bộ; `aria-label` tóm tắt. |
| `Modal` | `open`, `title`, `eyebrow`, `size` (`sm/md/lg/xl` = 400/520/680/880 px), `placement` (`center/sheet`), `backdrop` (`dim/clear`), `footer`, `tone` (`default/danger/celebration`), `layer` (`modal` z 60 / `card` z 70), `headerAccent`, `describedBy`, `role`, `onClose`, `closeOnEscape`, `closeOnOutsideClick` | Xem mục "Modal v2". Vẫn là primitive prompt duy nhất. |
| `ConfirmationDialog`, `ToastView` | như trước (nội dung/ nút dùng `Button` v2) | `ConfirmationDialog` luôn nằm trên mọi dialog khác; thời lượng lấy từ `motionTokens`. |

`game/characters/characterRegistry.ts` có `accessibleLabel` (Vietnamese, chỉ cho công nghệ hỗ trợ: `alt`/`aria-label`); `displayName` đã bị xóa (plan 04, OD-04-1): mascot chỉ nhận diện bằng hình, không hiện tên nào ở màn hình.

`design-system/useMediaQuery.ts` cung cấp `useMediaQuery(query)` (`useSyncExternalStore`, false khi không có `matchMedia`) và `SHORT_VIEWPORT_QUERY` (`(orientation: landscape) and (max-height: 31rem)`): chỉ dùng để chọn biến thể component (deed `compact`, nút `md`, ảnh 64 px), còn style nằm trong CSS.

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
  danh sách `surfaces` vẫn 56 id và `PLAN04_SURFACES` không đổi; xem
  [how-to-play.instruction.md](./how-to-play.instruction.md).

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

`surfaces` render từng bề mặt đứng một mình qua `&surface=<id>` (`&chrome=hidden` bỏ thanh Lab để chụp): registry `surfaceRegistry.tsx` gồm 56 id theo cụm — `buy*`/`development-*`, `deeds`, `inspection-*`, `assets*`, `player-portfolio`, `jail`, `debt-*`, `forced-sale-*`, `trade`, `incoming-offers`, `card-*`, `winner-*`, `settings*`, `landing*`, `launcher*`, `lobby-*`, `confirm-forfeit`, `toasts`, `loading*`, `bootstrap-error`, `failure-*`, `connection`, `spectator`. `SurfaceProviders` dựng state/settings giả và khôi phục `localStorage` cài đặt khi surface đóng; fixture desktop cài `window.ownTheBlockDesktop` giả rồi gỡ khi unmount. Thư viện `DeedGallery` hiển thị mọi ô (street, nhà ga, tiện ích, ô đặc biệt) bằng `PropertyDeedCard`. Sidecar `data-design-lab-ready="true"` báo đã sẵn sàng chụp.

Tham số harness khác: `scenario=<key>`, `uat-controls=collapsed|hidden`, và
`main.phase4-uat[data-uat-ready="true"]` (hàng đợi presentation idle + mọi bước đã chạy).

## Công cụ chụp evidence

`pnpm visual:capture [--grep "<regex id>"]` (`playwright.visual.config.ts`, `e2e/visual/captures.ts`,
`e2e/visual/capture.visual.ts`; nhóm `04/g4` = 56 surface của Design Lab + kịch bản harness thẻ bài, `surfaceCaptures.test.ts` giữ manifest bằng registry) chụp từng mục manifest thành PNG + JSON diagnostics vào
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
