# Rule nền API và transport

## Phạm vi

Áp dụng cho HTTP startup/runtime và Socket.IO handlers dưới `apps/server/src/`.
Repo không có REST business controller; gameplay vẫn đi qua Socket.IO.

## HTTP surface

- `GET /healthz`: public liveness, không phụ thuộc DB.
- `GET /readyz`: readiness; chỉ 200 khi PostgreSQL/schema sẵn sàng.
- Production static client và SPA fallback cùng origin.
- Socket.IO root namespace/path mặc định.

## Session, identity và role

Lifecycle events `join room` và `resume session` thiết lập:

```text
socket.data = {
  roomId?, playerId?, role?, sessionId?, connectionGeneration?, pendingAdmission?
}
```

- Active Player phải có authenticated session và stable `playerId`.
- Spectator có role rõ ràng, không có active Seat/player ID.
- Raw reconnect token không được gắn vào SocketData.
- `pendingAdmission` chỉ là per-socket runtime lock chống hai `join room` đồng thời;
  nó không phải credential/domain state và bị xóa khi bind hoặc terminal admission fail.
- Newest valid connection wins; old connection nhận `session replaced` và disconnect.
- Stale disconnect chỉ tác động presence nếu generation vẫn active.

Room membership:

- Public: `room:<internalRoomId>`.
- Private: `player:<stablePlayerId>`.

## Runtime validation và ACK

Tất cả inbound payload được parse bởi schema trong
`packages/shared/src/socketSchemas.ts`. Parse success không cấp quyền; handler tiếp
tục kiểm tra authenticated actor, role, room status, turn/owner/balance và entity.
Middleware còn bắt đúng số argument và một ACK callback; command không có business
payload từ chối dummy/actor payload trước khi vào handler.

Mọi state-changing request có request-scoped `Ack<T>`:

- Success chỉ sau PostgreSQL commit.
- Failure có stable code/message/retryable.
- Không broadcast state từ failed draft.
- Current transport uses protocol V7. The card commands below carry only the
  operation ID; the authenticated actor, pending state, card order and consequence
  remain server-authoritative.

## Command handler pattern

1. Parse payload.
2. Require authenticated Player hoặc explicit allowed spectator action.
3. Enqueue theo internal room ID.
4. Re-check connection generation trong queue, rồi load/clone aggregate và validate
   business state; command của connection đã bị thay thế trả `SESSION_REPLACED`.
5. Mutate draft và related session/offer records; validate lại strict snapshot/output
   invariants trước save.
6. Repository transaction compare-and-swap aggregate version.
7. Sau commit mới emit public/private projections và ACK; scheduler poll deadline
   metadata đã persist.

Actor không bao giờ lấy từ client payload. Handler không tự viết SQL.

## Event modules

| Module | Events |
| --- | --- |
| Session/presence | `join room`, `resume session`, disconnect |
| Lobby/lifecycle | `set ready`, `start game`, `leave room` |
| Turn | `roll dice`, `buy property`, `do not buy`, `resolve development`, `wait in jail` |
| Chat | `send chat` |
| Trading | durable bilateral offer events |
| Property | sell-house và landing development |
| Jail | `pay bail`, `use jail card`, `wait in jail` |
| Card | `draw card`, `dismiss card` |
| Payment shortfall | sell to Bank / propose / accept / reject forced sale |

Pending purchase/development decisions, `PendingCardInteraction`, payment shortfall
and forced-sale proposals carry operation/claim IDs. Card draw/dismiss uses the
durable `AWAITING_DRAW`/`REVEALED` state and server deadline/continuation; the
handler commits the draft and only then broadcasts/ACKs. Turn handler không tự
advance: domain `completeTurnResolution` handoff sau khi decision/card/payment
continuation hoàn tất.

`new player` không còn là operational event. Dummy payload của start/buy đã bị xóa.

## Public/private outbound

- `update(PublicRoomState)` tới public room với monotonic revision.
- Offer arrival/result/expiry/cancellation chỉ tới private room của buyer/owner.
- `session replaced` chỉ tới old connection.
- Token/session hash/database row không được serialize trong `update`.

## Persistence/recovery

- `DATABASE_URL` bắt buộc cho mọi real server start; schema mismatch/startup migration
  error làm process fail trước listen. In-memory store chỉ được dependency-inject trong test.
- Room command failure do DB trả retryable ACK, không memory fallback.
- Offer/turn/payment/forced-sale recovery dùng persisted absolute deadlines và stable
  operation ID.
- Graceful shutdown ngừng nhận command, đóng scheduler/socket/http/pool; shutdown không
  được tạo artificial player-disconnect grace.

## Kiểm tra

```bash
pnpm --filter @monopoly/server typecheck
pnpm --filter @monopoly/server test
pnpm lint
```

Event/lifecycle change cần Socket.IO integration; persistence/deadline change cần
PostgreSQL và restart integration.
