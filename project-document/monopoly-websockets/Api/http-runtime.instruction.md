# HTTP runtime instruction

## Phạm vi AS-IS

File này mô tả lớp khởi động Express/HTTP/Socket.IO. Đây không phải business controller và repo không có REST API nghiệp vụ.

- HTTP base: `/`.
- Route tường minh: `GET /healthz`.
- Production: static assets từ `CLIENT_DIST` hoặc thư mục build được tạo tại `apps/client/dist` (không phải source-tracked), sau đó SPA fallback cho mọi `GET` bằng `/.*/`.
- Socket.IO: gắn trên cùng HTTP server; path/namespace không override nên dùng `/socket.io`, namespace `/`.

## Code liên quan

| Vai trò | Đường dẫn thật |
|---|---|
| Tạo Express, HTTP và Socket.IO server | `apps/server/src/createServer.ts:15-57` |
| Đăng ký Socket handler và listen port | `apps/server/src/index.ts:1-10` |
| Dev proxy `/socket.io` | `apps/client/vite.config.ts:21-28` |
| Client chọn Socket URL | `apps/client/src/App.tsx:10-14` |

## Auth và permission

| Mức | Permission/auth hiện tại |
|---|---|
| Runtime/controller | Không có auth middleware và không có permission key. |
| `GET /healthz` | Public; không có guard. |
| Static/SPA GET | Không có auth; chỉ có rate limiter trong production. |
| Socket.IO handshake | Không có `io.use` auth middleware; CORS origin không phải authentication. |

## Function và route

| Function/route | Hành vi hiện tại | Outbound |
|---|---|---|
| `createServer()` | Tạo `express()`, HTTP server và typed Socket.IO server; trả `{ server, io }`. | Không tự listen. |
| `GET /healthz` | Trả HTTP `200` với body `ok`. | HTTP response, không phát Socket event. |
| `express.static(clientDist)` | Chỉ mount khi `NODE_ENV === 'production'`. | Static file nếu tồn tại. |
| `GET /.*/` | Production SPA fallback, trả `clientDist/index.html`. | HTML file. |
| `server.listen(PORT)` | `PORT` từ environment, fallback `8080`. | Mở HTTP server. |

## Middleware và cấu hình nhìn thấy được

- Production đặt `trust proxy = 1`: `apps/server/src/createServer.ts:19-26`.
- `CORS_ORIGIN` được dùng nếu có; mặc định dev là `http://localhost:5173`, production là `false`: `createServer.ts:28-33`.
- Production static limiter: cửa sổ 15 phút, giới hạn 1000 request, standard header draft-8, tắt legacy header: `createServer.ts:40-49`.
- Limiter chỉ được mount cùng static/SPA routes; `/healthz` và Socket.IO transport không nằm dưới limiter này.
- Code không mount `express.json()`, router hoặc REST error middleware.

## Caveat cần giữ đúng khi sửa

- `createServer()` hiện chỉ trả `server` và `io`, không expose `app`.
- Static hosting/fallback chỉ tồn tại trong production; dev Client chạy ở Vite port `5173` và proxy WebSocket sang server `8080`.
- Production mặc định hướng tới same-origin. Chỉ đặt `CORS_ORIGIN` khi Client/Server chạy khác origin.
- SPA fallback dùng RegExp vì Express 5 không nhận bare `*`: `createServer.ts:50-54`.
- State game không nằm ở HTTP runtime và không được persist khi server restart.

## Liên kết chéo

- API index: [`README.md`](README.md)
- Client shell/socket: [`../Client/game-board.instruction.md`](../Client/game-board.instruction.md)
- Shared Socket contract: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- GameCore room state: [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md)
- Testcase: [`../testcase/http-runtime-and-deployment.md`](../testcase/http-runtime-and-deployment.md)

## Quy tắc sửa và kiểm thử

Khi đổi file này phải kiểm tra tối thiểu:

- `GET /healthz` trả đúng status/body ở môi trường chạy server.
- Dev Client kết nối được qua proxy `/socket.io`.
- Production phục vụ asset có thật và route SPA bất kỳ trả `index.html`.
- `CLIENT_DIST`, `CORS_ORIGIN`, `NODE_ENV` và `PORT` vẫn có đúng precedence/fallback.
- Static limiter không vô tình throttle `/healthz` hoặc Socket.IO transport.
- Chạy `pnpm --filter @monopoly/server typecheck`; nếu đổi behavior transport, thêm/chạy integration test tương ứng thay vì chỉ dựa vào pure game tests.
