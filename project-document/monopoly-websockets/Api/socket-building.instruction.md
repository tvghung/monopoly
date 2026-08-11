# Building và mortgage Socket instruction

## Events/authority

`build house`, `sell house`, `mortgage property`, `unmortgage property` accept only
numeric tile ID plus typed ACK. Runtime schema requires integer `0..39`.

Authenticated stable Player from SocketData must be active owner. Spectator,
unauthenticated, cross-room and spoofed actor attempts fail. UI visibility is not
authority.

## Domain rules

- Build: full color group, no group mortgage, build-even, below hotel and funded.
- Sell: has building and sell-even; refund half house cost.
- Mortgage: owned, not mortgaged and no building on property/group as domain rule
  requires; credit half price.
- Unmortgage: owned/mortgaged and funded for half price plus 10%, rounded up.

Existing property-economy rules live in GameCore and remain unchanged.

## Durability

Action runs on room draft and commits aggregate version before public update/success
ACK. Rejected/no-op action returns explicit failure; save failure commits no revision
and emits no `update`.

## Tests

- Stable actor/owner, invalid tile and spectator rejection.
- Full valid/rejected property-economy boundaries.
- DB save failure and reconnect/restart state preservation.
