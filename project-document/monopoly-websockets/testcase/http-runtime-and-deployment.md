# Checklist — PostgreSQL, HTTP runtime và deployment

## Automated evidence

- `[AUTO]` Config validation/defaults: `apps/server/src/config.test.ts`.
- `[AUTO]` HTTP liveness/readiness/shutdown projection: `apps/server/src/createServer.test.ts`.
- `[AUTO]` Snapshot version/UUID/active-member inverse gates: `apps/server/src/rooms.test.ts`.
- `[AUTO]` Due auction/buy/room cleanup: `apps/server/src/services/deadlineScheduler.test.ts`.
- `[AUTO]` Test-adapter terminal retention: `apps/server/src/persistence/inMemory.test.ts`.
- `[AUTO]` Migration order/checksum/required-table SQL:
  `apps/server/src/persistence/migrations.test.ts`.
- `[PG-INTEGRATION]` Repository/CAS/hash/rollback/session-retention tests:
  `apps/server/src/persistence/postgres.integration.test.ts` when test DB configured.
- `[SOCKET-INTEGRATION]` A failure-injected transaction mutates its draft then throws
  a simulated DB outage; `apps/server/src/socket.integration.test.ts` asserts retryable
  `DATABASE_UNAVAILABLE`, no `update`, and byte-for-byte unchanged room/version.
- `[PG-INTEGRATION][SOCKET-INTEGRATION]` Conditional fresh-pool/server restart:
  `apps/server/src/socket.integration.test.ts` when test DB configured.

## Checklist

- [ ] Clean PostgreSQL runs migrations once; `db:status` reports current schema.
- [ ] Any real server start with missing/invalid `DATABASE_URL` or incompatible schema
  fails before listen.
- [ ] No production in-memory fallback exists.
- [ ] `/healthz` remains liveness; `/readyz` reports healthy/unhealthy DB/schema.
- [ ] DB save failure returns retryable ACK, leaves revision unchanged and emits no update.
- [ ] Snapshot round-trip preserves stable references; unknown/deep-malformed fields,
  cross-reference/invariant failures, over-500 logs and non-v1 version fail explicitly.
- [ ] Expected-version conflict cannot silently overwrite a newer room.
- [ ] Local `compose.yaml` + `.env.example` support migrate/dev/restart workflow.
- [ ] Production same-origin static/SPA and Socket.IO work; CORS is not authentication.
- [ ] Production proxy/static limiter uses one trusted hop and does not throttle
  Socket.IO or health probes.
- [ ] CI migrates PostgreSQL before integration tests and runs typecheck/lint/test/build.
- [ ] Container/Render starts migration-guarded app and uses `/readyz` health check.
- [ ] Render deployment uses the paid starter service and deployment-guard disk;
  replacement starts only after the previous process stops (brief token-based
  reconnect is expected).
- [ ] Rolling revisions/horizontal replicas remain disabled until distributed
  connection ownership, presence, locking and Socket.IO fan-out are implemented.
- [ ] SIGTERM stops commands and closes scheduler/socket/http/pool without fake turn grace.
- [ ] Scheduler/bootstrap/listen failure before ready closes opened Socket.IO/DB resources.
- [ ] Backup/forward-fix procedure avoids destructive down migration.

## Restart/recovery

- [ ] Same DB restores room/session/host/ready/game/offers/auction.
- [ ] Due auction/offer/turn deadline is applied exactly once before state is served.
- [ ] Cleanup honors pending/lobby/in-progress/finished TTL and never deletes merely-offline room.
- [ ] Expired/revoked session rows purge after `TERMINAL_SESSION_RETENTION_MS` without
  touching active sessions.
