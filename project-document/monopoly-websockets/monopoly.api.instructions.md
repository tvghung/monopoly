# Rule nền API và transport

## Phạm vi

Áp dụng cho:

- `apps/server/src/index.ts`
- `apps/server/src/createServer.ts`
- `apps/server/src/socket/`

Đọc sau [monopoly.shared.instructions.md](./monopoly.shared.instructions.md), rồi mở [Api/README.md](./Api/README.md) và file module liên quan.

## Kiến trúc API hiện tại

Repo không có REST controller nghiệp vụ. Bề mặt server gồm:

1. Express runtime:
   - `GET /healthz`.
   - Production static client serving.
   - Production SPA fallback cho mọi `GET` còn lại.
2. Socket.IO root namespace `/`, transport path mặc định `/socket.io`.
3. Bảy event-handler modules tương đương controller: player, turn, chat, trading, building, jail và auction.

Điểm đăng ký tập trung là `apps/server/src/socket/index.ts`. Không gọi các module này là REST controller và không dựng base route HTTP cho chúng.

## Auth, permission và middleware AS-IS

| Khái niệm | Hiện trạng |
| --- | --- |
| Authentication | Không có |
| RBAC/permission key | Không có |
| Express auth middleware | Không có |
| Socket `io.use`/`socket.use` middleware | Không có |
| Actor identity | `socket.id` |
| Room scope | `socket.data.roomId` sau event `new player` |
| Runtime schema validation | Không có |
| Persistence | In-memory `Map`; không database/migration |

CORS chỉ giới hạn origin và không xác thực người dùng. Room code được normalize nhưng không phải password hoặc credential.

File instruction module phải tách rõ:

- `Permission controller/module`: không có.
- `Permission action`: không có permission key; liệt kê state/ownership/turn guards thật của từng event.

## Event contract

`packages/shared/src/events.ts` định nghĩa `ClientToServerEvents`, `ServerToClientEvents` và `SocketData`. Server types nằm ở `apps/server/src/socket/types.ts`; client socket types nằm ở `apps/client/src/types.ts`.

Contract này chỉ có hiệu lực compile-time. Handler vẫn phải kiểm tra type/range/existence ở runtime nếu code triển khai kiểm tra đó. Không mô tả interface TypeScript như runtime validation.

Outbound hiện có:

- `update`: broadcast full `GameState` tới room.
- `offer on prop`: gửi riêng cho property owner.
- `offer declined`, `offer accepted`: gửi riêng cho buyer.

Không có ACK/error event. Nhiều invalid action bị bỏ qua bằng `return`; một số failure ghi log rồi broadcast `update`.

## Pattern handler hiện tại

Phần lớn handler đi theo chuỗi:

1. Lấy room bằng `getRoom(socket.data.roomId)`.
2. Return nếu room không tồn tại.
3. Lấy actor/state/entity liên quan.
4. Áp dụng guard hiện có.
5. Gọi game-domain function hoặc mutate state trực tiếp.
6. Ghi log nếu action có log.
7. Broadcast `update` hoặc gửi private event.

Đây là mô tả AS-IS, không phải bảo đảm mọi handler hiện đã validation đầy đủ. Các ngoại lệ và missing guard phải ghi trong file module.

## Module map

| Module | Inbound actions | Instruction |
| --- | --- | --- |
| HTTP runtime | `GET /healthz`, static, SPA fallback | [Api/http-runtime.instruction.md](./Api/http-runtime.instruction.md) |
| Player | `new player`, `disconnect` | [Api/socket-player.instruction.md](./Api/socket-player.instruction.md) |
| Turn | `start game`, `roll dice`, `buy property` | [Api/socket-turn.instruction.md](./Api/socket-turn.instruction.md) |
| Chat | `send chat` | [Api/socket-chat.instruction.md](./Api/socket-chat.instruction.md) |
| Trading | listing, sale và private-offer events | [Api/socket-trading.instruction.md](./Api/socket-trading.instruction.md) |
| Building | build/sell house, mortgage/unmortgage | [Api/socket-building.instruction.md](./Api/socket-building.instruction.md) |
| Jail | `pay bail`, `use jail card` | [Api/socket-jail.instruction.md](./Api/socket-jail.instruction.md) |
| Auction | `decline property`, `place bid`, `pass bid` | [Api/socket-auction.instruction.md](./Api/socket-auction.instruction.md) |

## HTTP runtime và environment

- Port mặc định: `8080` qua `PORT`.
- Dev Socket CORS mặc định: `http://localhost:5173`.
- Production default không cho cross-origin trừ khi đặt `CORS_ORIGIN`.
- Production bật `trust proxy` đúng một hop.
- `CLIENT_DIST` có thể override thư mục static client.
- Static limiter: 1000 request trong 15 phút, chỉ áp dụng static/SPA routes ở production.
- `/healthz` không nằm dưới static limiter.

Không áp các fact production này cho dev nếu code chỉ chạy branch `NODE_ENV === 'production'`.

## State mutation và caveat nền

- State room được mutate in place và broadcast; không có transaction hoặc persistence layer.
- Full `GameState` được gửi cho mọi socket trong room, kể cả spectator.
- Room isolation phụ thuộc việc luôn dùng đúng `room.id` và `socket.data.roomId`.
- Invalid payload có thể chỉ bị return hoặc, ở một số đường chưa guard, gây lỗi truy cập data; xem từng file module.
- Timers như auction countdown sống trong room object và phải cleanup khi auction/room kết thúc.
- Không có rate limit riêng cho Socket events/chat.

## Quy tắc đổi endpoint/event

Trong cùng lần sửa:

1. Cập nhật `packages/shared/src/events.ts` và các payload/state types liên quan.
2. Cập nhật handler registration/module.
3. Cập nhật client `socketFunctions` và listener/hook.
4. Cập nhật Api index + module instruction.
5. Cập nhật Client/GameCore/Shared instructions bị tác động.
6. Cập nhật testcase cho valid, invalid, room isolation và đúng outbound target.

Nếu thêm REST controller thật, tạo file instruction theo controller và ghi base route/action/permission thật; không trộn nó vào Socket module hiện có.

## Kiểm tra bắt buộc

```bash
pnpm --filter @monopoly/server typecheck
pnpm --filter @monopoly/server test
pnpm lint
```

Unit test hiện chỉ bao phủ game-domain functions, chưa bao phủ Socket/HTTP integration. Thực hiện checklist liên quan trong [testcase/README.md](./testcase/README.md) và không gọi checklist integration là đã tự động hóa khi chưa có test file.
