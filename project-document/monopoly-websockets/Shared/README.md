# Shared — contracts, Standard Mode state và canonical game data

| Nhóm | Code | Instruction |
| --- | --- | --- |
| Stable IDs, room/public game/session DTO | `types.ts` | [socket-and-state-contracts.instruction.md](./socket-and-state-contracts.instruction.md) |
| Events, ACK, SocketData | `events.ts` | Cùng instruction |
| Runtime network schemas | `socketSchemas.ts` | Cùng instruction |
| Board/color groups/cards | `tileState.ts`, Chance/Chest files | [board-and-card-data.instruction.md](./board-and-card-data.instruction.md) |
| Số luật (start cash, thưởng Xuất Phát, tiền thuê Ga/Công Ty, bán bắt buộc, vòng chờ tù, thời hạn) | `rules.ts` | Cùng instruction; `apps/server/src/rulesContract.test.ts` giữ khớp với server |

`SOCKET_PROTOCOL_VERSION = 11` and `ROOM_SNAPSHOT_SCHEMA_VERSION = 10`. Compile-time
types và Zod validation runtime là hai lớp khác nhau; schema parse không thay server
authority.

Public DTO không chứa reconnect credential/private offer/exact deck order.
Persistence snapshot v8 chứa authoritative turn/payment/card operations cùng
`CharacterId`/`PlayerColorId`, public `BoardState.rollSequence`, bounded
`gameplayEvents`, and the typed public `activityFeed`, nhưng không chứa
presence/socket/timer handle. Historical V5 rooms được nâng lên V6 với
`rollSequence: 0` by migration 007; V6 rooms được nâng lên V7 by
`008_semantic_card_v7.sql`; current V7 rooms được nâng lên V8 by
`009_activity_feed_v8.sql`, which initializes an empty activity tail without
reconstructing history. Exact deck order remains private. Mọi contract change phải
sửa server producer, client consumer, public projector, runtime schema và executable
testcase.

Protocol V9 adds `TAX` money/debt semantics and `TILE_LANDED`. This widens the
validated JSON unions without changing the persisted JSON shape, so existing V8
snapshots remain valid and no SQL migration is required.

Protocol V10 adds 2v2 Teamplay (`GameMode`, `TeamId`, `TeamSettingsById`, `TeamPlayState`, `ReviveWindow`,
`EmergencyRescueOffer`, `PaymentQueue.rescue`, `teamId` on every player record, the team lobby/revive/rescue events,
`TEAM_REVIVE`/`EMERGENCY_RESCUE` activity and the `REVIVE`/`RESCUE` money reasons) and snapshot V9. Migration
`010_teamplay_v9.sql` upgrades V8 rooms to Solo mode with balanced default teams. Protocol V11 adds the 2v2 lobby seats and the host kick
(`TeamSlot`/`TEAM_SLOTS`, `Player.teamSlot`, `RoomPlayerMeta.teamSlot`, `SeatSwapRequest`, `BoardState.seatSwapRequests`, `SeatHolder`/`seatHolderAt`/`firstFreeTeamSlot`
in `teams.ts`, the events `kick player`, `move to seat`, `request seat swap`, `cancel seat swap`, `respond seat swap` and `removed from room`) and removes
`swap team`; `set team name` loses its `teamId`. Snapshot V10 / migration `011_lobby_seats_v10.sql`. Team rules shared by server and client live in
`teams.ts` (`colorSetRentPercent`, `planEmergencyRescue`, `buildAlternatingTurnOrder`, …) and the numbers in `rules.ts`.
