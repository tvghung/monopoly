# Building và mortgage Socket instruction

## Events/authority

`build house`, `sell house`, `mortgage property`, `unmortgage property` accept only
tile index `0..39` plus typed ACK. Actor derives from stable SocketData and must own
target; spectator/cross-room/spoof fails.

## Domain behavior

- `build house`: full group, no mortgage, even, funded. Normal stock consumes unit;
  scarce stock creates/joins `BuildingContention` through this existing event—không
  thêm request-building event. Hotel requires 4 houses on every group property.
- `sell house`: reverse-even, half refund; hotel downgrade requires four Bank houses.
- Mortgage requires zero buildings across entire color group; unmortgage charges
  principal +10%.
- Building inventory derives from board and `reservedUnit` against 32/12; handler
  không mutate persisted counter.
- Debtor may use valid sell/mortgage while active claim waits; successful action may
  trigger domain payment continuation but never client-chosen creditor.

Each command revalidates draft, commits once, then update/ACK. Rejected/no-op/save
failure changes no balance/building/inventory/contention/revision.

## Tests

Full property rule matrix; last-unit contention/join/reservation; debt liquidation;
restart/reconnect; actor/spectator/invalid tile; save failure.
