# HTTP runtime, database readiness và deployment

## Surface

- `GET /healthz`: public liveness; process is running.
- `GET /readyz`: readiness; PostgreSQL reachable and schema compatible.
- Cloud and desktop profiles serve an explicit static client root plus SPA fallback.
- Cloud trusts exactly one reverse-proxy hop and limits static/SPA requests to
  1,000 per IP per 15 minutes; Socket.IO and health routes are outside that limiter.
- Socket.IO shares the HTTP server at default path/namespace.

Development endpoint contract:

- Game server and Socket.IO server: `http://127.0.0.1:8080`.
- Vite renderer origin: `http://127.0.0.1:5173`.
- Socket.IO development CORS default: exactly `http://127.0.0.1:5173`.
- Desktop Host uses the explicit LAN profile: the game HTTP/Socket.IO server
  binds `0.0.0.0:<actual-game-port>` while managed PostgreSQL remains loopback-only;
  the host renderer connects to `127.0.0.1:<game-port>`.
- Desktop Join accepts an explicit validated HTTP IPv4/port plus room code. A
  configured developer/release endpoint may remain HTTP(S); no UDP/mDNS discovery
  path exists.
- Desktop Socket.IO admits `app://own-the-block`, origin-less native clients, and
  browser origins whose exact host/port matches the HTTP `Host` header. An unrelated
  browser origin is rejected. No wildcard is used.
- `CORS_ORIGIN` explicitly overrides the applicable development or production
  default.

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

- `PORT` default `8080`; desktop accepts `0` and reports the actual OS-selected port.
- `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`,
  `DATABASE_MAX_CONNECTIONS`.
- `RECONNECT_GRACE_MS=60000`, `PENDING_SESSION_TTL_MS=300000`,
  `TERMINAL_SESSION_RETENTION_MS=604800000`.
- `LOBBY_RETENTION_MS=86400000`, `IN_PROGRESS_RETENTION_MS=2592000000`,
  `FINISHED_RETENTION_MS=604800000`.
- Existing `NODE_ENV`, `CORS_ORIGIN`, `CLIENT_DIST` behavior remains. In development,
  the default `CORS_ORIGIN` is `http://127.0.0.1:5173`. Desktop requires an absolute
  explicit client distribution and applies its dynamic Electron/same-origin policy;
  `CORS_ORIGIN` remains an explicit override.

Room code and CORS are not authentication. Browser CORS authorizes whether a
browser may expose a transport response to a requesting origin; it is not a
server-side rejection or authentication mechanism for arbitrary WebSocket clients.

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

### Phase 7.2 automated evidence

- `[PACKAGED][PASS-WINDOWS]` The separate Host proof starts packaged PostgreSQL
  on loopback, starts the external helper on `0.0.0.0` with an OS-selected port,
  verifies health/readiness, serves the bundled renderer/asset, checks Electron
  and browser same-origin admission plus unrelated-origin rejection, reaches a
  real local IPv4 candidate, and shuts down cleanly.
- `[SOCKET][PACKAGED][PASS-WINDOWS]` Four real protocol-V8 clients share one room,
  the fifth receives `ROOM_FULL`, reconnect preserves identity/room, newest
  connection wins, and helper/PostgreSQL restarts retain the room/session and
  deadline recovery.
- `[AUTO][PASS]` `createServer.test.ts` covers desktop static root, asset, SPA,
  origin, no cloud proxy trust, plus unchanged cloud/development policies.
- `[NOT RUN/BLOCKED]` Database integration requires `TEST_DATABASE_URL`; local
  `db:status` without the configured PostgreSQL service is not a substitute.
- `[MANUAL DEFERRED / NOT RUN]` Physical Windows/macOS host/join, real phones,
  firewall prompts, and install/upgrade/uninstall remain separate evidence.

- Liveness/readiness under healthy/unhealthy DB.
- Missing config/schema mismatch fail before listen.
- Static/SPA/CORS and Socket proxy behavior.
- Clean migration/status, production image start and graceful shutdown.
- Restart same DB restores sessions/room/game/deadlines.
- The Phase 7.0 packaged proof remains an independent regression gate. The Phase
  7.2 Host proof adds product-stack LAN-equivalent and recovery evidence; neither
  is physical desktop-to-desktop acceptance.
