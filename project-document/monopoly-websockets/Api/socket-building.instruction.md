# Building và property Socket instruction

## Events/authority

`sell house` nhận tile index `0..39` plus typed ACK. Development after landing uses
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

Regression risk (current behavior): `sell house` is not idempotent. It carries only the tile index,
so a replayed or duplicated emit sells one more level while levels remain.

## Tests

Landing development, sell-house, forced-sale liquidation, reconnect while the host process lives;
actor/spectator/invalid tile; failed commit. Debt liquidation commands:
[socket-debt-and-rescue](./socket-debt-and-rescue.instruction.md).
