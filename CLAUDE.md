# Hướng dẫn làm việc với Cờ Tỷ Phú Việt Nam

## Nguồn sự thật duy nhất

Tài liệu điều hướng, phạm vi và quy tắc thay đổi của project nằm tại:

`project-document/monopoly-websockets/`

Code và migration là bằng chứng thực thi. Nếu code, schema và tài liệu lệch nhau,
thay đổi chưa hoàn tất.

## Bắt buộc đọc trước khi sửa

1. `project-document/monopoly-websockets/README.md`.
2. `project-document/monopoly-websockets/monopoly.shared.instructions.md`.
3. Rule nền đúng khối: Client, Api, GameCore, Shared contracts hoặc Persistence.
4. `README.md` index và file `.instruction.md` đúng module.
5. Cross-link tới producer/consumer và checklist trong `testcase/`.

## Map code tới tài liệu

| Khối | Đường dẫn chính | Tài liệu bắt đầu |
| --- | --- | --- |
| Client | `apps/client/` | `monopoly.client.instructions.md` → `Client/README.md` |
| HTTP/Socket | `apps/server/src/createServer.ts`, `apps/server/src/socket/` | `monopoly.api.instructions.md` → `Api/README.md` |
| GameCore/room aggregate | `apps/server/src/rooms.ts`, `apps/server/src/game/` | `monopoly.game-core.instructions.md` → `GameCore/README.md` |
| Persistence/session/runtime services | `apps/server/src/persistence/`, `apps/server/src/services/`, `apps/server/migrations/` | `Persistence/README.md` |
| Shared contracts/schema | `packages/shared/src/` | `monopoly.contracts.instructions.md` → `Shared/README.md` |
| Tests | `apps/**/**.test.ts*` | `testcase/README.md` |

## Invariants kiến trúc bắt buộc

- `PlayerId` là UUID ổn định; `socket.id` chỉ là định danh connection runtime.
- Raw reconnect token chỉ trả qua ACK và lưu phía client. Server chỉ lưu SHA-256
  hash; không đưa raw token/hash vào log, `socket.data` hoặc public state.
- `disconnect` chỉ đổi presence. Chỉ `leave room` mới revoke session và loại seat.
- Mỗi player có tối đa một active connection; connection mới nhất thắng. Stale
  disconnect phải bị chặn bằng connection generation.
- Actor của command luôn lấy từ authenticated `socket.data.playerId`; không tin
  `playerId`, owner, seller hoặc buyer do client gửi.
- Public room dùng `room:<roomId>`; private delivery dùng `player:<playerId>`.
- Mọi payload mạng được parse bằng runtime schema. Mọi state-changing command có
  typed ACK và chỉ ACK/broadcast sau khi PostgreSQL transaction commit.
- Mutation cùng room chạy tuần tự qua room command executor trên draft state.
  Save thất bại phải bỏ draft, không commit revision hoặc broadcast.
- PostgreSQL là durable authority: relational room/session/offer metadata kết hợp
  JSONB game snapshot, snapshot schema version và aggregate compare-and-swap.
- Không có production memory fallback. In-memory repository chỉ dành cho test.
- Không persist presence, socket mapping, raw token, timer handle hoặc countdown
  tick. Auction/offer/turn recovery persist absolute deadline.
- Lifecycle room chỉ tiến `LOBBY → IN_PROGRESS → FINISHED`.
- Host là stable player; disconnect không transfer host. Lobby cần 2–7 active,
  connected và ready players để host start.
- Standard Mode dùng board Việt Nam cố định 40 ô, đơn vị số nguyên game-unit
  (`1 unit = 1.000 VNĐ`) và protocol/snapshot schema v2. Không đổi index hoặc
  economy chỉ vì đổi nhãn hiển thị.
- `completeTurnResolution` là điểm duy nhất quyết định `EXTRA_ROLL` hay
  `ADVANCE_TURN`. `doublesStreak`, `PendingTurnContinuation` nhúng trong các wait,
  `TurnInfo.pendingPropertyDecision`, `PaymentQueue`, private
  `GamePrivateState.decks`, `BankPropertyAuctionQueue`, auction/building contention
  đều thuộc authoritative room aggregate và phải recovery-safe.
- `DeckState` và thứ tự thẻ không được phát trong public DTO. Client chỉ nhận dữ
  liệu công khai cần để render; credential, private offer và hidden deck state vẫn
  giữ ngoài public projection.

## Quy tắc cập nhật đồng bộ

- Đổi event/payload/ACK: sửa Shared schema, server handler, client caller/listener,
  Api/Client/Shared docs và testcase.
- Đổi public/private state: sửa projector, shared types, client consumer và test
  chống rò credential.
- Đổi persistence/schema/deadline: thêm migration forward-only, repository/recovery
  test và cập nhật `Persistence/` cùng deployment docs.
- Đổi room/session/host/ready/leave: cập nhật GameCore, player/lobby transport,
  Client lifecycle và restart/reconnect testcase.
- Đổi tile/card data: rà shared data, presentation duplicates, hard-coded index,
  docs và testcase. Không dọn code/tài liệu không liên quan.
- Đổi payment/bankruptcy/transfer/building inventory: rà mọi producer của
  `DebtClaim`, policy transfer, auction continuation, snapshot validation và test
  restart/reconnect trước khi hoàn tất.

## Kiểm tra trước khi hoàn tất

```bash
pnpm db:status
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Với thay đổi persistence/recovery, phải chạy PostgreSQL integration và restart
scenario bằng cùng database. Không đổi nhãn checklist thành automated nếu chưa có
test file/assertion thực thi tương ứng.
