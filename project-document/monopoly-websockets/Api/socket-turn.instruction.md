# Turn Socket instruction

## Events/authority

All commands require authenticated Player role, runtime schema and typed ACK. Actor
comes from stable `socket.data.playerId`; spectator and unauthenticated sockets fail.

| Event | Server guards/mutation |
| --- | --- |
| `roll dice` | In-progress active current Player, not moved, no blocking auction/decision; server rolls/moves/resolves |
| `buy property` | Current Player with `canBuyProp`; revalidate tile unowned and balance; purchase then next turn |

Buy no longer accepts an ignored dummy payload. `start game` belongs to
[`socket-lobby.instruction.md`](./socket-lobby.instruction.md).

## Durable command behavior

Each action runs on a cloned room draft in the per-room executor, commits aggregate
version to PostgreSQL, then broadcasts `PublicRoomState` and ACKs. Save failure leaves
committed state unchanged.

## Disconnect/recovery

Disconnect does not remove current Player. A configured persisted marker (default
60 seconds) carries turn number/player/deadline. Reconnect committed before expiry
clears marker and keeps `hasMoved`, `canBuyProp` and jail state exactly. At expiry:

- Active auction owns progression; turn marker does nothing.
- Pending buy decision revalidates and starts durable auction.
- Otherwise server advances/skips turn.

Recovery captures and requires the exact current turn/player/deadline under the
locked command; stale recovery rolls back with no revision/update, and aggregate CAS
prevents duplicate advance.

## Existing game rules

Dice remain server-authoritative; movement/tile/jail/property rules remain in
GameCore. No doubles-extra-turn/three-doubles rule is introduced.

## Tests

- Actor/role spoof rejection and invalid payload ACK.
- Roll/buy authoritative valid/rejected paths.
- Persistence failure no broadcast; revision increments once.
- Current-turn reconnect/grace/auction interaction/restart races.
