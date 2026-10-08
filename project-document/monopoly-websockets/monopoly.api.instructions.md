# Rule nền API và transport

## Phạm vi

Áp dụng cho HTTP startup/runtime và Socket.IO handlers dưới `apps/server/src/`.
Repo không có REST business controller; gameplay vẫn đi qua Socket.IO.

## HTTP surface

- `GET /healthz`: public liveness; 503 khi shutting down.
- `GET /readyz`: RAM authority readiness; 503 khi shutting down.
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

- Success chỉ sau in-memory transaction commit.
- Failure có stable code/message/retryable.
- Không broadcast state từ failed draft.
- Current transport uses protocol V10 (2v2 Teamplay). The card commands below carry only the
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
| Lobby/lifecycle | `set ready`, `start game`, `play again`, `leave room` |
| Team (2v2) | `set game mode`, `set team name`, `set team color`, `move to seat`, `request seat swap`, `cancel seat swap`, `respond seat swap`, `revive teammate`, `accept rescue`, `decline rescue` |
| Lobby removal | `kick player` (host, lobby); the removed player's connection receives `removed from room` |
| Turn | `roll dice`, `buy property`, `do not buy`, `resolve development`, `wait in jail` |
| Chat | `send chat` |
| Trading | durable bilateral offer events |
| Property | sell-house và landing development |
| Jail | `pay bail`, `use jail card`, `wait in jail` |
| Card | `dismiss card` (current client); `draw card` retained for protocol-9 compatibility |
| Payment shortfall | sell to Bank / propose / accept / reject forced sale |

Pending purchase/development decisions, `PendingCardInteraction`, payment shortfall
and forced-sale proposals carry operation/claim IDs. New card landings are
immediately `REVEALED`; the current client sends only operation-scoped `dismiss
card`, which commits the existing effect and continuation once. Persisted
`AWAITING_DRAW` and `draw card` remain protocol-9 compatibility for legacy state;
the scheduler may promote that state but never applies a normal `REVEALED` card.
The handler commits the draft and only then broadcasts/ACKs. Turn handler không tự
advance: domain `completeTurnResolution` handoff sau khi decision/card/payment
continuation hoàn tất.

`new player` không còn là operational event. Dummy payload của start/buy đã bị xóa.

## Public/private outbound

- `update(PublicRoomState)` tới public room với monotonic revision.
- Offer arrival/result/expiry/cancellation chỉ tới private room của buyer/owner.
- `session replaced` chỉ tới old connection.
- Token/session hash/database row không được serialize trong `update`.

## Persistence/recovery

- Mỗi server process tạo một RAM store mới; không database/migration startup.
- Room command failure bỏ draft và trả failure ACK, không emit success.
- Offer/turn/payment/forced-sale deadlines và stable operation ID được giữ trong
  RAM khi process còn sống. Process chết thì room/token mất vĩnh viễn.
- Graceful shutdown ngừng nhận command, đóng scheduler/socket/http; shutdown không
  được tạo artificial player-disconnect grace.

## Kiểm tra

```bash
pnpm --filter @monopoly/server typecheck
pnpm --filter @monopoly/server test
pnpm lint
```

Event/lifecycle change cần Socket.IO integration; store/deadline change cần
transaction, reconnect và process-loss integration.
