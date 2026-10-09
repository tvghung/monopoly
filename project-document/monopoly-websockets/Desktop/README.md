# Desktop module index

Status: CURRENT (RELEASED in v1.7.0; no desktop changes on the vNext branch after v1.7.0).

## Scope

`apps/desktop/` is the Electron shell of Own the Block for Windows and macOS. It owns the window, the renderer security
boundary, the preload/IPC bridge, quit/close coordination, the supervision of the authoritative server helper process and
of the Online Quick Tunnel, LAN room lookup on the requester side, the in-app updater and the packaging/release scripts.

It owns no game rules. The server helper (a separate Electron utility process running the bundled
`apps/server/src/desktopServerHelper.ts`) is the only gameplay authority; rooms, sessions and offers live in its RAM and a
helper exit destroys them permanently. Electron main never holds GameCore and never bypasses the server.

## Foundation rules

1. [Shared instructions](../monopoly.shared.instructions.md).
2. The Electron and desktop invariants in the repository `CLAUDE.md` / `AGENTS.md`: `contextIsolation: true`,
   `nodeIntegration: false`, `sandbox: true`, typed whitelist-only preload, `app://` path traversal guard, main process as
   shell/runtime/window boundary only, active-game close = disconnect (never `leave room`), central
   Modal/ConfirmationDialog (no `window.confirm`), pinned `cloudflared` digests, empty `--config` and no `TUNNEL_*`.
3. [RAM lifecycle and storage](../Persistence/README.md): what a helper exit destroys and why it is never restarted to fake
   recovery.

## Read order

1. This index.
2. [Electron shell and packaging](./electron-shell-and-packaging.instruction.md) for anything in `apps/desktop/src/` or
   `apps/desktop/scripts/`.
3. The canonical behaviour doc of the subsystem you touch (table below). Hosting/LAN/Online network behaviour is canonical in
   [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md); launcher/join/relink UX in
   [Join room](../Client/join-room.instruction.md); update behaviour in [App update](../Client/app-update.instruction.md);
   the release process in [V1 release contract](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md).
4. The testcase checklists: [HTTP runtime and deployment](../testcase/http-runtime-and-deployment.md) and
   [Join room and player lifecycle](../testcase/join-room-and-player-lifecycle.md).

## Subsystems

| Subsystem | Code owner | Canonical instruction | Tests |
| --- | --- | --- | --- |
| Electron shell & security | `apps/desktop/src/main.ts`, `apps/desktop/src/desktopBootstrap.ts`, `apps/desktop/src/security.ts`, `apps/desktop/src/rendererContentType.ts`, `apps/desktop/src/productionPolicy.ts`, `apps/desktop/src/ipc/externalLinks.ts`, `apps/desktop/src/squirrelEvents.ts` | [Electron shell and packaging](./electron-shell-and-packaging.instruction.md) | `apps/desktop/tests/security.test.ts`, `apps/desktop/tests/rendererContentType.test.ts`, `apps/desktop/tests/productionPolicy.test.ts`, `apps/desktop/tests/squirrelEvents.test.ts` |
| Preload/IPC bridge | `apps/desktop/src/preload.ts`, `apps/desktop/src/ipc/channels.ts`, `apps/desktop/src/ipc/windowHandlers.ts`, `apps/desktop/src/runtimeConfig.ts`; renderer side `apps/client/src/runtime/desktopBridge.ts`, `apps/client/src/runtime/types.ts` | [Electron shell and packaging](./electron-shell-and-packaging.instruction.md) | `apps/desktop/tests/preloadBridge.test.ts`, `apps/desktop/tests/preloadBundle.test.ts`, `apps/desktop/tests/windowHandlers.test.ts`, `apps/desktop/tests/runtimeConfig.test.ts` |
| Quit/close coordination | `apps/desktop/src/ipc/windowHandlers.ts` (`QuitRequestController`), `apps/desktop/src/appQuitCoordinator.ts`; renderer `apps/client/src/App.tsx` | [Electron shell and packaging](./electron-shell-and-packaging.instruction.md); leave vs disconnect in [Join room](../Client/join-room.instruction.md) | `apps/desktop/tests/quitRequestController.test.ts`, `apps/desktop/tests/appQuitCoordinator.test.ts`, `apps/desktop/tests/windowHandlers.test.ts` |
| Host runtime & server helper | `apps/desktop/src/hostRuntime.ts`, `apps/desktop/src/serverHelper.ts`, `apps/desktop/src/networkInterfaces.ts`; helper entry `apps/server/src/desktopServerHelper.ts`; capability check `apps/server/src/socket/index.ts` (`canCreateRoom`) | [Electron shell and packaging](./electron-shell-and-packaging.instruction.md); network surface in [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md) | `apps/desktop/tests/hostRuntime.test.ts`, `apps/desktop/tests/serverHelper.test.ts`, `apps/desktop/tests/networkInterfaces.test.ts` |
| LAN discovery | `apps/desktop/src/lanFinder.ts` (requester); `apps/server/src/lanDiscoveryResponder.ts` (responder in the helper) | [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md#lan) | `apps/desktop/tests/lanFinder.test.ts`, `apps/desktop/tests/lanDiscoveryContract.test.ts` |
| Online Quick Tunnel & room registry client | `apps/desktop/src/online/connectivity.ts`, `apps/desktop/src/online/discovery.ts`, `apps/desktop/src/online/hostInstance.ts`, `apps/desktop/cloudflared-integrity.json`; registry service `services/room-registry/` | [HTTP, LAN and online hosting](../Api/http-runtime.instruction.md#online); registry deploy in [room registry README](../../../services/room-registry/README.md) | `apps/desktop/src/online/connectivity.test.ts`, `apps/desktop/src/online/discovery.test.ts`, `apps/desktop/src/online/hostInstance.test.ts`, `apps/desktop/src/online/hostLifecycle.test.ts`, `apps/desktop/tests/prepareCloudflared.test.ts` |
| Auto-update | `apps/desktop/src/update/` (`updateService.ts`, `manifest.ts`, `installers.ts`, `squirrelGuard.ts`, ...), `apps/desktop/update-policy.json`, `apps/desktop/scripts/updateManifest.mjs`, `apps/desktop/scripts/stageReleaseAssets.mjs` | [App update](../Client/app-update.instruction.md) (design record: [auto-update](../../auto-update/README.md), REFERENCE) | `apps/desktop/tests/updateService.test.ts`, `apps/desktop/tests/updateManifest.test.ts`, `apps/desktop/tests/updateManifestContract.test.ts`, `apps/desktop/tests/updateInstallers.test.ts`, `apps/desktop/tests/updateDownloader.test.ts`, `apps/desktop/tests/updateSquirrelGuard.test.ts`, `apps/desktop/tests/updateSquirrelGuardCopy.test.ts`, `apps/desktop/tests/updateVersion.test.ts`, `apps/desktop/tests/stageReleaseAssets.test.ts` |
| Packaging, release & packaged proofs | `apps/desktop/forge.config.cjs`, `apps/desktop/scripts/` (`compile.mjs`, `prepareRenderer.mjs`, `writeReleaseConfig.mjs`, `prepareCloudflared.mjs`, `checkPackagedBudget.mjs`, `runPackagedProof.mjs`, `release.mjs`, `validateRelease.mjs`, ...), `apps/desktop/src/phase72HostProof.ts`, `apps/desktop/src/audioRendererProof.ts`, `.github/workflows/desktop-build.yml`, `.github/workflows/release-candidate.yml` | [Electron shell and packaging](./electron-shell-and-packaging.instruction.md); release process in [V1 release contract](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md) | `apps/desktop/tests/checkPackagedBudget.test.ts`, `apps/desktop/tests/releaseMetadata.test.ts`, `apps/desktop/tests/pruneElectronLocales.test.ts`, `apps/desktop/tests/audioRendererProofResult.test.ts`, `apps/desktop/tests/oggVorbisMetadata.test.ts`; packaged proofs (see the instruction) |

Run the desktop suite with `pnpm --filter @monopoly/desktop test` and `pnpm --filter @monopoly/desktop typecheck`.

## Related

- [Documentation Hub](../../README.md), [feature traceability](../FEATURE_TRACEABILITY.md),
  [architecture decisions](../ARCHITECTURE_DECISIONS.md).
- [Settings and audio](../Client/settings-and-audio.instruction.md) (renderer side of desktop settings).
- [Online multiplayer design](../../own-the-block-vnext/ONLINE_MULTIPLAYER_DESIGN.md) (REFERENCE design record).

## Index update rule

Every new `*.instruction.md` in `Desktop/` must be added to the Subsystems table above in the same change. A change to a
desktop subsystem whose canonical doc lives elsewhere (Api, Client, release contract) updates that doc, and this table only
when code ownership or tests move.
