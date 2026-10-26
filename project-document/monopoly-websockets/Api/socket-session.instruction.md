# Session admission, resume và disconnect Socket instruction

## Scope

`apps/server/src/socket/session.ts` handles `join room`, `resume session` and Socket.IO
disconnect. Token/Seat work in the in-RAM store is delegated to
`apps/server/src/services/playerSessionService.ts`. Sessions and Seats survive reconnect while the
host process lives and are lost when the host process exits.

## `join room({name, roomCode, hostCapability?})`

- Runtime schema validates and normalizes input. `hostCapability` is an optional
  strict 64-character lowercase hex string; no other field is accepted.
- Admission attempts are limited before any lookup: 8 per minute per connection, 30 per
  minute per trusted client key and 600 per minute for the process (see
  [HTTP hosting](./http-runtime.instruction.md#client-identity-and-request-limits-behind-the-tunnel)).
  A limited attempt receives retryable `CONFLICT`. Only admitted attempts are counted.
- Existing `IN_PROGRESS`/`FINISHED` room returns explicit spectator admission with no
  Seat or token.
- Development profile retains create-or-join behavior. In desktop profile, a new
  room requires the Electron main process's 256-bit capability for the selected
  room code. The Host renderer sends it only with its initial `join room` request;
  it is absent from invitation links and public state. Loopback, Origin and
  forwarded headers do not grant creation rights. Unknown-room Guests receive
  `NOT_FOUND`. The capability is compared in constant time against the secret that
  Electron main gave only to its own helper process (`OTB_HOST_ROOM_CODE` /
  `OTB_HOST_CREATE_SECRET`); it is bound to one room code, ends with that helper and
  is checked again only when the room does not exist. `PlayerSessionService.beginAdmission`
  takes the resulting permission as a required argument with no default.
- An accepted lobby admission creates a five-minute `PENDING` session with random
  32-byte token; only its SHA-256 hash is kept in the RAM store.
- Pending admission does not reserve color, join order, host or capacity. It does
  retain the admitted existing room ID or explicit Host creation permission in
  RAM. Activation rechecks that exact room ID; room deletion or room expiry returns
  `ROOM_GONE` (an expired pending session returns `SESSION_EXPIRED`), even if a new room later reuses the code. A Guest admission that names a
  room that does not exist is refused with `NOT_FOUND` and writes no pending row, so no
  timing or ordering between a Guest and the Host can turn a Guest into a room creator or a
  Host; racing admissions settle identically in either order because every transaction
  runs on the store's single queue.

## `resume session({token})`

- Hash lookup handles pending activation or active reconnect.
- Pending activation transaction creates only with stored Host authorization, or
  finds the exact admitted lobby; it enforces four-seat capacity,
  creates stable UUID Seat and assigns join order/color/host. A newly admitted human starts
  unready with Dog in the authoritative room state. If Dog conflicts with an active player's
  mascot+color combination, or with a teammate's mascot in 2v2, admission chooses the first
  valid mascot in `CHARACTER_IDS` order. The assigned color is unchanged. Active session
  resume does not reassign a mascot.
- Active reconnect returns the same stable Player and relevant pending offers.
- Invalid/revoked/expired token is rejected, never converted to spectator/new Seat.
- `resume session` accepts only `{token}`: a capability smuggled into it is an
  `INVALID_REQUEST`, and a reconnecting socket has no creation rights of its own.
- While the server is shutting down, the in-memory store refuses new transactions: join and
  resume are answered with sanitized, non-retryable `INTERNAL_ERROR`
  (`The game service is shutting down.`), never with a storage error.

## Connection binding/newest-wins

**CURRENT DEVELOPMENT — E1-FIX-019 (AUDIT-019).** Quyền sở hữu transport được kiểm tra tách biệt với session/Seat trong RAM:

- Mỗi request resume nhận thứ tự trước lần await đầu tiên. Chỉ một binding thành công mới ghi nhận thứ tự cho Player;
  request sai token hoặc bị hủy trước binding không giành quyền của Player. Resume cũ hoàn tất muộn không được thay thế binding mới hơn
  đã thành công, kể cả khi socket cũ vẫn đang sống.
- Tại binding boundary, socket phải có `connected=true` và chính object đó vẫn nằm trong namespace Socket.IO theo
  `socket.id`. Session phải còn `ACTIVE`, thuộc đúng room/Player và member chưa `LEFT`; các điều kiện domain này được
  kiểm tra lại trong validation-only room FIFO sau session processing.
- `afterCommit` kiểm tra liveness và thứ tự, activate registry, tăng generation, ghi internal room/player/role/session/
  generation SocketData và thay thế connection cũ trong cùng đoạn đồng bộ. Không có await giữa các bước đó.
  Connection bị thay thế nhận `session replaced` rồi disconnect. Raw token không vào SocketData/log/public state.
- Public room `room:<roomId>` và private room `player:<playerId>` được join tuần tự. Sau mỗi await của room join,
  deadline reconciliation, room lookup và private-offer lookup, continuation phải còn sở hữu cùng live socket/generation
  trước khi tiếp tục. Reconciliation cũng kiểm tra ownership trong room FIFO; một resume mất quyền không được để mất turn-recovery của Player đang offline. Nếu disconnect xảy ra trong lúc commit xóa marker, handler đối chiếu
  trạng thái đã commit và arm lại bằng guard hiện hữu; một owner mới đang sống khiến bước này no-op.
- Resume mất liveness hoặc bị binding mới hơn vượt qua nhận lỗi `SESSION_REPLACED` theo ACK hiện có, không phát success ACK
  hoặc private projection từ continuation đã mất quyền. Cleanup chỉ deactivate generation của chính operation và không
  xóa SocketData/subscription thuộc generation mới hơn trên cùng socket. Membership của resume kế tiếp đợi cleanup cũ
  hoàn tất, để async leave không gỡ room vừa join. Stale disconnect và queued command vẫn bị chặn
  bằng generation.
- Trước success ACK, một validation-only room FIFO kiểm tra lại session/member và đọc private offers trong cùng
  transaction; projection/ACK chỉ phát tại afterCommit còn đúng owner. ACK vẫn trước presence broadcast, và lỗi broadcast
  sau success không tạo ACK thứ hai.
- Transport bị hủy không revoke session hoặc loại Seat đã commit. Nếu pending activation đã tạo Seat trước khi disconnect,
  token còn hợp lệ vẫn resume được cùng PlayerId/Seat; quyền transport và trạng thái session không bị đánh đồng.

Implementation: `apps/server/src/socket/session.ts`, `apps/server/src/services/connectionRegistry.ts` và
`apps/server/src/services/deadlineScheduler.ts`. Đây là thay đổi ownership nội bộ; payload/ACK schemas và các hằng số
protocol/snapshot giữ nguyên.

## Disconnect

Disconnect changes runtime presence only. It never deletes/revokes Player, balance,
property, ready, host, session, offer or payment/proposal state.

If the disconnected stable Player owns current turn and no payment/proposal operation
controls progression, handler stores the configured guarded turn-recovery deadline in the room aggregate
(default 60 seconds). Reconnect before expiry clears it and preserves exact turn,
pending decision/continuation, payment, deck holder and forced-sale proposal state. The common room commit
boundary also arms the same marker when a command advances to an already-offline
current Player. Controlled shutdown does not arm artificial deadlines.

## Broadcast/ACK

Admission/resume uses the typed ACK of the current `SOCKET_PROTOCOL_VERSION` (`packages/shared/src/types.ts`).
Resume returns stable Player identity, public room, stored `PlayerColorId`/`CharacterId`, pending private offers,
private player state, the open forced-sale proposal for that player (or `null`) and the host continuity public key.
A spectator admission through `join room` (`recoverRoomIfDue`) and every `resume session`
(`reconcileTurnPresence`, which calls `recoverRoomIfDue`) also run the room's due deadlines.
Public presence projection is broadcast after binding;
session/token/offer/exact private deck state remain private.

## Tests

- Pending/lost ACK/idempotent activation; invalid/revoked/expired token.
- Same stable Player across a new socket, and across an in-process server restart reusing the same
  store (test harness, `apps/server/src/socket.integration.test.ts` "restores the same identity and game
  state after recreating the server"); protocol mismatch. That test is not a host process restart: a new
  host process has an empty store, so old tokens fail (`SESSION_INVALID`, Phase 7.2 contract below).
- Newest-wins and stale generation race.
- `apps/server/e1/audit019.e1.ts`: disconnected-before-binding, old disconnected A versus live B, valid-token/Seat
  preservation, invalid-token isolation, human presence và bot scheduling; cả hai E1 mode dùng fixed-behavior assertions
  sau E1-FIX-019.
- `apps/server/src/socket.resumeOwnership.integration.test.ts`: deterministic FIFO/session/join/deadline gates,
  older still-live resume, overlapping same-socket resumes, generation-scoped cleanup, invalidation và valid retry.
  Đây là Socket.IO loopback integration, không phải bằng chứng native hoặc cross-network acceptance.
- Disconnect preserves domain state and arms only valid current-turn grace.
- Spectator admission versus valid Player reclaim; public/private room isolation.
- Desktop capability-only room creation, Guest-first/header-forgery rejection,
  stale pending Guest rejection and remote unknown-room rejection
  (`hostAdmission.integration.test.ts`, explicit loopback only; two direct LAN-peer cases are skipped pending an isolated network namespace; peer/header classification is covered deterministically by `socket/clientIdentity.test.ts`).
- Phase 7.2 packaged Host contract uses four real Socket.IO clients, rejects a
  fifth with `ROOM_FULL`, preserves PlayerId/room on reconnect, proves newest-wins,
  and rejects the old session with `SESSION_INVALID` after a real helper restart
  (`apps/server/src/phase72HostContract.ts`). Physical LAN devices remain manual evidence.
