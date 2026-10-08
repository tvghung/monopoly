# RAM host, LAN and Online acceptance

## Automated evidence

- `[AUTO]` Server configuration starts without `DATABASE_URL`; `/healthz` and `/readyz` represent a live/shutting-down server (`apps/server/src/config.test.ts`, `createServer.test.ts`).
- `[AUTO]` In-memory transactions serialize direct writes and room commands. Failure discards the draft; room CAS rejects stale versions (`apps/server/src/persistence/inMemory.test.ts`, `services/roomCommandExecutor.test.ts`).
- `[AUTO]` Desktop starts one helper, retries automatic port collisions, and treats helper crash/failed readiness as terminal (`apps/desktop/tests/hostRuntime.test.ts`).
- `[AUTO]` Direct-link Online hosting works without a registry; a public route and existing room must be reached before showing a link (`apps/desktop/src/online/hostLifecycle.test.ts`).
- `[AUTO]` Tunnel loss replaces the public endpoint while keeping the same helper; helper loss is terminal and stops the tunnel (`apps/desktop/src/online/hostLifecycle.test.ts`).
- `[PACKAGED][WINDOWS-X64][PASS]` `pnpm desktop:package` and `pnpm desktop:proof:host` passed on 2026-10-08. The proof used a real Electron utility process and bundled client, four Socket.IO clients, LAN HTTP/discovery, reconnect, and rejection of the previous room/token after process restart.
- `[LIVE-TUNNEL][SAME-NETWORK][PASS]` `scripts/proveQuickTunnel.mjs` passed on 2026-10-08. Chromium opened the public `trycloudflare.com` page with invitation prefill; browser-origin Socket.IO polling succeeded. Four public WebSocket clients passed room-full/wrong-room rejection, reconnect and newest-connection replacement. It does not prove a second network or phone.

## Release checks still requiring separate execution

- `[MANUAL-E2E]` Windows and macOS installed hosts with other physical desktops and Android/iOS/tablet browsers on the same LAN, including no Internet and firewall prompts.
- `[MANUAL-E2E]` Host and clients on distinct Wi-Fi/cellular networks; open the HTTPS link, join and play a game on a real remote device.
- `[PACKAGED]` macOS x64 and arm64 build/proof, signing/notarization and execution of the bundled `cloudflared` binary.
- `[MANUAL-E2E]` Tunnel loss and changed hostname observed on a live game; new invitation delivered to disconnected clients.
- `[RELEASE]` A stable public hosting claim requires a named Cloudflare Tunnel and its account/domain provisioning. Quick Tunnels are officially for testing/development and offer no uptime guarantee.

No PostgreSQL, Docker/Render gameplay service, migration command or cross-restart match recovery belongs to the supported workflow.
