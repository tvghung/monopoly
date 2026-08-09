# Chat Socket instruction

## Phạm vi AS-IS

Đây là Socket event module tương đương controller cho chat trong room. Chat được ghi chung vào `boardState.logs`, không có collection/message store riêng.

- Socket.IO path: `/socket.io` mặc định.
- Namespace: `/` mặc định.
- Function đăng ký: `registerChatHandlers(io, socket)`.
- Handler: `apps/server/src/socket/chat.ts:5-30`.
- Inbound: `send chat(message)`.
- Outbound: `update(GameState)` tới toàn room.

## Auth và permission

| Mức/action | Permission/guard hiện tại |
|---|---|
| Module/controller | Không có auth và không có permission key. |
| `send chat` | Chỉ yêu cầu socket đã gắn với room còn tồn tại. |
| Active player | Được gắn name/color từ `state.players`. |
| Finished player | Được gắn name/color từ `finishedPlayers`. |
| Spectator | Được phép chat, hiển thị tên `Spectator` và màu grey. |

## Action, validation và mutation

| Bước | Code | Hành vi hiện tại |
|---|---|---|
| Resolve room | `apps/server/src/socket/chat.ts:7-10` | Không có room thì `return`. |
| Sanitize message | `apps/server/src/socket/chat.ts:11`; `apps/server/src/game/text.ts:6-12` | `escapeHtml` escape `& < > " '`; non-string thành chuỗi rỗng. |
| Chọn nhãn sender | `apps/server/src/socket/chat.ts:12-28` | Active, finished hoặc spectator. |
| Append log | `apps/server/src/game/text.ts:20-22` | Tạo mảng logs mới và thêm timestamp `HH:MM:SS`. |
| Broadcast | `apps/server/src/socket/chat.ts:29` | Phát full state bằng `update` tới room. |

## Caveat cần giữ đúng khi sửa

- Client render log bằng `dangerouslySetInnerHTML`: `apps/client/src/components/Log.tsx:28-36`. Không được bỏ `escapeHtml` cho user message nếu chưa thay toàn bộ render contract.
- Markup của name được loại bỏ lúc join bởi `sanitizeName`; màu player lấy từ server color pool.
- Code không kiểm tra message rỗng sau sanitize, không giới hạn độ dài và không rate limit Socket chat.
- `boardState.logs` tăng trong memory không có retention/cap.
- Chat không có outbound event riêng; mọi client nhận lại toàn bộ `GameState`.
- Không có persistence, moderation, private message, ACK hoặc error response.

## Liên kết chéo

- Client log/chat: [`../Client/activity-log-and-chat.instruction.md`](../Client/activity-log-and-chat.instruction.md)
- Client state sync: [`../Client/game-board.instruction.md`](../Client/game-board.instruction.md)
- Room lifetime: [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md)
- Shared state/event: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Testcase: [`../testcase/chat-log-and-input-safety.md`](../testcase/chat-log-and-input-safety.md)

## Quy tắc sửa và kiểm thử

Khi sửa module này phải kiểm tra:

- Escape đủ HTML-significant characters và không tạo executable markup từ message.
- Active/finished/spectator được ghi đúng nhãn và color.
- Empty, non-string, rất dài và HTML payload theo đúng validation mới nếu có.
- Message chỉ xuất hiện trong room tương ứng.
- Client vẫn render server-generated markup và user text an toàn.
- Nếu thêm giới hạn/rate limit/error event, cập nhật Shared contract, Client behavior và testcase cùng lần sửa.
