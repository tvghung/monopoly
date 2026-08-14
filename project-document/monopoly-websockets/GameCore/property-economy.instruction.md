# Property economy, buildings, mortgage và transfer

## Code nguồn

- Domain: `apps/server/src/game/property.ts` và
  `apps/server/src/game/transfer.ts`.
- Transport: `apps/server/src/socket/building.ts`, trading and forced-sale handlers.
- Canonical economy: `packages/shared/src/tileState.ts`.

## Rent

- Street: always base rent; 1–4 Nhà/Khách Sạn dùng `rentTiers`; mortgaged landed
  property = 0. A full colour group does not multiply rent.
- Ga Tàu: rent `25/50/100/200` theo tổng số Ga owner sở hữu. Một Ga mortgaged vẫn
  tính là owned để xác định tier trên Ga khác; landing chính Ga mortgaged trả 0.
- Công Ty: landing utility mortgaged trả 0; owner sở hữu một utility = dice x4,
  sở hữu cả index 12/28 = dice x10, kể cả utility còn lại đang mortgage.
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

## Mortgage

- Mortgage chỉ yêu cầu chính tài sản không có công trình; không có group-wide
  mortgage guard.
- Mortgage trả `floor(price/2)`; unmortgage trả `ceil(mortgageValue * 1.1)`.
- Mortgaged property không thu rent nhưng vẫn thuộc ownership/group để tính tier
  railroad/utility; color-group street không được build khi bất kỳ member mortgage.

## Transfer policies

Mọi ownership change dùng một policy rõ ràng:

- `VOLUNTARY`: open market/private `TradeBundle`; mortgaged recipient trả ngay
  10% mortgage value cho Bank.
- `RETURN_TO_BANK`: clear owner, mortgage, buildings and listing.
- `BANK_PURCHASE`: tạo ownership mới unbuilt/unmortgaged sau Buy.
- `FORCED_SALE`: buyer trả gross 70% của price + invested build cost; Bank giữ
  mortgage principal; seller nhận net và property trở thành unowned/unmortgaged.

Nhà/Khách Sạn không được đưa trực tiếp vào `TradeBundle`; debtor phải bán về Bank
trước. Transfer xóa listing/offer stale trong cùng transaction.

## Tests

Xem [property testcase](../testcase/property-economy.md),
[trading testcase](../testcase/trading-market-and-private-offers.md),
[payment shortfall testcase](../testcase/payment-shortfall-and-forced-sale.md)
 và persistence restart cases.
