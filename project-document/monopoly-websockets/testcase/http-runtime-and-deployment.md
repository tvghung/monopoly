# Checklist — HTTP runtime và deployment

## Nguồn hành vi

- [`../Api/http-runtime.instruction.md`](../Api/http-runtime.instruction.md)
- Code/config: `apps/server/src/createServer.ts`, `apps/server/src/index.ts`, `apps/client/vite.config.ts`, `Dockerfile`, `render.yaml`, `.github/workflows/ci.yml`, root/package manifests.

## Coverage hiện tại

- `[MISSING-AUTO]` Không có HTTP integration, production static, container smoke hay deployment test.
- CI hiện chỉ install, typecheck, lint và test; không chạy `pnpm build` hoặc Docker build.

## Checklist

### Development runtime

- [ ] `[MANUAL]` `pnpm dev` chạy client Vite port 5173 và server port 8080 mặc định.
- [ ] `[MANUAL]` Vite proxy `/socket.io` tới `http://localhost:8080` với WebSocket enabled; client dùng same-origin khi `VITE_SOCKET_URL` rỗng.
- [ ] `[MANUAL]` Dev Socket.IO CORS mặc định cho `http://localhost:5173`; origin khác chỉ dùng được khi cấu hình phù hợp.
- [ ] `[MANUAL]` `GET /healthz` trả HTTP 200 body `ok`.

### Production server

- [ ] `[MANUAL]` `NODE_ENV=production` bật `trust proxy = 1`, serve `CLIENT_DIST` hoặc default là thư mục build generated `apps/client/dist`.
- [ ] `[MANUAL]` Asset thật được serve; GET route SPA không trùng asset trả `index.html` qua RegExp fallback.
- [ ] `[MANUAL]` Static/SPA limiter áp dụng 1000 request/15 phút với standard headers; `/healthz` và Socket.IO transport không nằm sau limiter này.
- [ ] `[MANUAL]` Không set `CORS_ORIGIN` trong production dùng same-origin; override chỉ khi client/server host tách.
- [ ] `[MANUAL]` `PORT` override được honor; default là 8080.

### Build/CI/container/Render

- [ ] `[MANUAL]` `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` đều pass.
- [ ] `[AS-IS CAVEAT]` Root `pnpm build` chỉ build client; server chạy TypeScript trực tiếp bằng `tsx`, nên typecheck là gate riêng.
- [ ] `[AS-IS CAVEAT]` CI workflow chưa gọi client production build dù job tên `build`.
- [ ] `[MANUAL]` Docker multi-stage Node 24 tạo client `dist`, copy server/shared sources, expose 8080 và start `@monopoly/server`.
- [ ] `[MANUAL]` Render Blueprint dùng Node 24, branch `main`, health path `/healthz`, build client và start server đúng manifest.
- [ ] `[MANUAL]` Production cold start/redeploy làm mất room đang chơi vì state/timer chỉ in-memory.
- [ ] `[AS-IS CAVEAT]` Chạy nhiều instance không share room/game state hoặc Socket.IO adapter; không mô tả horizontal scaling là được hỗ trợ.

## Negative/edge cases cần automation khi sửa

- [ ] `[MISSING-AUTO]` Chưa có smoke test ghi nhận response/error hiện tại khi `CLIENT_DIST` thiếu hoặc trỏ sai.
- [ ] `[MISSING-AUTO]` CORS matrix dev/prod/custom origin và spoofed forwarded headers được kiểm tra ở HTTP/Socket integration level.
- [ ] `[MISSING-AUTO]` SPA fallback không nuốt `/healthz` hoặc Socket.IO handshake.
- [ ] `[MISSING-AUTO]` Docker health/start smoke xác nhận built client tải và WebSocket connect được từ cùng origin.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; khi đổi image/runtime cần thêm `docker build` và HTTP/WebSocket smoke trong môi trường có Docker.
