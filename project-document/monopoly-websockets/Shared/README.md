# Shared — contracts, Standard Mode state và canonical game data

| Nhóm | Code | Instruction |
| --- | --- | --- |
| Stable IDs, room/public game/session DTO | `types.ts` | [socket-and-state-contracts.instruction.md](./socket-and-state-contracts.instruction.md) |
| Events, ACK, SocketData | `events.ts` | Cùng instruction |
| Runtime network schemas | `socketSchemas.ts` | Cùng instruction |
| Board/color groups/cards | `tileState.ts`, Chance/Chest files | [board-and-card-data.instruction.md](./board-and-card-data.instruction.md) |
| Số luật (start cash, thưởng Xuất Phát, tiền thuê Ga/Công Ty, bán bắt buộc, vòng chờ tù, thời hạn) | `rules.ts` | Cùng instruction; `apps/server/src/rulesContract.test.ts` giữ khớp với server |

Hằng số hiện hành: `SOCKET_PROTOCOL_VERSION` (`packages/shared/src/types.ts`) và `ROOM_SNAPSHOT_SCHEMA_VERSION`
(`apps/server/src/rooms.ts`). Lịch sử từng version, bản phát hành chứa nó và phần CURRENT DEVELOPMENT (vNext, unreleased)
chỉ nằm ở [Version history](./socket-and-state-contracts.instruction.md#version-history). Compile-time
types và Zod validation runtime là hai lớp khác nhau; schema parse không thay server
authority.

Public DTO không chứa reconnect credential/private offer/exact deck order.
Room snapshot (chỉ nằm trong RAM của host process) chứa authoritative turn/payment/card operations cùng
`CharacterId`/`PlayerColorId`, public `BoardState.rollSequence`, bounded
`gameplayEvents`, and the typed public `activityFeed`, nhưng không chứa
presence/socket/timer handle. HISTORICAL: các file SQL dưới `apps/server/migrations/` từng là đường nâng snapshot
khi còn PostgreSQL; runtime RAM không nạp chúng và không có bước nâng snapshot lúc chạy. Exact deck order remains private. Mọi contract change phải
sửa server producer, client consumer, public projector, runtime schema và executable
testcase.

Team rules shared by server and client live in
`teams.ts` (`colorSetRentPercent`, `planEmergencyRescue`, `buildAlternatingTurnOrder`, …) and the numbers in `rules.ts`.
