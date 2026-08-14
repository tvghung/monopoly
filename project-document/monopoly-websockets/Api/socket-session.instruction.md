# Session admission, resume và disconnect Socket instruction

## Scope

`apps/server/src/socket/session.ts` handles `join room`, `resume session` and Socket.IO
disconnect. Durable token/Seat work is delegated to `playerSessionService.ts`.

## `join room({name, roomCode})`

- Runtime schema validates and normalizes input.
- Existing `IN_PROGRESS`/`FINISHED` room returns explicit spectator admission with no
  Seat or token.
- Lobby/new-room intent creates a five-minute `PENDING` session with random 32-byte
  token; only SHA-256 hash is persisted.
- Pending admission does not reserve color, join order, host or capacity.

## `resume session({token})`

- Hash lookup handles pending activation or active reconnect.
- Pending activation transaction creates/finds lobby, enforces seven-seat capacity,
  creates stable UUID Seat and assigns join order/color/host.
- Active reconnect returns the same stable Player and relevant pending offers.
- Invalid/revoked/expired token is rejected, never converted to spectator/new Seat.

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

Admission/resume uses protocol-v4 typed ACK. Resume returns stable Player identity, public room
and pending private offers. Public presence projection is broadcast after binding;
session/token/offer/exact private deck state remain private.

## Tests

- Pending/lost ACK/idempotent activation; invalid/revoked/expired token.
- Same stable Player across new socket/process; protocol mismatch.
- Newest-wins and stale generation race.
- Disconnect preserves domain state and arms only valid current-turn grace.
- Spectator admission versus valid Player reclaim; public/private room isolation.
