# Auction Socket instruction

## Phạm vi AS-IS

Đây là Socket event module tương đương controller cho việc đưa property bị từ chối mua ra auction, nhận bid/pass và điều khiển countdown theo room.

- Socket.IO path: `/socket.io` mặc định.
- Namespace: `/` mặc định.
- Functions: `registerAuctionHandlers(io, socket)`, `beginAuction(io, room, tileID)`, `endAuction(io, room)`.
- Handler/timer coordinator: `apps/server/src/socket/auction.ts:11-108`.
- Core auction mutation: `apps/server/src/game/auction.ts:5-42`.

## Auth và permission

Không có auth hoặc permission key.

| Action/function | Guard trạng thái hiện tại |
|---|---|
| `decline property` | Sender là active/current player; `turnInfo.canBuyProp`; chưa có auction. |
| `place bid` | Auction và player tồn tại; sender nằm trong `auction.active`; amount finite; bid floored phải lớn hơn highest và không vượt balance hiện tại. |
| `pass bid` | Auction/player tồn tại; sender active; sender không phải highest bidder. |
| `beginAuction` / `endAuction` | Exported coordinator function; caller chịu trách nhiệm kiểm tra ngữ cảnh trước khi gọi. |

## Action/function, mutation và outbound

| Action/function | Hành vi hiện tại | Outbound |
|---|---|---|
| `decline property` | Gọi `beginAuction` cho `player.currentTile`. | `update` khi bắt đầu. |
| `beginAuction` | `startAuction`, tạo interval 1 giây; mỗi tick giảm `timer`; timer 0 gọi `endAuction`. | `update` khi start và mỗi tick còn sống. |
| `place bid(amount)` | `Math.floor`; set highest bid/bidder/name; clear `passed`; nâng timer lên 15 nếu đang dưới 15; ghi log. | `update` tới room. |
| `pass bid` | Thêm sender vào `passed`; nếu không còn ai ngoài top bidder cần phản hồi thì `endAuction`. | `update`, hoặc `endAuction` phát update. |
| `endAuction` | Clear room interval; `finalizeAuction`; `checkBalance(state, false)`. | `update` tới room. |
| `finalizeAuction` | Nếu có bidder hợp lệ: trừ bid, tạo ownership; nếu không thì tile vẫn unowned; clear auction; `nextTurn`. | Không tự emit; caller emit. |

## State và service liên quan

| Concern | Code thật |
|---|---|
| Socket/timer orchestration | `apps/server/src/socket/auction.ts:11-108` |
| Start/finalize state | `apps/server/src/game/auction.ts:5-42` |
| Balance/winner/turn | `apps/server/src/game/turn.ts:4-75` |
| Disconnect cleanup | `apps/server/src/socket/player.ts:73-100` |
| Room timer handle | `apps/server/src/rooms.ts:6-12` |
| Auction state type | `packages/shared/src/types.ts:102-118` |

## Rule hiện tại

- Auction khởi tạo `timer = 30`, highest bid `0`, chưa có bidder, `active = Object.keys(state.players)` và `passed = []`.
- Current player vừa từ chối cũng nằm trong `active` và có thể bid.
- `pass` không xóa player khỏi `active`; bid mới clear toàn bộ `passed`, nên người đã pass có thể phản hồi lại.
- Highest bidder không được pass chính bid đang dẫn.
- Khi mọi người trừ highest bidder đã pass, auction kết thúc sớm; nếu chưa có bidder, tất cả active player phải pass.

## Caveat cần giữ đúng khi sửa

- Bid không reserve tiền. Sau khi bid, player vẫn có thể dùng tiền ở building/trading/jail trước finalize.
- `finalizeAuction` không recheck balance trước khi trừ highest bid. `nextTurn` bên trong `finalizeAuction` chạy `checkBalance`, rồi `endAuction` gọi `checkBalance` thêm lần nữa; bidder có thể thắng rồi bị loại vì bankrupt.
- Timer là `setInterval` trong memory của room; không persistent và không đồng bộ nhiều process.
- Mỗi timer tick broadcast toàn bộ `GameState`, không có event countdown riêng.
- Highest bidder disconnect làm reset highest bid về 0 và clear passed; player disconnect còn có thể khiến auction kết thúc: `socket/player.ts:80-100`.
- `beginAuction` không tự guard auction cũ hoặc tile validity; guard hiện nằm trong event handler.
- Failure không có ACK/error event.

## Liên kết chéo

- Client auction: [`../Client/auction.instruction.md`](../Client/auction.instruction.md)
- Client decline-to-auction: [`../Client/turn-actions.instruction.md`](../Client/turn-actions.instruction.md)
- Player disconnect: [`socket-player.instruction.md`](socket-player.instruction.md)
- GameCore auction: [`../GameCore/auction.instruction.md`](../GameCore/auction.instruction.md)
- GameCore turn/bankruptcy: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md)
- Shared contract/state: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Testcase: [`../testcase/auction.md`](../testcase/auction.md)

## Quy tắc sửa và kiểm thử

Khi sửa module này phải kiểm tra:

- Decline property bởi đúng/sai player, thiếu `canBuyProp`, auction đã tồn tại.
- Bid NaN/Infinity/fractional/không tăng/vượt balance và bid hợp lệ.
- Pass trước bid, top bidder pass, tất cả pass và bid mới mở lại floor.
- Timer start/tick/reset về tối thiểu 15/end; interval được clear đúng một lần.
- Không bid, có winner, bidder disconnect, room bị xóa và leader đổi balance trước finalize.
- Ownership/balance/turn/bankruptcy/winner sau finalize.
- Chạy auction pure tests `apps/server/src/game.test.ts:442-478`; thêm fake-timer Socket integration test khi đổi coordinator/timer.
