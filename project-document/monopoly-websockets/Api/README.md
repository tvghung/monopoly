# HTTP và Socket.IO — Cờ Tỷ Phú Việt Nam

Express runtime và Socket.IO command modules. PostgreSQL/session/recovery detail:
[Persistence README](../Persistence/README.md).

| Module | Events/routes | Instruction |
| --- | --- | --- |
| Runtime | `/healthz`, `/readyz`, static/SPA, startup/shutdown | [http-runtime](./http-runtime.instruction.md) |
| Session | `join room`, `resume session`, disconnect | [socket-session](./socket-session.instruction.md) |
| Lobby | `set ready`, `start game`, `leave room` | [socket-lobby](./socket-lobby.instruction.md) |
| Turn/landing decision | `roll dice`, `buy property`, `do not buy`, `resolve development`, `wait in jail` | [socket-turn](./socket-turn.instruction.md) |
| Chat | `send chat` | [socket-chat](./socket-chat.instruction.md) |
| Trading | bilateral `TradeOfferRequest` và private offer lifecycle | [socket-trading](./socket-trading.instruction.md) |
| Building/property | sell-house và landing development | [socket-building](./socket-building.instruction.md) |
| Jail | `pay bail`, `use jail card`, `wait in jail` | [socket-jail](./socket-jail.instruction.md) |
| Payment shortfall | Bank forced sale and bilateral forced-sale proposal events | [payment-shortfall-and-forced-sale](../testcase/payment-shortfall-and-forced-sale.md) |

## Authority/commit

Protocol v5 schema → authenticated role/actor → serialized room draft → PostgreSQL
CAS commit → public/private projection → ACK. Save failure phát không state/update/
success. Actor/owner/dice/debt target và forced-sale price không lấy từ payload.

Public `update` tới `room:<roomId>`; session/private trade/forced-sale results chỉ tới
relevant `player:<playerId>`. Exact deck order và credentials không thuộc public
projection.
