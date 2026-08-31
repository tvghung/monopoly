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
| Desktop shell | `apps/desktop/` | `../ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md` → Client/runtime rules |
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
  tick. Offer/turn/payment-shortfall/forced-sale recovery persist absolute deadline.
- Lifecycle room là `LOBBY → IN_PROGRESS → FINISHED`; chỉ command `play again` của
  host đã xác thực mới mở lại cùng room theo `FINISHED → LOBBY`.
- Host là stable player; disconnect không transfer host. Lobby cần 2–4 active,
  connected và ready players để host start.
- Standard Mode dùng board Việt Nam cố định 40 ô, đơn vị số nguyên game-unit
  (`1 unit = 1.000 VNĐ`), socket protocol v9 và snapshot schema v8
  (`SOCKET_PROTOCOL_VERSION = 9`, `ROOM_SNAPSHOT_SCHEMA_VERSION = 8`). `BoardState.rollSequence`
  là public durable identity, bắt đầu từ `0`, tăng đúng một lần cho mỗi gameplay
  roll đã commit, không tăng cho starting-player tie-break hoặc command rollback.
  Không đổi index hoặc
  economy chỉ vì đổi nhãn hiển thị.
- `completeTurnResolution` là điểm duy nhất handoff và v4 chỉ có
  `ADVANCE_TURN`; đổ đôi không cấp thêm lượt. `PendingTurnContinuation` nhúng trong
  các wait, pending purchase/development landing decision, `PaymentQueue`, private
  `GamePrivateState.decks`, `PendingCardInteraction` và forced-sale proposal đều
  thuộc authoritative room aggregate và phải recovery-safe. Card interaction dùng
  operation ID, `AWAITING_DRAW`/`REVEALED`, `revealedCardId` chỉ khi đã reveal,
  continuation và server deadline; `draw card`/`dismiss card` chỉ ACK sau commit.
- `DeckState` và thứ tự thẻ không được phát trong public DTO. Public V8 có bounded
  `gameplayEvents` và typed `activityFeed`; private durable state có per-player
  semantic lanes và `completedCardOperations`, nhưng client chỉ nhận đúng
  projection được phép để render. Credential, private offer và hidden deck order
  vẫn nằm ngoài public projection. Migration `009_activity_feed_v8.sql` nâng V7
  snapshot lên V8 bằng activity baseline rỗng, không dựng lại lịch sử log.
  Protocol V9 bổ sung `TAX` money/debt semantics và `TILE_LANDED`; snapshot V8 cũ
  vẫn hợp lệ nên không cần migration dữ liệu.
- Client display state không thay authoritative room state. `SESSION_SYNC`,
  `SPECTATOR_SYNC` và `REPLAY_SYNC` reset presentation queue/snap; chỉ
  `LIVE_UPDATE` mới animate state diff. Activity tail trong live update phải chờ
  cùng PresentationQueue gate, còn reconnect/replay chỉ hydrate snapshot hiện tại.
  Queue failure phải resolve, và reconnect không replay lịch sử.
- WebGL board chỉ render `BoardRenderModel` derive từ authoritative state cộng
  presentation state. Camera orthographic cố định, `frameloop="demand"`; callback
  hoàn tất local SDF text phải invalidate frame để tên ô hiện mà không cần tương tác.
- Property chassis giữ màu trung tính. Tám district dùng tám material/texture pair
  textless dùng chung theo `surfaceKey`; district accent không biểu diễn ownership.
  Surface batch phải theo cùng tile-motion matrix với chassis. WebGL fallback và
  40 semantic tile buttons vẫn là accessibility/compatibility boundary bắt buộc.
- Desktop Electron phải giữ `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, preload bridge typed/whitelist-only và packaged `app://` path
  traversal guard. Main process chỉ là shell/runtime/window boundary, không chứa
  GameCore hoặc bypass server authority.
- Active-game desktop close là disconnect để reconnect; không emit `leave room`.
  Chỉ nút `Bỏ cuộc`/explicit leave mới revoke session. Prompt/confirmation dùng
  central Modal/ConfirmationDialog; không thêm `window.confirm`.

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
- Đổi payment/bankruptcy/transfer/forced sale: rà mọi producer của `DebtClaim`,
  policy transfer, proposal continuation, snapshot validation và test
  restart/reconnect trước khi hoàn tất.

## Kiểm tra trước khi hoàn tất

```bash
pnpm db:status
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Desktop checks:

```bash
pnpm --filter @monopoly/desktop typecheck
pnpm --filter @monopoly/desktop test
pnpm desktop:package
```

Với thay đổi persistence/recovery, phải chạy PostgreSQL integration và restart
scenario bằng cùng database. Không đổi nhãn checklist thành automated nếu chưa có
test file/assertion thực thi tương ứng.
