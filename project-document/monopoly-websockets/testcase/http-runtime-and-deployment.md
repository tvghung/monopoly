# Checklist — PostgreSQL, HTTP runtime và deployment

## Automated evidence

- `[AUTO]` Config validation/defaults: `apps/server/src/config.test.ts`.
- `[AUTO]` HTTP liveness/readiness/shutdown projection: `apps/server/src/createServer.test.ts`.
- `[AUTO]` Snapshot version/UUID/active-member inverse gates: `apps/server/src/rooms.test.ts`.
- `[AUTO]` Due buy/development/payment/room cleanup: `apps/server/src/services/deadlineScheduler.test.ts`.
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
- [ ] Forward migration stores canonical bilateral TradeBundle offer terms and
  snapshot schema version 4 without destructive down migration.
- [ ] Any real server start with missing/invalid `DATABASE_URL` or incompatible schema
  fails before listen.
- [ ] No production in-memory fallback exists.
- [ ] `/healthz` remains liveness; `/readyz` reports healthy/unhealthy DB/schema.
- [ ] DB save failure returns retryable ACK, leaves revision unchanged and emits no update.
- [ ] Snapshot round-trip preserves stable references; unknown/deep-malformed fields,
  cross-reference/invariant failures, over-500 logs and non-v8 version fail explicitly.
- [ ] Expected-version conflict cannot silently overwrite a newer room.
- [ ] Local `compose.yaml` + `.env.example` support migrate/dev/restart workflow.
- [ ] Production same-origin static/SPA and Socket.IO work; development defaults to
  `http://127.0.0.1:5173`, packaged Electron defaults to `app://own-the-block`, and
  `CORS_ORIGIN` overrides the applicable default. CORS is browser authorization,
  not authentication or server-side rejection of arbitrary WebSocket clients.
- [ ] Desktop Host starts managed PostgreSQL on loopback and the authoritative
  game server on the selected LAN-capable port; PostgreSQL is not LAN reachable.
- [ ] Desktop Join accepts a validated explicit IPv4/port plus room code before
  creating the gameplay socket; configured developer/release endpoints remain a
  separate HTTP(S) override.
- [ ] Physical Windows/macOS host/join pairs, reconnect, 2/3/4-player lobby,
  manual fallback, and host loss are recorded separately as manual acceptance.
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

## Phase 7.2 evidence

- `[AUTO][PASS]` Desktop tests prove single-start, helper-before-database shutdown,
  renderer-independent ownership, bounded helper/database recovery, actual-port
  propagation, IPv4 filtering/selection/refresh, safe status projection, and
  validated sender-scoped IPC.
- `[PACKAGED][PASS-WINDOWS]` The Host proof validates the external helper/client
  resources, PostgreSQL loopback, authoritative `0.0.0.0` bind, actual port,
  health/readiness, bundled page/asset, explicit origin policy, real local IPv4
  access, four-client capacity/reconnect/newest-wins, restart retention, deadline
  recovery, redaction, and ordered clean shutdown.
- `[BROWSER][PASS]` Mobile Chromium and WebKit load the host-served page, prefill
  without auto-submit, join/lobby/start, exercise portrait/landscape boundaries,
  legacy rendering, settings/audio UI, reload resume, and offline/online recovery.
- `[AUTO][PASS]` Application-level quit coordination is idempotent: cancellation
  leaves runtime resources running; confirmed quit stops runtime once and closes
  only after cleanup.
- `[NOT RUN/BLOCKED]` Local `db:status` is blocked when PostgreSQL is unavailable;
  this does not replace configured PostgreSQL integration evidence.
- `[MANUAL DEFERRED / NOT RUN]` Physical Windows/macOS LAN pairs, real devices,
  firewall/network-isolation behavior, install, upgrade, and uninstall remain
  separate.

## Restart/recovery

- [ ] Same DB restores room/session/host/ready plus pending landing decision/
  continuation, payment claim/index, private decks/card holders and proposal terms.
- [ ] Historical snapshot upgrades are transactional/idempotent and preserve room/member/host/
  active session identity and never cascades reconnect credentials.
- [ ] Due offer/turn/payment/proposal deadline is applied exactly once before state is served.
- [ ] Cleanup honors pending/lobby/in-progress/finished TTL and never deletes merely-offline room.
- [ ] Expired/revoked session rows purge after `TERMINAL_SESSION_RETENTION_MS` without
  touching active sessions.
