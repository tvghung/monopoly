# HTTP, LAN and online hosting

The desktop app starts one Electron utility-process helper. The helper binds the game HTTP/Socket.IO server to `0.0.0.0` on an OS-selected port, serves the bundled client, and answers room-code LAN discovery. The host renderer connects over `127.0.0.1`; other LAN devices use a real private IPv4 endpoint. The helper creates a fresh RAM store on start. Its exit ends every match; desktop reports a terminal host failure and never performs same-match helper recovery.

## HTTP surface

- `/healthz` returns `ok` while live and 503 during shutdown.
- `/readyz` returns `ready` while the live store/server is ready and 503 during shutdown.
- `/_otb/room?code=<ROOM_CODE>` is a rate-limited desktop probe for a known room code. It returns only 200/404, no game state or credential. The host checks it through the public route before publishing an online link.
- Static assets and the SPA fallback share the game server origin. Socket.IO uses its default path and is not throttled by the static asset limiter.

## LAN

The desktop chooses and advertises usable IPv4 interfaces, not loopback. Automatic port selection retries bounded bind conflicts. A desktop Join can discover a room by code through UDP; a full LAN invitation connects directly. LAN play and discovery require no Internet or Cloudflare account.

## Online

The package bundles a pinned, SHA-256 verified official `cloudflared` binary for Windows x64, macOS x64 or macOS arm64. The desktop launches a Quick Tunnel without a shell or manual installation. It retries public DNS/page/readiness checks for a bounded period, then checks the actual room through the public endpoint. Only then may the lobby copy a direct `https://<host>.trycloudflare.com/?room=<code>` link. The browser loads the client and Socket.IO from that same HTTPS origin.

Complete links bypass the optional registry. If configured, the registry can still resolve a bare online room code; reservation failure must not block direct-link hosting. A tunnel loss hides the old link, keeps the RAM match, and attempts bounded reconnection. If Cloudflare issues a new hostname, the host receives a new link; old clients must open it. Quick Tunnels are documented by Cloudflare as development/testing infrastructure, without an uptime guarantee. Stable production hosting would need a named tunnel and its account/domain setup.

The server permits the packaged `app://own-the-block` renderer and exact LAN/tunnel browser origins. Forwarded client IP headers are trusted only from a loopback peer; incoming commands remain schema checked and actor authenticated. When running an online room, the helper permits creation only for the host-selected code, preventing a tunneled loopback peer from creating an unrelated room.

The optional live probe is `scripts/proveQuickTunnel.mjs`; it verifies a public page and four Socket.IO clients through a real Quick Tunnel. Cross-network desktop/mobile acceptance still requires physical devices on independent networks. The retired Docker/Render deployment and PostgreSQL setup are outside the current architecture.
