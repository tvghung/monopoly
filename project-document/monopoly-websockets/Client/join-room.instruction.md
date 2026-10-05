# Join, resume và connection lifecycle

Player-facing product name là **Cờ Tỷ Phú Việt Nam**. Join, restore, reconnect,
replacement, leave/forfeit confirmations và mọi ACK error được render bằng tiếng
Việt. Internal phase/event/error codes vẫn giữ English.

## Định danh màn hình

SPA entry `/`; không có Router/menu/permission key. Join/restore/lobby/board được chọn
bằng application session state, không bằng `socket.id` hay optimistic `joined` flag.

## Code

- `apps/client/src/App.tsx`
- `apps/client/src/playerSessionStorage.ts`
- `apps/client/src/components/JoinForm.tsx`, `JoinHero.tsx`, `DesktopMultiplayerLauncher.tsx`, `LauncherScene.tsx`, `HostLanSharing.tsx`
- `apps/client/src/runtime/lanSharing.ts` (`buildLanJoinUrl`, `parseLanJoinUrl`), `runtime/types.ts` (bridge `lan?`)
- Desktop: `apps/desktop/src/lanFinder.ts`, `networkInterfaces.ts`, `ipc/windowHandlers.ts` (`quit:exit`), `preload.ts`; server: `apps/server/src/lanDiscoveryResponder.ts`
- `apps/client/src/settings/` (`SettingsProvider`, `useSettingsAvailable`, `SettingsPanel`) cho nút "Cài đặt" của launcher
- `apps/client/src/app/screens/` (`LoadingScreen`, `ErrorScreen`, `BootstrapErrorScreen`, `ScreenBrand`)
- `apps/client/src/components/ConnectionOverlay.tsx`
- `apps/client/src/components/SpectatorBanner.tsx`
- Shared types/events/schemas under `packages/shared/src/`

## Màn hình trước phòng (plan 04)

- **Landing** (`JoinForm`): hero (tám mascot trên một board mini, trang trí, không tên) + thẻ vào phòng.
  Toggle **"Loại phòng"**: `Có mã phòng` (mặc định, hiện ô mã phòng) / `Phòng chung` (ẩn ô mã, gửi
  `LOBBY` — mọi người chọn Phòng chung vào cùng một phòng). Khi tên còn trống, nút "Vào phòng" bị disable
  kèm lý do viết ra. `?room=` vẫn prefill, không bao giờ tự submit. Hero chỉ chào bằng hai cú nhảy lúc mở
  (không loop; tắt khi reduced motion setting hoặc OS); border ô nhập dùng `--entry-field-border` đạt 3:1.
  Nút "Hướng dẫn chơi" (có chữ) là phần tử cuối của cột hero, dưới hàng mascot; nó nằm ngoài thẻ nên thẻ vẫn vừa
  812×375 không cuộn, và không bao giờ submit form.
  **Trong app desktop** (V1.1 mục 3), form này là màn hình rơi về khi vào phòng thất bại: nó nhận `initialName` và
  `initialRoomCode` từ `launch.initialJoin` (tên và mã đã gõ ở launcher có sẵn, người chơi không gõ lại; chế độ "Có mã phòng")
  và có nút phụ **"Quay lại"** (ghost, điều khiển đầu tiên của trang: góc trên trái cột hero, trước tiêu đề, ngoài thẻ nên thẻ vẫn
  vừa 812×375 không cuộn; `type="button"`, không bao giờ submit, vẫn dùng được khi đang "Đang vào phòng…") chỉ khi `App` có
  `desktopBridge` và `onExitToLauncher`; trình duyệt thường không có nút vì đây là màn hình đầu tiên. Xem "Đường quay lại launcher" bên dưới.
- **Launcher desktop = màn hình chính** (`DesktopMultiplayerLauncher` + `LauncherScene`; V1.1 mục 4): toàn cửa sổ, một cột nút
  lệch về bên trái trên nền giấy ấm có tranh ở bên phải. Tiêu đề (h1) "Chơi qua mạng LAN", không phụ đề, không ghi chú chân thẻ.
  Màn chọn **chỉ có nút, không có câu giải thích dưới nút nào**: `Tạo phòng` (primary) và `Tham gia phòng` (secondary) cỡ `xl`;
  `Máy chủ riêng` (chỉ khi có `configuredRuntimeConfig`, nhãn ngắn, không mô tả); khi Host đang chạy có thêm `Vào lại phòng đang
  mở` và `Đóng phòng` (cùng hành vi cũ: tiếp tục / dừng Host) xếp trên cùng; hàng cuối là `Cài đặt` và `Thoát`. Mọi nút là
  `Button` của design system (≥ 44 px, focus ring dùng chung, tab theo thứ tự trên xuống). `Quay lại` (trước là "Chọn lại chế
  độ") trả focus về nút đã mở form. Nút "Hướng dẫn chơi" (có chữ) ghim góc trên phải (`placement="corner"`) và đứng sau menu trong
  thứ tự Tab; ở cửa sổ thấp (landscape, cao ≤ 31rem) khi một form đang mở nó nhập vào hàng tiêu đề để khỏi đè lên dòng lỗi. Nó chỉ
  có khi launcher nằm trong `HowToPlayProvider` (app thật luôn có; test cô lập thì không).
  - **Tranh nền** (`LauncherScene`, thuần trang trí: `aria-hidden`, `alt=""`, không `title`, không chữ): năm tấm "bưu thiếp"
    landmark (`public/art/landmarks/{26,13,39,24,14}.svg`) trên tám mascot đứng trên bàn cờ mini (`JoinHero`). Tranh nằm ở bên phải;
    độ rộng `--scene-w` được tính từ cột menu nên không chạm cột. Dưới 40rem tranh ẩn; ở landscape thấp khi mở form tranh ẩn để form
    vừa 812×375 không cuộn. Hiệu ứng vào (bưu thiếp rơi xuống, nút trồi lên, mascot nhảy hai lần) chạy một lần, không lặp, và tắt
    khi reduced motion từ hệ điều hành hoặc từ cài đặt (`data-reduced-motion`). Màu chữ trên nền là mực/đỏ sơn mài trên giấy (≥ 4.5:1).
  - **`Cài đặt`**: mở `SettingsPanel` hiện có. `AppBootstrap` bọc **chỉ launcher** bằng `SettingsProvider` (đọc cài đặt đã lưu
    đồng bộ từ `settings/storage.ts`, ghi mỗi thay đổi về cùng key, nên `bootstrap()` và game đọc đúng giá trị đó khi người chơi vào
    chơi); không có `AudioProvider` hay `ToastProvider` ở đây nên không có âm thanh nào tự chạy. Không có provider (render cô lập
    trong test) thì không có nút (`useSettingsAvailable()`); Design Lab cấp provider để nút hiện trong ảnh chụp.
  - **`Thoát`**: chỉ hiện khi bridge có `quit.exitApp` (trình duyệt thường và stub cũ thì không). Không có phòng nào đang mở trên
    máy này thì thoát ngay; khi Host ở `HOSTING`/`READY`/`STARTING_*` thì `ConfirmationDialog` trung tâm hỏi "Đóng phòng và thoát
    game?" ("Đóng phòng và thoát" / "Ở lại") rồi mới gọi `exitApp()`. Nút thành "Đang thoát…" và tự dùng lại được sau 10 giây nếu
    cửa sổ vẫn còn; lỗi IPC hiện "Chưa thoát được game. Hãy thử lại.". Main process dừng Host đang chạy đúng như khi đóng cửa sổ
    (xem [Api/http-runtime.instruction.md](../Api/http-runtime.instruction.md#desktop-quit-channel-v11)). Không dùng `window.confirm`.
  - **Cập nhật** (khi bridge có nhóm `update` và bộ cập nhật được hỗ trợ): hộp thoại `Modal` ("Có bản cập nhật mới", "Cần cập
    nhật Own the Block", "Bản cập nhật đã sẵn sàng", "Đang cài đặt bản cập nhật") chỉ mở khi launcher đang ở menu, không bao
    giờ trên một form; một dòng yên lặng trên menu cho tiến trình/lỗi/lý do chờ. Một bản cập nhật **bắt buộc** vô hiệu
    `Tạo phòng`, `Tham gia phòng` và `Máy chủ riêng` (không vô hiệu `Vào lại phòng đang mở` và `Đóng phòng`). Menu vẫn chỉ
    có nút. Chi tiết: [app-update.instruction.md](./app-update.instruction.md).
  - **Form host**: chỉ có tên (`desktop-player-name`) và nút "Tạo và vào phòng". Không có ô chọn mạng và không có dòng
    giải thích về cổng hay địa chỉ: main process tự chọn mạng đang kết nối (`bridge.host.start()` không tham số; xem
    `networkInterfaces.ts`). Khi mở form mà máy chưa có mạng dùng được, một `role="alert"` nói bằng lời thường "Máy này
    chưa kết nối mạng. Hãy bật Wi-Fi hoặc cắm dây mạng."; nút vẫn bấm được để thử lại (main process đọc lại mạng lúc start).
    Dòng tiến trình ("Đang chuẩn bị phòng…", "Đang mở phòng…", "Đang đóng phòng…") và mọi lỗi host (`HostRuntimeErrorCode`)
    cũng viết bằng lời thường: không nhắc cổng, máy chủ hay cơ sở dữ liệu, và lỗi luôn có việc cần làm.
  - **Form join**: chỉ có tên và mã phòng (`desktop-lan-room`). "Kết nối và vào phòng" gọi
    `window.ownTheBlockDesktop.lan.findRoom(mã)`; nút hiện "Đang tìm phòng…" (tối đa khoảng 3 giây) và hai ô nhập chỉ-đọc
    cho tới khi có kết quả; chỉ khi có endpoint đã kiểm chứng mới `onReady` (socket được tạo sau đó). Kết quả tìm bị bỏ
    nếu người chơi bấm "Quay lại" hoặc launcher bị đóng. Thất bại hiện thông điệp có việc cần làm:
    `NOT_FOUND` "Không tìm thấy phòng {mã}. Kiểm tra lại mã và chắc chắn máy tạo phòng đang mở game, cùng Wi-Fi với bạn.",
    `UNREACHABLE` "Tìm thấy phòng nhưng chưa kết nối được. Nhờ chủ phòng bấm Cho phép khi tường lửa hỏi.", `NO_NETWORK`
    "Máy này chưa kết nối mạng. Hãy bật Wi-Fi hoặc cắm dây mạng.", `UNAVAILABLE` (kể cả bridge cũ không có `lan` hoặc IPC lỗi)
    "Không thể tìm phòng tự động. Hãy dán liên kết mời."
  - **Liên kết mời (dự phòng ẩn)**: chỉ sau một thất bại (trừ `NO_NETWORK`) form hiện thêm ô "Dán liên kết mời"
    (`desktop-lan-invite`). Liên kết hợp lệ `http://<ip>:<cổng>/?room=<MÃ>` (`parseLanJoinUrl` trong `runtime/lanSharing.ts`)
    bỏ qua bước tìm; ô "Mã phòng" đi theo mã trong liên kết; liên kết sai báo "Liên kết mời chưa đúng. …". Mạng chặn
    broadcast (Wi-Fi khách, client isolation) vẫn vào được bằng đường này.
  - Chế độ `Máy chủ riêng` (trước là "Máy chủ đã cấu hình") giữ nguyên: địa chỉ cố định, không tìm, không ô liên kết.
- **Loading**: một `LoadingScreen` (`as="main"` lúc bootstrap, `as="section"` lúc `RESTORING` trong app):
  brand, hàng mascot, đúng stage thật (không phần trăm giả), ba chấm; đứng yên khi reduced motion hiệu lực.
  Nút "Hướng dẫn chơi" dán góc phải trên (`HowToPlayButton placement="corner"`), ngoài dòng trạng thái.
- **Lỗi**: `ErrorScreen` (mascot bối rối, tiêu đề, thông điệp, một hành động chính và, trên desktop, một hành động phụ "Về trang
  chủ") dùng cho `REPLACED` ("Phiên chơi đã được mở ở nơi khác"; trình duyệt thường không có nút, desktop có "Về trang chủ"),
  `ERROR` và `BootstrapErrorScreen`. `role="alert"` nằm
  trên khối chữ, không trên cả `main`. Mọi màn hình lỗi có nút "Hướng dẫn chơi" ở góc phải trên (sau hành động
  chính), kể cả màn hình lỗi render của `AppErrorBoundary` (boundary tự bọc `HowToPlayProvider`).
- **Mất kết nối**: `ConnectionOverlay` là lớp phủ toàn màn hình; `role="status"` chỉ bọc panel giấy (nút
  "Hướng dẫn chơi" góc phải trên đứng cạnh, nên không bị đọc theo trạng thái), nằm trên lớp thẻ bài, giữ snapshot
  phía dưới và khóa mutation; hộp thoại hướng dẫn mở từ đây nằm trên lớp phủ. **Khán giả**: `SpectatorBanner` (pill "Chế độ Khán Giả", giải thích, nút
  "Rời phòng" chạy flow rời phòng của app qua `useRoomExit()`).

## Đường quay lại launcher (desktop, V1.1 mục 3)

Không màn hình nào của app desktop là ngõ cụt: mọi lối quay lại đều đi qua `onExitToLauncher` (`AppBootstrap`: `setLaunch(null)`) và
**chỉ ngắt kết nối**. `backToLauncher` trong `App.tsx` tăng `admissionAttemptRef` (ACK muộn bị bỏ), xóa `initialJoinRef`, gọi
`socket.disconnect()` rồi `onExitToLauncher()`; nó không emit `leave room` và không xóa token đã lưu, nên session của một phòng
khác vẫn còn để vào lại từ launcher. Chỉ `leave room` tường minh (`exitToStart`) mới thu hồi session.

| Màn hình (desktop) | Lối quay lại |
| --- | --- |
| `JoinForm` (JOIN/JOINING): mã phòng sai hoặc không tồn tại, "Phòng chung" kèm mã, vào phòng thất bại, đang chờ ACK | nút "Quay lại" (ghost, góc trên trái của trang); chỉ có khi có `desktopBridge` và `onExitToLauncher` |
| `ERROR` có `returnToLauncher` (session terminal, lỗi kết nối) | hành động chính "Về trang chủ" (trước là "Quay về trình khởi động LAN") |
| `ERROR` khác (hết giờ xác nhận phiên, không lưu được phiên, `DATABASE_UNAVAILABLE`…) | "Thử lại" hoặc "Quay về màn hình vào phòng" cộng hành động phụ "Về trang chủ" (`ErrorScreen.secondaryAction`) |
| `REPLACED` | hành động duy nhất "Về trang chủ" |
| `LOBBY` (host và khách), ván đang chơi, khán giả, `WinnerBanner` | không đổi: "Rời phòng" / "Bỏ cuộc" / "Về trang chủ" qua `leaveRoom` → `exitToStart` |
| `RECONNECTING`, `RESTORING` (loading) | tạm thời và có giới hạn: lần kết nối lại thất bại đầu tiên (`connect_error`) hoặc `ACK_TIMEOUT_MS` chuyển sang `ERROR` ở trên |

## First join

1. Form trim/validate name và room code.
2. Client emit `join room({name, roomCode})` và ở state `JOINING`.
3. Running game may ACK explicit `SPECTATOR`; spectator gets no Player session/token.
4. Lobby admission ACK returns `PENDING` raw token/expiry; no Seat yet.
5. Client writes versioned record `monopoly.player-session.v3` under the
   selected server authority origin with the canonical room code; a token from
   another LAN host or another explicitly selected room is never sent to this
   endpoint.
6. Client immediately emits `resume session({token})`.
7. Success ACK supplies stable `playerId`, role, public room and pending offers.
8. Only then App renders Lobby/Board.

Two-step activation prevents lost first ACK from consuming a Seat. Lost activation
ACK is resumable because token was stored first.

## Startup/refresh/reconnect

- Startup with stored token enters `RESTORING` before JoinForm.
- A desktop launch with `targetRoomCode` resumes only an exact authority + room
  match; that token wins over its fresh `initialJoin`. A different room, or an
  unscoped V1/V2 token, performs the selected fresh join instead.
- Every new Socket.IO connection resumes token before enabling mutation.
- During transport loss, last snapshot remains visible under `RECONNECTING` overlay;
  actions are disabled.
- `DATABASE_UNAVAILABLE` and network errors retain token for retry.
- Invalid/revoked/expired/room-gone terminal errors clear the invalid local record
  and show safe recovery without silently issuing a fresh `join room`. In desktop
  mode the deliberate recovery action returns to the LAN launcher;
  `GAME_ALREADY_STARTED`/`ROOM_FULL` during the pending activation race are also
  terminal for that admission token and clear it.
- `session replaced` moves old tab to terminal `REPLACED`, stops reconnect and does
  not clear shared localStorage.

## Duplicate/role rules

- Newest valid connection for a token wins.
- Reconnect preserves stable Player/Seat/host/ready/assets.
- Valid Player token is resolved before spectator branch.
- Join without valid token after start is an explicit read-only gameplay spectator;
  the bound spectator may still use room chat.
- Spectator has no durable identity/token; a temporary transport reconnect reissues
  the remembered room request and receives a fresh spectator admission.
- Refresh never derives identity from a new `socket.id`.
- Desktop Host/Join resolves the endpoint before creating the gameplay socket
  (Join: from the room code through the main-process lookup, or from a pasted
  invitation link after a failed lookup; the endpoint returned by IPC is
  re-validated with `normalizeLanEndpoint`).
  Host admission still uses the ordinary `join room` → `resume session` flow;
  the host runtime never creates a room or player directly. In desktop server
  profile, only this loopback Host path may activate an unused room code; remote
  LAN peers receive the existing localized `NOT_FOUND` error for a wrong code.
- Configured-server Join uses the supplied valid HTTP/HTTPS endpoint as
  informational, keeps the room code editable, and does not apply private-LAN
  address normalization.

## Explicit leave

`leave room` has success ACK. Only after success does client clear its Player token
or in-memory spectator request. Desktop Player, spectator, and hosting leave
disconnect the gameplay socket and return to the LAN launcher without stopping the
app-owned host runtime. Web leave returns to JoinForm.
In-game Player requires explicit forfeit confirmation. Browser close, refresh and
network loss are not leave.

Sau khi xác nhận "Bỏ cuộc" (V1.1) client không đuổi người chơi ra ngoài (`forfeitAndWatch` trong `App.tsx`): nó emit
`leave room`, xóa token và session đã lưu, giữ bàn cờ trên màn hình, rồi cùng Socket đó emit `join room` (tên + mã phòng) để vào
lại như khán giả (join sau khi ván bắt đầu là khán giả; server không đổi). `ForfeitChoiceDialog` ("Bạn đã bỏ cuộc", `alertdialog`)
đưa hai lựa chọn: **Xem tiếp** (nút mặc định, cũng là Escape; ở lại xem) và **Rời phòng** (flow rời phòng của khán giả: launcher
trên desktop, JoinForm trên web). Host desktop thấy thêm một dòng nói máy này vẫn giữ phòng. Nếu ván đã `FINISHED` (hai người cuối)
thì không hiện dialog: `WinnerBanner` là lựa chọn. Nếu join lại thất bại hoặc quá `ACK_TIMEOUT_MS`, client rời hẳn và hiện toast
"Bạn đã bỏ cuộc và rời phòng."; mất kết nối giữa chừng thì connect handler vào lại như khán giả (`spectatorRequestRef`). Tải lại trang
sau khi bỏ cuộc về launcher/JoinForm vì token đã bị thu hồi và khán giả không bền.

## Security

- Never put token in URL, public state, error text, log or DOM.
- Room code/name/public player ID are not credential.
- Client-side storage is versioned as V3, stores canonical room codes, and rejects
  malformed entries safely. V1/V2 migrations remain unscoped until a successful
  authoritative resume supplies the room code.
- Legacy V2 cleanup preserves its `authority -> token` wire shape; V3 writes
  refresh existing authority order before the eight-entry retention limit.

## Required tests

- No optimistic Board/Lobby transition.
- Pending token is stored before resume; lost ACK recovery.
- Refresh/new socket returns same stable Player.
- Invalid/revoked/retryable errors handle storage correctly.
- Newest-wins/old tab does not clear token.
- Spectator versus valid reconnect after start.
- StrictMode listener cleanup and mutation controls disabled while reconnecting.
- Desktop launcher resolves Host/Join before socket creation; abandoning an
  endpoint does not retain a stale socket.
- The launcher is a menu of buttons with no sentence under any of them; its picture is decoration only; "Cài đặt" keeps a change
  in the storage the game reads and plays no audio; "Thoát" asks first only when a room is open and is absent without a bridge
  that can quit (`DesktopMultiplayerLauncher.test.tsx`, `AppBootstrap.test.tsx`).
- `JoinForm` shows "Quay lại" only with a way back, opens with the name and room code the player already typed, and never submits
  on it; every desktop failure screen has a way back and going back disconnects without leaving or clearing a saved session
  (`JoinForm.test.tsx`, `ErrorScreen.test.tsx`, `App.test.tsx`).
- Join asks for a name and a room code only, searches by code (busy label, read-only
  fields, stale result dropped), shows each failure code in plain words, offers the
  invitation-link field only after a failure and enters the room it names without
  searching; host form has no network choice or technical hint and calls `start()`
  without options; no launcher text contains an address, port or database wording
  (`DesktopMultiplayerLauncher.test.tsx`, `AppBootstrap.test.tsx`).
- `parseLanJoinUrl` is the inverse of `buildLanJoinUrl` and refuses credentials,
  non-http, non-IPv4, loopback/link-local, missing port or room (`lanSharing.test.ts`).
- The desktop connect-failure screen says "Không vào được phòng. Hãy kiểm tra Wi-Fi
  rồi thử lại." without firewall/VPN/address wording (`App.test.tsx`).
- `?room=` accepts only the canonical room schema, prefills JoinForm, and never
  auto-submits. Visibility, `pageshow`, and `online` recovery resume without
  emitting leave.
