# GameCore — mục lục room aggregate và luật game

## Phạm vi

Game-domain functions dùng stable player IDs và mutate draft aggregate. Repository,
Socket.IO và ACK nằm ngoài GameCore.

| Nhóm | Code | Instruction | Testcase |
| --- | --- | --- | --- |
| Room/Seat/host/ready/leave | `rooms.ts`, lifecycle services | [room-lifecycle.instruction.md](./room-lifecycle.instruction.md) | [join lifecycle](../testcase/join-room-and-player-lifecycle.md) |
| Turn/movement/bankruptcy/recovery | `game/turn.ts`, `game/dice.ts` | [turn-movement-and-bankruptcy.instruction.md](./turn-movement-and-bankruptcy.instruction.md) | [turn](../testcase/turn-movement-buy-and-jail.md), [winner](../testcase/game-status-bankruptcy-and-winner.md) |
| Tile/card/jail | `game/tiles.ts` | [tile-cards-and-jail-resolution.instruction.md](./tile-cards-and-jail-resolution.instruction.md) | [turn](../testcase/turn-movement-buy-and-jail.md) |
| Property economy | `game/property.ts` | [property-economy.instruction.md](./property-economy.instruction.md) | [property](../testcase/property-economy.md) |
| Auction | `game/auction.ts` | [auction.instruction.md](./auction.instruction.md) | [auction](../testcase/auction.md) |

Room persistence/CAS/deadline recovery: [../Persistence/README.md](../Persistence/README.md).

## Invariants

- Stable-ID references remain internally consistent.
- Disconnect is presence-only; leave/forfeit is explicit atomic mutation.
- Lifecycle cannot reverse; host transfer only on explicit leave.
- Deadline state is absolute and serializable; timer handles are runtime-only.
- Domain test covers valid/rejected/boundary cases, including multi-bankruptcy.
