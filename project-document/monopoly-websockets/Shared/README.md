# Shared — contracts, Standard Mode state và canonical game data

| Nhóm | Code | Instruction |
| --- | --- | --- |
| Stable IDs, room/public game/session DTO | `types.ts` | [socket-and-state-contracts.instruction.md](./socket-and-state-contracts.instruction.md) |
| Events, ACK, SocketData | `events.ts` | Cùng instruction |
| Runtime network schemas | `socketSchemas.ts` | Cùng instruction |
| Board/color groups/cards | `tileState.ts`, Chance/Chest files | [board-and-card-data.instruction.md](./board-and-card-data.instruction.md) |

`SOCKET_PROTOCOL_VERSION = 7` and `ROOM_SNAPSHOT_SCHEMA_VERSION = 7`. Compile-time
types và Zod validation runtime là hai lớp khác nhau; schema parse không thay server
authority.

Public DTO không chứa reconnect credential/private offer/exact deck order.
Persistence snapshot v7 chứa authoritative turn/payment/card operations cùng
`CharacterId`/`PlayerColorId`, public `BoardState.rollSequence` and bounded
`gameplayEvents`, nhưng không chứa presence/socket/timer handle. Historical V5 rooms
được nâng lên V6 với `rollSequence: 0` by migration 007; V6 rooms được nâng lên V7
by `008_semantic_card_v7.sql`, which initializes empty semantic lanes and
`completedCardOperations` without reconstructing history. Exact deck order remains
private. Mọi contract change phải sửa server producer, client consumer, public
projector, runtime schema và executable testcase.
