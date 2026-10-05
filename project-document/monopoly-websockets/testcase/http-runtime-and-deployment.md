# Checklist — PostgreSQL, HTTP runtime và deployment

## Automated evidence

- `[AUTO]` Config validation/defaults: `apps/server/src/config.test.ts`.
- `[AUTO]` HTTP liveness/readiness/shutdown projection: `apps/server/src/createServer.test.ts`.
- `[AUTO]` Snapshot version/UUID/active-member inverse gates: `apps/server/src/rooms.test.ts`.
- `[AUTO]` Due buy/development/payment/room cleanup: `apps/server/src/services/deadlineScheduler.test.ts`.
- `[AUTO]` Test-adapter terminal retention: `apps/server/src/persistence/inMemory.test.ts`.
- `[AUTO]` Migration order/checksum/required-table SQL:
  `apps/server/src/persistence/migrations.test.ts`.
- `[PG-INTEGRATION]` Repository/CAS/hash/rollback/session-retention tests:
  `apps/server/src/persistence/postgres.integration.test.ts` when test DB configured.
- `[SOCKET-INTEGRATION]` A failure-injected transaction mutates its draft then throws
  a simulated DB outage; `apps/server/src/socket.integration.test.ts` asserts retryable
  `DATABASE_UNAVAILABLE`, no `update`, and byte-for-byte unchanged room/version.
- `[PG-INTEGRATION][SOCKET-INTEGRATION]` Conditional fresh-pool/server restart:
  `apps/server/src/socket.integration.test.ts` when test DB configured.

## Checklist

- [ ] Clean PostgreSQL runs migrations once; `db:status` reports current schema.
- [ ] Forward migration stores canonical bilateral TradeBundle offer terms and
  snapshot schema version 4 without destructive down migration.
- [ ] Any real server start with missing/invalid `DATABASE_URL` or incompatible schema
  fails before listen.
- [ ] No production in-memory fallback exists.
- [ ] `/healthz` remains liveness; `/readyz` reports healthy/unhealthy DB/schema.
- [ ] DB save failure returns retryable ACK, leaves revision unchanged and emits no update.
- [ ] Snapshot round-trip preserves stable references; unknown/deep-malformed fields,
  cross-reference/invariant failures, over-500 logs and non-v8 version fail explicitly.
- [ ] Expected-version conflict cannot silently overwrite a newer room.
- [ ] Local `compose.yaml` + `.env.example` support migrate/dev/restart workflow.
- [ ] Production same-origin static/SPA and Socket.IO work; development defaults to
  `http://127.0.0.1:5173`, packaged Electron defaults to `app://own-the-block`, and
  `CORS_ORIGIN` overrides the applicable default. CORS is browser authorization,
  not authentication or server-side rejection of arbitrary WebSocket clients.
- [ ] Desktop Host starts managed PostgreSQL on loopback and the authoritative
  game server on the selected LAN-capable port; PostgreSQL is not LAN reachable.
- [ ] Desktop Join takes a room code, finds the Host through the LAN room lookup (or,
  after a failed lookup, a pasted invitation link) and verifies it with `/healthz`
  before creating the gameplay socket; configured developer/release endpoints remain a
  separate HTTP(S) override.
- [ ] Physical Windows/macOS host/join pairs, reconnect, 2/3/4-player lobby,
  manual fallback, and host loss are recorded separately as manual acceptance.
- [ ] Production proxy/static limiter uses one trusted hop and does not throttle
  Socket.IO or health probes.
- [ ] CI migrates PostgreSQL before integration tests and runs typecheck/lint/test/build.
- [ ] Container/Render starts migration-guarded app and uses `/readyz` health check.
- [ ] Render deployment uses the paid starter service and deployment-guard disk;
  replacement starts only after the previous process stops (brief token-based
  reconnect is expected).
- [ ] Rolling revisions/horizontal replicas remain disabled until distributed
  connection ownership, presence, locking and Socket.IO fan-out are implemented.
- [ ] SIGTERM stops commands and closes scheduler/socket/http/pool without fake turn grace.
- [ ] Scheduler/bootstrap/listen failure before ready closes opened Socket.IO/DB resources.
- [ ] Backup/forward-fix procedure avoids destructive down migration.

## Phase 7.2 evidence

- `[AUTO][PASS]` Desktop tests prove single-start, helper-before-database shutdown,
  renderer-independent ownership, bounded helper/database recovery, actual-port
  propagation, IPv4 filtering/selection/refresh, safe status projection, and
  validated sender-scoped IPC.
- `[PACKAGED][PASS-WINDOWS]` The Host proof validates the external helper/client
  resources, PostgreSQL loopback, authoritative `0.0.0.0` bind, actual port,
  health/readiness, bundled page/asset, explicit origin policy, real local IPv4
  access, four-client capacity/reconnect/newest-wins, restart retention, deadline
  recovery, redaction, and ordered clean shutdown.
- `[BROWSER][PASS]` Mobile Chromium and WebKit load the host-served page, prefill
  without auto-submit, join/lobby/start, exercise portrait/landscape boundaries,
  legacy rendering, settings/audio UI, reload resume, and offline/online recovery.
- `[AUTO][PASS]` Application-level quit coordination is idempotent: cancellation
  leaves runtime resources running; confirmed quit stops runtime once and closes
  only after cleanup.
- `[NOT RUN/BLOCKED]` Local `db:status` is blocked when PostgreSQL is unavailable;
  this does not replace configured PostgreSQL integration evidence.
- `[MANUAL DEFERRED / NOT RUN]` Physical Windows/macOS LAN pairs, real devices,
  firewall/network-isolation behavior, install, upgrade, and uninstall remain
  separate.

## V1.1 LAN room lookup (owner feedback 5 and 6)

The desktop Join finds the Host from the room code; the Host form drops the network
choice. Design and wire contract: [Api/http-runtime.instruction.md](../Api/http-runtime.instruction.md).

- [x] `[AUTO]` The responder parses only an exact `find-room` (at most 256 bytes, exact keys, shared room-code schema, nonce
  pattern), replies with the nonce and the game port only, answers only for a room that exists, applies its token buckets
  before any database call, caps concurrent lookups, stays silent on a database failure, and a bind failure leaves hosting
  unaffected: `apps/server/src/lanDiscoveryResponder.test.ts` (including one real loopback socket).
- [x] `[AUTO]` The finder sends from every usable real interface to the directed and the limited broadcast at 0, 400 and
  1000 ms, accepts only a reply with the right nonce, port and subnet, verifies `/healthz`, reports `NOT_FOUND`,
  `UNREACHABLE`, `NO_NETWORK` and `UNAVAILABLE`, is single-flight, ends within 3 s and closes every socket:
  `apps/desktop/tests/lanFinder.test.ts` (fake sockets; no real broadcast).
- [x] `[AUTO]` The repeated wire constants agree on both sides and with `SOCKET_PROTOCOL_VERSION`, and the real finder finds
  a room through the real responder over loopback UDP: `apps/desktop/tests/lanDiscoveryContract.test.ts`.
- [x] `[AUTO]` Interface choice without a dropdown: `/32` dropped, virtual/VPN/`100.64.0.0/10` last, the default-route boost
  only for a real adapter, RFC 1918 then numeric tie-break, and a Host start without an address uses the result:
  `apps/desktop/tests/networkInterfaces.test.ts`, `hostRuntime.test.ts`.
- [x] `[AUTO]` The IPC channel `ownTheBlock:lan:find-room` is sender-checked, strict, absent without a finder and removed
  with the window: `apps/desktop/tests/windowHandlers.test.ts`.
- [x] `[AUTO]` The quit channel `ownTheBlock:quit:exit` (V1.1, the launcher's "Thoát") is sender-checked, takes no payload, quits
  the application once without a second question to the renderer, approves only that one quit, ends in the same
  `AppQuitCoordinator` shutdown as closing the window (Host stopped, then final close armed, then quit) and is removed with the
  window: `apps/desktop/tests/windowHandlers.test.ts`.
- [x] `[AUTO]` The preload bridge exposes one typed object and no raw `ipcRenderer`; its quit group is exactly
  `onQuitRequested`, `respond` and `exitApp`; `exitApp()` invokes `ownTheBlock:quit:exit` with no payload; every channel the bridge
  uses is a known `IPC_CHANNELS` value: `apps/desktop/tests/preloadBridge.test.ts` (with `preloadBundle.test.ts` for the bundle).
- [ ] `[PACKAGED]` The real "Thoát" on a packaged build (a running Host's helper and PostgreSQL stop, the window closes). Not
  automated: see [V1 final manual acceptance](../../ui-ux-overhaul/V1_FINAL_MANUAL_ACCEPTANCE.md#main-menu-and-way-back-v11).
- [ ] `[PACKAGED]` The Phase 7.2 Host proof step `lan-room-discovery-loopback` passes on Windows x64, macOS x64 and macOS
  arm64. _(Added with this change; not run by its author.)_
- [ ] `[MANUAL-E2E]` Two physical PCs: discovery by room code, firewall prompt, guest Wi-Fi fallback, macOS Local Network
  permission. The rows are in [V1 final manual acceptance](../../ui-ux-overhaul/V1_FINAL_MANUAL_ACCEPTANCE.md#lan-room-lookup-v11).

## V1 release publication

- [x] `[AUTO]` Staging keeps exactly the three installers plus `SHA256SUMS.txt` and `update-manifest.json` under the release
  names, checks each installer against the version, platform, architecture and checksum in its build job's `manifest.json`,
  and fails on a missing, doubled, altered or unlisted file: `apps/desktop/tests/stageReleaseAssets.test.ts`.
- [x] `[CI]` Pushing `v<version>` (equal to the root `package.json` version, with `.github/release-notes/<tag>.md`)
  runs the Release Candidate quality job and its three targets and, only when all pass, publishes the GitHub Release with
  the three installers and `SHA256SUMS.txt`. _(Exercised once: `v1.0.0`, Release Candidate run #3, `36981843076`,
  2026-10-02, all jobs passed and the release was published; see the release record in the
  [V1 release contract](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md#release-record).)_
- [ ] `[CI]` A tag that differs from the root version, or has no release notes, fails in the first job before any build, and
  a manual dispatch publishes nothing. _(Follows from the step and the `publish` job's `if:` condition; no run has
  exercised these negative paths.)_

## V1.1.1 lean desktop package

- [x] `[AUTO]` The PostgreSQL runtime filter keeps the six binaries `managedPostgres.ts` runs, their whole Windows DLL
  import closure, the server modules under `lib/*.dll`, `share/` and the client tools, and drops link-time libraries,
  `lib/pgxs`, `lib/pkgconfig`, the StackBuilder GUI and the DLLs outside the closure; macOS drops only link-time files; an
  exclude pattern that would drop a required binary is rejected: `apps/desktop/tests/postgresRuntimeFilter.test.ts`.
- [x] `[AUTO]` Locale pruning keeps exactly `en-US.pak` and `vi.pak` on Windows, refuses to prune when either is missing,
  and only lists the macOS locale bundles: `apps/desktop/tests/pruneElectronLocales.test.ts`.
- [x] `[AUTO]` The size budget reads `app.asar` from its header and fails when it packs `generated/`, `src/`, `tests/` or
  `scripts/`, when an excluded PostgreSQL file or an extra locale ships, when a required binary is missing, or when the
  Windows Setup.exe exceeds its budget: `apps/desktop/tests/checkPackagedBudget.test.ts`.
- [x] `[CI]` The `Archive Evidence` workflow published the evidence of commit `9c79c29` as the pre-release
  `evidence-visual-v2-2026-10-02` (run `37147251894`): the zip's `FILES.sha256` lists 1,130 files, every SHA-256 equals the
  committed blob, and `releases/latest` still points at the game release `v1.1.0`. Checked before the PNGs left `main`.
- [x] `[AUTO]` The installer budgets (Windows `Setup.exe` 175 MiB, macOS `.dmg` 195 MiB) flag an installer over budget and
  ignore other files, and stay below the sizes before the slimming work: `apps/desktop/tests/checkPackagedBudget.test.ts`.
- [x] `[CI]` Desktop Build runs `proof:packaged:budget` on the real packaged app after the packaged proofs, and the Windows and
  macOS runtime, Host, audio, card and landmark proofs pass with the pruned PostgreSQL and the Ogg music (runs `37145323205`,
  `37147002597`, `37147677938`); macOS also runs `hdiutil verify` on the LZMA disk image. Release Candidate carries the same
  steps and passed them on the `v1.1.1` tag run (`37167178261`) for Windows x64, macOS x64 and macOS arm64.
- [ ] `[PACKAGED]` A fresh install of the lean Windows Setup.exe hosts a LAN game, survives an app restart with the same
  room, and uninstalls cleanly. Not automated.

## In-app update (desktop)

Module guide: [Client/app-update.instruction.md](../Client/app-update.instruction.md). Nothing here touches the socket
protocol, the snapshot or PostgreSQL.

- [x] `[AUTO]` Semantic version precedence, including pre-releases and build metadata, and refusal of non-versions:
  `apps/desktop/tests/updateVersion.test.ts`.
- [x] `[AUTO]` The manifest parser accepts exactly the documented shape (schema, app, versions, asset key/name/size/SHA-256),
  refuses unsafe file names, implausible sizes and a minimum above the release, selects one platform's installer and computes
  "mandatory" from the running version: `apps/desktop/tests/updateManifest.test.ts`.
- [x] `[AUTO]` The release tooling (`scripts/updateManifest.mjs`) and the app (`src/update/`) agree: identity constants, version
  comparison over a precedence table, the generated manifest read by the app's parser for every release target, and the
  download URL pattern: `apps/desktop/tests/updateManifestContract.test.ts`.
- [x] `[AUTO]` Staging writes `update-manifest.json` from the very values of `SHA256SUMS.txt` and the policy, and refuses a policy
  above the release or an installer the app would refuse: `apps/desktop/tests/stageReleaseAssets.test.ts`. The contract gate
  requires the policy, a plain `x.y.z` minimum not above the release and `reviewedForSocketProtocol` equal to the protocol:
  `scripts/validateV1Contract.check.mjs` (`pnpm test:v1-contract`).
- [x] `[AUTO]` The verified download, against a real HTTP server on loopback: exact bytes and monotonic progress, replacing a
  stale partial file, refusing a different checksum, a short or oversized body and a different announced size, an HTTP
  status, a redirect to an untrusted host (and following one between trusted hosts; Node's fetch reports where a response
  ended, Electron's `net.fetch` does not, so this check has no effect in the app), cancel, stall, header timeout, an
  unreachable server and an unwritable destination, each leaving no file: `apps/desktop/tests/updateDownloader.test.ts`.
- [x] `[AUTO]` `UpdateService` with fakes and a real temp directory: every check result (up to date, available, mandatory,
  offline, 404/503, bad JSON, other application, bad checksum, no installer for this platform, timeout, untrusted redirect),
  one shared request for overlapping checks, no re-check while an update is known, download progress and its throttle,
  cancel back to "available", corruption/connection/server/disk-space/stall failures with retry, reuse of a staged file and
  refusal of an altered one, the installer running **before** the quit request and only once, install blocked while a room is
  open (and announced only when that changes), retry after a failed or throwing installer, a file altered after verification,
  the manual-restart watchdog, the open-installer mode, scheduled checks and clean-up of old installers, dispose, and a
  failing listener: `apps/desktop/tests/updateService.test.ts`.
- [x] `[AUTO]` The Squirrel silent installer (arguments, exit codes, start failure, timeout without killing, restart helper that
  outlives the app), the open-installer mode and installer selection: `apps/desktop/tests/updateInstallers.test.ts`;
  `--squirrel-firstrun` is a normal run: `apps/desktop/tests/squirrelEvents.test.ts`.
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
- [ ] `[PACKAGED]` An installed Windows build updates itself: silent `Setup.exe` over the running version, the new version
  starts after the restart, shortcuts and the uninstall entry point at it, the same release is not offered again. Not run.
- [ ] `[PACKAGED]` macOS (x64 and arm64): the disk image downloads, verifies and opens. Not run (no Mac was available).
- [ ] `[CI]` A tag run publishes `update-manifest.json` next to the installers and
  `releases/latest/download/update-manifest.json` serves it. Not run: no release has been cut with this change.
- [ ] `[MANUAL-E2E]` The rows of [V1 final manual acceptance](../../ui-ux-overhaul/V1_FINAL_MANUAL_ACCEPTANCE.md#in-app-update).

## Restart/recovery

- [ ] Same DB restores room/session/host/ready plus pending landing decision/
  continuation, payment claim/index, private decks/card holders and proposal terms.
- [ ] Historical snapshot upgrades are transactional/idempotent and preserve room/member/host/
  active session identity and never cascades reconnect credentials.
- [ ] Due offer/turn/payment/proposal deadline is applied exactly once before state is served.
- [ ] Cleanup honors pending/lobby/in-progress/finished TTL and never deletes merely-offline room.
- [ ] Expired/revoked session rows purge after `TERMINAL_SESSION_RETENTION_MS` without
  touching active sessions.
