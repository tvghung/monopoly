# GameCore — turn, payment shortfall và forfeit v4

## Luồng lượt

- `roll dice` là server-authoritative. Server tạo 2d6, di chuyển theo index 0..39
  và resolve card/property/tile trên draft room.
- Đổ đôi chỉ là kết quả xúc xắc; không có extra roll hoặc triple-double jail.
- `completeTurnResolution` là cổng handoff duy nhất và chỉ trả `ADVANCE_TURN`.
- Landing tile unowned tạo `pendingPropertyDecision` với operation ID. Landing
  property của chính người chơi tạo `pendingDevelopmentDecision` chứa level tại
  thời điểm đáp; quyết định gồm `SKIP`, xây 1..4 Nhà trong khoảng còn thiếu, hoặc
  nâng cấp Khách sạn ở level 4. Không được build lại landing cũ sau reconnect.

## Jail

- Vào tù đặt `isJail=true`, `jailOpponentRoundsElapsed=0`.
- Double giải phóng và di chuyển nhưng vẫn hoàn tất lượt; failed roll tự động
  kết thúc lượt. `wait in jail` chỉ còn là transport tương thích cũ.
- Khi handoff chạm tới seat đang bị tù, counter tăng một lần. Counter đạt 2 thì
  tự động giải phóng trước lượt của seat đó. Người chơi rời/disconnect không làm
  counter tăng ngoài handoff đã commit.
- `pay bail` dùng shared `BAIL_AMOUNT=25`, chỉ được phép khi balance đủ và trừ
  trực tiếp; không mở payment queue mới. Jail-free card giữ identity và trả về
  đúng deck khi dùng.

## Payment shortfall

- Rent/card payments tạo `PaymentQueue` gồm ordered claims, `activeClaimIndex`,
  continuation và absolute `actionDeadlineAt`.
- Trong shortfall, ordinary offer/build actions bị khóa;
  debtor chỉ được bán tài sản cho Bank hoặc gửi một forced-sale proposal cho một
  active buyer. Proposal lưu trong private snapshot và gắn operation/claim,
  property fingerprint, gross authoritative price và expiry không vượt claim
  deadline.
- Bank sale dùng `floor((price + investedBuildCost) * 70 / 100)` gross. Seller nhận
  gross trước khi `PaymentQueue` tiếp tục xử lý khoản nợ. Scheduler tự động bán theo
  tile index khi deadline hết, retry claims, rồi mới loại debtor khi hết tài sản.
- Forced-sale buyer trả gross, seller nhận gross và claim tiếp tục trong cùng room CAS.

## Forfeit/winner/recovery

- Explicit leave của active payer hủy proposal/ordinary offers, auto-liquidates
  deterministically để trả creditor rồi marks `LEFT`; tài sản còn lại trả Bank,
  không đấu giá. Leave của non-payer trả tài sản trực tiếp cho Bank.
- Winner supersedes every pending landing/payment/proposal/turn-recovery marker.
- Scheduler rechecks exact room/turn/operation/claim/deadline marker under the room
  lock; stale/replayed callbacks are no-ops.
