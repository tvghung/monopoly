# Durable property, building và Bank auctions

## Shared state

`Auction.kind` là `PROPERTY | BUILDING`. Mọi auction giữ stable `auctionId`, active/
passed stable Player IDs, highest bid/bidder, absolute `endsAt`, source/continuation
và target data đúng kind. Timer handle/tick không persist.

## PROPERTY auction

- Current Player decline unowned landed property → auction gồm mọi active Player,
  kể cả người vừa decline. Không ai bid thì property vẫn unowned.
- Bankruptcy/forfeit-to-Bank đưa property theo board index vào durable
  `BankPropertyAuctionQueue`; chỉ head mở auction. Finalize/cancel xong mới pop và
  mở head kế tiếp, rồi mới resume payment/turn continuation.
- Highest valid bidder thắng; award dùng `BANK_AUCTION_AWARD`, charge qua Bank và
  tạo property unbuilt/unmortgaged. Invalid/unfunded leader tại finalize không được
  tạo debt hoặc ownership; property giữ unowned và queue tiếp tục.

## BUILDING auction

- Khi số legal request cho Nhà/Khách Sạn cuối vượt stock, tạo
  `BuildingContention` với loại unit, eligible Player/target và đúng một
  `reservedUnit: { buildingType: 'HOUSE' | 'HOTEL'; quantity: 1 }`; inventory derive
  phải trừ unit này.
- Auction winner trả winning bid và nhận reserved unit trên target đã revalidate.
  Nếu target/funds không còn hợp lệ, không mutate building/balance và contention
  tiếp tục/finalize theo deterministic domain rule.
- Finalize/cancel luôn release hoặc consume `reservedUnit` đúng một lần; restart và
  stale callback không được duplicate building.

## Bid/pass/deadline

- Start 30 giây; bid integer dương, lớn hơn high bid và không vượt current balance.
- Valid bid clear `passed` và bảo đảm còn ít nhất 15 giây. Highest bidder không pass;
  early finalize khi không còn participant cần act.
- Disconnect giữ participation/high bid; explicit leave reconcile atomic. Active
  auction ưu tiên hơn generic current-turn grace.
- Deadline recovery match `auctionId/kind/endsAt` dưới room lock và aggregate CAS.
  Commit trước public update/ACK; save failure không đổi revision/state.

## Tests

- Decline auction/no-bid/award/all-active participation.
- Bank queue ordering, multi-property restart và exact continuation.
- Building last-unit contention/reservation/inventory/restart/invalidated target.
- Bid/pass/extension/leave/disconnect/stale callback/save-failure cho cả hai kind.
