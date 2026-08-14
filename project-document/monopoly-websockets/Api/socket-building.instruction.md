# Building và mortgage Socket instruction

## Events/authority

`sell house`, `mortgage property`, `unmortgage property` accept only tile index
`0..39` plus typed ACK. Development after landing uses `resolve development` with
`{operationId, action}`; the server derives the tile, level and cost. Actor derives
from stable SocketData and must own the target; spectator/cross-room/spoof fails.

## Domain behavior

- `resolve development`: `SKIP`, `BUILD_HOUSES` (1–4 remaining levels) or
  `UPGRADE_HOTEL` only for the persisted landing decision; no stock or contention.
- `sell house`: half refund for the changed tile. Mortgage requires zero buildings
  on that tile; unmortgage charges principal +10%.
- During a payment shortfall only the typed forced-sale commands are available;
  ordinary property/trading commands are rejected.

Each command revalidates draft, commits once, then update/ACK. Rejected/no-op/save
failure changes no balance/building/inventory/contention/revision.

## Tests

Landing development, forced-sale liquidation, restart/reconnect; actor/spectator/
invalid tile; save failure.
