# Building và property Socket instruction

## Events/authority

`sell house` nhận tile index `0..39` plus typed ACK. Development after landing uses
`resolve development` with `{operationId, action}`; server derives the tile, level and
cost. Actor derives from stable SocketData and must own the target;
spectator/cross-room/spoof fails.

## Domain behavior

- `resolve development`: `SKIP`, `BUILD_HOUSES` (1–4 remaining levels) hoặc
  `UPGRADE_HOTEL` only for the persisted landing decision; no stock or contention.
- `sell house`: half refund for the changed tile.
- During a payment shortfall ordinary build/trade commands are rejected; only the
  typed Bank liquidation and forced-sale proposal commands remain available.

Each command revalidates draft, commits once, then update/ACK. Rejected/no-op/save
failure changes no balance/building/inventory/revision.

## Tests

Landing development, sell-house, forced-sale liquidation, restart/reconnect;
actor/spectator/invalid tile; save failure.
