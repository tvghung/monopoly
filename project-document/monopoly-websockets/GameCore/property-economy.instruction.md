# Property economy, buildings và transfer

## Code nguồn

- Domain: `apps/server/src/game/property.ts` và `apps/server/src/game/transfer.ts`.
- Transport: `apps/server/src/socket/building.ts`, trading and forced-sale handlers.
- Canonical economy: `packages/shared/src/tileState.ts`.

## Rent

- Street: base rent hoặc `rentTiers` (1–4 Nhà/Khách Sạn). Sở hữu đủ một khu màu nhân tiền thuê (đã gồm tier xây) của **mọi ô street
  trong khu**: Solo ×1,5 (`SOLO_COLOR_SET_RENT_PERCENT = 150`), 2v2 khi cả khu thuộc đội ×2 (`TEAM_COLOR_SET_RENT_PERCENT = 200`,
  tổng hợp hai đồng đội); `Math.floor`. Bộ màu chỉ nhân thuê, không bao giờ khóa việc xây Nhà.
- 2v2: chủ ô là đồng đội thì không trả tiền thuê tài sản (thẻ vẫn tính).
- Ga Tàu: rent `25/50/100/200` theo tổng số Ga owner sở hữu (2v2: cộng cả Ga của đồng đội).
- Công Ty: owner sở hữu một utility = dice x4, sở hữu cả index 12/28 = dice x10 (2v2: tính theo cả đội).
- Rent tạo `DebtClaim` có PLAYER creditor thay vì transfer âm trực tiếp.

## Build/sell và landing decision

- Chỉ một lần phát triển được mở khi người chơi đáp xuống street của chính mình.
  Server lưu `pendingDevelopmentDecision` với operation ID và level tại thời điểm
  đáp xuống; client không tự chọn tile, group hay giá.
- `BUILD_HOUSES` nhận số lượng 1–4 trong phần còn lại của lần đáp xuống; level 4
  mở `UPGRADE_HOTEL`; `SKIP` kết thúc chờ. Không có stock contention, auction hay
  luật build-even.
- Bán Nhà tự nguyện hoàn tiền `floor(houseCost/2)` cho đúng tile; hành động chỉ
  bị chặn bởi payment shortfall đang mở.
- Team Investment (2v2): dừng ở street đồng đội, người dừng chân trả bằng tiền của mình để xây/nâng cấp; `ownedProps` không đổi chủ,
  và bán công trình hoàn tiền cho **chủ ô**.

## Transfer policies

Mọi ownership change dùng một policy rõ ràng:

- `VOLUNTARY`: direct bilateral `TradeBundle`; chỉ các terms trong bundle làm thay
  đổi cash/property/card state.
- `RETURN_TO_BANK`: clear owner and buildings.
- `BANK_PURCHASE`: tạo ownership mới với `houses = 0` sau Buy.
- `FORCED_SALE`: buyer trả giá đã thỏa thuận của proposal (mặc định gross `floor((price + invested development cost) * 70 / 100)`,
  hoặc `price` seller nhập, V1.1); seller nhận đúng số đó trước khi `PaymentQueue` tiếp tục xử lý khoản nợ.

Nhà/Khách Sạn không được đưa trực tiếp vào `TradeBundle`; debtor phải bán về Bank
trước. Mọi offer pending liên quan asset được hủy trong cùng transaction khi asset
đổi chủ hoặc bị bán.

## Tests

Xem [property testcase](../testcase/property-economy.md),
[trading testcase](../testcase/trading-market-and-private-offers.md),
[payment shortfall testcase](../testcase/payment-shortfall-and-forced-sale.md)
 và persistence restart cases.
