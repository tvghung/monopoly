# Cờ Tỷ Phú Việt Nam

[![CI](https://github.com/terragady/monopoly-websockets/actions/workflows/ci.yml/badge.svg)](https://github.com/terragady/monopoly-websockets/actions/workflows/ci.yml)
![GitHub top language](https://img.shields.io/github/languages/top/terragady/monopoly-websockets)
![GitHub repo size](https://img.shields.io/github/repo-size/terragady/monopoly-websockets)
![GitHub last commit](https://img.shields.io/github/last-commit/terragady/monopoly-websockets)
![License](https://img.shields.io/github/license/terragady/monopoly-websockets)

![TypeScript](https://img.shields.io/github/package-json/dependency-version/terragady/monopoly-websockets/dev/typescript?logo=typescript&logoColor=white&label=TypeScript)
![React](https://img.shields.io/github/package-json/dependency-version/terragady/monopoly-websockets/react?filename=apps%2Fclient%2Fpackage.json&logo=react&logoColor=61DAFB&label=React)
![Vite](https://img.shields.io/github/package-json/dependency-version/terragady/monopoly-websockets/dev/vite?filename=apps%2Fclient%2Fpackage.json&logo=vite&logoColor=white&label=Vite)
![Socket.IO](https://img.shields.io/github/package-json/dependency-version/terragady/monopoly-websockets/socket.io?filename=apps%2Fserver%2Fpackage.json&logo=socketdotio&logoColor=white&label=Socket.IO)
![Express](https://img.shields.io/github/package-json/dependency-version/terragady/monopoly-websockets/express?filename=apps%2Fserver%2Fpackage.json&logo=express&logoColor=white&label=Express)
![pnpm](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fterragady%2Fmonopoly-websockets%2Fmain%2Fpackage.json&query=%24.packageManager&logo=pnpm&logoColor=white&label=pnpm&color=F69220)
![Node](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fterragady%2Fmonopoly-websockets%2Fmain%2Fpackage.json&query=%24.engines.node&logo=nodedotjs&logoColor=white&label=Node&color=5FA04E)

Trò chơi Cờ Tỷ Phú Việt Nam nhiều người chơi theo thời gian thực trên trình duyệt.
Tạo mã phòng, mời bạn bè và chơi cùng nhau.

Giao diện và nội dung người chơi đã được Việt hóa; các tên package kỹ thuật
`@monopoly/*` được giữ nguyên để tránh breaking change không cần thiết.

This started life as a small 2020 hobby project and has since been **rewritten from
the ground up**: the original single-file Express + Create React App codebase (one
global game, all logic on the client, easily cheated) is now a typed pnpm monorepo
with an **authoritative game server**, **isolated game rooms**, sanitised chat, and
an animated, polished UI. See [What changed in the rewrite](#what-changed-in-the-rewrite).

Everything that happens is written to the in-game log / chat — keep an eye on it!

## What changed in the rewrite

| Then (2020) | Now |
| --- | --- |
| Create React App + single `server.js` | pnpm monorepo — `apps/server`, `apps/client`, `packages/shared` |
| Plain JavaScript | End-to-end **TypeScript**, incl. typed Socket.IO event contracts |
| One global game for everyone | **Durable isolated rooms** — share a code to play together |
| Client decided dice, money & moves (cheatable) | **Server-authoritative** dice, movement, rent and turn order |
| A dropped socket deleted the player | **Stable player sessions** reclaim the same seat after refresh/reconnect |
| Process memory was the game store | **PostgreSQL-backed** rooms, sessions, offers and restart recovery |
| Chat rendered raw HTML (XSS) | Chat + names sanitised |
| Cơ Hội và Khí Vận dùng chung nguồn thẻ | Hai bộ thẻ có thứ tự, xáo trộn và phục hồi durable riêng |
| Static board, instant token jumps | **Animated** 3D dice, tile-by-tile token movement, card flips, modal prompts |
| Committed build output, mixed yarn/npm lockfiles | Clean workspace, single pnpm lockfile, Docker + Render deploy configs |

## Tech stack

- **Monorepo:** pnpm workspaces — `apps/server`, `apps/client`, `packages/shared`.
- **Server:** Express + Socket.IO (TypeScript, run directly with `tsx`). Commands
  are validated, serialized per room and committed before acknowledgement.
- **Client:** React 19 + Vite (TypeScript).
- **Persistence:** PostgreSQL relational metadata plus a versioned JSONB game
  snapshot. There is no production in-memory fallback.
- **Shared:** board data, card decks, runtime schemas and typed Socket.IO contracts
  imported by both sides via `@monopoly/shared`.

Front-end ⇄ back-end communication is over WebSockets. A player is identified by a
stable UUID, not by `socket.id`. A reconnect token stored in that browser reclaims
the same seat after a refresh, dropped connection or server restart. This is a
room-seat session, not an account or OAuth login.

## Getting started

Requires **Node 24 (LTS)** and **pnpm** (via `corepack enable`).

```bash
pnpm install
docker compose up -d postgres
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Server and database scripts load the root `.env` when it exists; shell environment
variables still take precedence.

`pnpm dev` / `pnpm dev:web` runs the web server and Vite client in parallel:

- server on `http://localhost:8080`
- client on `http://localhost:5173` (Vite proxies `/socket.io` to the server)

Open `http://localhost:5173`, enter a name and a **room code**, and share the code
with friends. A lobby supports 2–7 players. Every player must be connected and ready;
only the persisted host can start the game.

`pnpm dev:desktop` starts the same server/client pair and opens the hardened Electron
shell against `http://127.0.0.1:5173`. The desktop renderer receives only the typed
preload bridge; game state and commands remain in the existing client/server flow.
For a split-terminal workflow, run `pnpm dev:web` in Terminal A and
`pnpm dev:desktop:shell` in Terminal B; the shell command compiles main/preload and
does not own or stop the web processes.

The bundled PostgreSQL service maps host port `5433` to container port `5432`.
Keep the local `.env` `DATABASE_URL` host port aligned with that mapping before
running migrations or manual multiplayer checks.

### Useful scripts

```bash
pnpm dev         # run server + client together
pnpm dev:web     # run server + client together
pnpm dev:desktop # run web dependencies and the Electron shell
pnpm dev:desktop:shell # open only Electron; keep pnpm dev:web in another terminal
pnpm db:migrate  # apply pending PostgreSQL migrations
pnpm db:status   # inspect migration status
pnpm build       # build the client bundle
pnpm start       # start the server (serves the built client in production)
pnpm typecheck   # tsc --noEmit across all packages
pnpm lint        # eslint across the repo
pnpm test        # unit/client/socket tests; PostgreSQL suite is conditional
pnpm desktop:package # package the Windows/macOS Electron application
pnpm desktop:make    # create configured platform makers (Windows Squirrel on Windows)
```

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | local value in `.env.example` | Required by every real server start; tests may inject the in-memory adapter. |
| `DATABASE_SSL` | `false` | Enable TLS for PostgreSQL. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` | Certificate verification policy. |
| `DATABASE_MAX_CONNECTIONS` | `10` | PostgreSQL pool size. |
| `TEST_DATABASE_URL` | unset | Enables the PostgreSQL integration suite; pass it in the shell running `pnpm test`. |
| `PORT` | `8080` | HTTP/Socket server port. |
| `NODE_ENV` | `development` | `production` also serves the built client. |
| `CORS_ORIGIN` | Vite origin in development | Explicit cross-origin allowlist; not authentication. |
| `CLIENT_DIST` | `apps/client/dist` | Static client directory override. |
| `RECONNECT_GRACE_MS` | `60000` | Grace before an offline current player's turn is resolved. |
| `PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS` | `120000` | Thời hạn xử lý thanh toán thiếu hụt trước auto-liquidation xác định. |
| `PENDING_SESSION_TTL_MS` | `300000` | Unactivated first-join token TTL. |
| `TERMINAL_SESSION_RETENTION_MS` | `604800000` | Retain revoked/expired session rows for seven days before purge. |
| `LOBBY_RETENTION_MS` | `86400000` | Inactive lobby retention. |
| `IN_PROGRESS_RETENTION_MS` | `2592000000` | Inactive running-game retention. |
| `FINISHED_RETENTION_MS` | `604800000` | Finished-room retention. |

## Deployment

The Node server serves the built client from the same origin, so application code
ships as one service. PostgreSQL remains a required durable dependency. Run
migrations before accepting traffic; a schema/database failure makes readiness fail
instead of silently creating an in-memory game.

### Render (Blueprint)

A [`render.yaml`](./render.yaml) blueprint provisions a paid `starter` Node web
service and paid `basic-256mb` PostgreSQL database. The paid database is intentional:
durable games must not rely on an expiring/no-backup free database. The service also
has a 1 GB deployment-guard disk. No game data is written to that disk; its purpose
is to make Render stop the old process before starting its replacement, preserving
the runtime's single-live-process session and presence invariant during deploys.
Expect a brief reconnect while the browser resumes through its stable token.

In the Render dashboard: **New → Blueprint**, point it at this repo, review the paid
resources, and deploy. It runs:

```bash
# build
corepack enable && pnpm install --frozen-lockfile && pnpm build
# start (server applies guarded migrations before listen)
pnpm start
```

`/healthz` is liveness. `/readyz` checks the database/schema and is the deployment
health-check target.

### Docker / stop-first container platforms

A multi-stage [`Dockerfile`](./Dockerfile) builds the client and runs the server.

```bash
docker build -t monopoly-websockets .
docker run -p 8080:8080 -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... monopoly-websockets
# → http://localhost:8080
```

The current runtime supports one live Node process, including across a deployment.
Use a stop-before-start deployment strategy. A rolling platform that overlaps old
and new revisions is unsupported even when its steady-state maximum is one instance;
add distributed connection ownership, presence, room locking and a Socket.IO adapter
before enabling overlapping revisions or horizontal scaling.

## Gameplay FAQ

**How do I chat with other players?** There's a chat in the log panel — use it.

**Can spectators join?** Yes. Anyone who joins a room after its game has started
joins as an explicit spectator (and can still chat). A browser with a valid existing
player token reclaims that seat instead of becoming a spectator.

**What happens if I refresh or lose my network?** The browser reconnects with a
private token and resumes the same stable player. A newer connection using the same
token replaces the older one. Disconnecting does not sell, delete or transfer assets.

**How do I trade?**
- *Private sale:* click another player's property and submit an offer. The owner has
  20 seconds to accept or decline. Offers and expiry are server-authoritative and
  survive reconnect/restart.
- *Open market:* click your own property, choose **Sell**, and set a price. Any player
  in the room can then buy it; you can also pull it back off the market.

**What happens when I cannot pay?** The payment shortfall remains a durable ordered
claim. You can sell an owned property to the Bank at the server-derived gross/net
value, or propose that another active player buys it. On deadline, the server sells
properties deterministically by tile index and only eliminates the debtor after no
owned property remains.

**How do I win?** Be the last active player after the others go bankrupt or forfeit.

## Roadmap

- [x] pnpm monorepo + Vite + full TypeScript conversion
- [x] Server-authoritative state pushed to all clients
- [x] Server-side validation (reject out-of-turn / unaffordable / not-owner actions)
- [x] Isolated game rooms (share a room code to play together)
- [x] Chat input sanitisation (no HTML injection)
- [x] Separate, expanded Cơ Hội / Khí Vận decks with durable draw order
- [x] Animated 3D dice, tile-by-tile token movement, card flips and modal prompts
- [x] Building houses / hotels and the rent tiers they unlock
- [x] Base rent without monopoly multiplier; authoritative landing development prompt
- [x] Mortgaging properties for cash
- [x] Do Not Buy resolves the landing without an auction
- [x] Thẻ Thoát Tù Miễn Phí và trả 50 game-unit để ra tù
- [x] Property trading (private offers and an open market)
- [x] A dedicated win screen
- [x] Stable player identity, reconnect and newest-connection-wins sessions
- [x] Host/ready lobby with 2–7 players and explicit spectator admission
- [x] PostgreSQL persistence and restart recovery
- [x] Durable private offers, payment shortfall deadlines and private forced-sale proposals
