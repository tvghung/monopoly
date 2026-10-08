# Session admission, resume và disconnect Socket instruction

## Scope

`apps/server/src/socket/session.ts` handles `join room`, `resume session` and Socket.IO
disconnect. Durable token/Seat work is delegated to `playerSessionService.ts`.

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
  32-byte token; only SHA-256 hash is persisted.
- Pending admission does not reserve color, join order, host or capacity. It does
  retain the admitted existing room ID or explicit Host creation permission in
  RAM. Activation rechecks that exact room ID; deletion or expiry returns
  `ROOM_GONE`, even if a new room later reuses the code. A Guest admission that names a
  room that does not exist is refused with `NOT_FOUND` and writes no pending row, so no
  timing or ordering between a Guest and the Host can turn a Guest into a room creator or a
  Host; racing admissions settle identically in either order because every transaction
  runs on the store's single queue.

## `resume session({token})`

- Hash lookup handles pending activation or active reconnect.
- Pending activation transaction creates only with stored Host authorization, or
  finds the exact admitted lobby; it enforces four-seat capacity,
  creates stable UUID Seat and assigns join order/color/host.
- Active reconnect returns the same stable Player and relevant pending offers.
- Invalid/revoked/expired token is rejected, never converted to spectator/new Seat.
- `resume session` accepts only `{token}`: a capability smuggled into it is an
  `INVALID_REQUEST`, and a reconnecting socket has no creation rights of its own.
- While the server is shutting down, the in-memory store refuses new transactions: join and
  resume are answered with sanitized, non-retryable `INTERNAL_ERROR`
  (`The game service is shutting down.`), never with a storage error.

## Connection binding/newest-wins

After durable load/activation, handler sets internal room/player/role/session/
generation SocketData and awaits joins of `room:<roomId>` and
`player:<playerId>`. Raw token is never stored in SocketData/log/public state.

Connection registry applies newest-wins. Superseded socket receives
`session replaced` then disconnects. Generation validation prevents stale disconnect
or queued command from deactivating/mutating the newer connection.

## Disconnect

Disconnect changes runtime presence only. It never deletes/revokes Player, balance,
property, listing, ready, host, session, offer or payment/proposal state.

If the disconnected stable Player owns current turn and no payment/proposal operation
controls progression, handler persists the configured guarded turn-recovery deadline
(default 60 seconds). Reconnect before expiry clears it and preserves exact turn,
pending decision/continuation, payment, deck holder and forced-sale proposal state. The common room commit
boundary also arms the same marker when a command advances to an already-offline
current Player. Controlled shutdown does not arm artificial deadlines.

## Broadcast/ACK

Admission/resume uses protocol-v11 typed ACK. Resume returns stable Player identity,
public room, persisted `PlayerColorId`/`CharacterId` and pending private offers.
Public presence projection is broadcast after binding;
session/token/offer/exact private deck state remain private.

## Tests

- Pending/lost ACK/idempotent activation; invalid/revoked/expired token.
- Same stable Player across new socket/process; protocol mismatch.
- Newest-wins and stale generation race.
- Disconnect preserves domain state and arms only valid current-turn grace.
- Spectator admission versus valid Player reclaim; public/private room isolation.
- Desktop capability-only room creation, Guest-first/header-forgery rejection,
  stale pending Guest rejection and remote unknown-room rejection
  (`hostAdmission.integration.test.ts`, including a real non-loopback LAN peer).
- Phase 7.2 packaged Host contract uses four real Socket.IO clients, rejects a
  fifth with `ROOM_FULL`, preserves PlayerId/room on reconnect, proves newest-wins,
  and rejects the old session after helper restart. Physical LAN
  devices remain manual evidence.
