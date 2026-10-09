# Electron shell and packaging

Status: CURRENT (RELEASED in v1.7.0). Foundation rules: [monopoly.shared.instructions.md](../monopoly.shared.instructions.md).

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
(`onQuitRequested`, `respond`, `exitApp`), `openExternal`, `host` (`getStatus`, `start`, `stop`, `refreshNetwork`,
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
  random request id and waits for the renderer's answer. `apps/client/src/App.tsx` answers `true` at once unless the player
  holds a seat in an `IN_PROGRESS` room; then it opens the central `ConfirmationDialog`
  (`apps/client/src/design-system/components/ConfirmationDialog/ConfirmationDialog.tsx`) with `app.closeHostMessage`
  (hosting) or `app.closeWindowMessage` (guest) from `apps/client/src/i18n/catalog.ts`. Cancel answers `false` only within the 2 s window; with no answer in 2 s the main process proceeds with the close
  (`QUIT_RESPONSE_TIMEOUT_MS` in `apps/desktop/src/ipc/windowHandlers.ts`, known issue). There is no
  `window.confirm`.
- Closing is a disconnect, not `leave room`: the session and seat stay and a guest can reconnect. Only the explicit
  forfeit/leave action in the renderer revokes the session (see [Join room](../Client/join-room.instruction.md)). On the
  Host, quitting stops the helper and therefore ends the RAM match for everyone; that is what the host-close copy says.
- Main fails open: if no answer arrives within 2 s (`QUIT_RESPONSE_TIMEOUT_MS`), or the message cannot be sent, the close
  proceeds. The confirmation dialog does not extend that timeout (no keep-alive channel exists), so per the code a close
  left unanswered for more than 2 s proceeds while the dialog is still open. Real-app behaviour: NOT VERIFIED here.
- Application quit (Cmd+Q, last window, update restart, the start screen's "Thoát") goes through `before-quit` →
  `AppQuitCoordinator`: it prevents the quit, asks the renderer once (coalescing concurrent quits), and on approval stops
  the host runtime, arms the final window close and quits. A cleanup error is reported and the quit still proceeds. "Thoát"
  (`ownTheBlock:quit:exit`) and the updater's restart call `approveApplicationQuit()` first because the player already
  answered, so no second question is asked.

### Host runtime and helper supervision

`HostRuntimeController` (`apps/desktop/src/hostRuntime.ts`) states: `IDLE → STARTING_SERVER → HOSTING`, plus `STOPPING`
and `FAILED` (`READY` exists in the type; the current start path goes straight to `HOSTING`). Modes `LAN` and `ONLINE`.

- **Start.** LAN mode requires a usable private IPv4 interface (`NO_LAN_INTERFACE` otherwise); Online does not. Port 0
  (OS-assigned) retries up to three times on `PORT_OCCUPIED`. Concurrent starts share one promise; a second start with a
  different mode or room code fails (`HOST_MODE_CONFLICT` / `HOST_ROOM_CONFLICT`). Errors are classified into
  `HostRuntimeErrorCode` with a bounded diagnostic.
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
- **LAN lookup.** `LanFinder` (`apps/desktop/src/lanFinder.ts`) is the requester side of UDP room discovery on port 41234;
  its wire constants (including `LAN_DISCOVERY_SOCKET_PROTOCOL`) duplicate the server responder's because main has no
  runtime dependencies, and `apps/desktop/tests/lanDiscoveryContract.test.ts` keeps both sides equal. Behaviour:
  [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md#lan).
- **Updater interlock.** `hostIsBusy()` in `apps/desktop/src/desktopBootstrap.ts` reports every state except `IDLE` and
  `FAILED` as busy so an update restart never silently closes a hosted room; update rules are in
  [App update](../Client/app-update.instruction.md).

### Packaging resources and the budget gate

`pnpm desktop:package` / `pnpm desktop:make` run `prepare:renderer` (writes `generated/release-config.json` via
`apps/desktop/scripts/writeReleaseConfig.mjs`, then builds the client), `prepare:cloudflared`
(`apps/desktop/scripts/prepareCloudflared.mjs`: download and verify against `apps/desktop/cloudflared-integrity.json`) and
`compile` (`apps/desktop/scripts/compile.mjs`: `tsc`, the esbuild bundle of `apps/server/src/desktopServerHelper.ts` as
`server-helper.cjs` and of `apps/server/src/phase72HostContract.ts` for the proof, and the preload bundle with `electron`
external), then Electron Forge.

`apps/desktop/forge.config.cjs`: `asar: true`, `prune: false`; `generated/`, `src/`, `tests/`, `scripts/`, `node_modules/`
and `update-policy.json` are ignored, while `cloudflared-integrity.json` stays in `app.asar` because main requires it.
`extraResource` = client `dist`, `release-config.json`, `server-helper/`, `cloudflared/`. The `packageAfterExtract` hook
prunes Electron locales to `en-US` and `vi` (Windows; macOS bundles are listed, not pruned). Makers: Squirrel (win32,
`OwnTheBlock-<version>-win32-x64-Setup.exe`) and DMG (darwin, ULMO). Signing inputs are read only when
`OWN_THE_BLOCK_DISTRIBUTION_MODE=signed`.

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
- Known fail-open: an unanswered quit request proceeds after 2 s (see Quit and close semantics). Changing this needs a
  renderer keep-alive or a different protocol and tests on both sides.

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
