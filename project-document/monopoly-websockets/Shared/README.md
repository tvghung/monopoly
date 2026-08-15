# Shared — contracts, Standard Mode state và canonical game data

| Nhóm | Code | Instruction |
| --- | --- | --- |
| Stable IDs, room/public game/session DTO | `types.ts` | [socket-and-state-contracts.instruction.md](./socket-and-state-contracts.instruction.md) |
| Events, ACK, SocketData | `events.ts` | Cùng instruction |
| Runtime network schemas | `socketSchemas.ts` | Cùng instruction |
| Board/color groups/cards | `tileState.ts`, Chance/Chest files | [board-and-card-data.instruction.md](./board-and-card-data.instruction.md) |

`SOCKET_PROTOCOL_VERSION = 4`. Compile-time types và Zod validation runtime là hai
lớp khác nhau; schema parse không thay server authority.

Public DTO không chứa reconnect credential/private offer/exact deck order.
Persistence snapshot v4 chứa authoritative turn/payment operations nhưng không
chứa presence/socket/timer handle. Mọi contract change phải sửa server producer,
client consumer, public projector, runtime schema và executable testcase.
