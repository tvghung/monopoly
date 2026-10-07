# Hướng dẫn chơi (nút "?" và hộp thoại)

V1.1 mục 8 của chủ sản phẩm: mọi màn hình có một nút thông tin; bấm vào mở một hộp thoại
"Hướng dẫn chơi" gồm luật cơ bản, thu tiền thuê, xây nhà, mua đất, nhà tù, thuế, danh sách thẻ
Cơ Hội/Khí Vận, giao dịch, nợ, bỏ cuộc và chơi đội. Mỗi mục là một khối đóng, người chơi bấm mới mở.
Nội dung có tiếng Việt và tiếng Anh; model chọn theo preference của client, mặc định là tiếng Việt.
Hai ngôn ngữ giữ câu ngắn, không đưa thuật ngữ kỹ thuật vào nội dung người chơi đọc.

## Code nguồn

| Phần | Đường dẫn |
| --- | --- |
| Provider và hook | `apps/client/src/howToPlay/HowToPlayProvider.tsx`, `howToPlayContext.ts` (`useHowToPlay()`: `available`, `isOpen`, `open`, `close`) |
| Nút | `HowToPlayButton.tsx` (`variant` `icon` mặc định / `labelled`, `placement` `inline` mặc định / `corner`) |
| Hộp thoại | `HowToPlayModal.tsx`, `howToPlay.css` |
| Model nội dung (thuần, không React) | `modelTypes.ts` (kiểu), `model.ts` / `model.en.ts` (`buildHowToPlayModel(language)`), `cards.ts` (danh sách thẻ) |
| Số luật chỉ có ở server | `packages/shared/src/rules.ts` (export qua `@monopoly/shared`) |
| Giữ server và `rules.ts` khớp nhau | `apps/server/src/rulesContract.test.ts` |
| Icon | `help` trong `design-system/icons/actionIcons.ts` (Lucide `CircleQuestionMark`) |

## Provider, nút, hộp thoại

- `HowToPlayProvider` không phụ thuộc provider nào khác (launcher và màn hình loading render trước settings, audio,
  toast). `index.tsx` bọc `<AppBootstrap />`; `AppErrorBoundary` tự bọc màn hình lỗi render vì cây app đã mất.
  Provider sở hữu **đúng một** `Modal`; mọi nút mở cùng hộp thoại đó. Nội dung chỉ được dựng khi hộp thoại đang mở.
- Ngoài provider (test cô lập, Design Lab) `useHowToPlay().available` là `false` và `HowToPlayButton` trả `null`:
  không bao giờ có nút không làm gì cả, và các test cũ của màn hình không đổi.
- Nút: tên truy cập **"Hướng dẫn chơi"** (`IconButton` v2, 44 px, `aria-haspopup="dialog"`); biến thể `labelled` là
  `Button` ghost có chữ cho chỗ rộng (Lobby, form vào phòng). Nút `corner` dán góc phải trên (`top`/`right`
  `max(0.75rem, safe-area)`, z `--z-floating-control`) cho màn hình không có toolbar. **Không đặt nút cố định lên bàn
  cờ**: bốn góc màn hình thuộc về card người chơi; trong ván nút nằm trong `.room-toolbar`.
- Hộp thoại: `Modal` `size="lg"`, `closeOnOutsideClick`, không footer. Escape, vòng Tab, trả focus về nút đã mở do
  `Modal` lo. Phần thân cuộn trong `.ds-modal__body`.
- Mỗi mục là một `<details>` + `<summary>` gốc của trình duyệt (đóng sẵn; Enter/Space trên summary mở/đóng; nhiều mục
  mở cùng lúc được; mở lại hộp thoại thì mọi mục đóng lại). Summary cao tối thiểu 44 px, có số thứ tự trang trí
  (`aria-hidden`) và mũi tên xoay. Summary đầu có `data-modal-autofocus`, nên người dùng bàn phím bắt đầu ở mục 1 chứ
  không ở nút "Đóng". `Modal` tính `summary` vào danh sách phần tử focus.
- Bảng (`<table>` có `<caption>`, `th scope`) nằm trong vùng `role="region"` có tên, `tabindex="0"`, cuộn ngang bên trong
  khi hẹp. Màu khu (district) chỉ là chấm trang trí `aria-hidden` cạnh tên "Nhóm …"; loại thẻ luôn có chữ
  ("Nhận tiền", "Trả tiền", "Di chuyển", "Vào tù", "Giữ lại"), không dựa vào màu. Số tiền giữ một dòng bằng dấu cách
  không ngắt trước "₫" (chỉ ở lớp vẽ).
- Hộp thoại mở từ `ConnectionOverlay` phải nằm trên lớp mất kết nối (z 90): `howToPlay.css` nâng lớp phủ của hộp thoại
  lên `--z-connection-overlay + 1` **chỉ khi** `body:has(.connection-overlay)`; hộp thoại khác và `ConfirmationDialog` giữ
  nguyên tầng.

## Nội dung (model)

`buildHowToPlayModel()` trả `{ title, intro, sections[12] }` theo thứ tự: 1 Mục tiêu và lượt chơi, 2 Mua đất, 3 Thu tiền
thuê, 4 Xây nhà và công trình, 5 Nhà Tù, 6 Thuế và ô đặc biệt, 7 Thẻ Cơ Hội, 8 Thẻ Khí Vận, 9 Giao dịch mua bán,
10 Nợ và phá sản, 11 Bỏ cuộc và chiến thắng, 12 Chơi đội 2v2 (lập đội, lượt và tiền thuê, đầu tư cho đồng đội, phá sản/hồi sinh/cứu trợ,
chiến thắng; số lấy từ `REVIVE_COST`, `REVIVE_STARTING_CASH`, `REVIVE_WINDOW_SURVIVOR_TURNS`, `DEFAULT_EMERGENCY_RESCUE_SECONDS`,
`SOLO_COLOR_SET_RENT_PERCENT`, `TEAM_COLOR_SET_RENT_PERCENT`, `TEAM_NAME_MAX_LENGTH`, `TEAM_2V2_PLAYER_COUNT`). Khối: đoạn, tiêu đề phụ, danh sách, bước, bảng, danh sách thẻ.

- **Mọi số đọc từ dữ liệu dùng chung, không gõ tay**: giá, tiền thuê, giá xây, thuế từ `tileState`/`colorGroups`
  (qua `getTileDetails`), chữ in trên thẻ từ `chanceCards`/`chestCards` (tiêu đề từ `cardVisualFor`), tiền bảo lãnh từ
  `BAIL_AMOUNT`, còn lại từ `rules.ts`. Tiền luôn qua `formatMoney`. Chỉ có hai ví dụ minh họa là hằng trong model
  (tổng xúc xắc 7, "2 Nhà"). `model.test.ts` quét mọi số tiền trong chữ và chỉ chấp nhận số có trong dữ liệu.
- Thời gian server có thể đổi bằng biến môi trường (chờ mất kết nối 60 giây, hạn trả nợ 120 giây) luôn ghi "(mặc định)".
- Luật khớp code, không khớp tài liệu cũ: ô thuế **thu tiền** (200.000 ₫ và 100.000 ₫, nộp Ngân hàng); đổ đôi không được đi
  thêm lượt và chỉ giúp ra tù; sở hữu cả khu màu nhân tiền thuê mọi ô trong khu ×1,5 (Solo; 2v2 đủ khu theo đội ×2) và **không** cần để xây; chỉ xây khi quân dừng
  ở ô đất của mình (1 đến 4 Nhà hoặc nâng Khách Sạn ở cấp 4); bán lại một cấp công trình nhận một nửa giá xây; không có
  đấu giá, không có thế chấp; ra tù bằng đổ đôi, bảo lãnh, thẻ, hoặc tự động khi vòng chờ đạt 2/2; thẻ lật ngay khi dừng và
  hiệu lực chỉ áp dụng khi người chơi bấm "Đóng"; ván chỉ có thắng khi còn một người.
- Ba luật của bản 1.1 (mục 9, 10, 11 của phản hồi; đã có ở server và client) được viết đúng như hành vi hiện tại: (a) trong lúc một người đang nợ, người khác gửi được đề nghị mua tài sản
  của người nợ bằng tiền mặt và người nợ chấp nhận hoặc từ chối ngay trong cửa sổ "Cần thanh toán"; (b) người nợ tự đặt giá
  khi đề nghị bán cho người chơi khác (mặc định bằng giá Ngân hàng); (c) sau "Bỏ cuộc" người chơi mất tiền và tài sản về
  Ngân hàng rồi ở lại xem tiếp hoặc rời phòng. Đổi một trong ba thì sửa mục 9, 10, 11 và `model.test.ts` cùng lúc.

## Chỗ đặt nút

| Màn hình | Code | Cách đặt |
| --- | --- | --- |
| Loading (bootstrap và `RESTORING`) | `LoadingScreen` | `corner`, ngoài dòng trạng thái `role="status"` |
| Lỗi khởi động, `REPLACED`, `ERROR` | `ErrorScreen` (`BootstrapErrorScreen`, `FailureScreen`) | `corner`, đứng sau hành động chính của màn hình |
| Lỗi render cả app | `AppErrorBoundary` | `corner`; boundary tự bọc `HowToPlayProvider` |
| Mất kết nối (`RECONNECTING`) | `ConnectionOverlay` | `corner`; `role="status"` chỉ bọc thẻ giấy, nút đứng cạnh nên không bị đọc theo trạng thái |
| Launcher desktop | `DesktopMultiplayerLauncher` | `labelled`, dưới tiêu đề "Chơi qua mạng LAN" trong `.desktop-launcher__header` (căn giữa); launcher chạy ngoài mọi provider trừ `HowToPlayProvider` |
| Vào phòng (web) | `JoinForm` | `labelled`, cuối cột hero (dưới hàng mascot), không trong thẻ nên thẻ vẫn vừa 812×375 không cuộn |
| Lobby | `Lobby` | `labelled`, nút đầu trong `.lobby__header-actions` |
| Ván chơi, khán giả | `App.tsx` `.room-toolbar` | `icon`, ô đầu của toolbar (sau FPS dev): [?] [Cài đặt] [Bỏ cuộc/Rời phòng] |

Toolbar có `data-hud-region="toolbar"` nên bộ kiểm tra chồng lấn của `pnpm visual:capture` đo nó cùng các vùng HUD. Banner
khán giả (`RoomStatus.css`) chừa chỗ cho ba nút: căn giữa `max-width: calc(100vw - 22.5rem)`, thu gọn
`calc(100vw - 11.75rem)`.

## Kiểm tra

`apps/client/src/howToPlay/model.test.ts`, `HowToPlay.test.tsx`, `placement.test.tsx`, `App.test.tsx` (nhóm "App how-to-play key
placement"), `apps/server/src/rulesContract.test.ts`; hàng checklist ở
[testcase/client-state-sync-motion-and-accessibility.md](../testcase/client-state-sync-motion-and-accessibility.md) và
[testcase/shared-contracts-and-board-data.md](../testcase/shared-contracts-and-board-data.md). Hộp thoại không có bề mặt Design Lab và
không nằm trong `pnpm visual:capture`; xem hàng `[MANUAL-E2E]` chưa tick.
