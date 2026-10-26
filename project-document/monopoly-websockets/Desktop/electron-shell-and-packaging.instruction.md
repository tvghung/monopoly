# Electron shell and packaging

Status: CURRENT (release baseline v1.10.0; later CURRENT DEVELOPMENT sections are labeled). Foundation rules: [monopoly.shared.instructions.md](../monopoly.shared.instructions.md).

## Scope

This file owns the parts of `apps/desktop/` that no other current doc owns:

- the Electron shell security model (window `webPreferences`, the `app://` renderer protocol, navigation and external-link
  guards, production input policy);
- the preload bridge `window.ownTheBlockDesktop` and its IPC channels;
- quit/close coordination between Electron main and the renderer;
- supervision of the authoritative server helper process and of the Online tunnel process by `HostRuntimeController`,
  including the room-creation capability and the helper environment;
- packaging resources, the size/integrity gate and the packaged proofs.

It maps to, and does not repeat:

| Topic | Canonical doc |
| --- | --- |
| HTTP routes, LAN/Online behaviour, Quick Tunnel arguments and environment, registry fallback, client identity behind the tunnel | [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md) |
| Launcher, join, relink and explicit leave UX | [Join room](../Client/join-room.instruction.md) |
| In-app update states, manifest and installers | [App update](../Client/app-update.instruction.md) |
| Release steps, versioning, tags and publication | [V1 release contract](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md) |
| What a helper exit destroys | [RAM lifecycle and storage](../Persistence/README.md) |

Protocol numbers are not repeated here: the current value is `SOCKET_PROTOCOL_VERSION` in `packages/shared/src/types.ts`
and its history is in [socket and state contracts](../Shared/socket-and-state-contracts.instruction.md).

## Code ownership

| Area | Files |
| --- | --- |
| Entry, Squirrel startup events | `apps/desktop/src/main.ts`, `apps/desktop/src/squirrelEvents.ts` |
| Window, protocol, services wiring, proof flags | `apps/desktop/src/desktopBootstrap.ts` (`startDesktopRuntime`) |
| Renderer security | `apps/desktop/src/security.ts`, `apps/desktop/src/rendererContentType.ts`, `apps/desktop/src/productionPolicy.ts`, `apps/desktop/src/ipc/externalLinks.ts` |
| Preload and IPC | `apps/desktop/src/preload.ts`, `apps/desktop/src/ipc/channels.ts`, `apps/desktop/src/ipc/windowHandlers.ts`, `apps/desktop/src/runtimeConfig.ts` |
| Quit/close | `apps/desktop/src/ipc/windowHandlers.ts` (`QuitRequestController`), `apps/desktop/src/appQuitCoordinator.ts` |
| Host runtime and helper | `apps/desktop/src/hostRuntime.ts` (`HostRuntimeController`), `apps/desktop/src/serverHelper.ts` (`ServerHelperController`), `apps/desktop/src/networkInterfaces.ts`, `apps/desktop/src/lanFinder.ts`, `apps/desktop/src/online/connectivity.ts`, `apps/desktop/src/online/discovery.ts`, `apps/desktop/src/online/hostInstance.ts` |
| Server side of the boundary | `apps/server/src/desktopServerHelper.ts` (helper entry), `apps/server/src/socket/index.ts` (`canCreateRoom`), `apps/server/src/lanDiscoveryResponder.ts` |
| Renderer consumers | `apps/client/src/runtime/desktopBridge.ts`, `apps/client/src/runtime/types.ts` (`OwnTheBlockDesktopBridge`, renderer copy of the bridge type), `apps/client/src/App.tsx` (quit confirmation), `apps/client/src/components/DesktopMultiplayerLauncher.tsx` (host start, "Thoát") |
| Packaging | `apps/desktop/forge.config.cjs`, `apps/desktop/package.json`, `apps/desktop/cloudflared-integrity.json`, `apps/desktop/scripts/` |
| Packaged proofs | `apps/desktop/src/phase72HostProof.ts`, `apps/desktop/src/phase7RuntimeProof.ts`, `apps/desktop/src/audioRendererProof.ts`, `apps/server/src/phase72HostContract.ts`, `apps/desktop/scripts/runPackagedProof.mjs` |
| CI | `.github/workflows/desktop-build.yml`, `.github/workflows/release-candidate.yml` |

## Current behavior

### Startup

`apps/desktop/src/main.ts` first routes Windows Squirrel lifecycle arguments (`--squirrel-*`) through
`apps/desktop/src/squirrelEvents.ts` (shortcut create/remove via `Update.exe`, then quit). Only a normal start imports
`desktopBootstrap` and calls `startDesktopRuntime()`, which registers the privileged `app` scheme, then on `whenReady`
either runs a packaged proof (see below) or creates the host services (`HostRuntimeController`, `LanFinder`,
`UpdateService`), registers the production renderer protocol (packaged only), creates the window and starts the updater.
On `powerMonitor` `resume` it calls `hostRuntime.verifyAndRecover()`.

### Security model

- The one `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
  and `devTools` only when not packaged (`createWindow` in `apps/desktop/src/desktopBootstrap.ts`). A packaged build also closes DevTools
  if they open, and `apps/desktop/src/productionPolicy.ts` swallows reload and history keys (F5, Ctrl/Cmd+R, browser
  back/forward, Alt+Left/Right).
- The packaged renderer is served from `app://own-the-block/` by `protocol.handle('app')`. `resolveRendererPath` in
  `apps/desktop/src/security.ts` accepts only scheme `app:` with host `own-the-block`, URL-decodes the path, rejects NUL
  bytes, resolves inside the renderer root (`resources/dist`) and rejects anything outside it (encoded traversal included);
  a directory maps to its `index.html`, a missing file is 404. Every response carries the MIME type from
  `apps/desktop/src/rendererContentType.ts` and `PRODUCTION_RENDERER_CSP` (scripts and workers only from `'self'` and
  `blob:`; `connect-src` allows `http:`, `https:`, `ws:`, `wss:` because the game server may be a LAN or tunnel origin).
- Development loads the Vite origin (`http://127.0.0.1:5173` by default, overridable with
  `OWN_THE_BLOCK_DEV_RENDERER_URL`). `isAllowedRendererNavigation` allows only `app://own-the-block` and, in development,
  `127.0.0.1`/`localhost` on port 5173.
- `apps/desktop/src/ipc/externalLinks.ts`: `window.open` is always denied; a URL that passes `isSafeExternalUrl` (https
  without credentials; plain http to localhost in development only) is handed to the OS browser. In a packaged build every
  `will-navigate` is prevented.

### Preload bridge and IPC

`apps/desktop/src/preload.ts` exposes exactly one object, `window.ownTheBlockDesktop`, through `contextBridge`; the raw
`ipcRenderer` is never exposed. Groups: `getRuntimeConfig`, `window` (state, fullscreen, fullscreen listener), `quit`
(`onQuitRequested`, `respond`, `acknowledge`, `exitApp`), `openExternal`, `host` (`getStatus`, `start`, `stop`, `refreshNetwork`,
`onStatusChanged`, `activateOnline`), `lan.findRoom`, `online.findRoom`, `update` (five calls without arguments and one
listener). Every channel name lives in `IPC_CHANNELS` (`apps/desktop/src/ipc/channels.ts`, prefix `ownTheBlock:`).

`registerWindowHandlers` in `apps/desktop/src/ipc/windowHandlers.ts`:

- rejects any IPC whose sender is not this window's `webContents`;
- validates every payload at the boundary: host start accepts only `port`, `preferredAddress` (dotted IPv4), `mode`
  (`LAN`/`ONLINE`) and `roomCode` (`[A-Z0-9-]{1,20}`); find-room requests accept exactly `{ roomCode }`; network refresh
  only `preferredAddress`; quit responses need a UUID-shaped request id and a boolean; update channels take no payload, so
  the renderer never chooses a URL, file or version;
- returns typed result objects (`{ ok, status }`, `{ ok: false, code }`) instead of throwing host/LAN/Online failures to
  the renderer;
- registers the host, LAN and update channels only when those services exist, pushes host/update/fullscreen state to the
  window, and removes every handler and listener when the window closes (and cancels a running LAN search).

`getRuntimeConfig` returns `{ target: 'desktop', socketUrl?, platform, appVersion }`. `socketUrl` resolves from
`--socket-url=`, then `OWN_THE_BLOCK_SOCKET_URL`, then the packaged `release-config.json`; packaged builds without one return
no URL (LAN-first), development defaults to `http://127.0.0.1:8080` (`apps/desktop/src/runtimeConfig.ts`).

The renderer type of the bridge is a hand-maintained copy in `apps/client/src/runtime/types.ts`; a bridge change updates
both, plus `apps/desktop/tests/preloadBridge.test.ts`.

### Quit and close semantics

- Closing the window is intercepted by `QuitRequestController.handleClose`: main sends `ownTheBlock:quit:requested` with a
  random request id and, for a guarded macOS Host close, a `requiresConfirmation` flag. `apps/client/src/App.tsx` answers `true`
  at once unless the player holds a seat in an `IN_PROGRESS` room or main reports a busy Host; then it opens the central `ConfirmationDialog`
  (`apps/client/src/design-system/components/ConfirmationDialog/ConfirmationDialog.tsx`) with `app.closeHostMessage`
  (hosting) or `app.closeWindowMessage` (guest) from `apps/client/src/i18n/catalog.ts`, and tells main it is on screen
  (`quit.acknowledge(requestId)`, channel `ownTheBlock:quit:prompting`). Cancel answers `false`; confirm answers `true`. There is no
  `window.confirm`.
- Closing is a disconnect, not `leave room`: the session and seat stay and a guest can reconnect. Only the explicit
  forfeit/leave action in the renderer revokes the session (see [Join room](../Client/join-room.instruction.md)). On the
  Host, quitting stops the helper and therefore ends the RAM match for everyone; that is what the host-close copy says.
- The renderer gets a `QUIT_RESPONSE_TIMEOUT_MS` (2 s) to answer or acknowledge that a dialog is on screen. Once acknowledged,
  main waits without a time limit for the answer; a main-frame navigation or unmounting the dialog is cancellation. Renderer loss
  (`render-process-gone`/`destroyed`) or `unresponsive` for `QUIT_UNRESPONSIVE_GRACE_MS` (30 s, cancelled by `responsive`) is
  the legacy fail-open path when no guarded Host is active. A repeated close while a request is pending creates no second request.
  **CURRENT DEVELOPMENT — AUDIT-020:** on macOS, `createWindow` supplies a `HostWindowCloseGuard` backed by the same
  `HostRuntimeController.isBusy` and `stopRuntime()` used by the existing lifecycle. Busy includes accepted startup before it
  reaches `HOSTING`, an in-flight Stop, owned helper/tunnel resources and failed cleanup. The renderer receives
  `requiresConfirmation=true`, so even a startup before room admission opens the central dialog. Cancel leaves the Host and
  window untouched. Confirm joins the idempotent Stop barrier; main rechecks that the current window is alive and Host is no
  longer busy immediately before allowing one close. Send failure, timeout, renderer loss, Stop rejection or a still-busy/new
  Host lifecycle blocks ordinary close, reports a native error and leaves the window available for retry where Electron permits.
  An idle Host needs no Stop; normal guest confirmation still works. Windows/Linux instantiate the existing unguarded controller
  and retain their prior close behavior. A forced OS shutdown, crash or `End task` cannot be reliably intercepted (ADR-03).
  Mock-only evidence: `apps/desktop/tests/windowHandlers.test.ts`, `apps/desktop/tests/quitRequestController.test.ts`, and
  `apps/client/src/App.test.tsx`; native macOS acceptance is NOT RUN.
- Application quit (Cmd+Q, last window, update restart, the start screen's "Thoát") goes through `before-quit` →
  `AppQuitCoordinator`: it prevents the quit, asks the renderer once (coalescing concurrent quits), and on approval stops
  the host runtime, arms the final window close and quits. **CURRENT DEVELOPMENT — E1-FIX-003:** bootstrap always delegates
  shutdown to the idempotent Host Stop, including a pending start before helper creation; the coordinator waits for that
  cancellation and cleanup barrier before authorizing normal exit. A cleanup error is reported and the quit still proceeds. "Thoát"
  (`ownTheBlock:quit:exit`) and the updater's restart call `approveApplicationQuit()` first because the player already
  answered, so no second question is asked.
- Closing a macOS window remains a window-close operation; it does not call `app.quit()`. `window-all-closed` keeps the
  process available under the existing macOS convention. Explicit app Quit and updater restart remain on
  `AppQuitCoordinator`; update restart continues to use the `isBusy` safety gate and existing Host Stop barrier.

### Host runtime and helper supervision

`HostRuntimeController` (`apps/desktop/src/hostRuntime.ts`) states: `IDLE → STARTING_SERVER → HOSTING`, plus `STOPPING`
and `FAILED` (`READY` exists in the type; the current start path goes straight to `HOSTING`). Modes `LAN` and `ONLINE`.

- **Start.** LAN mode requires a usable private IPv4 interface (`NO_LAN_INTERFACE` otherwise); Online does not. Port 0
  (OS-assigned) retries up to three times on `PORT_OCCUPIED`. **CURRENT DEVELOPMENT — E1-FIX-003:** an accepted start owns
  its operation and publishes `STARTING_SERVER` synchronously, before registry reservation or route preflight. Concurrent
  starts for the same mode and room share that operation; a different mode or room code fails
  (`HOST_MODE_CONFLICT` / `HOST_ROOM_CONFLICT`) even while preflight is pending. Requests waiting for Stop re-evaluate the
  current operation after its cleanup barrier; they cannot inherit a cancelled room's promise. Errors remain classified into
  `HostRuntimeErrorCode` with a bounded diagnostic.
- **Cancellation and Stop (CURRENT DEVELOPMENT — E1-FIX-003).** Stop marks the accepted start cancelled before waiting and
  publishes `STOPPING`. Startup checks ownership across reservation, route, helper and tunnel/public-probe awaits and before
  publishing `HOSTING`; a cancelled start rejects internally with `HOST_START_CANCELLED`. A late reservation is retained
  for revocation, and a helper or tunnel acquired during cancellation is cleaned before Stop succeeds. Consecutive Stops
  share one shutdown. Stop may wait for an adapter that cannot abort; it does not claim `IDLE` while that adapter can still
  create resources. After successful Stop, the cancelled operation cannot publish or acquire resources and a fresh Start
  may proceed. Cleanup failure retains helper/tunnel ownership and busy safety for a later Stop retry. Registry request
  cancellation follows the separate operation boundary below; registry revocation remains best effort.
- **Room-creation capability.** Every start draws a fresh `randomBytes(32)` hex secret. It reaches the helper only as
  `OTB_HOST_CREATE_SECRET` with `OTB_HOST_ROOM_CODE` (and, Online, `OTB_ONLINE_ROOM_CODE`, plus `OTB_REGISTRY_ROOM_CODE` /
  `OTB_REGISTRY_PROOF` when a registry reservation succeeded). The renderer receives it once, as `hostCapability` in the
  host-start IPC result, and only while the state is `HOSTING` and the requested code equals the started one
  (`creationCapability`). The server compares it in constant time in `canCreateRoom` (`apps/server/src/socket/index.ts`,
  desktop profile only). Stop, failure and recovery clear the secret and code.
- **Helper process.** `ServerHelperController` (`apps/desktop/src/serverHelper.ts`) forks
  `resources/server-helper/server-helper.cjs` with Electron `utilityProcess` bound to `0.0.0.0`. Environment hygiene: every
  name in `HOST_CONTROL_VARIABLES` is deleted from the inherited environment before the controller's own values are added,
  so a player's shell cannot grant room creation or tunnel trust; `DATABASE_URL` and `OWN_THE_BLOCK_MIGRATIONS_DIR` are
  deleted as a defensive guard (the runtime is RAM-only); `SERVER_RUNTIME_PROFILE=desktop`, `NODE_ENV=production`,
  `SERVER_HOST`, `PORT` and `OWN_THE_BLOCK_CLIENT_DIST` are set. Readiness = a `ready` message whose host/port match, then
  `/healthz` = `ok` and `/readyz` = `ready` over loopback within 30 s; stop = `shutdown` message and a clean exit within
  10 s, otherwise kill. stdout/stderr feed only a bounded (2 KiB) diagnostic. Tunnel origins reach the helper through the
  `public-endpoints` message.
- **Health and loss.** While hosting, health is checked every 5 s and after system resume. A helper that exits
  unexpectedly or fails health is **not restarted**: the controller stops the tunnel and registry lease, stops the helper,
  clears the capability and goes to `FAILED`. The helper's RAM was the only copy of the match, so no room or reconnect token
  survives (`recover()` in `apps/desktop/src/hostRuntime.ts`).
- **Online.** The controller owns the process side of the Quick Tunnel (`CloudflareQuickTunnel` in
  `apps/desktop/src/online/connectivity.ts`), the optional registry lease (`HttpRoomDiscovery` in
  `apps/desktop/src/online/discovery.ts`, https origins only, 30 s renewal) and the instance probe
  (`apps/desktop/src/online/hostInstance.ts`). `resolveCloudflared` runs only an absolute path under the app's own resources
  (or `OWN_THE_BLOCK_CLOUDFLARED_PATH`) whose SHA-256 equals the pinned `executableSha256` for this platform; otherwise
  `CLOUDFLARED_MISSING` / `CLOUDFLARED_CORRUPT`. Tunnel loss keeps the RAM match and re-opens a tunnel at most twice. The
  network behaviour (arguments, empty config, environment filtering, accepted hostnames, registry fallback) is canonical in
  [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md#online). The registry URL comes from
  `OWN_THE_BLOCK_REGISTRY_URL` at runtime, else `registryUrl` in the packaged `release-config.json` (`resolveRegistryUrl`).
  Released in v1.9.1, `apps/desktop/src/online/probe.ts` records safe stage and failure codes through
  `HostRuntimeStatus`, and `apps/desktop/src/desktopBootstrap.ts` supplies Electron `net.fetch` to public-route, room and
  registry checks so they use the desktop network stack. The renderer can copy only the bounded diagnostic fields; it
  receives no helper output or registry credential. See the Online section of the canonical HTTP document for retry and
  endpoint policy.
- **Registry activation and renewal (CURRENT DEVELOPMENT — E1-FIX-004).** Activation belongs to the existing Online
  epoch, helper, room code, public endpoint, specific lease and discovery adapter, with a separate operation identity. It
  checks that ownership after asynchronous public-room, body-cancellation, retry and registry work, and before publishing
  status or installing a renewal loop. Concurrent activations for the same current owner share pending work; a valid
  activation retry after settlement replaces the previous operation and its renewal ownership. Stop and tunnel recovery
  invalidate and abort the operation. Activation and renewal requests cannot create a new lease, so cancellation detaches their pending
  continuations rather than adding them to the resource-acquisition Stop barrier; even an adapter that ignores abort
  cannot keep recovery waiting for obsolete activation or later publish into a replacement Host.
  Each renewal loop uses only its captured room code and lease credential, checks its operation and timer ownership
  before requesting or applying an outcome, and allows at most one renewal request in flight. An obsolete success or
  failure cannot clear a newer timer, schedule another loop, change discovery state or publish another Host's endpoint.
  Current failures keep the existing direct-link fallback and renewal recovery. These guards govern runtime state;
  remote revocation, expiry and same-lease request ordering limits are documented in
  [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md#online).
- **LAN lookup.** `LanFinder` (`apps/desktop/src/lanFinder.ts`) is the requester side of UDP room discovery on port 41234;
  its wire constants (including `LAN_DISCOVERY_SOCKET_PROTOCOL`) duplicate the server responder's because main has no
  runtime dependencies, and `apps/desktop/tests/lanDiscoveryContract.test.ts` keeps both sides equal. Behaviour:
  [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md#lan).
- **Updater interlock (CURRENT DEVELOPMENT — E1-FIX-003).** `hostIsBusy()` in
  `apps/desktop/src/desktopBootstrap.ts` delegates to the controller's `isBusy` authority: pending startup, Stop, owned
  resources and failed cleanup remain busy, including the first preflight and cleanup retry. Public Host status reports
  `STARTING_SERVER` / `STOPPING` for accepted work; the updater uses operation/resource ownership in addition to status.
  Update rules, including the existing `restart` / `open-installer` distinction, are in
  [App update](../Client/app-update.instruction.md).

### Packaging resources and the budget gate

`pnpm desktop:package` / `pnpm desktop:make` run `prepare:renderer` (writes `generated/release-config.json` via
`apps/desktop/scripts/writeReleaseConfig.mjs`, then builds the client), `prepare:cloudflared`
(`apps/desktop/scripts/prepareCloudflared.mjs`: download and verify against `apps/desktop/cloudflared-integrity.json`) and
`compile` (`apps/desktop/scripts/compile.mjs`: `tsc`, the esbuild bundle of `apps/server/src/desktopServerHelper.ts` as
`server-helper.cjs` and of `apps/server/src/phase72HostContract.ts` for the proof, and the preload bundle with `electron`
external), then Electron Forge.

`apps/desktop/forge.config.cjs`: `asar: true`, `prune: false`; `generated/`, `src/`, `tests/`, `scripts/`, `node_modules/`,
`update-policy.json`, TypeScript configuration and Forge configuration are ignored, while `cloudflared-integrity.json`
stays in `app.asar` because main requires it. `apps/desktop/scripts/compile.mjs` cleans the fixed `dist/` output before
compiling, and `tsconfig.build.json` excludes test files and source maps. The packaged budget gate rejects compiled tests,
source maps and build configuration even when they are nested under `dist/`.
`extraResource` = client `dist`, `release-config.json`, `server-helper/`, `cloudflared/`. The `packageAfterExtract` hook
prunes Electron locales to `en-US` and `vi` (Windows; macOS bundles are listed, not pruned). Makers: Squirrel (win32,
`OwnTheBlock-<version>-win32-x64-Setup.exe`) and DMG (darwin, ULMO). Signing inputs are read only when
`OWN_THE_BLOCK_DISTRIBUTION_MODE=signed`.

**CURRENT DEVELOPMENT — E1 package boundary (after released v1.10.0):** `apps/desktop/e1/` contains opt-in regression
tests and fixtures under Forge's application input directory, so `packagerConfig.ignore` explicitly adds
`/^\/e1(?:\/|$)/`. This matches only the root `e1` directory and descendants. The installed Packager normalizes
Windows path separators before applying regex rules; POSIX paths already use `/`. The regression test
`apps/desktop/tests/forgePackageBoundary.test.ts` evaluates Forge's loaded configuration with the installed Packager
filter, checks both separator forms on Windows, and keeps runtime controls (`dist/main.js`, `dist/preload.js`,
`package.json`, and `cloudflared-integrity.json`) eligible. Renderer the generated client dist directory (apps/client/dist, absent until build), generated release configuration,
server helper and cloudflared remain in the separate `extraResource` list. This static test verifies the configured path
boundary and retained inputs; it does not inspect an ASAR or archive. The F3 local candidate and its Squirrel payload
are inspected against their file inventories in the current-development release records. This E1 package-boundary rule
does not change the published v1.10.0 release.

**CURRENT DEVELOPMENT — F6 Squirrel payload parity (2026-10-23):** the installed `electron-winstaller` 5.4.4 NuSpec
template has explicit root-file globs and no catch-all for `*.html` or the root `version` marker. Forge's supported
`additionalFiles` option adds only `LICENSES.chromium.html` and `version` at `lib/net45/`. A controlled unsigned maker
build from the preserved F3 package matched all 184 F3 files by size and SHA-256; the only extra payload entries were
Squirrel's execution stub and `squirrel.exe`. This local candidate check does not establish signature, installation,
update, or published-release acceptance. Detailed hashes and status are in Report 28 (local-only historical evidence: `28_PHASE_F6_INSTALLER_PARITY_AND_HOST_ISOLATION.md`; unavailable in a clean checkout).

`apps/desktop/scripts/checkPackagedBudget.mjs` (`proof:packaged:budget`) fails when: `app.asar` exceeds 5 MiB, lacks
`cloudflared-integrity.json` or contains `generated`/`src`/`tests`/`scripts`/`node_modules`/`out`; an obsolete `postgres`
resource is bundled; the bundled `cloudflared` executable or license does not match the pinned digests (the neighbouring
`cloudflared.sha256` must also agree, but is never the trust source); the Windows locale set is not exactly the kept set;
or `Setup.exe` exceeds 175 MiB / the DMG exceeds 195 MiB. It prints the size table either way.

### Packaged proofs

`apps/desktop/scripts/runPackagedProof.mjs` launches the packaged executable found in the desktop `out/` folder with one flag:

| Command | Flag | What it proves |
| --- | --- | --- |
| `pnpm proof:packaged` (`proof:packaged`) | `--phase7-runtime-proof` | Legacy name; delegates to the host proof below. |
| `pnpm desktop:proof:host` (`proof:packaged:host`) | `--phase7-2-host-proof` | Packaged helper starts, serves `/healthz`, `/readyz` and the client over loopback and a real LAN interface, runs the `apps/server/src/phase72HostContract.ts` match contract with a capability, finds the room via `LanFinder`, then restarts the helper on the same port and proves the old room is 404 and the retained session is rejected. Result marks `physicalDeviceAcceptance: 'MANUAL_REQUIRED'`. |
| `proof:packaged:audio` | `--audio-renderer-proof` | Loads `app://own-the-block/index.html` in a hidden sandboxed window and decodes the shipped Ogg music (MIME and Web Audio). |
| `proof:packaged:cards`, `proof:packaged:landmarks` | none (file checks) | `apps/desktop/scripts/validatePackagedCardArt.mjs`, `apps/desktop/scripts/validatePackagedLandmarkArt.mjs`. |
| `start:packaged` / `pnpm desktop:run:packaged` | `--launch` | Starts the packaged app normally. |

For B7, `node scripts/perf/packagedElectronAcceptance.mjs` is a focused Windows UI proof after `pnpm desktop:package`.
It launches the real packaged executable with fresh profiles, checks the launcher, deferred gameplay resources,
LAN Host/Guest room flow, game board, return/reentry and Balanced/Dog defaults. It writes its local run evidence
to `project-document/ui-ux-overhaul/08K_evidence/`; this proof is not a CI or release-workflow gate.

`.github/workflows/desktop-build.yml` (manual dispatch, Windows and macOS) runs the release-contract and asset validators,
desktop typecheck/tests, `pnpm desktop:make`, every packaged proof, the budget gate and the Playwright mobile flows.
`.github/workflows/release-candidate.yml` (version tags and manual dispatch) builds Windows x64, macOS Intel and macOS Apple
silicon through `pnpm desktop:release`, runs every packaged proof and the budget gate, then
`pnpm validate:release -- --release --artifacts`; publication rules are in the
[V1 release contract](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md).

## Constraints and regression risks

- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` and `webSecurity: true` on every window,
  including proof windows. Never expose `ipcRenderer`, Node APIs or a generic invoke through the preload.
- Every new channel: add it to `IPC_CHANNELS`, check the sender, validate the payload shape, return a typed result,
  remove it on window close, extend `apps/desktop/tests/preloadBridge.test.ts` and `apps/desktop/tests/windowHandlers.test.ts`.
  Never let the renderer pass a path, executable, URL to fetch or version to install.
- Do not weaken `resolveRendererPath` (host check, NUL rejection, root containment) or the CSP without a security test.
- Electron main is a shell/runtime/window boundary: no GameCore, no room state, no command that bypasses the helper's
  socket validation. The capability only authorizes creating the one selected room code.
- Do not add `window.confirm`; quit prompts go through the central ConfirmationDialog. Do not emit `leave room` on close.
- Never restart a crashed or unhealthy helper to fake recovery of an existing room or reconnect token.
- Never pass `HOST_CONTROL_VARIABLES` from the user environment to the helper; do not reintroduce database variables.
- Run only a `cloudflared` whose digest is pinned in `apps/desktop/cloudflared-integrity.json`; never resolve it from
  `PATH` or trust a checksum stored beside it. Never read or modify the user's cloudflared configuration; keep the empty
  per-run `--config` and the removal of `TUNNEL_*` variables.
- Keep `cloudflared-integrity.json` inside `app.asar`; keep `checkPackagedBudget.mjs` failing on an obsolete `postgres`
  resource.
- The quit request has a renderer keep-alive (`quit.acknowledge`); keep the 2 s countdown for a renderer that never acknowledges,
  and the tests on both sides (see Quit and close semantics).

## Change impact

| Change | Also update |
| --- | --- |
| Preload bridge or IPC channel | `apps/desktop/src/preload.ts`, `apps/desktop/src/ipc/channels.ts`, `apps/desktop/src/ipc/windowHandlers.ts`, `apps/client/src/runtime/types.ts`, renderer callers, desktop tests, this file |
| Quit/close flow | `apps/desktop/src/appQuitCoordinator.ts`, `QuitRequestController`, `apps/client/src/App.tsx`, catalog copy in `apps/client/src/i18n/catalog.ts`, [Join room](../Client/join-room.instruction.md), [join testcase](../testcase/join-room-and-player-lifecycle.md) |
| Helper environment, capability or lifecycle | `apps/desktop/src/hostRuntime.ts`, `apps/desktop/src/serverHelper.ts`, `apps/server/src/desktopServerHelper.ts`, `apps/server/src/socket/index.ts`, [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md), [RAM lifecycle](../Persistence/README.md), process-restart proof |
| LAN wire constants or socket protocol bump | `apps/desktop/src/lanFinder.ts` and `apps/server/src/lanDiscoveryResponder.ts` together (contract test), plus the protocol-bump checklist in [socket and state contracts](../Shared/socket-and-state-contracts.instruction.md) |
| cloudflared version | `apps/desktop/cloudflared-integrity.json` (archive, executable and license digests), [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md#online), budget gate run |
| Packaged resources or size | `apps/desktop/forge.config.cjs`, `apps/desktop/scripts/checkPackagedBudget.mjs` and its test, this file |
| Release/update metadata | [App update](../Client/app-update.instruction.md), [V1 release contract](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md) |

## Verification

Automated (run before completing a desktop change):

```bash
pnpm --filter @monopoly/desktop typecheck
pnpm --filter @monopoly/desktop test
```

Key suites: `apps/desktop/tests/security.test.ts`, `apps/desktop/tests/rendererContentType.test.ts`,
`apps/desktop/tests/productionPolicy.test.ts`, `apps/desktop/tests/preloadBridge.test.ts`,
`apps/desktop/tests/preloadBundle.test.ts`, `apps/desktop/tests/windowHandlers.test.ts`,
`apps/desktop/tests/quitRequestController.test.ts`, `apps/desktop/tests/appQuitCoordinator.test.ts`,
`apps/desktop/tests/squirrelEvents.test.ts`, `apps/desktop/tests/hostRuntime.test.ts`,
`apps/desktop/tests/serverHelper.test.ts`, `apps/desktop/tests/networkInterfaces.test.ts`,
`apps/desktop/tests/lanFinder.test.ts`, `apps/desktop/tests/lanDiscoveryContract.test.ts`,
`apps/desktop/tests/runtimeConfig.test.ts`, `apps/desktop/tests/prepareCloudflared.test.ts`,
`apps/desktop/tests/checkPackagedBudget.test.ts`, `apps/desktop/tests/releaseMetadata.test.ts`,
`apps/desktop/tests/pruneElectronLocales.test.ts`, `apps/desktop/src/online/connectivity.test.ts`,
`apps/desktop/src/online/discovery.test.ts`, `apps/desktop/src/online/hostInstance.test.ts`,
`apps/desktop/src/online/hostLifecycle.test.ts` (Online lifecycle of `HostRuntimeController`; there is no
`hostLifecycle.ts` source file).

Packaged (after `pnpm desktop:package` or `pnpm desktop:make`): `pnpm desktop:proof:host`, `pnpm proof:packaged`,
`pnpm --filter @monopoly/desktop proof:packaged:audio`, `pnpm --filter @monopoly/desktop proof:packaged:budget`.
Release metadata: `pnpm validate:release`, `pnpm validate:v1-contract`.

MANUAL-E2E (not covered by automation): physical Windows and macOS hosts with guests on other LAN devices and on
independent networks via the Quick Tunnel, the real close/quit prompt on each OS, sleep/resume while hosting, and the
installed Squirrel/DMG update path. Record results in [HTTP runtime and deployment](../testcase/http-runtime-and-deployment.md)
and the release acceptance records of the [V1 release contract](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md).

## Related docs

- [Desktop module index](./README.md)
- [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md)
- [Join room](../Client/join-room.instruction.md), [App update](../Client/app-update.instruction.md),
  [Settings and audio](../Client/settings-and-audio.instruction.md)
- [RAM lifecycle and storage](../Persistence/README.md)
- [Testcase: HTTP runtime and deployment](../testcase/http-runtime-and-deployment.md),
  [Testcase: join room and player lifecycle](../testcase/join-room-and-player-lifecycle.md)
- [Feature traceability](../FEATURE_TRACEABILITY.md), [architecture decisions](../ARCHITECTURE_DECISIONS.md),
  [Documentation Hub](../../README.md)
- [V1 release contract](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md) (release source of truth),
  [auto-update design record](../../auto-update/README.md) (REFERENCE),
  [Online multiplayer design](../../own-the-block-vnext/ONLINE_MULTIPLAYER_DESIGN.md) (REFERENCE),
  [room registry](../../../services/room-registry/README.md)

## Loopback acceptance mode (F8)

F12 scope clarification: the parser in `apps/desktop/src/localAcceptance.ts` and its main-process caller do not gate activation on `app.isPackaged` or platform. The flag pair can therefore select the mode in development or packaged startup on any platform; this describes activation, not verified cross-platform support. F8 was packaged and statically verified on Windows x64 only. Native Host acceptance did not occur. A packaged-only or Windows-only product policy requires a later explicit decision and implementation/test review; F12 preserves runtime behavior and artifact provenance.

The acceptance mode is authorized only by the main process when launched with exactly one
`--otb-loopback-acceptance` and one `--otb-loopback-acceptance-profile=<absolute-new-path>` argument. It creates a never-reused
profile root outside the normal `userData` tree before Electron becomes ready, redirects `userData`, `sessionData`, app data,
logs, cache, crash dumps and temporary files into that root, and replaces the process environment with an allowlist. A partial
flag pair, existing profile, overlapping production path or socket URL override exits before bootstrap. The renderer cannot
select or enable this mode through IPC.

Inside this mode the Host keeps its normal cancellation/Stop lifecycle but accepts LAN mode only. HostRuntime skips route and
interface probing, does not construct registry or tunnel adapters, and advertises no LAN/public endpoint. `ServerHelperController`
passes only safe Windows runtime variables, the isolated profile and the explicit Host capability. The helper marks the child
server as loopback-only; `startAuthoritativeServer` rejects any requested host except `127.0.0.1` before scheduler startup and
checks the actual TCP address after listening. The LAN UDP responder, updater service and update IPC handlers are omitted. The
renderer shows the active mode and builds invite links only from `127.0.0.1`. Production startup does not supply this trusted
configuration and retains the `0.0.0.0` Host default.

Activation is documented in the F8 audit report and must use a fresh path under a new F8 evidence run. Do not reuse a profile,
open firewall ports or run the original F3 package as a substitute for the F8 candidate. Native acceptance requires independent
Windows process and listener inspection; an announced endpoint or a mocked helper is not proof of the bound address.
