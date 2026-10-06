# Persistence — snapshot v10 và restart recovery

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
- SQL migration version và JSON snapshot schema version độc lập; current runtime
  uses protocol v11 and accepts snapshot schema v10.

## Snapshot v10 (v9 + lobby seats; v9 = v8 + 2v2)

Room JSONB giữ stable-ID state, pending purchase/development landing decisions,
ordered `PaymentQueue`/`DebtClaim`, durable `PendingCardInteraction`, private
deck/card ownership, bounded public `gameplayEvents` and typed `activityFeed`,
per-player private semantic lanes, `completedCardOperations` and one optional
forced-sale proposal. Live/finished/
winner identity records also retain nullable `CharacterId` and shared
`PlayerColorId`. Public projection loại exact deck order, continuation internals and
proposal terms except to its seller/buyer private rooms. Auction, Bank queue,
building-contention and finite Bank inventory remain outside current V8 live state.
Property rows contain only owner, colour and development level.

`BoardState.rollSequence` is persisted as a public non-negative safe integer.
Fresh rooms start at zero. Migration `007_roll_sequence_v6.sql` upgrades V5
rooms in place to V6 with `rollSequence: 0`, increments the aggregate version
using the established rewrite convention, and does not reconstruct historical
roll count.

V9 adds the 2v2 aggregate state: `boardState.gameMode`, `teams` (name and colour per team), `teamPlay` (`slotOrder`,
`revivedPlayerIds`, `reviveWindows`), `winningTeamId`, `teamId` on live/finished/winner records and `PaymentQueue.rescue` (the open
Emergency Rescue offer with its absolute `expiresAt`). The loader/save gate runs `assertTeamState`: Solo carries no match state, 2v2
requires team colours, an alternating four-seat `slotOrder`, a turn order equal to `slotOrder` filtered by who is still in, valid
revive windows (a bankrupt player, a surviving teammate, not yet revived, 1–3 turns) and a rescue offer equal to
`planEmergencyRescue`. Presence, socket mapping, timer handles and countdown ticks are still never persisted.

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
and is forward-only. This is historical V5 → V6 migration history, not the current
runtime version.

## Current V9 → V10 migration

Migration `011_lobby_seats_v10.sql` (PL/pgSQL, forward-only) upgrades only rooms with snapshot schema 9: every live `Player` gets
`teamSlot` — the next free seat of their team in join order (`ORDER BY joinOrder, id`), never above 1 — and `boardState.seatSwapRequests`
starts as `[]`. It sets snapshot schema version 10 and increments the aggregate version. Finished players, the winner and every other
field are untouched. The TypeScript helper `upgradeRoomSnapshotV9ToV10` (`rooms.ts`) mirrors it; the PostgreSQL test runs both over the
same V9 lobby (scrambled join order) and compares the result, and a second test restarts a lobby with an open seat-swap request on the
same database. The loader additionally validates lobby seats (`assertSeatState`): active lobby members never share a seat of a team
(skipped above `MAX_PLAYERS`), and every request is between two different active lobby members, one per requester, and only in a 2v2
lobby. A V9 snapshot that is still in the table at runtime is rejected with `UnsupportedRoomSnapshotVersionError`.

## Earlier V8 → V9 migration

Migration `010_teamplay_v9.sql` (PL/pgSQL, forward-only) upgrades only rooms with snapshot schema 8: it sets `gameMode` `SOLO`,
assigns teams alternating by join order across all members (so a Solo room can later switch to 2v2 balanced), defaults the team
settings to `Team 1` red / `Team 2` blue, empties `teamPlay`, adds `winningTeamId: null` and a `teamId` to
every player, finished-player and winner record, sets `PaymentQueue.rescue` to `null`, sets snapshot schema version 9 and increments the aggregate version. The
TypeScript helper `upgradeRoomSnapshotV8ToV9` (`rooms.ts`) mirrors it; the PostgreSQL test runs both over the same V8 fixture and
compares the result. A V8 snapshot that is still in the table at runtime is rejected with `UnsupportedRoomSnapshotVersionError`.

## Earlier V7 → V8 migration

Migration `009_activity_feed_v8.sql` upgrades only rooms with snapshot schema 7.
It initializes an empty bounded public typed `activityFeed`, sets snapshot schema
version 8 and increments the aggregate version inside the transaction. It does not
reconstruct activity from legacy logs, card order or prior card effects. The current
loader/save gate validates the V8 activity, card interaction, semantic streams and
privacy boundaries.

## Deadline/restart recovery

`next_action_at` is the minimum room expiry, turn-recovery, payment-shortfall action
deadline, Emergency Rescue expiry or forced-sale proposal expiry. Ordinary trade-offer/session deadlines
remain relational. Scheduler captures exact operation/claim/player/deadline markers,
rechecks under room lock/CAS, and treats stale/replayed callbacks as no-ops.

Required release gates include migration checksum/order, snapshot invariants, CAS
failure, private no-leak, payment auto-liquidation, proposal expiry/reconnect and
fresh-runtime restart tests.
