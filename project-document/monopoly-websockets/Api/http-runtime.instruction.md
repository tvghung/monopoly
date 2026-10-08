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
- Desktop Host uses the same local authority in LAN and Online modes: the game HTTP/Socket.IO server
  binds `0.0.0.0:<actual-game-port>` while managed PostgreSQL remains loopback-only;
  the host renderer connects to `127.0.0.1:<game-port>`.
- Desktop Join takes one room-code/invitation input. A code searches LAN UDP and
  the configured HTTPS registry concurrently; an invitation connects directly to
  its validated LAN IPv4 or `*.trycloudflare.com` endpoint. A configured developer/
  release endpoint may remain HTTP(S). There is no mDNS or periodic LAN advertisement.
- Desktop Socket.IO admits `app://own-the-block`, origin-less native clients, and
  HTTP IPv4 browser origins whose exact host/port matches HTTP `Host`. HTTPS Quick
  Tunnel browser origins match the public `Host`, or the local `127.0.0.1` service
  `Host` when the TCP peer itself is loopback (cloudflared's default rewrite).
  An unrelated browser origin is rejected. No wildcard is used.
- `CORS_ORIGIN` explicitly overrides the applicable development or production
  default.

No REST gameplay controller/auth route is added.

## Desktop Online host (Quick Tunnel + registry)

`apps/desktop/src/hostRuntime.ts` owns the lifetime of the existing local
PostgreSQL and authoritative server. `online/connectivity.ts` defines
`ConnectivityProvider`; `CloudflareQuickTunnel` is the current implementation.
`online/discovery.ts` defines `RoomDiscoveryProvider`; `HttpRoomDiscovery` is the
current registry client. Neither interface is imported by GameCore or Socket
command handlers. Native P2P would need a separate Socket.IO transport bridge.

Online creation reserves a random room code and opaque owner credential in the
registry, starts the local PostgreSQL/server, starts `cloudflared` without a
shell, checks the public `/readyz`, then joins through the existing loopback
Socket.IO admission. Only after the authoritative lobby exists does
`HostLanSharing` request registry activation. The registry verifies a random
reservation proof exposed by that host's server at `/_otb/registry-proof` via
the tunnel. The proof is not a room/session credential. A 30-second heartbeat
renews the 90-second active lease; an unactivated reservation lasts 180 seconds.
Host stop/quit revokes the lease, stops the tunnel, then stops the helper and
PostgreSQL. Unexpected tunnel exit hides the old link, suspends lookup and tries
two bounded restarts. A changed public URL updates the registry/link/QR if
activation succeeds; guests already connected to the old hostname must join
again. Registry failure does not stop the game or tunnel: direct invitations
remain available while the tunnel is healthy.

The deployable registry is `services/room-registry/` (Worker + SQLite-backed
Durable Objects). Per-code transactions make reservation/activation/collision
atomic. Owner credentials are generated in Electron main and sent only as
Bearer headers; the Worker stores their SHA-256 digest. The registry stores
only code, public endpoint, proof, digest and expiry. It validates endpoint
hostnames, verifies control through the tunneled proof route, limits request
body and per-IP request rate, and never proxies gameplay or stores game state.
`GET /healthz`, `POST /v1/rooms/:code/reserve`, `POST .../activate`, `POST
.../renew`, `POST .../suspend`, `DELETE /v1/rooms/:code`, and `GET
/v1/rooms/:code` form the HTTP API. Only lookup and health are unauthenticated.

### External setup (development/private testing)

1. Install `cloudflared` on a Windows or macOS **host** from the official
   [Cloudflare downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).
   Set `OWN_THE_BLOCK_CLOUDFLARED_PATH` to its absolute `cloudflared.exe`
   (Windows) or `cloudflared` (macOS) path, or put that binary on `PATH`.
   No binary is downloaded by the app. Quick Tunnels need no Cloudflare
   account/domain, but the registry does.
2. Create a Cloudflare account with Workers/Durable Objects access. From this
   repository root, authenticate with `npx wrangler login`, then run
   `npx wrangler deploy --config services/room-registry/wrangler.jsonc`.
   `wrangler.jsonc` declares SQLite-backed `RoomLease` and `RequestBudget`
   namespaces. Record the actual HTTPS Worker URL printed by Wrangler; do not
   invent one. Cloudflare's Free plan permits SQLite-backed Durable Objects.
3. Set `OWN_THE_BLOCK_REGISTRY_URL` to that exact HTTPS origin in the desktop
   process environment on **both** hosts and guests. The packaged app does
   not load `.env.example` automatically. For example, in PowerShell:

   ```powershell
   $env:OWN_THE_BLOCK_CLOUDFLARED_PATH = 'C:\path\to\cloudflared.exe'
   $env:OWN_THE_BLOCK_REGISTRY_URL = 'https://your-actual-worker.workers.dev'
   & 'C:\path\to\Own the Block.exe'
   ```

   On macOS, launch the app executable from the same Terminal environment:

   ```bash
   export OWN_THE_BLOCK_CLOUDFLARED_PATH=/path/to/cloudflared
   export OWN_THE_BLOCK_REGISTRY_URL=https://your-actual-worker.workers.dev
   "/Applications/Own the Block.app/Contents/MacOS/Own the Block"
   ```

The registry is required for **code-only Online join** and Online host setup;
an existing public invitation URL joins without a registry request. LAN mode
continues to work without these variables. PostgreSQL remains local and is
never the tunnel origin. The public tunnel serves the same bundled browser
client and Socket.IO endpoint; browser pages on LAN/Quick Tunnel host origins
select same-origin Socket.IO even if a separate web endpoint was embedded at
build time. CORS still checks approved origins and
desktop `allowRequest` still rejects unrelated browser origins. Socket
admission, command validation, reconnect-token hashing and per-peer admission
rate limits are unchanged. The desktop profile does not trust arbitrary
forwarded headers from LAN peers.

Quick Tunnel URLs are temporary and Cloudflare makes no uptime guarantee;
currently one tunnel/room per desktop Host is supported. This is a development
and private-testing path, not a production SLA. See
[Cloudflare Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
and [WebSocket support](https://developers.cloudflare.com/network/websockets/).

## LAN room lookup (desktop Host profile only)

A joining player types a room code, not an address. The lookup is request/response
over UDP port `41234`; it carries no credential and exists only in the desktop Host
profile: the desktop server helper starts it, while `apps/server/src/index.ts` (the
cloud and development servers) never does.

- **Responder** (`apps/server/src/lanDiscoveryResponder.ts`, started by
  `desktopServerHelper.ts` after the authoritative server listens, closed first on
  shutdown): a udp4 socket on `0.0.0.0:41234` with address reuse. A bind failure logs
  one short line and turns the lookup off; hosting is unaffected.
- **Request** (broadcast, JSON, at most 256 bytes, exactly these keys):
  `{app:'own-the-block', type:'find-room', v:1, protocol:<SOCKET_PROTOCOL_VERSION>, roomCode, nonce}`.
  `roomCode` follows the shared `roomCodeSchema`; `nonce` is `[A-Za-z0-9_-]{8,32}`.
  `protocol` is informational: a mismatch is reported by the Socket.IO handshake
  (`UPGRADE_REQUIRED`), not by silence.
- **Reply** (unicast to the sender): `{app:'own-the-block', type:'room-here', v:1, nonce, port}`
  with the game TCP port. The requester takes the Host address from the packet
  source. A reply never contains a token, hash, name, player, status, room list or
  database detail; the room code appears only in the request and is not a credential.
- **Guards, in this order**: size limit; token buckets (per sending address: burst 8,
  2 per second; all senders: burst 20, 10 per second) before any parsing or database
  call; strict parse; at most 4 concurrent lookups; the only database read is
  `persistence.rooms.findByCode(code)` existence. Everything else is dropped silently.
- **Finder** (`apps/desktop/src/lanFinder.ts`, Electron main process): for each usable
  interface (rank 0–2; virtual/VPN adapters only when nothing else exists; `/32`
  addresses dropped; at most six) one udp4 socket bound to that interface address
  sends the request to the directed broadcast and `255.255.255.255` at 0, 400 and
  1000 ms. A reply is accepted only when the nonce matches, the source port is
  `41234`, and the source is a usable LAN IPv4 inside the subnet of the receiving
  interface; the candidate must then answer `GET /healthz` with `ok` (1 s, at most
  two tries per endpoint). The first verified candidate wins; the search ends within
  3 s, is single-flight (the same code shares the search, another code replaces it)
  and always closes its sockets.
- **Result**: `{ok:true, endpoint:'http://<ip>:<port>'}` or `{ok:false, code}` with
  `NOT_FOUND` (nobody answered), `UNREACHABLE` (a Host answered but `/healthz` failed),
  `NO_NETWORK` (no usable interface), `UNAVAILABLE` (nothing could be opened or sent,
  for example the OS refuses broadcasts for the app).
- **IPC**: channel `ownTheBlock:lan:find-room`, sender-checked, strict payload
  `{roomCode}` (1–20 characters `[A-Za-z0-9-]`), handler removed when the window
  closes; preload exposes `lan.findRoom(roomCode)` only.
- **Interface choice**: `resolveNetworkInterfaces` drops `/32`, ranks virtual/VPN/
  hypervisor/personal-area adapters and `100.64.0.0/10` last, prefers the interface
  that carries the default route (`probeDefaultRouteAddress`: a UDP `connect` that
  sends nothing; boost only for rank 0–2), then ranks, then RFC 1918 before other
  ranges, then numeric address order. The Host runtime takes the first candidate; the
  choice stays sticky while that address exists.
- The wire constants are repeated in the finder (the main process has no runtime
  dependencies); `apps/desktop/tests/lanDiscoveryContract.test.ts` imports both sides
  and fails when they drift.

## Desktop quit channel (V1.1)

The launcher's "Thoát" button reaches the main process through one more typed channel, `ownTheBlock:quit:exit`
(`IPC_CHANNELS.quitExit`; preload `quit.exitApp()`, no payload). The handler checks the sender is the app window, then calls
`QuitRequestController.approveApplicationQuit()` and `app.quit()`. That is the road Cmd+Q and the end of a window close
already take: `before-quit` → `AppQuitCoordinator` → `stopRuntime()` (stops a running Host: the helper, then PostgreSQL) →
`armFinalWindowClose()` → quit. The renderer has already asked the player (central confirmation when a room is open), so the
approval makes the coordinator's own question to the renderer answer yes at once instead of waiting for it; the approval is
used once. The handler is removed when the window closes. No game command and no Node API reach the renderer; the preload
bridge stays whitelist-only (`apps/desktop/tests/preloadBridge.test.ts`).

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
- `[AUTO][PASS]` LAN room lookup: `apps/server/src/lanDiscoveryResponder.test.ts`
  (strict parsing, reply content, rate limits before any database call, silent for
  an unknown room or a database failure, bind failure keeps hosting, real loopback
  socket), `apps/desktop/tests/lanFinder.test.ts` (timeline, nonce/port/subnet
  checks, health check, failure codes, single flight, cleanup),
  `lanDiscoveryContract.test.ts` (constants equal on both sides; the real finder
  against the real responder over loopback UDP), `networkInterfaces.test.ts`,
  `hostRuntime.test.ts`, `windowHandlers.test.ts` (channel validation). No test uses
  a real broadcast.
- `[PACKAGED][NOT RUN]` The Phase 7.2 Host proof gained a loopback step
  (`lan-room-discovery-loopback`): the real finder must find the contract's room
  through the packaged helper and get nothing for an unknown room. It needs
  `pnpm desktop:package` and `pnpm desktop:proof:host` to run.
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
