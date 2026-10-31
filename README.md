# Own the Block — Cờ Tỷ Phú Việt Nam

**Latest published version: 1.9.1.** This release includes the rc.2 Online hosting reliability fix. The host can add up to three bots; guests join by code or invitation link. An optional room registry (`services/room-registry`) supports Online code lookup. Socket protocol is 14, snapshot schema is 11, and the minimum supported version is 1.9.0. Download published Windows/macOS packages from [GitHub Releases](https://github.com/tvghung/monopoly/releases/latest). The installers are unsigned.

Own the Block is a host-authoritative multiplayer Monopoly game. A Windows or macOS desktop player hosts a match; other players join from desktop or mobile browsers over the LAN or a temporary HTTPS Cloudflare Quick Tunnel invitation. The host's server process holds every room, reconnect session and offer in RAM. Stopping or crashing that process permanently ends its matches.

## Play

1. Open the desktop application and choose **LAN** or **Online** hosting.
2. Create a room. Online mode starts the bundled Cloudflare Tunnel automatically.
3. Copy the invitation link from the lobby and share it. The link includes the room code and points to the host's client and Socket.IO server.
4. Joiners open the link in a browser or paste it into the desktop Join form. LAN room-code discovery remains available on the same network.

No database, Node.js, developer tools, port forwarding or VPN is required on players' machines. Browser clients cannot host. The host must keep the desktop application and its Internet connection running for online play. A short client or tunnel interruption can reconnect while the original authoritative server remains alive; a new server process cannot restore the match.

### Hosting and reconnecting

- **Keep the host running.** Closing the host application stops the server for everyone and ends the match permanently. During an active game the app shows a confirmation and waits for your answer; closing from the lobby or after the game ends stops the room without asking. Rooms live only in the host's memory, so reopening the app cannot bring a match back.
- **Dropped connection.** A player who loses connection rejoins the same seat automatically while the host keeps running. If the current player stays disconnected, the game waits about 60 seconds and then skips that turn; bots never take over a human seat.
- **Online link changed.** A Quick Tunnel address is temporary. If a guest cannot reconnect for about 20 seconds, the "Mất kết nối" dialog accepts the new invitation link from the host and returns the guest to the same seat.
- **LAN.** Players on the same network can type the room code; the desktop app finds the host on the LAN.

> **1.9.1 Online hosting note.** Online room creation retries temporary DNS/readiness failures and uses Electron resolver diagnostics while keeping public HTTPS and room checks mandatory. The owner reports repeated success with rc.2 on a Windows PC where 1.9.0 and rc.1 failed, but startup still takes roughly 40–90 seconds there. The cause has not been isolated, and the stable build has not been tested on that PC. Cross-network guest joining and real macOS hosting have not been independently confirmed. See the [Documentation Hub](project-document/README.md).

## Development

Requires Node.js 24 and pnpm. From the repository root:

```bash
pnpm install
pnpm dev:desktop
```

`pnpm dev:desktop` prepares the pinned, verified cloudflared binary, compiles the desktop/helper, and starts the web
processes and Electron. Do not also run `pnpm dev:web` in this mode. Alternatively, run `pnpm dev:web` in Terminal A and
`pnpm dev:desktop:shell` in Terminal B. Renderer: `http://127.0.0.1:5173`; standalone server: port 8080; desktop Host: its own
automatically selected port. Close the test app/Host before rebuilding its helper. Stop development terminals with Ctrl+C.
If binary preparation fails offline, LAN still opens; Online requires a successful
`pnpm --filter @monopoly/desktop prepare:cloudflared`. This is developer preparation; installed apps use their bundled binary.

Checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:docs
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
- [Documentation Hub](project-document/README.md): where every current rule, module guide and test checklist lives, and how released behavior differs from the development branch. Technical index: [project-document/monopoly-websockets](project-document/monopoly-websockets/README.md).

The in-memory store serializes transactions and direct writes. Room commands use draft snapshots and expected-version checks; success ACKs and broadcasts follow commit. The server stores only SHA-256 reconnect-token hashes. A new server process starts with an empty store, so old room codes and tokens are invalid.

Cloudflare Quick Tunnels are a personal-use/testing path with no uptime guarantee. [Cloudflare documents](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) that production deployments require a managed tunnel. Physical cross-network device checks need separate release evidence. The optional registry supports bare online room-code lookup; complete invitation links work without it.

Historical SQL migrations and the former cloud deployment design are superseded. There is no active database migration, PostgreSQL process, Docker deployment or cloud-hosted authoritative gameplay service in the supported workflow.
