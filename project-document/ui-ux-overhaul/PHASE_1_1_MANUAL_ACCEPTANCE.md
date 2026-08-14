# Phase 1.1 — Manual acceptance procedure

This checklist is for Phase 1 desktop/presentation acceptance only. It does not
start Phase 2 board work or any character/audio/particle implementation.

## Environment

1. Enable Corepack and install dependencies with `pnpm install`.
2. Start PostgreSQL with `docker compose up -d postgres`. The compose file maps
   host `localhost:5433` to container port `5432`; set the local `.env`
   `DATABASE_URL` to the host port (`...@localhost:5433/monopoly`).
3. Run `pnpm db:status` and, when the database is available, `pnpm db:migrate`.
   Record a database-unavailable result as environment-blocked; do not call the
   integration path passed.

## Launch paths

- Development endpoint contract: Vite/Electron renderer
  `http://127.0.0.1:5173`; game/Socket.IO server `http://127.0.0.1:8080`; server
  development CORS origin exactly `http://127.0.0.1:5173`.
- Web: Terminal A, `pnpm dev:web`; open `http://127.0.0.1:5173`. Verify
  `http://127.0.0.1:8080/healthz` and `/readyz` before joining a room.
- All-in-one desktop: stop the separate web processes, then run
  `pnpm dev:desktop`. Confirm the shell compiles `dist/main.js` and the bundled
  `dist/preload.js` before opening the renderer.
- Shell-only desktop: keep Terminal A `pnpm dev:web` alive, then run
  `pnpm dev:desktop:shell` in Terminal B. Closing the Electron shell must not stop
  the server/client processes in Terminal A.
- Packaged desktop: run `pnpm desktop:package` and launch the generated executable;
  `pnpm desktop:make` creates the configured platform maker artifact.

## Manual scenarios

Record date, OS, commit, database availability, and result for each scenario.

- [ ] Two browser/desktop clients join the same room with distinct names; the
  server-assigned player identity remains stable after reconnect.
- [ ] Host start, ready state, dice, purchase/development, trade, forced-sale,
  jail, and spectator actions retain their existing authoritative/permission
  behavior. Reconnecting or spectator clients cannot mutate gameplay.
- [ ] Change native fullscreen externally, open settings, and verify the toggle
  follows native state. Turn fullscreen on, choose `Khôi phục mặc định`, and verify
  both the UI and the native window leave fullscreen without a loop.
- [ ] While a token movement is running, enable reduced motion or use skip-all.
  The board immediately shows the newest accepted state and does not replay an old
  movement after the queue settles.
- [ ] In an active game choose window close. Confirming closes/disconnects without
  emitting `leave room`; reopen/reconnect with the stored session. The explicit
  `Bỏ cuộc` action still asks for confirmation and emits the leave operation.
- [ ] In production/package mode, Ctrl/Cmd+R, Ctrl/Cmd+Shift+R, F5, Alt+Left/
  Alt+Right, and browser back/forward do not reload or navigate. DevTools are
  available only in development.
- [ ] The join, loading, lobby, packaged title, document title, application-name
  metadata, and accessibility labels show `Own the Block` with the Vietnamese
  descriptor `Cờ Tỷ Phú Việt Nam`. Lobby character UI is visibly a placeholder only.

## Evidence boundary

Windows package/maker validation can be recorded locally. macOS packaging is
validated by the macOS CI matrix or a macOS run; a Windows run must not be reported
as a macOS pass. Native final artwork (`.icns`), signing, notarization, updater,
and Phase 2+ visuals are intentionally out of Phase 1.1 scope.
