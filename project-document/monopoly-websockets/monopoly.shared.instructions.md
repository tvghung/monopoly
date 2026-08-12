# Rule nền dùng chung

## Phạm vi

Áp dụng cho mọi code và tài liệu trong repo. Đọc sau [README.md](./README.md).

## Workspace

| Khối | Đường dẫn | Vai trò |
| --- | --- | --- |
| Client | `apps/client/` | React/Vite và Socket.IO client |
| Server | `apps/server/` | Express, Socket.IO, domain, services và persistence |
| Shared | `packages/shared/` | Types, ACKs, Zod schemas và static game data |
| Database | `apps/server/migrations/` | Forward SQL schema |
| Local DB | `compose.yaml`, `.env.example` | PostgreSQL development |
| CI/deploy | `.github/`, `Dockerfile`, `render.yaml` | Validation và application service deployment |

## Authority và identity

- Server/PostgreSQL aggregate là authority cho room/game/session/offer.
- `PlayerId` là stable UUID; `socket.id` chỉ dùng cho connection registry.
- Socket command actor lấy từ authenticated `socket.data.playerId`.
- Raw reconnect token là bearer credential. Chỉ client giữ raw value; server lưu
  SHA-256 hash và không đưa token vào public serialization/log.
- Đây là room-seat session, không phải account system, OAuth, RBAC hoặc user profile.
- CORS, room code, display name và public player ID không phải authentication.
- Client display state cho animation/modal không được dùng làm business authority.

## Durable mutation contract

1. Parse inbound payload bằng schema trong `packages/shared/src/socketSchemas.ts`.
2. Resolve session/role/actor từ SocketData.
3. Enqueue theo internal room ID.
4. Clone aggregate và áp dụng guard/mutation lên draft.
5. Commit rooms/session/offer changes trong một PostgreSQL transaction bằng expected
   aggregate version.
6. Sau commit mới broadcast public/private DTO và ACK; deadline scheduler đọc
   `next_action_at` đã persist thay vì nhận timer handle từ command.

Save thất bại phải bỏ draft. Không có production memory fallback. In-memory adapter
chỉ dùng trong test qua dependency injection.

## Public/private/runtime boundaries

| Boundary | Dữ liệu |
| --- | --- |
| Public | Room status/version/host/min-max/ready/presence và public GameState |
| Private persistent | Session hash/status; offer records |
| Client-only | Raw token và connection UX state |
| Runtime-only | `socket.id`, generation registry, presence, queues và scheduler timer handle |
| Durable aggregate | Stable-ID GameState, room metadata, absolute deadlines |

Snapshot v2 còn chứa authoritative doubles/pending decision/continuation,
`PaymentQueue`, private `GamePrivateState.decks`, `BankPropertyAuctionQueue` và
building contention. Public projection
phải loại exact deck order; building inventory là giá trị derive, không phải một bộ
đếm persist độc lập.

Public Socket.IO room có tên `room:<roomId>`; private player room có tên
`player:<playerId>`. Không emit raw database aggregate trực tiếp; dùng whitelist
projector.

## Input và HTML safety

- User payload luôn qua runtime schema; domain handler vẫn phải kiểm tra authority và
  business state sau khi parse.
- Chat/name phải được escape trước khi đi vào HTML log. Client vẫn render log markup,
  nên không đưa raw user string vào `dangerouslySetInnerHTML`.
- Inbound bid/listing/offer amount là positive integer không vượt `2_147_483_647`
  (PostgreSQL `integer`); tile index là integer `0..39`; offer action chỉ nhận UUID
  `offerId`.

## Environment và vận hành

- PostgreSQL được cấu hình bằng `DATABASE_URL`; mọi real server start thiếu DB phải
  fail trước khi listen. In-memory adapter chỉ dành cho test.
- `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED` và
  `DATABASE_MAX_CONNECTIONS` cấu hình pool/TLS.
- Grace/TTL/retention có environment tương ứng trong `.env.example`.
- `/healthz` là liveness; `/readyz` phản ánh DB/schema readiness.
- SQL migration và JSON snapshot schema version là hai version riêng.

## Quy tắc sửa

- Thay shared contract phải sửa đồng thời producer, consumer, runtime schema và test.
- Thay aggregate phải rà snapshot migration/validation và public projector.
- Thay lifecycle/deadline phải test cả reconnect race và process restart.
- Không thêm router/auth framework/Redis/event sourcing nếu scope không yêu cầu.
- Không coi checklist là automated nếu chưa có executable assertion.

## Baseline

```bash
pnpm db:status
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Xem tiếp Client, Api, GameCore, Shared, [Persistence/README.md](./Persistence/README.md)
và [testcase/README.md](./testcase/README.md).
