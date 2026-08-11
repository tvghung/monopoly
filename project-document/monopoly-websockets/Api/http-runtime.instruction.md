# HTTP runtime, database readiness và deployment

## Surface

- `GET /healthz`: public liveness; process is running.
- `GET /readyz`: readiness; PostgreSQL reachable and schema compatible.
- Production static client and SPA fallback on same origin.
- Production trusts exactly one reverse-proxy hop and limits static/SPA requests to
  1,000 per IP per 15 minutes; Socket.IO and health routes are outside that limiter.
- Socket.IO shares the HTTP server at default path/namespace.

No REST gameplay controller/auth route is added.

## Startup

1. Parse environment via `apps/server/src/config.ts`.
2. Require `DATABASE_URL` for every real application server start.
3. Open PostgreSQL pool and verify/apply expected migrations under lock.
4. Construct repositories/services/Socket handlers.
5. Recover due deadlines/cleanup metadata without eager-loading every room.
6. Listen only after readiness prerequisites pass.

Missing DB, connection failure or schema mismatch exits before accepting traffic;
there is no in-memory fallback. If initial deadline cleanup or HTTP listen fails
after resources open, startup stops the scheduler and closes Socket.IO/PostgreSQL
before propagating the failure.

## Environment

- `PORT` default `8080`.
- `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`,
  `DATABASE_MAX_CONNECTIONS`.
- `RECONNECT_GRACE_MS=60000`, `PENDING_SESSION_TTL_MS=300000`,
  `TERMINAL_SESSION_RETENTION_MS=604800000`.
- `LOBBY_RETENTION_MS=86400000`, `IN_PROGRESS_RETENTION_MS=2592000000`,
  `FINISHED_RETENTION_MS=604800000`.
- Existing `NODE_ENV`, `CORS_ORIGIN`, `CLIENT_DIST` behavior remains.

Room code and CORS are not authentication.

## Runtime failure/shutdown

When DB becomes unavailable, authoritative commands fail with retryable ACK and
readiness becomes 503; the draft is discarded and no public update is sent.

SIGTERM/SIGINT stop new commands, cancel runtime schedules without creating fake
player-disconnect grace, close Socket.IO/HTTP and PostgreSQL pool cleanly.

## Deploy/migration

- Local development uses PostgreSQL from `compose.yaml`; server/database scripts load
  the optional root `.env` copied from `.env.example`.
- `pnpm db:migrate` and `pnpm db:status` manage/check schema.
- Render Blueprint provisions the Node application plus paid `basic-256mb` PostgreSQL;
  the database is intentionally non-expiring for production durability.
- The Blueprint uses a paid `starter` web service with a 1 GB deployment-guard disk.
  The disk is not a game-data store; it forces stop-before-start deployment so the
  process-local connection registry, FIFO queues and scheduler never overlap with a
  replacement process. Stable browser tokens handle the brief reconnect.
- Deployment health path is `/readyz`.
- Rolling revisions or horizontal replicas are unsupported until distributed
  connection ownership/presence and a Socket.IO adapter are added.
- Initial durable cutover cannot recover rooms that only existed in old process
  memory; drain/reset notice is required.
- Prefer forward fixes/backups; do not destructive down-migrate or run old memory
  version against persisted games.

## Tests

- Liveness/readiness under healthy/unhealthy DB.
- Missing config/schema mismatch fail before listen.
- Static/SPA/CORS and Socket proxy behavior.
- Clean migration/status, production image start and graceful shutdown.
- Restart same DB restores sessions/room/game/deadlines.
