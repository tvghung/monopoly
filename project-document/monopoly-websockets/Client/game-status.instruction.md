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

## Lobby/start

- Public roster hiển thị stable ID-backed name/color/host/ready/connected. `Lobby` vẽ luôn đủ `maxPlayers` thẻ chỗ ngồi
  (`LobbySeat`: mascot, tên, tem sẵn sàng có chữ, huy hiệu Chủ Phòng, biểu tượng "Mất kết nối", và với chính mình nút "Sẵn sàng"/"Hủy sẵn sàng"; `EmptySeat` cho chỗ trống).
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
- 2–4 active Player, tất cả connected/ready; chỉ host có start action. Nút "Bắt đầu" bị disable luôn kèm **lý do viết ra**
  (`startReadiness.getStartBlockReason`, lý do đầu tiên thắng): "Cần ít nhất N người chơi", "Tối đa N người chơi", "Chờ mọi
  người sẵn sàng", "Có người chưa chọn mascot", "Có người đang mất kết nối", "Hai người đang trùng mascot và màu";
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
- Player card trên HUD là nút thật "Xem tài sản của <tên>" mở `PlayerPortfolioModal` (chỉ đọc).
- The existing winner surface exposes `play again` only to the authenticated host.
  The command resets the same room to `LOBBY`; the server reuses canonical fresh
  state, keeps eligible stable IDs/appearance/join order/sessions, revives finished
  players, never revives `LEFT` members, and clears old offers and match state.

## Tests

- Vietnamese branding/copy/metadata and no player-facing English.
- Host/ready/2–4/first-player result/disconnect-transfer behavior.
- Bankruptcy versus forfeit reason, stable winner and reconnect/restart.
