# Own the Block — Cờ Tỷ Phú Việt Nam

**Version 1.7.0 — bot players and Online join by code or link.** The host adds up to three Balanced bots in the lobby; one join field takes an `OTB-XXXXXX` code or an invitation link; a guest whose host link changed pastes the new link to return to the same seat; an optional room registry (`services/room-registry`) lets a code be found from another network. Socket protocol 12, snapshot schema 11 (1.6.x must update). Download the Windows/macOS packages from [GitHub Releases](https://github.com/tvghung/monopoly/releases/latest) after the `v1.7.0` release workflow completes. The installers are unsigned. (Version 1.6.1 brought the phone and tablet layout; 1.5.0 introduced RAM-only LAN & Cloudflare Online Multiplayer.)

Own the Block is a host-authoritative multiplayer Monopoly game. A Windows or macOS desktop player hosts a match; other players join from desktop or mobile browsers over the LAN or a temporary HTTPS Cloudflare Quick Tunnel invitation. The host's server process holds every room, reconnect session and offer in RAM. Stopping or crashing that process permanently ends its matches.

## Play

1. Open the desktop application and choose **LAN** or **Online** hosting.
2. Create a room. Online mode starts the bundled Cloudflare Tunnel automatically.
3. Copy the invitation link from the lobby and share it. The link includes the room code and points to the host's client and Socket.IO server.
4. Joiners open the link in a browser or paste it into the desktop Join form. LAN room-code discovery remains available on the same network.

No database, Node.js, developer tools, port forwarding or VPN is required on players' machines. Browser clients cannot host. The host must keep the desktop application and its Internet connection running for online play. A short client or tunnel interruption can reconnect while the original authoritative server remains alive; a new server process cannot restore the match.

## Development

Requires Node.js 24 and pnpm. From the repository root:

```bash
pnpm install
pnpm dev:web
pnpm dev:desktop
```

Checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm desktop:package
pnpm desktop:proof:host
```

The desktop package step downloads the pinned official `cloudflared` asset for the build platform and verifies its archive SHA-256 and extracted executable SHA-256 before bundling it. The cached copy, the packaged copy and the executable the app launches are all checked against the same pinned manifest, never against a checksum stored beside them, and the license text is pinned as well. Quick Tunnel runs with its own empty `--config` file and without `TUNNEL_*` variables, so an existing `~/.cloudflared/config.yml` or tunnel environment of the host can neither break it nor be changed by it. Supported package targets are Windows x64, macOS x64 and macOS arm64. The installed application does not download or update executable code. Build provenance and hashes are in [cloudflared-integrity.json](apps/desktop/cloudflared-integrity.json).

`pnpm --filter @monopoly/server exec node --import tsx ../../scripts/proveQuickTunnel.mjs` performs an optional live Quick Tunnel probe after `pnpm build` and `pnpm --filter @monopoly/desktop prepare:cloudflared`. It opens the public page in Chromium, checks invitation prefill and browser Socket.IO origin, then runs four WebSocket clients through the public URL. It checks room admission and reconnect before shutting down the tunnel and server. A successful probe from the build machine does not establish that a separate cellular or Wi-Fi network can join.

## Architecture

- `apps/desktop/`: Electron shell, host helper and tunnel lifecycle, LAN discovery, secure preload bridge and packaged resources.
- `apps/server/`: Express, Socket.IO, room authority, in-memory transaction store and deadline scheduler.
- `apps/client/`: React client shared by packaged desktop and host-served browsers.
- `packages/shared/`: protocol schemas, types, board and rules.
- [Project documentation](project-document/monopoly-websockets/README.md): current invariants, module guides and test evidence.

The in-memory store serializes transactions and direct writes. Room commands use draft snapshots and expected-version checks; success ACKs and broadcasts follow commit. The server stores only SHA-256 reconnect-token hashes. A new server process starts with an empty store, so old room codes and tokens are invalid.

Cloudflare Quick Tunnels are a personal-use/testing path with no uptime guarantee. [Cloudflare documents](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) that production deployments require a managed tunnel. A stable public release, macOS signing/notarization, and physical cross-network device checks need separate release evidence. The optional registry supports bare online room-code lookup; complete invitation links work without it.

Historical SQL migrations and the former cloud deployment design are superseded. There is no active database migration, PostgreSQL process, Docker deployment or cloud-hosted authoritative gameplay service in the supported workflow.
