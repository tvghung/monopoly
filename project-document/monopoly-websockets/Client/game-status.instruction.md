# Lobby, roster, winner và branding

## Branding/language

- HTML title/metadata/manifest, loading/error/reconnect/replaced screens, join/lobby,
  center board, roster, winner và confirmations dùng “Cờ Tỷ Phú Việt Nam” và tiếng
  Việt. Technical repository/package/event names không cần rename.
- Host=`Chủ Phòng`, Ready=`Sẵn Sàng`, Spectator=`Khán Giả`, Online/Offline và
  bankruptcy/leave reasons đều có Vietnamese copy.

## Player card (HUD)

- Bốn góc màn hình, mỗi người chơi một card (`game/ui/hud/PlayerCard.tsx`); trạng thái luôn có chữ và icon, không chỉ màu:
  lượt hiện tại ("Đang đi", vòng vàng), "Bạn", "Ở tù n/2" (vòng đối thủ đã qua), "Mất kết nối" kèm "Tự bỏ lượt sau
  m:ss" khi `turnRecovery` trỏ tới người đó (chỉ hiển thị, deadline do server giữ), "Phá sản" (thay tiền bằng chip,
  card xám), "Đã rời" (mờ 50%). Người chơi LEFT/BANKRUPT giữ nguyên góc. Cạnh tên tối đa hai tag (ưu tiên Mất kết nối >
  Ở tù > Đang đi > Bạn); ở điện thoại ngang chỉ còn badge icon (Ở tù, Mất kết nối + đếm ngược).
- Tiền, lượt và số nhà/khách sạn theo presentation state; số tài sản và ô sở hữu theo `ownedProps` authoritative.
- 2v2: bốn card vẫn là bốn góc nhưng **nhóm theo đội** (`resolvePlayerStationSlots(..., teamMode)`: đội của người xem ở cột trái
  `BOTTOM`/`LEFT`, đối thủ cột phải `TOP`/`RIGHT`; khán giả thấy Team 1 bên trái). Mỗi card có dải đội (tên đội + màu, chữ chứ không
  chỉ màu) và `data-team`/`data-relation`; summary đọc "<tên>, Đồng đội/Đối thủ, đội <tên đội>". Người phá sản hiện chip
  **"Có thể hồi sinh"** + "Còn N lượt" (N giảm từ `REVIVE_WINDOW_SURVIVOR_TURNS` = 5)/"Cơ hội cuối" (còn đúng một lượt), hoặc **"Đã bị loại vĩnh viễn"** (`getReviveStatus`).

## Lobby/start

- Public roster hiển thị stable ID-backed name/color/host/ready/connected. `Lobby` vẽ luôn đủ `maxPlayers` thẻ chỗ ngồi
  (`LobbySeat`: mascot, tên, tem sẵn sàng có chữ, huy hiệu Chủ Phòng, biểu tượng "Mất kết nối" ở góc trên trái, và với chính mình nút "Sẵn sàng"/"Hủy sẵn sàng"; `EmptySeat` cho chỗ trống).
  **Mời ra khỏi phòng (Solo và 2v2)**: chỉ host thấy một nút X tròn ở góc trên phải của mọi chỗ ngồi *khác* (không có trên chỗ của chính host, không có
  với khách), `aria-label` "Mời <tên> ra khỏi phòng", disable khi `busy`. Bấm X mở `ConfirmationDialog` trung tâm "Mời <tên> ra khỏi phòng?"
  (nút "Hủy" lấy focus, "Mời ra" là nút nguy hiểm; không dùng `window.confirm`); chỉ sau khi xác nhận mới gửi `kick player` `{playerId}`.
  Câu hỏi tự đóng khi người đó đã rời phòng. Người bị mời nhận event `removed from room` — xem "Bị mời ra khỏi phòng" trong
  [join-room.instruction.md](./join-room.instruction.md).
  Mã phòng có nút "Sao chép mã phòng" với `role="status"` (`Đã sao chép.` / lỗi tự chọn mã); host đang chạy LAN thấy
  `HostLanSharing` ("Mời qua mạng LAN"): mã QR trên thẻ giấy và nút "Sao chép liên kết", **không in địa chỉ** (người chơi
  không đọc URL); lỗi sao chép nói "Không sao chép được. Hãy cho bạn bè quét mã QR."; chưa có mạng thì nói "Máy này chưa
  kết nối mạng. Hãy bật Wi-Fi hoặc cắm dây mạng.". Ô "Mạng chia sẻ" và nút "Làm mới mạng" chỉ hiện khi từ hai mạng trở
  lên cùng hạng tốt nhất (`rank` thấp nhất) — lúc đó app không tự biết bạn bè ở mạng nào; ô chọn liệt kê các mạng đồng hạng
  và mạng đang dùng.
- Header của Lobby có nút "Hướng dẫn chơi" (có chữ, là nút đầu của `.lobby__header-actions`, trước "Cài đặt"/"Rời
  phòng"/"Bắt đầu") mở hộp thoại hướng dẫn dùng chung; khi hẹp, các nút xuống dòng. Trong ván, nút "?" là ô đầu của
  toolbar; xem [how-to-play.instruction.md](./how-to-play.instruction.md).
- `MascotPicker` đổi mascot/màu qua `set appearance`, chuyển động theo reduced motion hiệu lực (setting hoặc OS).
  Mascot chỉ nhận diện bằng hình; `accessibleLabel` tiếng Việt chỉ nằm ở `alt`/`aria-label`.
- **Chế độ chơi**: host thấy `SegmentedControl` "Chế độ chơi" (Solo | 2v2; `set game mode`), người khác chỉ thấy nhãn. Đổi chế độ reset Ready
  của mọi người. Ở 2v2 `Lobby` thay danh sách ghế bằng hai `TeamZone` (mỗi vùng là `section` có tên đội, danh sách người chơi, số "n/2",
  nhãn "Đội của bạn"): tên đội (`TeamNameField` chỉ hiện cho **đội của chính người xem**, kể cả host; tên đội kia chỉ đọc với mọi người,
  host không có quyền đặc biệt; Enter/blur lưu, Escape hoàn tác, tối đa 20 ký tự, không reset Ready; lệnh `set team name` chỉ gửi `{name}`, server
  tự xác định đội của người gửi), màu đội (`TeamColorPicker`: chỉ thành viên đội đổi được, màu của đội kia bị khóa; đổi màu reset Ready cả đội).
  `MascotPicker` ẩn bảng màu (ghi chú "Mascot luôn mang màu đội…") và khóa mascot đồng đội đang dùng ("(đồng đội đã chọn)").
- **Chỗ ngồi 2v2 và đổi chỗ**: mỗi `TeamZone` luôn vẽ đúng hai ô chỗ theo `teamSlot` (0 rồi 1) từ `room.players[].teamSlot`
  (`layoutTeamSeats`): chỗ trống nằm đúng vị trí của nó (người ở chỗ 1 của đội trống hiện ở ô thứ hai); thành viên trùng chỗ (lobby cũ chưa chuẩn hóa)
  lấy ô trống đầu, không ai bị ẩn. Mọi chỗ **trừ chỗ của chính người xem** có nút đổi chỗ, disable khi `busy`; Solo không có nút đổi chỗ.
  - Chỗ trống: nút "Chuyển sang" (`aria-label` "Chuyển sang chỗ trống N của đội <tên đội>", N = `teamSlot`+1) → `move to seat` `{teamId, teamSlot}`,
    người xem vào chỗ ngay (kể cả chỗ còn lại của đội mình).
  - Chỗ có người: nút "Đổi chỗ" (`aria-label` "Đổi chỗ với <tên>") → `request seat swap` `{targetPlayerId}`; chưa ai di chuyển cho đến khi người kia đồng ý.
    Host không có quyền đổi chỗ người khác: host đổi chỗ như mọi người.
  - Mọi trạng thái suy ra từ `room.gameState.boardState.seatSwapRequests` (public), client không giữ nguồn sự thật cục bộ. Yêu cầu của chính người xem →
    chỗ của người được hỏi hiện "Đang chờ <tên> trả lời" (`role="status"`, viền vàng nét đứt) cùng nút "Hủy yêu cầu" (`aria-label` "Hủy yêu cầu đổi chỗ với <tên>")
    gửi `cancel seat swap` (không payload); các chỗ khác vẫn hỏi được (yêu cầu mới thay yêu cầu cũ).
  - Yêu cầu gửi tới người xem (lấy yêu cầu **cũ nhất** nếu có nhiều; chỉ khi người gửi còn trong phòng) mở `ConfirmationDialog` trung tâm trung tính
    "<tên> muốn đổi chỗ với bạn" với "Đồng ý"/"Từ chối" → `respond seat swap` `{requesterPlayerId, accept}`; Escape = từ chối; hai nút disable khi `busy`.
    Nội dung nói rõ hệ quả: cùng đội "Hai bạn đổi chỗ cho nhau trong đội <tên>."; khác đội "Bạn sang đội X, <tên> sang đội Y. Cả hai đổi sang màu đội mới và phải bấm lại Sẵn sàng."
    Dialog tự đóng khi yêu cầu biến mất khỏi room state (đã chấp nhận ở nơi khác, bị hủy, người gửi rời đi).
  - Yêu cầu của người xem biến mất trong khi chỗ của họ không đổi (người kia từ chối hoặc yêu cầu vô hiệu) → toast "Yêu cầu đổi chỗ đã kết thúc.";
    không báo khi đã đổi chỗ thật, khi chính họ hủy, khi bị thay bằng yêu cầu khác hoặc khi đổi chế độ.
  - Lỗi `CONFLICT`/`FORBIDDEN` của mọi lệnh phòng chờ (mode, đội, chỗ, mời ra) hiện trong `.lobby__error` qua cùng `operationError` và cùng trạng thái `busy`
    (`runTeamCommand` trong `App.tsx`).
- 2–4 active Player (2v2: đúng 4, mỗi đội 2), tất cả connected/ready; chỉ host có start action. Nút "Bắt đầu" bị disable luôn kèm **lý do viết ra**
  (`startReadiness.getStartBlockReason`, lý do đầu tiên thắng): "Cần ít nhất N người chơi", "Tối đa N người chơi", "Chờ mọi
  người sẵn sàng", "Có người chưa chọn mascot", "Có người đang mất kết nối", "Hai người đang trùng mascot và màu"; 2v2 thêm
  "Chế độ 2v2 cần đúng 4 người chơi", "Mỗi đội cần đúng 2 người chơi", "Hai đồng đội đang trùng mascot";
  nút trỏ tới lý do bằng `aria-describedby`. Server vẫn là authority.
- Start success update chứa persisted first-player result từ server dice tie-break;
  UI không tự random/reorder roster.
- Temporary host disconnect không transfer; explicit leave transfer theo join order.

## In-game/finished/replay

- Roster/turn/payment/winner key bằng stable IDs. Temporary disconnect không
  xóa Seat/assets; spectator read-only.
- Finished reason phân biệt `BANKRUPT` và `LEFT`; forfeit confirmation mô tả asset
  destination theo active creditor/Bank nhưng không đổi reason.
- Winner set một lần, room `FINISHED`, and `WinnerBanner` shows only authoritative
  name/mascot/color/final cash/property/house/hotel facts. Reconnect hydrates this
  surface immediately without replaying stale presentation.
- `WinnerBanner` là `Modal` `xl` tone `celebration`, `role="alertdialog"`, mô tả bằng người thắng + câu hướng dẫn tiếp theo:
  hero (avatar 128 px, 64 px khi landscape thấp, vương miện), bốn ô số liệu, danh sách người chơi khác (không xếp hạng:
  `finishedPlayers` không có thứ tự loại đáng tin; thứ tự theo ghế) với chip "Phá sản"/"Đã rời". **Mọi vai trò đều có "Về trang chủ"** (V1.1; icon `home`)
  (qua `useRoomExit()`, không cần xác nhận vì ván đã kết thúc: rời phòng rồi về trình khởi động LAN trên desktop hoặc form vào phòng
  trên web; server cho phép rời phòng đã `FINISHED`, lỗi vẫn hiển thị ngay trong dialog); chỉ host có "Chơi lại" (nút chính, đứng
  trước trong DOM). Người không phải host bắt đầu ở vùng "Kết quả ván chơi" (`tabIndex=0`, cũng là chỗ để cuộn bằng bàn phím),
  không bao giờ ở nút về trang chủ.
  `useVictoryVisibility`: winner đến từ live update chỉ hiện khi presentation `idle` (dự phòng 8 s); snapshot/reconnect hiện
  ngay. `VictoryConfetti` là một đợt 48 mảnh ≤ 1200 ms, chỉ lúc xuất hiện live, không bao giờ khi reduced motion hiệu lực.
- **Thắng đội (2v2)**: `WinnerBanner` đọc `getTeamVictorySummary` — tiêu đề **"CHIẾN THẮNG!"**, tên đội, hai thành viên (avatar mascot theo màu
  đội + tên; thành viên đã bị loại/rời hiện ghi chú "Đã phá sản trước đó"/"Đã rời phòng" nhưng vẫn là người thắng), bốn ô số liệu của cả đội
  (tổng tiền mặt, tài sản, Nhà, Khách sạn) và "Khu màu đủ bộ"; danh sách còn lại là "Đội đối thủ". Mô tả dialog đọc đội trước. Solo giữ
  nguyên "Người chiến thắng".
- Player card trên HUD là nút thật "Xem tài sản của <tên>" mở `PlayerPortfolioModal` (chỉ đọc; 2v2 thêm `TeamChip` và chip hồi sinh).
- The existing winner surface exposes `play again` only to the authenticated host.
  The command resets the same room to `LOBBY`; the server reuses canonical fresh
  state, keeps eligible stable IDs/appearance/join order/sessions, revives finished
  players, never revives `LEFT` members, and clears old offers and match state. In 2v2 the lobby that comes back keeps the mode, the
  teams (names, colours) and each player's team.

## Tests

- Vietnamese branding/copy/metadata and no player-facing English.
- Host/ready/2–4/first-player result/disconnect-transfer behavior.
- Bankruptcy versus forfeit reason, stable winner and reconnect/restart.
- Lobby: `Lobby.test.tsx` (Solo kick), `App.test.tsx` ("App 2v2 lobby commands": payload của từng lệnh, `removed from room`).
- 2v2: `Lobby.teamplay.test.tsx` (ô chỗ, nút đổi chỗ/chuyển chỗ, yêu cầu/hủy/trả lời, kick, tên đội của đội mình, busy), `startReadiness.test.ts`, `stationSlots.test.ts`, `playerCardSelectors.test.ts`, `PlayerCardList.test.tsx`,
  `WinnerBanner.test.tsx`, `teamView.test.ts` (xem [testcase/team-play.md](../testcase/team-play.md)).
