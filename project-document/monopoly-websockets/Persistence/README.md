# Persistence — snapshot v2 và restart recovery

## Phạm vi

- SQL/repositories: `apps/server/migrations/`, `src/persistence/`.
- Snapshot validation/serialization: `apps/server/src/rooms.ts`.
- FIFO/CAS/public projection/deadlines: `src/services/`, `socket/roomCommands.ts`.

## Invariants

- PostgreSQL là production authority; in-memory adapter chỉ test.
- Room command serialize + clone draft + expected-version CAS; commit trước mọi
  ACK/public/private emit. Failure bỏ toàn draft và related offer writes.
- Raw token không persist; chỉ SHA-256. Presence/socket/generation/queue object/timer
  handle/countdown tick không nằm database.
- SQL migration version và JSON snapshot schema version độc lập.

## Snapshot v2

Room JSONB v2 persists stable-ID Standard Mode state:

- turn order/number/current/dice/`doublesStreak`,
  `TurnInfo.pendingPropertyDecision` and each wait's `PendingTurnContinuation`;
- ownership/buildings/mortgage/open market/winner;
- `PaymentQueue.orderedClaims`/`DebtClaim` + `activeClaimIndex`, continuation and
  action deadline;
- private `GamePrivateState.decks.*.drawPile` and held jail-free card IDs;
- `Auction.kind`, absolute deadline, `BankPropertyAuctionQueue`;
- `BuildingContention.reservedUnit`.

Available house/hotel inventory is derived from board + reserved unit, never a
persisted counter. Public projector excludes exact deck order, credential and private
offer terms.

## Compatibility decision

- `SOCKET_PROTOCOL_VERSION = 2`; old clients fail `UPGRADE_REQUIRED`.
- `ROOM_SNAPSHOT_SCHEMA_VERSION = 2`; không diễn giải tiếp gameplay v1. Existing
  v1 `IN_PROGRESS` aggregate được reset một lần thành ván Standard Mode v2 mới,
  vẫn giữ status `IN_PROGRESS`, room ID/code, stable Player IDs, member
  join order/name/color/ready, host và active reconnect sessions/token hashes.
  Balance/position/tài sản/jail/deck/turn được tạo mới; roll chỉ chọn người đi đầu,
  rồi cyclic seat order cũ được xoay bắt đầu từ người đó.
- Pending private offers associated with reset gameplay are cancelled; runtime
  presence is rebuilt on resume. `FINISHED`/expired data follows retention policy;
  no destructive session-table reset/cascade.
- Reset is idempotent/transactional and records v2 snapshot before it can be served.

## Mapping/tests

| Concern | Main code/test |
| --- | --- |
| Schema/version/deep invariants | `rooms.ts`, `rooms.test.ts` |
| CAS/transaction | repositories, room command executor tests |
| Deadline/queue continuation | deadline scheduler tests |
| Real DB/restart | PostgreSQL integration + Socket restart tests |
| Public privacy | public projector/contract tests |

Release requires `db:status`, full gates and opt-in PostgreSQL suites with
`TEST_DATABASE_URL`; a skipped DB suite is not persistence verification.
