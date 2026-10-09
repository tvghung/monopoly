# Rule nền API và transport

## Phạm vi

Áp dụng cho HTTP startup/runtime và Socket.IO handlers dưới `apps/server/src/`.
Repo không có REST business controller; gameplay vẫn đi qua Socket.IO.

## HTTP surface

- `GET /healthz`: public liveness; 503 khi shutting down.
- `GET /readyz`: RAM authority readiness; 503 khi shutting down.
- Desktop profile only: `GET /_otb/room`, `GET /_otb/continuity` và (khi helper có
  `OTB_REGISTRY_ROOM_CODE` + `OTB_REGISTRY_PROOF`) `GET /_otb/registry-proof`; chi tiết tại
  [Api/http-runtime](./Api/http-runtime.instruction.md).
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
- Desktop new-room admission requires the Electron main process capability scoped
  to one selected room code. A pending Guest stores its admitted room ID; resume
  cannot turn room disappearance into creation permission.
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
- Current transport uses the current `SOCKET_PROTOCOL_VERSION` (`packages/shared/src/types.ts`); a handshake
  with another version is refused with `UPGRADE_REQUIRED` (`apps/server/src/socket/index.ts`). Version history:
  [Shared/socket-and-state-contracts](./Shared/socket-and-state-contracts.instruction.md). The card commands below
  carry only the operation ID; the authenticated actor, pending state, card order and consequence
  remain server-authoritative.

## Command handler pattern

1. Parse payload: `installInboundValidation` (`apps/server/src/socket/validation.ts`) parses every known event
   with `clientEventPayloadSchemas` (`packages/shared/src/socketSchemas.ts`) and requires exactly one ACK callback,
   else `INVALID_REQUEST`.
2. Require authenticated Player (`requirePlayer`, `apps/server/src/socket/authority.ts`: role `PLAYER` and the
   current connection, else `UNAUTHENTICATED`) hoặc explicit allowed spectator action (`send chat` qua `requireRoom`; spectator `leave room` chỉ rời
   Socket room, không vào room queue).
3. Enqueue theo internal room ID (`commitRoomCommand`, `apps/server/src/socket/roomCommands.ts`, per-room FIFO).
4. Re-check connection generation trong queue, rồi load/clone aggregate và validate
   business state; command của connection đã bị thay thế trả `SESSION_REPLACED`.
5. Mutate draft và related session/offer records; validate lại strict snapshot/output
   invariants trước save.
6. Version-checked commit (compare-and-swap aggregate version) trong in-RAM store.
7. Sau commit mới emit public/private projections và ACK: `broadcastRoom`
   (`apps/server/src/socket/broadcast.ts`) gửi `update` tới `room:<id>` và `private player state` tới mỗi member
   chưa `LEFT`, rồi báo bot driver. Broadcast chạy sau khi command resolve (ngoài FIFO), nên client so `version`.
   Scheduler poll deadline tuyệt đối nằm trong room aggregate (RAM). Ngoại lệ: `resume session` ACK trước rồi mới broadcast
   presence (`apps/server/src/socket/session.ts`).

Gameplay command objects (`runGameCommand`, `apps/server/src/commands/gameplay.ts`) được socket handler và bot
driver dùng chung. Actor không bao giờ lấy từ client payload. Handler không tự viết SQL (runtime không có database).

## Event modules

| Module | Events |
| --- | --- |
| Session/presence | `join room`, `resume session`, disconnect |
| Lobby/lifecycle | `set appearance`, `set ready`, `start game`, `play again`, `leave room` |
| Bots (`socket/bots.ts`) | `add bot`, `remove bot`; `set bot difficulty` is CURRENT DEVELOPMENT (vNext, unreleased, added without a protocol bump) |
| Team (2v2, `socket/team.ts`) | `set game mode`, `set team name`, `set team color`, `move to seat`, `request seat swap`, `cancel seat swap`, `respond seat swap`, `revive teammate` |
| Lobby removal | `kick player` (host, lobby); the removed player's connection receives `removed from room` |
| Turn | `roll dice`, `buy property`, `do not buy`, `resolve development`, `wait in jail` |
| Chat | `send chat` |
| Trading | `make offer`, `decline offer`, `accept offer` (bilateral offers held in RAM) |
| Property | sell-house và landing development |
| Jail | `pay bail`, `use jail card`, `wait in jail` |
| Card | `dismiss card` (current client); `draw card` retained for protocol-9 compatibility |
| Payment shortfall and 2v2 rescue (`socket/debt.ts`) | `sell property to bank`, `propose forced sale`, `accept forced sale`, `reject forced sale`, `accept rescue`, `decline rescue` — [Api/socket-debt-and-rescue](./Api/socket-debt-and-rescue.instruction.md) |

Full event → handler → document map (39 client commands, 10 server events): [Api/README](./Api/README.md).

Pending purchase/development decisions, `PendingCardInteraction`, payment shortfall
and forced-sale proposals carry operation/claim IDs. New card landings are
immediately `REVEALED`; the current client sends only operation-scoped `dismiss
card`, which commits the existing effect and continuation once. A legacy
`AWAITING_DRAW` state and `draw card` remain protocol-9 compatibility;
the scheduler may promote that state but never applies a normal `REVEALED` card
(only the turn-recovery deadline of a disconnected current player applies it).
The handler commits the draft and only then broadcasts/ACKs. Turn handler không tự
advance: domain `completeTurnResolution` handoff sau khi decision/card/payment
continuation hoàn tất.

`new player` không còn là operational event. Dummy payload của start/buy đã bị xóa.

## Public/private outbound

- `update(PublicRoomState)` tới public room với monotonic revision.
- Offer arrival/result/expiry/cancellation chỉ tới private room của buyer/owner.
- `session replaced` chỉ tới old connection.
- Token/session hash/store record không được serialize trong `update`.
- Full server → client event list và emitters: [Api/README](./Api/README.md#server--client-events).

## Persistence/recovery

- Mỗi server process tạo một RAM store mới; không database/migration startup.
- Room command failure bỏ draft và trả failure ACK, không emit success.
- ACK error mapping (`socket/errors.ts`, no error is classified by a `code` property):
  room-version conflict is retryable `CONFLICT`; missing room is `ROOM_GONE`; an
  incompatible snapshot is a non-retryable `INTERNAL_ERROR`; any other exception means the
  RAM draft was rolled back and nothing was committed, so it is a retryable
  `INTERNAL_ERROR` with the fixed text `The server could not complete the command.` (no
  message, code or stack of the cause leaves the server); a closed store
  (`RuntimeUnavailableError`, thrown once `persistence.close()` ran during shutdown) is a
  non-retryable `INTERNAL_ERROR` (`The game service is shutting down.`) because the
  match ends with the process. `DATABASE_UNAVAILABLE` remains only as a deprecated
  compatibility code; the server never emits it.
- Tests that stop a server and start another one on the same in-memory store object are an
  in-process server restart reusing the same store (test harness), not a host process restart.
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
