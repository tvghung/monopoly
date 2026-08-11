# Mục lục HTTP và Socket.IO backend

## Phạm vi

Express runtime và Socket.IO command modules. PostgreSQL/session/recovery detail nằm
tại [../Persistence/README.md](../Persistence/README.md).

## Module map

| Module | Events/routes | Instruction |
| --- | --- | --- |
| Runtime | `/healthz`, `/readyz`, static/SPA, startup/shutdown | [http-runtime.instruction.md](./http-runtime.instruction.md) |
| Session/presence | `join room`, `resume session`, disconnect | [socket-session.instruction.md](./socket-session.instruction.md) |
| Lobby/lifecycle | `set ready`, `start game`, `leave room` | [socket-lobby.instruction.md](./socket-lobby.instruction.md) |
| Turn | `roll dice`, `buy property` | [socket-turn.instruction.md](./socket-turn.instruction.md) |
| Chat | `send chat` | [socket-chat.instruction.md](./socket-chat.instruction.md) |
| Trading | listing/sale/make/accept/decline offer | [socket-trading.instruction.md](./socket-trading.instruction.md) |
| Building | build/sell/mortgage/unmortgage | [socket-building.instruction.md](./socket-building.instruction.md) |
| Jail | `pay bail`, `use jail card` | [socket-jail.instruction.md](./socket-jail.instruction.md) |
| Auction | `decline property`, `place bid`, `pass bid` | [socket-auction.instruction.md](./socket-auction.instruction.md) |

## Outbound

| Event | Đích |
| --- | --- |
| `update(PublicRoomState)` | `room:<roomId>` after commit |
| `offer on prop` | Private owner room only |
| `offer accepted`, `offer declined`, `offer expired`, `offer cancelled` | Private buyer and owner rooms |
| `session replaced` | Superseded connection only |

Mọi state-changing inbound có typed ACK. `new player` và dummy payloads không còn
thuộc contract.

## Authority

Runtime schema → authenticated actor/role → per-room executor → PostgreSQL commit →
projection/broadcast/ACK. Payload actor fields không được tin; spectators không được
gọi gameplay mutation.
