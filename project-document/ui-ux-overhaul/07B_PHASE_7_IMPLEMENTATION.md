# Phase 7 — Implementation Gate Record

## Status

**7.0A historical gate: FAIL / REJECTED.** The required PGlite Socket candidate
did not preserve the existing PostgreSQL multi-connection transaction
contract.

**7.0B corrective gate: PASS on Windows; NOT RUN on macOS; overall Phase 7.0
BLOCKED.** A managed native PostgreSQL 17.11 runtime and packaged Electron
`utilityProcess.fork()` server helper were implemented and proved on Windows.
The macOS package and native runtime were not executed in this workspace.
Phase 7.1–7.4 was not started. The corrective work does not change gameplay,
protocol V8, GameCore, migrations, persistence semantics, or client UI.

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

## 7.0A historical gate result

**FAIL / REJECTED — stop the PGlite candidate here.** Native PostgreSQL was not
silently substituted during the original probe, no in-memory production
fallback was added, and no GameCore, protocol, migration, pool, or persistence
semantic change was made to accommodate PGlite.

## Corrective 7.0B implementation and proof

The narrow corrective continuation selected managed native PostgreSQL because
the required multi-connection contract could not be established with PGlite
Socket. The implementation keeps PostgreSQL and the existing persistence
store authoritative and adds only the desktop runtime seams needed to execute
the proof:

- PostgreSQL 17.11 is sourced from the official EDB binary archives, verified
  by size and SHA-256, and staged outside `app.asar` under the packaged
  resources directory.
- The desktop controller creates or reuses an app-data PostgreSQL 17 data
  directory, generates a private password file, chooses a validated loopback
  port, writes loopback-only authentication/listen configuration, and uses
  bounded `pg_ctl` startup and fast shutdown.
- The authoritative server is reusable through
  `startAuthoritativeServer(...).shutdown()`. Its migration directory is
  explicit so bundled code does not depend on a source-tree `import.meta.url`.
- The packaged helper is an external `server-helper.cjs` launched by Electron
  `utilityProcess.fork()`. The database URL is passed through private child
  environment state, never renderer state or command-line arguments.
- The hidden `--phase7-runtime-proof` executes the packaged helper and native
  PostgreSQL, checks `/healthz` and `/readyz`, migrations 001–009, typed values,
  CAS/rollback/session behavior, two independent `BEGIN` calls,
  `FOR UPDATE`, `FOR UPDATE SKIP LOCKED`, shutdown, same-directory restart,
  and retained JSONB data. It exits zero only when all checks pass.

### Corrective proof result

| Gate | Status | Evidence boundary |
| --- | --- | --- |
| Managed PostgreSQL 17.11 | **PASS — Windows** | Official EDB archive, SHA-256 verification, loopback startup, migration/checksum and persistence contract checks, bounded shutdown, restart, and retained data. |
| Packaged server helper | **PASS — Windows** | External bundled artifact, `utilityProcess.fork()`, private environment configuration, duplicate-start guard, health/readiness, graceful shutdown, restart, and sanitized diagnostics. |
| macOS native/package proof | **NOT RUN / BLOCKED** | No macOS package or native execution was available in this Windows workspace. |
| Overall Phase 7.0 | **BLOCKED** | Windows evidence is insufficient for the required cross-platform gate; Phase 7.1–7.4 remain not started. |

### Windows evidence captured

- `apps/desktop/postgres-resources.json` records PostgreSQL 17.11 from the
  official EDB catalog. The Windows archive was verified before staging at
  `340719294` bytes with SHA-256
  `6eabdf00d2893713b75db4336a23c3fdf505f056e217ec6e2e95d901750cfea3`.
- `pnpm --filter @monopoly/desktop package` — **PASS**. The packaged artifact
  contains the PostgreSQL `bin`, `lib`, and `share` trees plus the external
  `server-helper/server-helper.cjs`, contract bundle, and canonical migrations
  under `resources/`, outside `app.asar`.
- `pnpm desktop:make` — **PASS** on Windows. Squirrel produced the ignored
  installer output under `apps/desktop/out/make/squirrel.windows/`.
- `pnpm --filter @monopoly/desktop proof:packaged` — **PASS**, exit code `0`.
  The final packaged run returned `platform=win32`, `architecture=x64`, and
  passed PostgreSQL major-version, loopback binding, migrations/checksums,
  advisory lock, health/readiness, typed UUID/BYTEA/TIMESTAMPTZ, JSONB,
  room/CAS/rollback, session digest/expiry/purge, two-client independent
  `BEGIN`, `FOR UPDATE SKIP LOCKED`, duplicate-start, clean shutdown, same
  data-directory restart, retained data, and private-URL checks.
- Server-helper bundle syntax/export smoke, migration-resource smoke, helper
  timeout/crash tests, and duplicate-start tests — **PASS**. The normal
  workspace suite finished with desktop `48 passed`, server `153 passed / 10
  skipped` (without `TEST_DATABASE_URL`), and client `499 passed`. The isolated
  PostgreSQL integration files then finished with `48 passed` against managed
  PostgreSQL 17 using Vitest's single-thread pool after the default Windows
  worker-fork path emitted an unexpected-worker error.
- `pnpm db:status`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  and `git diff --check` — **PASS**. The database status showed migrations
  `001` through `009` applied. No CI or Desktop Build run was created because
  this branch was not pushed.
- macOS package/native/runtime proof — **NOT RUN / BLOCKED**. No macOS runner
  or executable was available in this workspace, so no cross-platform PASS is
  claimed.

## Current final decision

Phase 7.0A is **REJECTED**. Phase 7.0B is **PASS on Windows / NOT RUN on
macOS**, so the overall Phase 7.0 decision is **BLOCKED**. The loopback proof
does not approve LAN host/join UX, QR/mobile flows, production endpoints, or
release readiness. Phase 7.1–7.4 were **NOT STARTED**.
