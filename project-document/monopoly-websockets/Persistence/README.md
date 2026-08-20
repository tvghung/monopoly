# Persistence — snapshot v6 và restart recovery

## Phạm vi

- SQL/repositories: `apps/server/migrations/`, `apps/server/src/persistence/`.
- Snapshot validation/serialization: `apps/server/src/rooms.ts`.
- FIFO/CAS/public projection/deadlines: `apps/server/src/services/`,
  `socket/roomCommands.ts`.

## Invariants

- PostgreSQL là production authority; in-memory adapter chỉ dùng trong test.
- Room command serialize + clone draft + expected-version CAS; chỉ commit xong mới
  ACK/public/private emit. Save failure bỏ toàn bộ draft và related offer writes.
- Raw token không persist; chỉ SHA-256. Presence/socket/generation/timer handle và
  countdown tick không nằm database.
- SQL migration version và JSON snapshot schema version độc lập; runtime v6 chỉ nhận
  protocol/snapshot v6.

## Snapshot v6

Room JSONB giữ stable-ID state, pending purchase/development landing decisions,
ordered `PaymentQueue`/`DebtClaim`, private deck/card ownership, and one optional
forced-sale proposal. Live/finished/winner identity records also retain nullable
`CharacterId` and shared `PlayerColorId`. Public projection loại deck order,
continuation internals and proposal terms except to its seller/buyer private rooms.
Auction, Bank queue, building-contention and finite Bank inventory are not v6 live
state. Property rows contain only owner, colour and development level.

`BoardState.rollSequence` is persisted as a public non-negative safe integer.
Fresh rooms start at zero. Migration `007_roll_sequence_v6.sql` upgrades V5
rooms in place to V6 with `rollSequence: 0`, increments the aggregate version
using the established rewrite convention, and does not reconstruct historical
roll count.

Property invariants remain houses `0..5` and non-street houses `0`. No colour-group/
even-building or 32/12 Bank-stock gate is persisted.

## v2/v3 → v4 migration

`004_simplified_rules_v3.sql` is forward-only and leaves migrations 001–003
unchanged. It preserves room/code/status (except a valid one-active-player running
room becomes finished), host, member/player stable IDs, join order, and active
session rows/token hashes. Running gameplay resets active players to 1500/start/no
assets/no jail/no operations, fresh private decks, and a new highest-roll/tie-reroll
starting-player competition with the existing seat order rotated from the winner.
Lobby rows are structurally fresh lobbies; finished rows keep terminal identity and
reason history while live operations are stripped. Pending ordinary offers in the
migrated rooms are cancelled; offer history and sessions are retained.

Migration 005 upgrades only snapshot version 3 rows to 4,
removes retired listing/property fields, clears the private forced-sale proposal,
preserves payment/turn state, cancels pending offers for those rooms, increments the
room aggregate once and recomputes `next_action_at`.

Migration 006 upgrades only V4 snapshots to V5 in place. It does not reset gameplay:
live/finished/winner records receive `characterId: null`, legacy colors map to the
shared ten-color palette, and owned-property color metadata is normalized from the
mapped live owner where available. The transformation is transactional and
checksum-ordered; new lobbies still enforce the current 2–4 admission rule.

Migration 007 upgrades only V5 snapshots to V6, adds the zero roll-identity
baseline, preserves all other room/game JSON, increments the aggregate version,
and is forward-only.

## Deadline/restart recovery

`next_action_at` is the minimum room expiry, turn-recovery, payment-shortfall action
deadline or forced-sale proposal expiry. Ordinary trade-offer/session deadlines
remain relational. Scheduler captures exact operation/claim/player/deadline markers,
rechecks under room lock/CAS, and treats stale/replayed callbacks as no-ops.

Required release gates include migration checksum/order, snapshot invariants, CAS
failure, private no-leak, payment auto-liquidation, proposal expiry/reconnect and
fresh-runtime restart tests.
