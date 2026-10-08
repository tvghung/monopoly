# RAM host, LAN and Online acceptance

## Automated evidence

- `[AUTO]` Server configuration starts without `DATABASE_URL`; `/healthz` and `/readyz` represent a live/shutting-down server (`apps/server/src/config.test.ts`, `createServer.test.ts`).
- `[AUTO]` In-memory transactions serialize direct writes and room commands. Failure discards the draft; room CAS rejects stale versions (`apps/server/src/persistence/inMemory.test.ts`, `services/roomCommandExecutor.test.ts`).
- `[AUTO]` Desktop starts one helper, retries automatic port collisions, and treats helper crash/failed readiness as terminal (`apps/desktop/tests/hostRuntime.test.ts`).
- `[AUTO]` Direct-link Online hosting works without a registry; a public route and existing room must be reached before showing a link (`apps/desktop/src/online/hostLifecycle.test.ts`).
- `[AUTO]` Tunnel loss replaces the public endpoint while keeping the same helper; helper loss is terminal and stops the tunnel (`apps/desktop/src/online/hostLifecycle.test.ts`).
- `[AUTO]` cloudflared preparation (`apps/desktop/tests/prepareCloudflared.test.ts`): the
  official Windows asset and the macOS `.tgz` are accepted only when the pinned archive
  digest and then the pinned executable digest match; a valid cached executable is accepted
  without a download and keeps its executable bit; a modified cached executable, also with a
  rewritten adjacent checksum, is removed and replaced; a failed replacement leaves no
  executable behind; a corrupted or truncated archive and an authentic archive that holds a
  different program are rejected before they reach `generated/`; incomplete hash metadata and
  an unsupported platform fail closed without any network request; the license text is pinned
  too. The cached path is exactly as strict as the fresh download.
- `[AUTO]` cloudflared at run time and in the package (`src/online/connectivity.test.ts`,
  `tests/checkPackagedBudget.test.ts`): the resolver accepts only the executable whose digest the
  manifest pins for the platform, ignores any adjacent checksum, never searches `PATH` and
  fails closed for an unpinned platform; the packaged-size check rejects a binary or license that
  is not the pinned build even when its sidecar was rewritten, and an `app.asar` without
  `cloudflared-integrity.json`. Positive path: a package built against matching pins passes.
- `[AUTO]` Quick Tunnel isolation and lifecycle (`src/online/connectivity.test.ts`): with no Cloudflare
  configuration and with a user's `TUNNEL_*` variables the launch is `tunnel --no-autoupdate
  --config <private empty file> --url <loopback origin>` with a scrubbed environment; the private
  directory is removed on stop, failure and exit; a startup failure, a spawn error and a start
  timeout reject cleanly; an unexpected exit is reported once; a recreated tunnel gets a new
  hostname and directory; the late exit of a stopped tunnel cannot disturb its replacement; only a
  root `trycloudflare.com` hostname is accepted from the process output.
- `[AUTO]` Online Host (`apps/desktop/tests/hostRuntime.test.ts`, `src/online/hostLifecycle.test.ts`): the
  public endpoint is presented only after the public readiness probe and client page answer; a tunnel
  start failure or an unreachable route fails the start and ends the server; a lost tunnel is recreated
  with a new hostname and the old link is withdrawn and never presented again; a tunnel that cannot be
  recreated leaves the healthy server running with no invitation; stopping the Host terminates the
  tunnel; helper loss is terminal for the match and the tunnel.
- `[SOCKET]` Host-only room creation, pending-admission lifecycle and request limits
  (`apps/server/src/hostAdmission.integration.test.ts`, desktop profile, real Socket.IO clients including a real
  non-loopback LAN peer): only the matching capability creates a room; a Guest that arrives first, forged
  `Origin`/`X-Forwarded-For`/`CF-Connecting-IP`/capability headers, a wrong or foreign capability and guessed
  codes all get `NOT_FOUND` and create nothing; `resume session` cannot carry a capability; a Guest's pending
  admission gets `ROOM_GONE` after its room is deleted, replaced or expired, and is never turned into a creation;
  Host and Guest racing in either order settle the same; an expired pending token creates nothing; four players
  behind one connector join, a fifth gets `ROOM_FULL`; one flooding visitor is limited (30 per minute) while
  another visitor and the Host are not; rotating a forwarded header buys nothing without an Online Host or from a LAN
  peer; a closed runtime answers join and resume with a sanitized, non-retryable error. Units:
  `socket/clientIdentity.test.ts` (peer and header rules, IPv6 grouping), `socket/admissionLimiter.test.ts` (window,
  global backstop, bounded state, overflow bucket, lazy expiry), `createServer.test.ts` (HTTP probe/static limiter keys).
- `[AUTO]` ACK errors (`apps/server/src/socket/errors.test.ts`, `persistence/inMemory.test.ts`): conflict stays
  retryable `CONFLICT`, missing room stays `ROOM_GONE`, a rolled-back or unexpected exception is a generic retryable
  `INTERNAL_ERROR` that leaks no message or code, a closed store is a non-retryable `INTERNAL_ERROR`, nothing maps to
  `DATABASE_UNAVAILABLE`, and the localized catalogs contain no database or durable-storage wording
  (`apps/client/src/i18n/catalog.test.ts`).
- `[AUTO]` Desktop IPC (`apps/desktop/tests/windowHandlers.test.ts`): the room-creation capability is returned only to the
  validated window, only for the room code that Host started, never in status, and a failed start returns none.
- `[BROWSER]` `pnpm test:e2e:mobile` runs Chromium and WebKit mobile flows against the `development` server
  profile (browser-created fixture rooms need open admission), serving the built client through the
  `configureApp` seam of `startAuthoritativeServer` and `apps/server/src/testing/serveBuiltClient.ts`; the
  production profile never serves a client in development. It checks mobile UI and gameplay only. Desktop-profile
  Host authorization is proven by the Socket, packaged Host and real-Electron checks.
- `[PACKAGED][WINDOWS-X64][PASS]` `pnpm desktop:package` and `pnpm desktop:proof:host` passed on 2026-10-08. The proof used a real Electron utility process and bundled client, four Socket.IO clients, LAN HTTP/discovery, reconnect, and rejection of the previous room/token after process restart.
- `[LIVE-TUNNEL][SAME-NETWORK][PASS]` `scripts/proveQuickTunnel.mjs` passed on 2026-10-08. Chromium opened the public `trycloudflare.com` page with invitation prefill; browser-origin Socket.IO polling succeeded. Four public WebSocket clients passed room-full/wrong-room rejection, reconnect and newest-connection replacement. It does not prove a second network or phone.

## Release checks still requiring separate execution

- `[MANUAL-E2E]` Windows and macOS installed hosts with other physical desktops and Android/iOS/tablet browsers on the same LAN, including no Internet and firewall prompts.
- `[MANUAL-E2E]` Host and clients on distinct Wi-Fi/cellular networks; open the HTTPS link, join and play a game on a real remote device.
- `[PACKAGED]` macOS x64 and arm64 build/proof, signing/notarization and execution of the bundled `cloudflared` binary.
- `[MANUAL-E2E]` Tunnel loss and changed hostname observed on a live game; new invitation delivered to disconnected clients.
- `[RELEASE]` A stable public hosting claim requires a named Cloudflare Tunnel and its account/domain provisioning. Quick Tunnels are officially for testing/development and offer no uptime guarantee.

No PostgreSQL, Docker/Render gameplay service, migration command or cross-restart match recovery belongs to the supported workflow.
