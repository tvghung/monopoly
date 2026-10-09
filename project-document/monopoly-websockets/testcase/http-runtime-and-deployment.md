# RAM host, LAN and Online acceptance

## Automated evidence

- `[AUTO]` Server configuration starts without `DATABASE_URL`; `/healthz` and `/readyz` represent a live/shutting-down server (`apps/server/src/config.test.ts`, `createServer.test.ts`).
- `[AUTO]` In-memory transactions serialize direct writes and room commands. Failure discards the draft; room CAS rejects stale versions (`apps/server/src/persistence/inMemory.test.ts`, `apps/server/src/services/roomCommandExecutor.test.ts`).
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

## In-app update (desktop)

Module guide: [Client/app-update.instruction.md](../Client/app-update.instruction.md). Nothing here touches the socket
protocol, the snapshot or PostgreSQL.

> Restored on 2026-10-09 from the version before commit `bffc0da`, which removed this section by mistake while retiring
> PostgreSQL (other documents still linked to it). Item states are as recorded then; every named test file was re-checked to
> exist, and the automated rows run in `pnpm test` (desktop and client suites passed on `1937a73`). The v1.2.0 notes below are
> historical; current release records: [RELEASE_ACCEPTANCE_MATRIX.md](./RELEASE_ACCEPTANCE_MATRIX.md).

- [x] `[AUTO]` Semantic version precedence, including pre-releases and build metadata, and refusal of non-versions:
  `apps/desktop/tests/updateVersion.test.ts`.
- [x] `[AUTO]` The manifest parser accepts exactly the documented shape (schema, app, versions, asset key/name/size/SHA-256,
  and the Windows `squirrel` block with its `RELEASES` and package), refuses unsafe file names, a `RELEASES` that is not named
  `RELEASES`, a package that is not a `.nupkg`, implausible sizes and a minimum above the release, selects one platform's
  installer, picks the files an installation downloads (the Squirrel feed or the installer) and computes "mandatory" from the
  running version: `apps/desktop/tests/updateManifest.test.ts`.
- [x] `[AUTO]` The release tooling (`apps/desktop/scripts/updateManifest.mjs`) and the app (`src/update/`) agree: identity constants, version
  comparison over a precedence table, the generated manifest (with the Squirrel payload) read by the app's parser for every
  release target, the Squirrel package named as `forge.config.cjs` names it, and the download URL pattern:
  `apps/desktop/tests/updateManifestContract.test.ts`.
- [x] `[AUTO]` Staging copies the three installers and the Windows Squirrel feed, writes `update-manifest.json` from the very
  values of `SHA256SUMS.txt` and the policy, refuses a policy above the release or an installer the app would refuse, a missing,
  doubled, stale or altered feed file, and a `RELEASES` that does not describe exactly the staged package (name, size, SHA-1,
  one line; the byte order mark is read): `apps/desktop/tests/stageReleaseAssets.test.ts`. The reader was also run against the
  real `RELEASES` and package of a Forge build. The contract gate requires the policy, a plain `x.y.z` minimum not above the
  release and `reviewedForSocketProtocol` equal to the protocol: `scripts/validateV1Contract.check.mjs` (`pnpm test:v1-contract`).
- [x] `[AUTO]` The verified download, against a real HTTP server on loopback: exact bytes and monotonic progress, replacing a
  stale partial file, refusing a different checksum, a short or oversized body and a different announced size, an HTTP
  status, a redirect to an untrusted host (and following one between trusted hosts; Node's fetch reports where a response
  ended, Electron's `net.fetch` does not, so this check has no effect in the app), cancel, stall, header timeout, an
  unreachable server and an unwritable destination, each leaving no file: `apps/desktop/tests/updateDownloader.test.ts`.
- [x] `[AUTO]` `UpdateService` with fakes and a real temp directory: every check result (up to date, available, mandatory,
  offline, 404/503, bad JSON, other application, bad checksum, no installer for this platform, a Windows release without the
  Squirrel files, timeout, untrusted redirect), one shared request for overlapping checks, no re-check while an update is
  known, download of the Squirrel feed (never the `Setup.exe`) with one progress bar over two files and its throttle, the
  installer download of the open-installer mode, cancel back to "available", corruption/connection/server/disk-space/stall
  failures with a retry that downloads only the file still missing, the room asked for by Squirrel (and counting only the
  bytes still missing), reuse of staged files and refusal of an altered or half-staged feed, the installer running **before**
  the quit request and only once, install blocked while a room is open (and announced only when that changes), retry after a
  failed or throwing installer, either feed file altered after verification, the manual-restart watchdog, the open-installer
  mode, scheduled checks and clean-up of old staged updates, dispose, and a failing listener:
  `apps/desktop/tests/updateService.test.ts`.
- [x] `[AUTO]` The Squirrel in-place installer (`Update.exe --update=<folder>` with spaces and an accent in the path, exit codes,
  start failure, timeout without killing and without undoing under a running updater, an exit code of 0 whose new executable
  is missing, an unreadable install folder, the restart helper that outlives the app) over a temp install folder laid out like
  the real one, with every failure leaving the folder as it was; the open-installer mode and installer selection:
  `apps/desktop/tests/updateInstallers.test.ts`; `--squirrel-firstrun` is a normal run:
  `apps/desktop/tests/squirrelEvents.test.ts`.
- [x] `[AUTO]` The Squirrel guard: rollback of the empty new version folder, of the package Squirrel added, of a rewritten
  `RELEASES` (byte for byte, byte order mark included) and of a deleted package, the running version, the stub and `Update.exe`
  never touched, older version folders kept, a harmless no-op rollback, hard-link backups (and the copy when the file system
  has none), commit drops the backups, a leftover guard folder is never reused, a partial rollback is reported, and an install
  folder with no version folder is refused: `apps/desktop/tests/updateSquirrelGuard.test.ts`,
  `updateSquirrelGuardCopy.test.ts`.
- [x] `[AUTO]` The five update channels are sender-checked, take no payload (a hostile URL/path/version never reaches the
  updater), answer at once for download/install and push every state; the preload bridge exposes only those calls:
  `apps/desktop/tests/windowHandlers.test.ts`, `preloadBridge.test.ts`.
- [x] `[CLIENT]` The provider: inert without an updater or while unsupported, a pushed state beats a late first answer,
  "Để sau" per version and never for a mandatory update, the multiplayer lock, and when applying is allowed (outside a game,
  no room open, also the retry of a failed install): `apps/client/src/runtime/appUpdate.test.tsx`.
- [x] `[CLIENT]` Which dialog and which quiet line show for every combination of phase, mandatory, deferred, open room, form
  and game: `components/update/updateView.test.ts`; the Vietnamese copy (the owner's sentences verbatim, no technical word, a
  "game vẫn chơi được" tail on every optional failure): `updateCopy.test.ts`.
- [x] `[CLIENT]` The dialogs (offer, mandatory, restart question, install wait, retry of the failed step, focus on "Để sau"),
  the quiet line, the "Cập nhật" section of the settings dialog, the launcher lock ("Tạo phòng", "Tham gia phòng", "Máy chủ
  riêng" disabled, "Vào lại phòng đang mở" and "Đóng phòng" reachable) and the in-game toast:
  `components/update/UpdatePrompt.test.tsx`, `DesktopMultiplayerLauncher.update.test.tsx`, `settings/SettingsPanel.update.test.tsx`,
  `components/update/UpdateSessionNotice.test.tsx`.
- [ ] `[MANUAL-E2E]` The real Electron shell against a local fake feed (Windows 10, dev shell, Playwright driving the window):
  offer, download with a moving percentage, SHA-256-verified staged file, "Để sau", the settings section, a mandatory update
  (clean start, and with the installer already on disk), a failing feed, a corrupted download and its retry all behaved as
  described. The driver was a scratch script and is not committed; not a CI gate.
- [ ] `[PACKAGED]` The packaged Windows app (run from `out/`, not installed) ignores the development override, asks the real GitHub
  feed and, while the latest release has no `update-manifest.json` (a 404), stays fully usable: no dialog, every menu button
  enabled, Cài đặt says the check was not possible and that the game stays playable. Observed by the agent on 2026-10-05
  (scratch Playwright run, not committed, not a CI gate), so the row is not ticked.
- [ ] `[PACKAGED]` An installed Windows build updates itself in place. Observed by the agent on 2026-10-05 on a differently named
  test package installed by its own `Setup.exe` (scratch Playwright and PowerShell scripts, a local feed, not committed, not a
  CI gate; the real install was not touched and the test install was removed): the Squirrel feed is downloaded and never the
  `Setup.exe`, `Update.exe --update` runs while the old game keeps answering, the old game quits by itself and the new version
  is running 19.7 s after the click, shortcuts and the uninstall entry point at it, the same release is not offered again; a
  refused update leaves the install folder byte-identical and the shortcut still opens the old version; the path handed to
  `Update.exe` had spaces and an accent. Not ticked: nobody has seen it on a real release; the first real update is between two
  updater releases.
- [ ] `[PACKAGED]` Not covered above: a second consecutive Squirrel update, an update killed by the system, antivirus
  interference.
- [ ] `[PACKAGED]` macOS (x64 and arm64): the disk image downloads, verifies and opens. Not run (no Mac was available).
- [x] `[CI]` A tag run publishes `update-manifest.json` (with the Windows `squirrel` block), `RELEASES` and the `.nupkg` next to
  the installers, and `releases/latest/download/update-manifest.json` serves it. Run by the `v1.2.0` tag (Release v1.2.0 #6,
  2026-10-05): the publish job staged and uploaded the seven files, its step "Check that the update feed serves this release"
  passed, and the agent compared every size and SHA-256 in the live manifest with the digest GitHub shows for the asset (record
  in [V1_RELEASE_CONTRACT.md](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md#release-record-120)). No installed app has updated
  through it yet.
- [ ] `[MANUAL-E2E]` The rows of [V1 final manual acceptance](../../ui-ux-overhaul/V1_FINAL_MANUAL_ACCEPTANCE.md#in-app-update).

## Release checks still requiring separate execution

- `[MANUAL-E2E]` Windows and macOS installed hosts with other physical desktops and Android/iOS/tablet browsers on the same LAN, including no Internet and firewall prompts.
- `[MANUAL-E2E]` Host and clients on distinct Wi-Fi/cellular networks; open the HTTPS link, join and play a game on a real remote device.
- `[PACKAGED]` macOS x64 and arm64 build/proof, signing/notarization and execution of the bundled `cloudflared` binary.
- `[MANUAL-E2E]` Tunnel loss and changed hostname observed on a live game; new invitation delivered to disconnected clients.
- `[RELEASE]` A stable public hosting claim requires a named Cloudflare Tunnel and its account/domain provisioning. Quick Tunnels are officially for testing/development and offer no uptime guarantee.

No PostgreSQL, Docker/Render gameplay service, migration command or cross-restart match recovery belongs to the supported workflow.
