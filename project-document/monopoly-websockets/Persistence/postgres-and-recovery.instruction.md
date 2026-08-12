# PostgreSQL, snapshot v2, CAS và recovery

## Relational model

- `rooms`: lifecycle/host, aggregate version, snapshot schema version, JSONB,
  `next_action_at`, retention timestamps.
- `player_sessions`: pending/active/revoked/expired with SHA-256 token hash and
  stable room/player mapping.
- `trade_offers`: stable participants/status/expiry plus canonical bilateral
  `TradeOfferRequest`/`TradeBundle` terms needed for restart-safe accept.

Forward SQL migration adds only relational shape required for v2 offer terms/reset
bookkeeping. Game rules/decks/payments/queues stay in room JSONB; không tạo table
riêng cho mỗi aggregate field.

## Strict snapshot validation

Loader/save schema is deep strict and requires version 2. Validate at least:

- every stable Player/card/auction reference resolves and active/finished inverse
  state is consistent;
- `doublesStreak` range/current-turn relation;
  `TurnInfo.pendingPropertyDecision` and each `PendingTurnContinuation` compatible
  with live payment/auction operation;
- each `DebtClaim` required settlement shape, PLAYER creditor ID presence, positive
  original/remaining amounts, unique `claimId`, order-valid `orderedClaims` and
  bounded `activeClaimIndex`;
- unique deck/card IDs, exact one location per card, correct source pile/holder and
  no held card owned by eliminated Player;
- Auction kind-specific target, participants/leader/deadline and matching building
  contention/reserved unit or Bank queue head;
- building level/even/inventory bounds and derived stock nonnegative;
- finished room has no live pending/payment/auction/recovery/Bank queue/contention.

Persistent snapshot excludes `loaded`, token/hash/session/offer rows, presence,
SocketData, queue executor and timer handles. Public projection further strips exact
`DeckState` and internal-only continuation detail.

## Command transaction

```text
parse/authenticate
→ per-room FIFO
→ row lock/load + v2 validate + clone
→ mutate GameCore draft and related offer rows
→ revalidate + expected-version CAS commit
→ public/private projection + ACK
```

Version conflict is retryable resync, not blind auto-retry. Save failure discards
all balance/payment/deck/auction/building/offer changes and emits nothing.

## Admission/session protocol

1. `join room` validates input and creates a five-minute `PENDING` session with a
   cryptographically random token; only its SHA-256 hash is stored.
2. ACK carries the raw token. No Seat/host/color is consumed before activation.
3. Client stores the token, then calls `resume session`.
4. The activation transaction creates/reuses room and Seat, binds the stable UUID
   and marks the session active; a lost activation ACK remains resumable/idempotent.
5. Routine reconnect hashes the token and reclaims the same Seat. The newest valid
   socket replaces the old connection; stale disconnect cannot revoke the Seat.

Explicit leave revokes the session; temporary disconnect does not. Routine resume
does not rotate the token. Room retention deletion may cascade terminal session
rows, but the v1→v2 reset below must not delete/recreate the room or sessions.

## Deadline and queue recovery

- `next_action_at` targets the minimum room expiry, turn-recovery, payment-action,
  auction or building-contention deadline. A `BankPropertyAuctionQueue` advances
  through its current durable auction and resumes on load/next committed command.
- Recovery captures exact operation marker (`turn/player/deadline` or
  `auctionId/kind/endsAt`), then rechecks under lock/CAS.
- Expired property auction finalizes then advances `BankPropertyAuctionQueue` head;
  expired building auction consumes/releases `reservedUnit` once. Continuation only
  runs after no blocking payment/pending auction remains.
- Startup handles due rows before listen; lazy load handles due state before resume.
  Shutdown does not arm artificial disconnect grace.

## v1 → v2 identity-preserving reset

Do not synthesize deck order, jail-card IDs, bank inventory or creditor history from
v1. In one transaction:

1. Lock v1 room and active sessions.
2. Preserve room identity/code, stable member IDs, join order/name/color, host and
   active session rows/token hashes.
3. Cancel pending gameplay offers; reset balance 1500, position Xuất Phát,
   ownership/building/mortgage/market/auction/debt/jail/cards; shuffle fresh v2 decks.
4. Với room `IN_PROGRESS`, giữ lifecycle đó, chọn lại duy nhất người đi đầu bằng
   highest-roll/tie-reroll rồi xoay cyclic join order từ người thắng; tạo fresh turn
   và Vietnamese system log. Ghi schema version 2, tăng aggregate version trong cùng
   transaction. Resume tokens reclaim cùng Seats; rerun trên v2 là no-op.

No delete/recreate room that would cascade sessions.

## Retention, startup và scale boundary

- Pending session: 5 minutes; revoked/expired session row: purge after 7 days.
- Inactive lobby: 24 hours; in-progress room: 30 days; finished room: 7 days.
  Empty lobby after explicit leave deletes immediately; all sockets offline alone
  never deletes a room.
- Every real server requires `DATABASE_URL` and compatible schema before traffic.
  `pnpm db:migrate` is forward-only under migration lock; `pnpm db:status` and
  `/readyz` must prove the schema/DB can serve commands.
- Rollback keeps data/backups and uses forward fixes; do not destructive
  down-migrate or run an old protocol/snapshot server against v2 rooms.
- Production remains one live Node instance with PostgreSQL durability. Before
  horizontal scale, add distributed Socket.IO fan-out, presence/connection
  ownership and room locking; aggregate CAS remains the final lost-update guard.

## Required tests

- Clean forward migration/checksum/constraints and TradeBundle round-trip.
- Snapshot v2 round-trip plus malformed payment/deck/auction/contention references.
- v1 IN_PROGRESS reset preserves identities/host/session hashes and removes old
  gameplay/pending offers; idempotent second run.
- Restart exact doubles/payment/deck/Bank queue/building/property auction state.
- CAS/save failure no revision/ACK/broadcast/private result.
- Public no-leak and session/newest-wins regressions.
