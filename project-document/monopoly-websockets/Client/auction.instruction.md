# Property/building auction UI

## Public state

Auction panel render `Auction.kind`, target, participants/pass, highest bid/bidder và
countdown từ absolute `endsAt`; không sở hữu timer authority. All amounts dùng VNĐ.

## PROPERTY

- Declined landed property và Bank-queued bankruptcy property dùng cùng panel nhưng
  hiển thị source/queue context khác nhau.
- Mọi active Player, kể cả decliner, có thể bid/pass. Không bid: property unowned;
  Bank queue tự chuyển item kế tiếp bằng committed update.

## BUILDING

- Panel nêu Nhà/Khách Sạn cuối đang được tranh, legal target đã chọn và
  `reservedUnit`; derived Bank inventory không double-count unit này.
- Winner/invalidated target/released reservation chỉ đổi UI sau committed finalize.

## Role/recovery

- Active participant bid/pass; highest bidder không pass. Spectator/non-participant
  read-only; reconnecting disables actions.
- Modal/panel chỉ đóng khi committed state clear/advance auction. Restart/refresh
  resume đúng kind, bid và deadline; stale revision không đóng auction mới.
- Typed ACK failure tiếng Việt không tạo phantom bid/reservation.

## Tests

- Both kinds labels/amount/countdown/action gating.
- Decliner participation/no-bid/bank queue next item.
- Building reservation/inventory/invalid target.
- Deadline extension/restart/stale update/StrictMode cleanup/save failure.
