# Player và room lifecycle Socket instruction

## Phạm vi AS-IS

Đây là Socket event module tương đương controller cho việc gắn một connection vào room, tạo player/spectator và dọn state khi disconnect.

- Socket.IO path: `/socket.io` mặc định.
- Namespace: `/` mặc định.
- Room nghiệp vụ: `socket.data.roomId` sau event `new player`.
- Function đăng ký: `registerPlayerHandlers(io, socket)`.
- Handler: `apps/server/src/socket/player.ts:11-101`.

## Auth và permission

| Mức/action | Permission/guard hiện tại |
|---|---|
| Module/controller | Không có auth và không có permission key. Identity là `socket.id`. |
| `new player` | Không cần room trước đó; normalize room và gắn socket vào room. Chỉ chặn duplicate trong cùng room/socket. |
| Trở thành active player | Chỉ khi `boardState.gameStarted === false`. |
| Trở thành spectator | Socket gửi `new player` sau khi game đã start vẫn join room/nhận update nhưng không được thêm vào `state.players`. |
| `disconnect` | Event hệ thống Socket.IO; chỉ xử lý room đang nằm trong `socket.data.roomId`. |

## Action, inbound và outbound event

| Function/action | Inbound | Validation/guard | Service/mutation chính | Outbound |
|---|---|---|---|---|
| `registerPlayerHandlers` | Connection | Được registry gọi cho mọi socket. | Gắn hai listener dưới đây. | Không phát ngay. |
| Join/register | `new player(name, roomId)` | Normalize room; duplicate `state.players[socket.id]` chỉ resend `update`; name sanitize và fallback `Player`. | `socket.join`, set `socket.data.roomId`, `getOrCreateRoom`; tạo player `$1500`, tile `0`, màu từ pool; rebuild `boardState.players`. | `update` tới room. |
| Cleanup | `disconnect` | Nếu không tìm thấy room thì return. | Trả màu; xóa active/finished player, property và listing; cập nhật auction; clear timer và xóa room nếu không còn active player. | `update`, hoặc `endAuction` phát `update`; không phát nếu room bị xóa. |

## Code và service liên quan

| Vai trò | Code |
|---|---|
| Handler | `apps/server/src/socket/player.ts:11-101` |
| Normalize/get/create/delete room | `apps/server/src/rooms.ts:44-69` |
| State và color pool mới | `apps/server/src/rooms.ts:16-42` |
| Name sanitization và game log | `apps/server/src/game/text.ts:14-22` |
| Auction cleanup/finalize | `apps/server/src/socket/auction.ts:11-20` |
| Event và socket data contract | `packages/shared/src/events.ts:21-55` |

## Luồng chính

1. Client phát `new player` từ `apps/client/src/App.tsx:73-76`.
2. Server normalize room: chỉ giữ chữ, số, dấu `-`, tối đa 20 ký tự, uppercase; rỗng thành `LOBBY`.
3. Socket join room trước khi kiểm tra game đã start.
4. Nếu game chưa start, server tạo player và đưa socket ID vào turn order; nếu đã start, chỉ ghi log spectator/rejected join.
5. Mọi state change được broadcast dưới dạng full `GameState` qua `update`.
6. Khi disconnect, state/player/property/listing/auction được dọn trực tiếp trong memory.

## Caveat cần giữ đúng khi sửa

- Code không `leave` room cũ nếu cùng socket gửi `new player` với room khác. `socket.data.roomId` bị ghi đè, nên disconnect sau đó chỉ dọn room mới; không được mô tả server hiện tại là chặn multi-room registration.
- Current player disconnect ngoài luồng auction không gọi `nextTurn`; `currentPlayer.id` có thể còn là ID đã rời.
- Không giới hạn số player. Pool có bảy màu; hết pool thì player mới nhận `grey`.
- Room bị xóa khi không còn **active player**, kể cả vẫn có spectator connection.
- Room/state chỉ tồn tại trong `Map` của process; restart hoặc chuyển process không khôi phục game.
- Room code không phải password và không có host/owner permission.
- `void socket.join(roomId)` không được await; nếu thay adapter bất đồng bộ cần đánh giá thứ tự join/broadcast.

## Liên kết chéo

- Client join: [`../Client/join-room.instruction.md`](../Client/join-room.instruction.md)
- Client board/status: [`../Client/game-board.instruction.md`](../Client/game-board.instruction.md), [`../Client/game-status.instruction.md`](../Client/game-status.instruction.md)
- GameCore room lifecycle: [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md)
- GameCore auction cleanup: [`../GameCore/auction.instruction.md`](../GameCore/auction.instruction.md)
- Shared contracts: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Testcase: [`../testcase/join-room-and-player-lifecycle.md`](../testcase/join-room-and-player-lifecycle.md)

## Quy tắc sửa và kiểm thử

Khi sửa module này phải kiểm tra:

- Normalize room với ký tự lạ, lowercase, quá 20 ký tự và room rỗng.
- Name rỗng/ký tự HTML/quá 20 ký tự; duplicate `new player` cùng socket.
- Join trước và sau `gameStarted`; spectator nhận update nhưng không nằm trong active turn order.
- Hai room không nhận state của nhau.
- Disconnect active/finished/current player; property/listing/color được dọn đúng.
- Disconnect khi auction đang chạy, gồm leader rời và room cuối cùng bị xóa/clear timer.
- Nếu thay lifecycle, bổ sung Socket integration tests; pure tests trong `apps/server/src/game.test.ts` không bao phủ handler này.
