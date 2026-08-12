# HTTP và Socket.IO — Cờ Tỷ Phú Việt Nam

Express runtime và Socket.IO command modules. PostgreSQL/session/recovery detail:
[Persistence README](../Persistence/README.md).

| Module | Events/routes | Instruction |
| --- | --- | --- |
| Runtime | `/healthz`, `/readyz`, static/SPA, startup/shutdown | [http-runtime](./http-runtime.instruction.md) |
| Session | `join room`, `resume session`, disconnect | [socket-session](./socket-session.instruction.md) |
| Lobby | `set ready`, `start game`, `leave room` | [socket-lobby](./socket-lobby.instruction.md) |
| Turn/payment | `roll dice`, `buy property`, `settle debt`, `declare bankruptcy` | [socket-turn](./socket-turn.instruction.md) |
| Chat | `send chat` | [socket-chat](./socket-chat.instruction.md) |
| Trading | listing/sale + bilateral `TradeOfferRequest` | [socket-trading](./socket-trading.instruction.md) |
| Building | build/sell/mortgage/unmortgage | [socket-building](./socket-building.instruction.md) |
| Jail | `pay bail`, `use jail card` | [socket-jail](./socket-jail.instruction.md) |
| Auction | `decline property`, `place bid`, `pass bid` for both kinds | [socket-auction](./socket-auction.instruction.md) |

## Authority/commit

Protocol v2 schema → authenticated role/actor → serialized room draft → PostgreSQL
CAS commit → public/private projection → ACK. Save failure phát không state/update/
success. Actor/owner/dice/auction kind/debt target không lấy từ payload.

Public `update` tới `room:<roomId>`; session/private trade results chỉ tới relevant
`player:<playerId>`. Exact deck order và credentials không thuộc public projection.
