# RAM hosting verification report — 2026-10-08

## Result by phase

| Phase | Status | Evidence boundary |
| --- | --- | --- |
| A — RAM migration | **PASS for automated implementation gate** | Production startup uses a fresh in-memory store without database configuration. Transaction, rollback, CAS, gameplay, reconnect and packaged process-restart checks pass. |
| B — LAN hosting | **PARTIAL** | Packaged Windows x64 helper serves the client and four Socket.IO players through a real LAN interface and LAN discovery; reconnect and process loss pass. Physical Windows/macOS and mobile clients on the same Wi-Fi, including offline LAN and firewall behavior, were not run. |
| C — Online links | **PARTIAL** | A live Quick Tunnel served the client to Chromium, accepted the browser origin and four public WebSocket clients, and passed admission/reconnect checks. Clients were run from this machine; independent Wi-Fi/cellular networks and a normal packaged UI session were not run. |
| D — release readiness | **PARTIAL** | Automated tests, mobile browser emulation, Windows package/installer/proof and documentation pass. macOS packaging, signed/notarized installers and physical cross-network gameplay remain unverified. |

## Executed checks

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed.
- `pnpm test`: passed with server 405, desktop 415 and client 2,199 tests before the final cleanup. After final cleanup, targeted full module suites passed: server 404, desktop 419 and client suite rerun. The server count dropped by one when the retired cloud-profile test was removed.
- `pnpm test:e2e:mobile`: four Chromium/WebKit mobile flow and audio tests passed against the RAM server, including invitation prefill, gameplay admission and reconnect.
- `pnpm desktop:make`: Windows x64 installer built. `pnpm desktop:proof:host` passed a real packaged helper with four clients, LAN HTTP/discovery, fifth-player and wrong-room rejection, stable identity/reconnect, newest-connection ownership, and rejection of the old room/token after helper restart.
- `scripts/proveQuickTunnel.mjs`: passed through a live public HTTPS endpoint. Chromium opened the invitation with the correct room prefill; Socket.IO browser-origin polling and four WebSocket clients passed. The tunnel and server were stopped afterward.
- A post-proof Windows process query found no `cloudflared.exe` or `OwnTheBlock.exe` processes running from this repository.
- The package budget check validates the bundled `cloudflared` binary, its SHA-256 digest, its Apache license, and absence of PostgreSQL resources. The Windows installer was about 145 MiB.
- `pnpm validate:release` passed metadata checks in unsigned-validation mode; signing is blocked and notarization was not run.

## Required manual release checks

1. Install and launch the Windows and macOS builds as a normal player. On macOS, build both x64 and arm64 packages and verify executable permissions, signing and notarization.
2. Play a complete LAN game with physical desktop and Android/iOS/tablet browsers on the same network, including a network with no Internet. Check firewall prompts, sleep, IP changes and host close.
3. Host Online on Windows and macOS; have another desktop and mobile browser join and play over independent Wi-Fi and cellular connections. Interrupt the tunnel during play, share the replacement link, then verify helper crash and application quit end the old room.
4. Observe repeated host start/stop cycles and process cleanup on both operating systems. Record any Cloudflare `429` or temporary-hostname behavior.

Cloudflare [documents Quick Tunnels as testing/development infrastructure](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), with temporary hostnames and no uptime guarantee. A stable public hosting claim requires a named tunnel and associated account/domain provisioning. The personal-use link workflow is implemented and verified to the extent recorded above; the independent-network completion gate remains open.
