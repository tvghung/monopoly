# Property economy, buildings, mortgage và transfer

## Code nguồn

- Domain: `apps/server/src/game/property.ts` và
  `apps/server/src/game/transfer.ts`.
- Transport: `apps/server/src/socket/building.ts`, trading/auction handlers.
- Canonical economy: `packages/shared/src/tileState.ts`.

## Rent

- Street: base rent; full unbuilt color group = base x2; 1–4 Nhà/Khách Sạn dùng
  `rentTiers`; mortgaged landed property = 0.
- Ga Tàu: rent `25/50/100/200` theo tổng số Ga owner sở hữu. Một Ga mortgaged vẫn
  tính là owned để xác định tier trên Ga khác; landing chính Ga mortgaged trả 0.
- Công Ty: landing utility mortgaged trả 0; owner sở hữu một utility = dice x4,
  sở hữu cả index 12/28 = dice x10, kể cả utility còn lại đang mortgage.
- Rent tạo `DebtClaim` có PLAYER creditor thay vì transfer âm trực tiếp.

## Build/sell và Bank inventory

- Build cần full color group, không tile nào trong group mortgage, đủ tiền và
  build-even. 1–4 là Nhà; Khách Sạn chỉ được xây khi mọi property trong group có
  đúng 4 Nhà, sau đó target thành level 5.
- Sell về Bank theo chiều even ngược, refund `floor(houseCost/2)`. Bán Khách Sạn
  trả 4 Nhà về target nên chỉ hợp lệ nếu Bank còn đủ 4 Nhà.
- Physical inventory là giá trị derive, không persist counter:
  - Nhà còn lại = `32 - số Nhà đang nằm trên board - reserved house unit`.
  - Khách Sạn còn lại = `12 - số level-5 trên board - reserved hotel unit`.
  - Level 5 không đồng thời chiếm 4 Nhà; upgrade trả bốn Nhà về Bank.
- `BuildingContention.reservedUnit` giữ duy nhất unit đang đấu giá để concurrent
  command/restart không oversell. Khi chỉ một legal request và còn stock, mua theo
  build cost; khi demand hợp lệ vượt stock, mở durable building auction.

## Mortgage

- Trước khi mortgage bất kỳ street trong color group, toàn bộ group phải có
  `houses=0`. Non-street property chỉ cần chính nó không có building.
- Mortgage trả `floor(price/2)`; unmortgage trả `ceil(mortgageValue * 1.1)`.
- Mortgaged property không thu rent nhưng vẫn thuộc ownership/group để tính tier
  railroad/utility; color-group street không được build khi bất kỳ member mortgage.

## Transfer policies

Mọi ownership change dùng một policy rõ ràng:

- `VOLUNTARY`: open market/private `TradeBundle`; reject nếu color group còn
  building. Mortgaged recipient trả ngay 10% mortgage value cho Bank; unmortgage
  sau đó vẫn dùng normal principal +10%.
- `BANKRUPTCY_TO_PLAYER`: transfer property/mortgage/jail-free card cho creditor;
  xử lý mortgage interest qua PaymentQueue, không clear mortgage.
- `RETURN_TO_BANK`: clear owner/mortgage/buildings/listing và enqueue property vào
  `BankPropertyAuctionQueue` khi source rule yêu cầu.
- `BANK_AUCTION_AWARD`: tạo ownership mới unbuilt/unmortgaged cho winner.

Nhà/Khách Sạn không được đưa trực tiếp vào `TradeBundle`; debtor phải bán về Bank
trước. Transfer xóa listing/offer stale trong cùng transaction.

## Tests

Xem [property testcase](../testcase/property-economy.md),
[trading testcase](../testcase/trading-market-and-private-offers.md),
[auction testcase](../testcase/auction.md) và persistence restart cases.
