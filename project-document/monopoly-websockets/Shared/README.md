# Shared — mục lục hợp đồng, schema và game data

| Nhóm | Code | Instruction |
| --- | --- | --- |
| Stable IDs, room/game/session/offer DTO | `types.ts` | [socket-and-state-contracts.instruction.md](./socket-and-state-contracts.instruction.md) |
| Events, ACK, SocketData | `events.ts` | Cùng instruction |
| Runtime network schemas | `socketSchemas.ts` | Cùng instruction |
| Board/color groups/cards | `tileState.ts`, Chance/Chest files | [board-and-card-data.instruction.md](./board-and-card-data.instruction.md) |

Contract compile-time và Zod validation runtime là hai lớp khác nhau. Schema parse
không thay thế server authority. Public DTO không chứa token/session hash/private
offer; persistence snapshot không chứa transport state.

Mọi change phải sửa cả server producer, client consumer, export surface và testcase.
