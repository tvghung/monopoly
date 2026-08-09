# Mục lục HTTP và Socket.IO backend

## Vai trò của thư mục này

Đây là mục lục AS-IS cho lớp transport trong `apps/server`. Repo hiện tại không có REST controller hay REST business API. Ngoài HTTP health/static hosting, nghiệp vụ được nhận qua các nhóm `socket.on(...)`; trong tài liệu này, mỗi nhóm đó được gọi là **Socket event module tương đương controller**.

Không suy diễn controller, auth, role hay permission key khi code không có. Các guard như đúng lượt, chủ tài sản hoặc thành viên auction là điều kiện trạng thái game, không phải permission key.

## Quy ước

- Đường dẫn code tính từ root repo.
- Socket.IO không cấu hình `path` hoặc namespace riêng: path đang dùng là mặc định `/socket.io`, namespace mặc định `/`. Dev proxy xác nhận `/socket.io` tại `apps/client/vite.config.ts:21-28`.
- `Inbound` là event client gửi lên server; `outbound` là event server phát xuống client.
- Event contract compile-time nằm tại `packages/shared/src/events.ts`; code hiện không có runtime schema validator.
- `update` luôn mang toàn bộ `GameState` và thường được broadcast bằng `io.to(room.id)`.
- Giá trị permission cho toàn bộ module hiện tại là **không có permission key**. Hãy đọc cột guard/action trong instruction tương ứng để biết điều kiện nghiệp vụ thực tế.
- Source of truth cho room/game là state trong memory của process; không có database, ORM hoặc migration.

## Thứ tự đọc

1. Đọc [`../README.md`](../README.md) để nắm tổng quan và phạm vi tài liệu.
2. Đọc [`../monopoly.shared.instructions.md`](../monopoly.shared.instructions.md) và [`../monopoly.api.instructions.md`](../monopoly.api.instructions.md).
3. Đọc mục lục này để chọn đúng transport module.
4. Đọc file `.instruction.md` của đúng route/event đang sửa.
5. Mở instruction liên quan trong [`../Shared/README.md`](../Shared/README.md) và [`../GameCore/README.md`](../GameCore/README.md) trước khi đổi event payload hoặc game rule.
6. Mở instruction Client được liên kết để kiểm tra emitter/listener/UI tương ứng.
7. Đọc checklist trong [`../testcase/README.md`](../testcase/README.md) và testcase được chỉ ra trong module.

## Điểm vào và contract nền

| Mục | Code hiện tại | Ý nghĩa |
|---|---|---|
| Process entrypoint | `apps/server/src/index.ts:1-10` | Tạo HTTP/Socket.IO server, đăng ký listener, listen `PORT` hoặc `8080`. |
| HTTP runtime | `apps/server/src/createServer.ts:15-57` | Express health route, Socket.IO CORS, production static hosting và limiter. |
| Socket registry | `apps/server/src/socket/index.ts:13-22` | Đăng ký đủ bảy nhóm handler trên mỗi connection. |
| Typed socket aliases | `apps/server/src/socket/types.ts:1-23` | Áp `ClientToServerEvents`, `ServerToClientEvents` và `SocketData` cho server/socket. |
| Event contract | `packages/shared/src/events.ts:14-55` | Danh sách event, payload compile-time và `roomId` trên socket data. |
| Room/state store | `apps/server/src/rooms.ts:3-69` | `Map` room in-memory, state khởi tạo, normalize/get/create/delete room. |

## Bảng ánh xạ module

| Module tương đương controller | Transport / base route / event | Instruction | Handler và service chính | Client liên quan |
|---|---|---|---|---|
| HTTP runtime | HTTP: `GET /healthz`; production static `/`; SPA fallback mọi `GET` | [`http-runtime.instruction.md`](http-runtime.instruction.md) | `apps/server/src/createServer.ts`; `apps/server/src/index.ts` | [`../Client/game-board.instruction.md`](../Client/game-board.instruction.md) |
| Player và room lifecycle | Socket.IO `/socket.io`, namespace `/`: `new player`, `disconnect` | [`socket-player.instruction.md`](socket-player.instruction.md) | `apps/server/src/socket/player.ts`; `apps/server/src/rooms.ts`; `apps/server/src/game/text.ts`; `apps/server/src/socket/auction.ts` | [`../Client/join-room.instruction.md`](../Client/join-room.instruction.md), [`../Client/game-status.instruction.md`](../Client/game-status.instruction.md) |
| Turn | Socket.IO: `start game`, `roll dice`, `buy property` | [`socket-turn.instruction.md`](socket-turn.instruction.md) | `apps/server/src/socket/turn.ts`; `apps/server/src/game/turn.ts`; `apps/server/src/game/dice.ts`; `apps/server/src/game/tiles.ts` | [`../Client/turn-actions.instruction.md`](../Client/turn-actions.instruction.md), [`../Client/game-board.instruction.md`](../Client/game-board.instruction.md) |
| Chat | Socket.IO: `send chat` | [`socket-chat.instruction.md`](socket-chat.instruction.md) | `apps/server/src/socket/chat.ts`; `apps/server/src/game/text.ts` | [`../Client/activity-log-and-chat.instruction.md`](../Client/activity-log-and-chat.instruction.md) |
| Trading | Socket.IO: `put on open market`, `remove sale`, `make sale`, `make offer`, `decline offer`, `accept offer` | [`socket-trading.instruction.md`](socket-trading.instruction.md) | `apps/server/src/socket/trading.ts`; `apps/server/src/game/turn.ts`; direct state mutation | [`../Client/trading-market.instruction.md`](../Client/trading-market.instruction.md), [`../Client/property-management.instruction.md`](../Client/property-management.instruction.md) |
| Building và mortgage | Socket.IO: `build house`, `sell house`, `mortgage property`, `unmortgage property` | [`socket-building.instruction.md`](socket-building.instruction.md) | `apps/server/src/socket/building.ts`; `apps/server/src/game/property.ts` | [`../Client/property-management.instruction.md`](../Client/property-management.instruction.md) |
| Jail action | Socket.IO: `pay bail`, `use jail card`; jail roll đi qua `roll dice` | [`socket-jail.instruction.md`](socket-jail.instruction.md) | `apps/server/src/socket/jail.ts`; `apps/server/src/game/tiles.ts` | [`../Client/turn-actions.instruction.md`](../Client/turn-actions.instruction.md) |
| Auction | Socket.IO: `decline property`, `place bid`, `pass bid` | [`socket-auction.instruction.md`](socket-auction.instruction.md) | `apps/server/src/socket/auction.ts`; `apps/server/src/game/auction.ts`; `apps/server/src/game/turn.ts` | [`../Client/auction.instruction.md`](../Client/auction.instruction.md), [`../Client/turn-actions.instruction.md`](../Client/turn-actions.instruction.md) |

## Outbound event index

| Event | Nguồn phát | Đích | Listener Client |
|---|---|---|---|
| `update(GameState)` | Tất cả module; auction còn phát mỗi timer tick | Toàn bộ socket trong room | `apps/client/src/App.tsx:80-91` |
| `offer on prop(OfferOnProp)` | Trading `make offer` | Socket room mang ID của owner | `apps/client/src/components/dashboard/useIncomingOffers.ts:26-48` |
| `offer declined(OfferResult)` | Trading `decline offer` | Socket room mang ID của buyer | Cùng hook trên |
| `offer accepted(OfferResult)` | Trading `accept offer` | Socket room mang ID của buyer | Cùng hook trên |

Không có ACK hoặc error event. Phần lớn guard thất bại chỉ `return` và không báo lỗi cho client.

## Quy tắc cập nhật

- Thêm/xóa/đổi tên event hoặc payload: cập nhật trong cùng thay đổi ở `packages/shared/src/events.ts`, handler server, `apps/client/src/types.ts`, emitter/listener Client, instruction Api/Client/Shared và testcase liên quan.
- Thêm nhóm `register*Handlers`: thêm đăng ký tại `apps/server/src/socket/index.ts`, tạo instruction mới và thêm một dòng vào bảng ánh xạ này.
- Đổi route HTTP, Socket.IO `path`/namespace, CORS, proxy hoặc static hosting: cập nhật `http-runtime.instruction.md`, rule API, Client connection/proxy docs và testcase deployment.
- Thêm auth/permission/middleware: không chỉ sửa nhãn permission; phải ghi rõ identity source, phạm vi enforcement, thứ tự middleware và guard từng action.
- Đổi room lifecycle hoặc state schema: cập nhật `Shared`, `GameCore`, các instruction module phát/đọc field đó và testcase trong cùng lần sửa.
- Không lưu flow/event đã bị xóa. Mục lục phải phản ánh đúng registry hiện tại.
