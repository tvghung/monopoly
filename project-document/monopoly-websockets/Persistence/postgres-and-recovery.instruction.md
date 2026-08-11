# PostgreSQL, sessions, command execution và recovery

## Data model

### `rooms`

Internal UUID/code/status/host metadata, `aggregate_version`,
`snapshot_schema_version`, JSONB game snapshot, `next_action_at`, activity/expiry
timestamps. Status chỉ tiến `LOBBY → IN_PROGRESS → FINISHED`.

### `player_sessions`

`PENDING | ACTIVE | REVOKED | EXPIRED`, unique 32-byte token hash, pending requested
name/code hoặc active room/player mapping, TTL/revocation timestamps. Một room/player
chỉ có một active session.

### `trade_offers`

Unique offer ID, stable buyer/owner IDs, tile, positive integer price,
`PENDING | ACCEPTED | DECLINED | EXPIRED | CANCELLED` và authoritative expiry/result
timestamps.

## Snapshot boundary

JSONB contains stable-ID game state and durable deadlines. It excludes:

- `loaded` and client-only flags.
- raw/hash tokens and session rows.
- private offer rows.
- socket IDs, presence and connection generation.
- queues and scheduler timer handles.

Loader and room-command output apply a strict deep Zod schema, then validate UUID
player identities, stable references, active/finished inverse state, join order,
host, lifecycle, auction and turn-recovery invariants before serve/save; unknown
fields, malformed nested values and logs above 500 entries fail explicitly.
It also requires the exact schema version. Version 1 is the first durable format, so
every other version currently fails. A future supported older format must add and
test an ordered forward transform before accepting it.

## Command transaction

```text
parse/authenticate
→ per-room FIFO
→ load + clone aggregate
→ validate/mutate draft
→ one repository transaction with expected version
→ commit
→ public/private emit + ACK
```

The in-process FIFO reduces same-process contention; PostgreSQL compare-and-swap is
the final guard. A version conflict is not auto-retried: it surfaces as retryable so
the client can resync before retrying. Database failure discards draft and returns a
retryable failure without broadcast.

## Admission/session protocol

1. `join room` validates input and creates a five-minute `PENDING` session with a
   cryptographically random token; only hash is stored.
2. ACK carries raw token. No active Seat/host/color is consumed yet.
3. Client stores token then sends `resume session`.
4. Activation transaction creates/reuses room and Seat, binds stable UUID and turns
   session active. Lost activation ACK remains resumable/idempotent.
5. Subsequent reconnect only hashes/looks up token and reclaims that Seat.

Newer authenticated socket replaces older connection. Explicit leave revokes token;
temporary disconnect does not alter the session/Seat. Active token is deliberately
not rotated on routine reconnect, avoiding lost-ACK/multi-tab token races; it is
revoked by leave/explicit session invalidation. Room deletion/retention cleanup
cascade-deletes its session row, so the token becomes invalid.

## Deadlines/recovery

- Auction uses `auctionId + endsAt`; offer uses `offerId + expiresAt`; current-turn
  recovery uses turn/player/deadline.
- Runtime scheduler polls indexed due rows from absolute deadlines; it never persists
  ticks or creates a per-room/per-offer countdown interval.
- Boot scheduler processes due rooms/offers before listen. Lazy room load processes
  due auction/turn/room deadlines before returning authoritative state; offer queries
  independently exclude expired rows and the scheduler resolves them.
- `next_action_at` supports targeted recovery without eager-loading every room.
- Recovery captures the due room-expiry/auction/turn marker, reloads the locked row
  and requires the exact ID/deadline marker before applying it. A stale contender
  throws inside the transaction, so it commits no revision/activity update or
  broadcast; compare-and-swap remains the final guard.

## Retention defaults

- Pending session: 5 minutes.
- Revoked/expired session row: purge after 7 days.
- Lobby: 24 hours inactive.
- In-progress room: 30 days inactive.
- Finished room: 7 days.
- Empty lobby after explicit leave: delete immediately.
- All sockets offline alone never deletes a room.

## Startup/deployment

- Every real application server start requires `DATABASE_URL` and a compatible
  schema before accepting traffic; only dependency-injected tests use memory.
- `pnpm db:migrate` applies forward migrations under migration locking;
  `pnpm db:status` reports status.
- `/readyz` returns unavailable when DB/schema cannot serve commands.
- Rollback preserves database/backups and uses forward fixes; do not destructive
  down-migrate or run the old in-memory server against durable rooms.
- Initial cutover cannot recover rooms that existed only in the former process Map;
  drain/reset notice is required for that one deployment.
- The production runtime is deliberately single-live-process, including during
  deployment. Render uses a paid web service plus a small deployment-guard disk to
  enforce stop-before-start; the disk is not authoritative storage. Other platforms
  must provide the same stop-first guarantee until distributed presence, connection
  ownership, Socket.IO fan-out and locking are implemented.

## Scale boundary

Current runtime is intentionally one Node instance with in-process connection
registry/FIFO scheduler and PostgreSQL durability. Redis is not required now. Before
horizontal scaling, add Socket.IO Redis adapter, distributed presence/connection
ownership and a database/distributed room lock; PostgreSQL aggregate CAS remains the
final lost-update guard.

## Required tests

- Clean migration, constraints and status.
- Snapshot round-trip, schema validation and expected-version conflict.
- Token hash lookup/revoke/pending expiry; raw token leak assertions.
- Save failure leaves DB/revision/broadcast unchanged.
- Restart with the same PostgreSQL restores identity, host/ready, money/ownership,
  turn, offers and auction exactly once.
- Cleanup respects lifecycle TTL and does not delete merely-offline rooms.
