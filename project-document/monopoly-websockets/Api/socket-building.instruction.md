# Building và property Socket instruction

## Events/authority

`sell house` nhận `{ tileID: 0..39, requestId: UUID }` (protocol 13) plus typed ACK; a bare tile number or a missing/malformed
`requestId` is `INVALID_REQUEST`. Development after landing uses
`resolve development` with `{operationId, action}`; server derives the tile, level and
cost. Actor derives from stable SocketData and must own the target;
spectator/cross-room/spoof fails.

## Domain behavior

- `resolve development`: `SKIP`, `BUILD_HOUSES` (1–4 remaining levels) hoặc
  `UPGRADE_HOTEL` only for the pending landing decision; no stock or contention.
- `sell house`: half refund for the changed tile.
- During a payment shortfall ordinary build/trade commands are rejected; only the
  typed Bank liquidation and forced-sale proposal commands remain available, plus `make offer`/`accept offer` under the
  debt exception, `decline offer`, rescue answers and accept/reject of an open forced-sale proposal
  ([socket-trading](./socket-trading.instruction.md), [socket-debt-and-rescue](./socket-debt-and-rescue.instruction.md)).

Each command revalidates draft, commits once to the in-RAM room aggregate, then update/ACK.
A rejected command or failed commit discards its draft: no balance/building/inventory/revision change.
`sell house` (`apps/server/src/socket/building.ts`) also cancels pending offers that include the tile
in the same commit and is refused while a payment shortfall is open or the tile has a pending
landing decision.

Idempotency (CURRENT DEVELOPMENT, protocol 13; RELEASED v1.7.0 had none and a replayed emit sold one more level): the
client sends a fresh `requestId` per logical sale (`apps/client/src/App.tsx`). `apps/server/src/socket/building.ts` checks
`runtime.sellHouseRequests` (`apps/server/src/services/commandRequestLedger.ts`, keyed by room, actor, event and id) inside the
room command: a retransmitted emit (Socket.IO replays a buffered packet after a reconnect, a double click) is acknowledged
again and sells nothing. Only a committed sale is recorded (in `afterCommit`), so a refused request may succeed later with the
same id; a new sale, even of the same street, carries a new id and is a new action. The ledger is runtime memory, bounded
(128 ids per room, 10 minutes, 1024 rooms) and dies with the host process like the rest of the room.

## Tests

Landing development, sell-house, forced-sale liquidation, reconnect while the host process lives;
actor/spectator/invalid tile; failed commit. `sell house` idempotency (one sale, duplicate and concurrent duplicate, a legitimate
second sale, refused-then-valid, another actor's id, invalid payloads): `apps/server/src/socket.hardening.integration.test.ts`. Debt liquidation commands:
[socket-debt-and-rescue](./socket-debt-and-rescue.instruction.md).
