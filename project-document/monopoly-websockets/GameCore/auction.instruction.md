# Auction

## Phạm vi và code nguồn

- Auction state transitions: `apps/server/src/game/auction.ts`.
- Timer và Socket events: `apps/server/src/socket/auction.ts`.
- Disconnect interaction: `apps/server/src/socket/player.ts`.
- Shared `Auction` shape: `packages/shared/src/types.ts`.

## Exports/functions

- `startAuction(state, tileID)`: tắt `canBuyProp`, tạo auction 30 giây với toàn bộ active player.
- `finalizeAuction(state)`: giao tile cho highest bidder hợp lệ hoặc để unowned; clear auction rồi `nextTurn`.
- `beginAuction(io, room, tileID)`: start, broadcast và mở interval 1 giây.
- `endAuction(io, room)`: clear interval, finalize, check balance và broadcast.
- Socket actions: `decline property`, `place bid`, `pass bid`.

## State và invariants

- Auction giữ `tileID`, `tileName`, list `price`, highest bid/bidder, `active`, `passed`, `timer`.
- Chỉ current player đang ở trạng thái `canBuyProp` và khi chưa có auction mới được decline property.
- Bidder phải là active player của auction; bid phải finite, được floor thành số nguyên, lớn hơn highest bid và không vượt balance hiện tại.
- Bid mới reset toàn bộ `passed`; nếu timer dưới 15 thì tăng lại 15 giây.
- Highest bidder không thể pass. Auction kết thúc sớm khi mọi active player khác highest bidder đã pass.
- Finalize tạo `OwnedProp` với `houses: 0`, `mortgaged: false`, trừ winning bid và chuyển turn.

## Disconnect mutation

- Player rời bị xóa khỏi `active` và `passed`.
- Nếu leader rời: highest bidder/name/bid về null/0 và reset passed.
- Auction kết thúc nếu còn tối đa một active player hoặc không còn ai cần hành động.
- Room cuối cùng rời sẽ clear timer trước khi room bị xóa.

## Caveat AS-IS

- Winning funds không được reserve. Bidder có thể tiêu tiền qua flow khác trước finalize; finalize vẫn trừ bid nếu player còn tồn tại, sau đó `checkBalance` có thể loại họ.
- Auction timer chỉ ở memory/process; restart làm mất auction.
- Active list là snapshot khi auction start; spectator không tham gia. Bankruptcy giữa auction không trực tiếp đồng bộ list như disconnect, nhưng timeout vẫn kết thúc.
- `price` là list price để hiển thị; minimum bid thực tế chỉ là `highestBid + 1`, bắt đầu từ 1, không bắt đầu bằng list price.
- `finalizeAuction` tự gọi `nextTurn`; `endAuction` gọi thêm `checkBalance(false)` sau đó.

## Consumers và liên kết chéo

- Auction Socket API: [`../Api/socket-auction.instruction.md`](../Api/socket-auction.instruction.md).
- Client auction UI: [`../Client/auction.instruction.md`](../Client/auction.instruction.md).
- Room cleanup: [`room-lifecycle.instruction.md`](room-lifecycle.instruction.md).
- Turn hand-off: [`turn-movement-and-bankruptcy.instruction.md`](turn-movement-and-bankruptcy.instruction.md).

## Kiểm thử khi sửa

- Unit hiện có chỉ cover `finalizeAuction` với winning bid và no-bid.
- Chưa có automation cho start state, bid/pass guards, integer normalization, timer extension/countdown, early close, disconnect hoặc room cleanup.
- Thực hiện [`../testcase/auction.md`](../testcase/auction.md) và disconnect cases trong [`../testcase/join-room-and-player-lifecycle.md`](../testcase/join-room-and-player-lifecycle.md).
- Chạy `pnpm typecheck`, `pnpm lint`, `pnpm test`.
