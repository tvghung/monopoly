# Phase 7 — Implementation Gate Record

## Status

**BLOCKED at Phase 7.0.** The required PGlite Socket candidate did not preserve
the existing PostgreSQL multi-connection transaction contract. Phase 7.1–7.4
was not started. No gameplay, protocol V8, migration, server bootstrap,
Electron, client, packaging, or workflow implementation was changed.

## Candidate and test shape

- Date: 2026-08-29
- Node: 24.15.0
- `@electric-sql/pglite`: 0.5.7
- `@electric-sql/pglite-socket`: 0.2.11
- PGlite data directory: persistent filesystem directory created for the probe
- PGlite Socket bind: `127.0.0.1`, ephemeral TCP port
- PGlite Socket `maxConnections`: 10
- application `pg` pool maximum: 10
- application path: existing `migrateDatabase()` and `PostgresPersistenceStore`

## Evidence before the failure

The probe passed:

- migrations `001` through `009` through the existing migration runner,
  including the single migration advisory-lock acquisition;
- `PostgresPersistenceStore.healthcheck()`;
- room create/read and JSONB snapshot round trip;
- aggregate CAS conflict detection;
- transaction rollback of a pending session write;
- a second `pg` client connecting to the loopback PGlite Socket;
- a `FOR UPDATE` query on the first client.

The probe did not claim a pass for `FOR UPDATE SKIP LOCKED`, concurrent
transactional operations, or same-directory restart because the gate failed
before those checks completed.

## Exact failing contract and reproduction

With two `pg` clients connected through the same PGlite Socket:

```ts
const clientA = await pool.connect();
const clientB = await pool.connect();

await clientA.query('BEGIN');
await clientA.query(
  'SELECT id FROM rooms WHERE id = $1 FOR UPDATE',
  [roomId],
);

await clientB.query('BEGIN'); // hangs; SKIP LOCKED is never reached
await clientB.query(
  'SELECT id FROM player_sessions WHERE status = $1 LIMIT 1 FOR UPDATE SKIP LOCKED',
  ['PENDING'],
);
```

The probe was run from `apps/server` with:

```text
pnpm exec tsx .phase7-pglite-probe.mts
```

Observed trace after migrations, healthcheck, room create/save and client
connection succeeded:

```text
stage: two lock clients connected
stage: lock client A began
stage: FOR UPDATE passed
[QueryQueueManager] enqueued query from handler #2, queue size: 1
[QueryQueueManager] transaction started, but no query from the same handler id found in queue 1
[QueryQueueManager] queue processing complete, queue length is 1
```

`clientB.query('BEGIN')` remained pending until the probe was terminated after
the bounded observation window. This is not an expected row-lock wait: client A
locks a `rooms` row, while client B has not yet started its transaction and its
next query targets `player_sessions`. It demonstrates that an open transaction
on one multiplexed client can prevent another client from making progress.

That violates the application contract required by the existing pool size and
by the repository's transaction/locking code. Reducing the pool to one would
not prove the required multiple-connection behavior and is explicitly not an
approved workaround.

The result is a hard-gate failure, not a reason to change GameCore, the
protocol, migrations, or persistence semantics. PGlite remains an unapproved
experimental candidate until an upstream implementation can pass this exact
contract plus the remaining concurrency and restart checks. The official
[PGlite Socket documentation](https://pglite.dev/docs/pglite-socket) describes
the multiplexing limitation, and the upstream
[concurrent-connection issue](https://github.com/electric-sql/pglite/issues/1046)
tracks the same class of failure.

## Gate result

**FAIL / BLOCKED — stop Phase 7 implementation here.** Native PostgreSQL was
not silently substituted, no in-memory production fallback was added, and no
Phase 7.1–7.4 acceptance claim is made.
