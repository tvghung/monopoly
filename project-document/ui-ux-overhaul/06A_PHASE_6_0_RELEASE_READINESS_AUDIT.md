# Phase 6.0 — Release Readiness Audit & Scope Lock

**Status: AUDIT COMPLETE — scope locked; Phase 6 engineering COMPLETE; production release readiness NOT YET APPROVED**

Audit date: 2026-08-26
Repository: tvghung/monopoly
Baseline branch: overhaul/phase-5-game-feel-audio-effects
Baseline SHA: e4ce23d36720f52ce0fc52db978a408269c45315
Phase 6 branch: overhaul/phase-6-polish-distribution
Protocol and snapshot contract: V8

## 1. Audit result

The baseline is clean and the Phase 6 branch was created from the expected
Phase 5.2 corrective commit. The current implementation already has the
authoritative V8 server/shared contract, one
PresentationController → AnimationQueue → PresentationStore path, one
AudioEngine, bounded presentation signals, a WebGL-to-legacy fallback, and
secure Electron boundary tests.

At audit time, the release was not yet ready for a normally distributed
multiplayer desktop build.
The confirmed stop-ship issue is the packaged socket endpoint: desktop runtime
configuration falls back to http://127.0.0.1:8080 unless a CLI argument or
environment variable is supplied, and no release endpoint is defined in the
repository. A packaged client therefore cannot reach the deployed multiplayer
server by default. The smallest safe fix is a release-time endpoint decision and
validated injection, with a fail-closed packaged path; no URL is invented in
this audit.

At audit time, other confirmed implementation gaps were persisted fullscreen
intent, top-level React failure containment with safe production error copy,
and native desktop icon/version metadata. Long-session, live multiplayer,
audible, install, signing, notarization, and cross-OS acceptance remain open
release gates rather than claims inferred from automated tests or packaging.

## 1A. Phase 6.1 corrective implementation record — 2026-08-26

This section supersedes the audit-time C1–C3 implementation claims where the
follow-up code has now been applied. The audit matrix and proposals below remain
the evidence-first Phase 6.0 baseline; they are not a claim that the external
release gates are complete.

### C1 endpoint lifecycle

- Development still resolves to `http://127.0.0.1:8080` when no value is
  supplied.
- Packaged Electron requires `--socket-url=<absolute HTTP(S) URL>` or
  `OWN_THE_BLOCK_SOCKET_URL`; missing or invalid values throw a typed runtime
  configuration error. An explicitly injected loopback URL is accepted for
  test/development use, but no production URL was invented or committed.
- `main.ts` no longer resolves runtime configuration before the BrowserWindow
  loads, and IPC resolves it only when the renderer requests it. Technical
  details stay in logs; the renderer maps the failure to safe copy instead of
  quitting or displaying a raw exception.
- Runtime-config tests cover development fallback, valid configuration,
  invalid protocol, packaged missing configuration, and explicit packaged
  loopback. The packaged missing-endpoint smoke showed the safe renderer error
  while the window remained open. Interactive packaged launch with an explicit
  endpoint was not completed in this host environment, so real endpoint
  connectivity remains **OPEN**.

### C2 fullscreen lifecycle

The persisted fullscreen intent is captured before native state synchronization,
applied once through the existing bridge, and then governed by settled native
enter/leave events. Provider/window-handler tests cover startup intent, false
startup, subsequent native synchronization, and reset. Electron development
smoke passed across restart with fullscreen enabled and after reset to a normal
window; a separate native OS shortcut/leave acceptance pass remains open.

### C3 top-level failure containment

`index.tsx` now has exactly one top-level app boundary outside the existing
`SceneErrorBoundary`. It logs technical details, renders a safe localized
fallback, and exposes a reload/recovery action. Bootstrap failures use the same
safe presentation without rendering the raw error. Focused tests deliberately
throw a child render error and reject bootstrap with a technical message; both
prove safe copy, raw-message absence, logging, and recovery. A deliberate live
browser render-failure smoke was **NOT RUN**; the tested boundary is still
automated evidence rather than a claim of full accessibility or installed-app
acceptance.

### Asset scope decision

No targeted Phase 6.1 asset prewarm was justified by the available evidence.
The generic asset-readiness authority and its associated progress/gating code
were removed, while the pre-Phase-6 reference-counted cache, shared SVG/card
ownership, procedural/lazy assets, and legacy rendering fallback were retained.
This keeps asset ownership in the existing components and does not turn client
readiness into a server or room authority.

### Local validation record for the 2026-08-26 corrective pass

That corrective pass recorded `pnpm install --frozen-lockfile`, root typecheck,
lint, database-enabled root tests, production build, focused client/desktop
tests, and Windows x64 desktop packaging as passing. Its PostgreSQL and
interactive smoke evidence is historical; the final closeout evidence is in
section 8A. Remote CI and Desktop Build are not inferred from local results.

## 1B. Final Phase 6.1 closeout — 2026-08-27

This closeout fixes the two remaining verified runtime gaps and closes the
Phase 6.1 implementation boundary from a code-hardening perspective:

- The desktop runtime-config IPC handler now returns the explicit serializable
  result `{ ok: true, config }` or `{ ok: false, code }`, with only the two
  expected codes `PACKAGED_SOCKET_URL_MISSING` and `SOCKET_URL_INVALID`.
  Expected technical details remain in main-process logs; unexpected errors
  still reject. The preload type exposes that result, the renderer converts an
  expected failure to local `RuntimeConfigLoadError`, and `AppBootstrap` uses a
  renderer-local predicate rather than IPC Error identity/name/message.
- The final production renderer inventory contains `.woff`, `.woff2`, and
  `.ttf` files, including the board `BeVietnamPro-ExtraBold-…​.ttf`. The pure
  packaged-renderer MIME helper maps those formats to `font/woff`, `font/woff2`,
  and `font/ttf` while preserving the existing mappings and safe unknown-file
  fallback.
- No generic asset-readiness authority, room/gameplay asset gate, duplicate
  presentation path, rule authority, or Phase 6.2 packaging metadata was
  introduced.

The implementation boundary is closed; the distributed app is not claimed to
be release-ready. The actual production endpoint value and normal installed-app
injection, native Windows/macOS metadata, clean install/launch/uninstall, live
multiplayer and reconnect matrix, spectator/FINISHED/Play Again/second match,
accessibility/scaling, audible validation, 30–60 minute soak, and
signing/notarization remain open Phase 6.2 or external release gates.

## 1C. Phase 6.2 implementation evidence — 2026-08-27

The Phase 6.2 implementation boundary is complete, but the release decision is
still open. The detailed ledger is in
[06B_PHASE_6_2_RELEASE_VERIFICATION.md](06B_PHASE_6_2_RELEASE_VERIFICATION.md).

- `package.json` version `3.0.0` is the canonical release source. The desktop
  package mirrors that version for workspace metadata; deterministic release
  validation rejects drift. Forge applies the canonical version to Electron
  metadata and the Squirrel setup name.
- The existing approved `apps/client/public/favicon.svg` was used to produce
  validated Windows `.ico` and macOS `.icns` files. The native files are checked
  for required container headers/entries before packaging.
- `release-config.json` is generated during renderer preparation and copied to
  packaged Electron resources. Release mode requires an absolute HTTP(S)
  endpoint before Forge runs; CLI and `OWN_THE_BLOCK_SOCKET_URL` remain the QA
  overrides, and missing packaged configuration remains fail-closed.
- The server default production CORS origin is the explicit packaged origin
  `app://own-the-block`; `CORS_ORIGIN` still replaces it when configured. The
  Socket.IO polling test covers same-origin, packaged-origin, and disallowed
  origin behavior without using permissive `*`.
- The pre-correction controlled Windows x64 release produced versioned Squirrel
  artifacts and validated SHA-256 metadata. Its clean install created the
  expected app, registry entry, and shortcuts, and its execution stub launched
  an executable process. That process-existence observation was not a renderer,
  Join-screen, graceful-quit, relaunch, or installed-runtime PASS. Standard
  uninstall removed registration and shortcuts but left the application
  directory after the wait window; that reproduction remains **FAIL**.
- The release-candidate workflow includes Windows x64, macOS x64, and macOS
  arm64 jobs, artifact upload, unsigned-validation handling, and secret-backed
  signing/notarization verification. At the time of this 2026-08-27 entry, no
  current-branch remote run had yet been inspected; final evidence is recorded
  in section 1F.

These changes preserve SERVER OWNS TRUTH → PresentationController →
AnimationQueue → PresentationStore → GameScene/R3F or legacy fallback, and the
single AudioEngine/AudioProvider path. No gameplay, protocol, migration,
GameCore, presentation, queue, renderer, or audio architecture change was
made.

## 1D. Corrective Phase 6.2 pass — 2026-08-27

The corrective pass began at the required starting SHA
`e035e34ecd7cb0d587cda4c555bb914f2d701b67` with a clean worktree. The
implementation changes are limited to the Release Candidate matrix and
deterministic generated-output cleanup, macOS temporary-keychain/signing and
final-DMG notarization order, Squirrel lifecycle/updater-grace behavior, native icon
wiring, CORS wording/tests, and the three evidence ledgers.

The final local unsigned-validation release build passed with the test-only
endpoint `http://127.0.0.1:8080`. The final manifest and checksums were produced
after the make step and, for signed macOS, the final DMG mutation steps are
ordered before collection. macOS x64 (`macos-15-intel`) and arm64 (`macos-15`)
jobs are source-configured but were not executable on this Windows host; no
real signing credentials were supplied.

The pre-correction Squirrel uninstall failure was reproduced: exit code 0 did
not prevent `app-3.0.0`, `.dead`, and `Update.exe` residue after registry and
shortcut removal. The 2026-08-27 UAC-canceled attempt was superseded on
2026-08-28 by a fresh final-artifact install: install registration, packaged
configuration, renderer/Join observation, graceful quit, and relaunch passed.
The standard uninstaller still removed registration and shortcuts while leaving
the exact install root, `app-3.0.0`, and `Update.exe` after the bounded wait, so
that gate is **FAIL/BLOCKED**. Host-launched direct executions also reproduced a
native `0x80000003` breakpoint while the Computer Use launch path opened the
renderer; no source change is claimed for this host-context failure. Exact test
residue was cleaned after capture. At the time of this 2026-08-27 entry, no
source-valid workflow was treated as an executed workflow result, and no
polling CORS result is treated as WebSocket-origin rejection or authentication.

## 1E. Final Phase 6.2 Windows closeout — 2026-08-28

The final controlled Windows x64 artifact was rebuilt and checksum validated
with the test-only loopback endpoint `http://127.0.0.1:8080`; the exact hashes
and complete installer ledger are in `06B_PHASE_6_2_RELEASE_VERIFICATION.md`.
The database-enabled test rerun was **BLOCKED** by the safety guard because the
configured database URL was not proven isolated. Migration/status checks and
non-database tests are reported separately.

## 1F. Final Phase 6 engineering closeout — 2026-08-28

The executable engineering freeze point is:

`VERIFIED_PHASE_6_ENGINEERING_SHA=05c2cf0b626c4db8a43b7fe31bd53122f161fa78`

The workflow-only PR #1 added only `.github/workflows/release-candidate.yml`
and merged into `main` as `4727909f51f5ac0efd919bca04f47b280d81636b`. The full
Phase 6 branch was not merged into `main`.

| Evidence | Result | Record |
|---|---|---|
| Starting SHA | **PASS** | `05c2cf0b626c4db8a43b7fe31bd53122f161fa78` |
| Exact-SHA CI | **PASS** | Run `33179037021`; exact head SHA verified |
| Exact-SHA Desktop Build | **PASS** | Run `33179037009`; exact head SHA verified |
| Release Candidate quality gates | **PASS** | Run `33181099766`, job `98882188069` |
| Release Candidate Windows x64 | **PASS** | Job `98882750089` |
| Release Candidate macOS x64 | **PASS** | Job `98882750073` |
| Release Candidate macOS arm64 | **PASS** | Job `98882750053` |
| Squirrel lifecycle implementation | **PASS** | Bounded updater grace and `app.quit()` remain; the app does not recursively delete the Squirrel root. |
| Squirrel zero-residue uninstall | **Accepted upstream Squirrel limitation / external installer behavior** | Final standard uninstall removed registration and shortcuts but left the exact install root, `app-3.0.0`, and `Update.exe` after the bounded wait. |

The Release Candidate used the controlled test-only endpoint
`http://127.0.0.1:8080` with `unsigned-validation`. It is not a production
endpoint, and no production endpoint was invented or committed.

Final engineering status: **Phase 6 engineering: COMPLETE**.

Production release readiness: **NOT YET APPROVED**. Remaining external or
release-owner gates are the real deployed multiplayer endpoint, production
Windows signing, production Apple signing/notarization, public-network live
multiplayer validation, speaker-backed audio UAT, accessibility/manual QA, and
long-session soak where still outstanding.

`PHASE_6_CLOSEOUT_DOCS_SHA=88f1eb10ba85114486c29e79e3d9509e13c03d6a`

## 2. Evidence snapshot

The following is retained as the Phase 6.0 audit-time evidence snapshot; the
Phase 6.1 results are recorded in section 8A and must not be inferred from this
older baseline.

- Audit-time HEAD was e4ce23d on the new local Phase 6 branch. The worktree was clean
  before the documentation changes.
- Current local Phase 4 UAT renderer measurements in the in-app browser at the
  observed 1280 × 720 viewport were: four-station baseline 199 draw calls and
  63,366 triangles; board-readability fixture 227 and 66,234; stress fixture
  214 and 64,640; reduced-motion fixture 217 and 76,668. The normal draw target
  is 210, the stress limit is 240, the triangle target is 80,000, and the hard
  triangle limit is 100,000.
- The board-readability fixture remains above the normal draw target but below
  the hard stress limit. This is accepted performance debt and a release
  profiling gate, not unfinished gameplay authority.
- The browser run produced no page errors; it exposed one existing
  THREE.Clock deprecation warning. The renderer diagnostic is a demand-render
  scene measurement. FpsBadge measures browser requestAnimationFrame cadence and
  is not proof of continuous R3F rendering.
- User-supplied remote evidence for that audit-time SHA records CI PASS and
  Desktop Build PASS. CI provisions PostgreSQL 17, sets DATABASE_URL and
  TEST_DATABASE_URL, applies migrations, and runs the workspace gates. Desktop
  Build runs the Windows and macOS makers. This is recorded separately from the
  local reruns below.

## 3. Classification key

- **A** — implemented and sufficiently automated.
- **B** — implemented, but validation or manual evidence is incomplete.
- **C** — genuine implementation gap.
- **D** — optional; implement only if profiling or acceptance evidence proves the
  need.
- **E** — manual or external release gate.
- **F** — obsolete or superseded by the current architecture.

## 4. Current-code capability matrix

The following matrix is the Phase 6.0 audit-time snapshot. Section 1A records
the subsequent Phase 6.1 implementation and the remaining proof boundaries;
historical classifications are retained so the original audit evidence is not
silently rewritten.

| Area | Current implementation/evidence | Classification | Gap/risk | Severity | Exact files | Recommended action | Automated validation | Manual/external validation | Phase assignment |
|---|---|---|---|---|---|---|---|---|---|
| Bootstrap and loading | AppBootstrap stages settings, runtime config, asset touch, and client initialization. LoadingScreen has explicit stages and reduced-motion CSS. The asset touch currently fetches only favicon.svg. | B | Flow is present, but there is no evidence for production first-render timing or asset pop-in. Do not create a fake progress pipeline. | P2 | apps/client/src/app/bootstrap/bootstrap.ts; apps/client/src/app/bootstrap/AppBootstrap.tsx; apps/client/src/app/screens/LoadingScreen.tsx | Preserve staged loading. Validate the exact board entry path before adding any prewarm. | Existing client suite; no direct bootstrap test. Add only if a 6.1 change touches this path. | Browser and packaged cold-start/error/retry smoke. | 6.1 validation |
| Generic critical-asset gate | Mascot SVG is bundled and rasterized on demand; dice, SFX, music, and several board surfaces are procedural; GameScene is lazy; two repeated card icons are prewarmed. There is no server-side asset-ready authority. | F | The old “all critical assets before gameplay” requirement does not describe the current local-bundle/procedural architecture. | — | apps/client/src/game/scene/GameScene.tsx; apps/client/src/game/characters/characterTextureCache.ts; apps/client/src/game/scene/special/RaisedSvgTileIcon.tsx; apps/client/src/game/scene/cards/PhysicalCardDecks.tsx; apps/client/src/design-system/typography/gameFonts.ts | Keep the current asset ownership. Add targeted prewarm only if profiling or visual UAT demonstrates a material pop-in. | Existing cache and renderer tests. | Cold browser and Electron visual inspection of mascot, board font, special icons, cards, and first interactive frame. | F |
| Session, reconnect, spectator, and replay lifecycle | App handles RESTORING, JOINING, LOBBY, GAME, RECONNECTING, REPLACED, and ERROR. SESSION_SYNC, SPECTATOR_SYNC, and REPLAY_SYNC use the existing snapshot reset boundary; socket listeners and cleanup are explicit. | B | In-memory and unit coverage is strong, but live 2–4 player disconnect/reclaim, pending-card, payment, bankruptcy, spectator, FINISHED, and Play Again evidence is incomplete locally. | P1 | apps/client/src/App.tsx; apps/client/src/game/presentation/PresentationController.ts; apps/server/src/services/playerSessionService.ts; apps/server/src/rooms.ts; apps/server/src/socket.integration.test.ts | Preserve server/shared authority and run the scenario matrix. Do not add a second reconnect architecture. | Root test PASS; server persistence-gated tests are separately reported. | Live browser/Electron 2–4 player matrix including idle, dice, movement, card, payment, bankruptcy, spectator, FINISHED, and Play Again. | 6.2 |
| Presentation ownership and reset | Typed accepted events feed the single PresentationController → AnimationQueue → PresentationStore path. Reset, skip, reduced motion, abort, replay, and stale-event protection are implemented. One-shot histories are bounded to 64 and character signals to 128. | A | No duplicate queue, event bus, log-derived event path, or client rule authority was found. | — | apps/client/src/game/presentation/PresentationController.ts; apps/client/src/game/presentation/queue/AnimationQueue.ts; apps/client/src/game/presentation/store/presentationStore.ts; apps/client/src/game/presentation/executors | Freeze this architecture. Any future cue must consume typed authoritative milestones through the existing path. | PresentationController, queue, store, executor, and Board tests; root suite PASS. | Live reconnect, skip, reduced-motion, and Play Again visual sequencing. | Preserve; validate in 6.2 |
| Audio runtime | AudioEngine is the only production AudioContext owner. AudioProvider owns unlock/listeners and settings routing. Registry, buses, cooldowns, polyphony, aborts, presentation scope, music lifecycle, and disposal are covered. | B | Code and synthetic-node tests pass; speaker output, clipping, fatigue, browser autoplay, and Electron audio are not proven. | P1 | apps/client/src/audio/AudioEngine.ts; apps/client/src/audio/AudioProvider.tsx; apps/client/src/audio/audioRegistry.ts; apps/client/src/game/presentation/executors | Preserve one engine and one AudioPort path. Do not add an asset audio pipeline or second engine without evidence. | AudioEngine and AudioProvider tests; root suite PASS. | Browser/Electron audible SFX, music, volume persistence, autoplay unlock, hidden/resume, fatigue, and cleanup session. | 6.2 |
| Renderer, budgets, and React demand rendering | Fixed orthographic camera, frameloop demand, DPR 1.25–1.5, disabled shadows, high-performance context, scene diagnostics, and explicit draw/triangle budgets exist. Current fixtures are recorded above. | B | Current draw counts are within hard limits but the board fixture exceeds the normal draw target. No long-session, low-end, memory, or real R3F cadence evidence exists. | P2 | apps/client/src/game/scene/GameScene.tsx; apps/client/src/game/scene/board/architecture/sceneBudget.ts; apps/client/src/game/ui/FpsBadge.tsx; apps/client/src/dev/phase4-uat/Phase4UatHarness.tsx | Re-measure at release viewports and soak before changing geometry, DPR, camera, or render modes. | Scene-budget, geometry, diagnostics, and UAT fixture coverage; local build and tests PASS. | 30–60 minute session, resize/scaling matrix, low-end profile, memory trend, and active animation/clutter review. | 6.2 |
| Resource ownership and bounded caches | Character texture cache is reference-counted and disposes stale textures. Per-component SVG textures dispose on unmount; two repeated card textures are intentionally app-lifetime shared. District materials release, and audio/queue listeners dispose. | A | No unbounded cache or confirmed long-session leak was found. App-lifetime shared resources are bounded by fixed asset keys and are not per-room allocations. | — | apps/client/src/game/characters/characterTextureCache.ts; apps/client/src/game/scene/special/RaisedSvgTileIcon.tsx; apps/client/src/game/scene/board/materials/districtSurfaceMaterials.ts; apps/client/src/audio/AudioEngine.ts; apps/client/src/game/presentation/queue/AnimationQueue.ts | Preserve ownership and disposal. Use soak evidence to detect regressions; do not delete shared resources merely because they are long-lived. | Cache, material, audio, queue, and StrictMode listener tests. | DevTools/WebGL and audio-node observation during a long session and reconnect/replay cycle. | 6.2 validation |
| WebGL fallback and accessibility | supportsWebGL selects WebGL or legacy; SceneErrorBoundary switches renderer; board has semantic tile buttons, aria-busy/inert behavior, focusable tile controls, reduced motion, modal focus handling, and connection status. | B | Actual fallback, screen-reader, keyboard-only, focus restoration, contrast, reduced-motion, and Electron viewport evidence remains incomplete. Scene fallback is intentionally silent except for the legacy board. | P1 | apps/client/src/components/Board.tsx; apps/client/src/game/scene/fallback/SceneErrorBoundary.tsx; apps/client/src/game/scene/fallback/webglSupport.ts; apps/client/src/components/BoardAccessibilityControls.tsx; apps/client/src/design-system/components/Modal/Modal.tsx | Run the existing accessibility and comfort checklist. Fix only observed release defects; do not redesign the board/camera. | Board, fallback, accessibility, modal, reduced-motion, and settings tests. | Keyboard-only, screen-reader/semantic inspection, forced WebGL failure, 100/125/150% scaling, reduced motion, and contrast. | 6.2 |
| Top-level React failure containment and safe error copy | SceneErrorBoundary protects the 2.5D scene, but index.tsx has no top-level React error boundary. BootstrapErrorScreen renders the supplied error string directly. | C | A non-scene render failure can blank the app, and a production bootstrap error may expose implementation detail. | P1 | apps/client/src/index.tsx; apps/client/src/app/bootstrap/AppBootstrap.tsx; apps/client/src/app/screens/BootstrapErrorScreen.tsx; apps/client/src/game/scene/fallback/SceneErrorBoundary.tsx | Add one top-level boundary and map production errors to safe user copy while logging technical detail. Keep the existing scene-to-legacy boundary; do not add a second rendering architecture. | Add boundary fallback, safe-message, retry, and logging tests without changing server/shared contracts. | Deliberate render failure and malformed packaged runtime-config smoke in browser and Electron. | 6.1 |
| Settings and fullscreen intent | Versioned local settings persist volumes, animation speed, reduced motion, and fullscreen. Native fullscreen changes sync through the bridge. On startup getState currently overwrites persisted fullscreen before applying the saved intent. | C | A saved fullscreen preference is not reliably restored after reopening the desktop app. | P1 | apps/client/src/settings/SettingsProvider.tsx; apps/client/src/settings/storage.ts; apps/client/src/settings/defaults.ts; apps/client/src/settings/SettingsPanel.tsx; apps/desktop/src/ipc/windowHandlers.ts | Recommended decision: apply persisted intent once at desktop startup, then treat native enter/leave events as authoritative. Add a guarded first-sync and preserve reset-to-windowed behavior. | Add a provider test for persisted true plus native startup false, then retain existing event/reset tests. | Reopen packaged app with fullscreen true and false, use native shortcut, settings reset, and verify persistence. | 6.1 |
| Electron security and lifecycle | contextIsolation, nodeIntegration false, sandbox, webSecurity, app:// path guard, CSP, external-link validation, preload whitelist, production input policy, and quit confirmation are implemented and tested. | A | Security automation is present; packaged runtime and close behavior still need an installed-app smoke. | P1 | apps/desktop/src/main.ts; apps/desktop/src/preload.ts; apps/desktop/src/security.ts; apps/desktop/src/ipc/windowHandlers.ts; apps/desktop/src/ipc/externalLinks.ts; apps/desktop/tests | Preserve the boundary and test packaged behavior. Do not widen IPC or enable Node in the renderer. | Desktop security, preload bundle, production policy, and quit-controller tests; desktop test PASS. | Packaged app launch, close while active, renderer navigation, external-link, DevTools, and IPC smoke. | 6.2 |
| Packaged multiplayer endpoint | Desktop runtime config accepts --socket-url or OWN_THE_BLOCK_SOCKET_URL, otherwise falls back to http://127.0.0.1:8080. The client receives the bridge config; the packaged app does not include the server. | C | Normal distributed packages have no repository-defined deployed endpoint and therefore default to an unreachable local server. | P0 | apps/desktop/src/runtimeConfig.ts; apps/desktop/src/main.ts; apps/desktop/src/preload.ts; apps/client/src/runtime/runtimeConfig.ts; apps/client/.env.example; README.md | Decide and supply the real HTTPS/HTTP release origin at build or signed-config time. Validate it, fail closed for missing packaged configuration, retain loopback only for development, and add a visible safe failure path. Do not invent or commit a deployment URL here. | Add runtime-config tests for dev fallback, release injection, invalid protocol, and missing packaged configuration; add packaged smoke coverage. | Install a package with the release endpoint, connect two clients to a real server, verify reconnect and CSP/WebSocket behavior. | 6.1 decision and implementation; 6.2 proof |
| Installed runtime, signing, notarization, and OS acceptance | CI and Forge define Windows Squirrel and macOS DMG maker jobs; no installed-app, certificate, notarization, or cross-OS runtime evidence is available in this local audit. | E | These are external release gates. A package or maker PASS cannot establish installation, launch, endpoint connectivity, uninstall, signing, or notarization. | P0 when public distribution requires it | apps/desktop/forge.config.cjs; apps/desktop/package.json; .github/workflows/desktop-build.yml; testcase/http-runtime-and-deployment.md | Assign the release owner to run clean install/launch/uninstall and provide signing/notarization evidence for the target OSes. | No automated substitute for certificate, notarization, or installed-runtime behavior. | Windows 10/11, macOS supported targets, 100/125/150% scaling, clean install, launch, real endpoint, quit, uninstall, signing, and notarization. | 6.2 |
| Forge packaging and makers | Electron Forge config enables asar, resources client/dist, Windows Squirrel, and macOS DMG. Local desktop package PASS; user-supplied exact-SHA Desktop Build PASS on Windows and macOS makers. | B | Package/maker success proves artifact creation, not install, launch, multiplayer, signing, notarization, or uninstall. | P1 | apps/desktop/forge.config.cjs; apps/desktop/package.json; .github/workflows/desktop-build.yml; apps/desktop/scripts | Keep the configured makers. Verify artifact contents and the packaged endpoint after the endpoint decision. | desktop typecheck/tests/package PASS; remote Desktop Build PASS. | Run maker artifacts through clean install, launch, upgrade-free uninstall, and runtime smoke on Windows and macOS. | 6.2 |
| Native icon and release metadata | Product name is Own the Block and desktop package version is 1.0.0; root package version is 3.0.0. Forge has no packager icon; renderer favicon assets are not native .ico/.icns configuration. | C | Artifacts can carry generic/default native branding and version provenance is not clearly unified. | P1 | package.json; apps/desktop/package.json; apps/desktop/forge.config.cjs; apps/client/public/favicon.svg; apps/client/public/favicon.ico; apps/client/public/favicon_don.ico | Choose one release version source, configure Forge icon metadata, and supply verified Windows .ico and macOS .icns assets. Add artifact metadata checks. | Test selected version and icon configuration in package/maker outputs. | Inspect installed shell icon, About/version surface, Squirrel metadata, DMG/app bundle metadata, and clean uninstall. | 6.2 |
| Server startup, readiness, shutdown, and recovery | index.ts performs migrations, readiness-backed health, graceful scheduler/socket/server/persistence shutdown, and production static serving. Postgres persistence uses aggregate-version CAS; session/deadline recovery is durable. | A | Implementation and automation exist; current machine has no PostgreSQL listener on 127.0.0.1:5433, so local database evidence is unavailable. | P1 | apps/server/src/index.ts; apps/server/src/createServer.ts; apps/server/src/config.ts; apps/server/src/persistence/postgres.ts; apps/server/src/services/deadlineScheduler.ts; apps/server/src/socket.integration.test.ts | Preserve the current lifecycle. Treat local DB as an evidence gap, not a reason to weaken persistence or replace it with memory. | In-memory server tests PASS; remote CI exact-SHA PASS with PostgreSQL 17 and database variables. | Run local migration, restart, readiness, reconnect, and deadline-recovery checks when PostgreSQL is available. | 6.2 |
| V8 shared/public/private contract | V8 room snapshots, typed semantic events, private card/deck state, rollSequence, activity feed, and Socket.IO schemas are current. Migration 009 initializes typed activity without reconstructing legacy logs. | A | No Phase 6 protocol, snapshot, migration, or rules change is required by this audit. | — | packages/shared/src/types.ts; packages/shared/src/socket.ts; packages/shared/src/events.ts; packages/shared/src/socketSchemas.ts; apps/server/src/rooms.ts; apps/server/migrations/009_activity_feed_v8.sql | Freeze V8 and preserve SERVER OWNS TRUTH / CLIENT OWNS PRESENTATION. | Shared/server/client contract suites and root test PASS. | Live compatibility and reconnect proof only; no new migration. | F for Phase 6 implementation |
| Quality modes and bundle optimization | No High/Balanced/Low setting exists. Build emits an existing large main-chunk advisory of about 1.63 MB minified. | D | A quality system or route split without device/perf evidence would add settings and rendering complexity without a proven need. | P2 | apps/client/src/settings/types.ts; apps/client/src/settings/defaults.ts; apps/client/src/settings/SettingsPanel.tsx; apps/client/src/game/scene/GameScene.tsx; apps/client/vite.config.ts | Profile first. If needed, add the smallest single policy or split justified by measurements; do not retune the board or add quality modes speculatively. | Build PASS with advisory; no implementation is justified yet. | Low-end startup/FPS/memory profile and settings usability review. | Conditional 6.1 |
| Auto-update, analytics, accounts, cloud saves, and unrelated polish | No auto-update or account/cloud-save system is present; current Phase 5 and V8 boundaries intentionally exclude them. | F | These are not release-readiness prerequisites for the current local multiplayer build and would expand scope materially. | — | project-document/ui-ux-overhaul/05_PHASE_5_GAME_FEEL_AUDIO_EFFECTS.md; project-document/ui-ux-overhaul/06_PHASE_6_POLISH_DISTRIBUTION.md | Keep auto-update post-v1 and exclude analytics, accounts, cloud saves, rules/economy changes, board redesign, and unrelated refactors. | No validation required for excluded work. | Product decision after v1 only. | F |

## 5. Confirmed C gaps and bounded proposals

The following are the only implementation gaps approved by this audit. They are
documentation decisions from the audit snapshot, not changes made in Phase 6.0.
Section 1A records the Phase 6.1 follow-up for C1–C3; C4 and the external
release gates remain open.

### C1. Packaged endpoint configuration — P0

- **Current behavior:** apps/desktop/src/runtimeConfig.ts resolves a CLI value,
  OWN_THE_BLOCK_SOCKET_URL, or loopback. main.ts validates the config but the
  package contains no server. No deployed origin is defined in the repo.
- **Risk:** a normally installed package starts but cannot join a real multiplayer
  room without undocumented machine-specific configuration.
- **Minimal change:** make a real release origin an explicit build or signed
  configuration input; validate http/https; reject missing configuration only for
  packaged builds; keep loopback fallback for development; surface a safe
  bootstrap error rather than silently entering a dead reconnect loop.
- **Dependencies and invariants:** release owner must provide the actual origin.
  Keep CSP compatible with the selected origin, preserve preload-only config
  delivery, do not place secrets in the renderer, and do not add a server-side
  asset or endpoint authority.
- **Automated evidence:** runtime-config unit tests for CLI, environment,
  invalid protocol, missing release input, and app version; one packaged
  configuration smoke.
- **Manual/external evidence:** clean-install package, connect two clients to the
  real server, verify health/Socket.IO upgrade, reconnect, and production error
  behavior.
- **Recommended subphase:** 6.1 for the decision and implementation; 6.2 for
  packaged proof.

### C2. Fullscreen preference restoration — P1

- **Current behavior:** SettingsProvider persists fullscreen but immediately
  synchronizes from native getState. Electron starts windowed, so a saved true
  preference can be overwritten before it is applied.
- **Risk:** the persisted setting appears to work in-session but is lost across
  desktop relaunch.
- **Minimal change:** on the first desktop mount, apply the persisted intent once,
  then subscribe to native state changes. Keep resetSettings explicitly
  windowed and preserve native state as authoritative after startup.
- **Dependencies and invariants:** no protocol, schema, or new settings version;
  retain the existing bridge and listener cleanup.
- **Automated evidence:** provider test for saved true plus native false, saved
  false plus native true, reset, and enter/leave events.
- **Manual/external evidence:** reopen packaged app in both states and use native
  fullscreen controls.
- **Recommended subphase:** 6.1.

### C3. Top-level render failure and production error copy — P1

- **Current behavior:** SceneErrorBoundary only covers the 2.5D scene. The root
  render path has no boundary, and BootstrapErrorScreen prints its error prop.
- **Risk:** an unrelated React render failure can blank the whole client; bridge
  or asset details may be shown to players.
- **Minimal change:** add one root boundary with a stable safe message and retry or
  reload policy, and map technical bootstrap errors to a safe user message while
  retaining diagnostic logging. Keep the existing renderer fallback.
- **Dependencies and invariants:** React/client-only change; no duplicate
  presentation path, socket authority, or protocol change.
- **Automated evidence:** boundary rendering, safe-message, retry, and logging
  tests; retain SceneErrorBoundary tests.
- **Manual/external evidence:** deliberate component throw, malformed runtime
  config, and renderer failure in browser and packaged Electron.
- **Recommended subphase:** 6.1.

### C4. Native icon and version provenance — P1

- **Current behavior:** Forge does not configure packager icon metadata; renderer
  favicon files exist, but no native .icns is present and the workspace and
  desktop package versions differ.
- **Risk:** generic OS branding and ambiguous artifact versioning weaken release
  trust and supportability.
- **Minimal change:** choose the release version source, add verified native
  .ico/.icns assets, wire the existing Forge packager configuration, and assert
  artifact metadata.
- **Dependencies and invariants:** requires product/version and artwork inputs;
  no gameplay, protocol, or renderer architecture change.
- **Automated evidence:** package/maker metadata inspection and a deterministic
  config test.
- **Manual/external evidence:** Windows shell icon, Squirrel metadata, macOS
  bundle/DMG metadata, About/version surface, and uninstall.
- **Recommended subphase:** 6.2.

## 6. Conditional D work

### D1. Targeted asset prewarm — only after pop-in evidence

The current local asset strategy is intentional and bounded.

- **Files/components:** apps/client/src/app/bootstrap/bootstrap.ts,
  GameScene.tsx, characterTextureCache.ts, RaisedSvgTileIcon.tsx,
  PhysicalCardDecks.tsx, and gameFonts.ts.
- **Current behavior and risk:** only favicon.svg is touched by bootstrap; the
  board and procedural systems load through their existing owners. A real
  first-frame pop-in has not been established.
- **Minimal change:** if cold-start inspection proves a material gap, prewarm
  only the exact existing board font, special-icon, mascot, or card cache entry.
- **Dependencies and invariants:** use current local bundle/cache ownership;
  never add a generic loader, block gameplay on unmeasured work, or add a server
  “asset ready” event.
- **Automated evidence:** existing cache, renderer, and asset-owner tests; add a
  focused test only for a changed prewarm owner.
- **Manual evidence:** cold browser and Electron inspection of the first
  interactive frame, mascot, board font, special icons, and cards.
- **Recommended subphase:** conditional 6.1.

### D2. Quality policy or bundle split — only after profiling

The board is inside hard geometry/draw budgets, although normal draw target
evidence is not fully comfortable.

- **Files/components:** apps/client/src/game/scene/GameScene.tsx,
  sceneBudget.ts, apps/client/src/settings/types.ts, defaults.ts,
  SettingsPanel.tsx, and apps/client/vite.config.ts.
- **Current behavior and risk:** no quality setting exists; the production build
  reports an existing large main chunk. Adding tiers or splitting routes without
  device evidence would create settings and rendering complexity without a
  proven benefit.
- **Minimal change:** profile startup, low-end rendering, and memory first; if a
  measured problem remains, add one small policy at the existing Canvas/settings
  boundary or split the proven startup offender.
- **Dependencies and invariants:** preserve the fixed camera, current demand
  rendering, scene budgets, and single renderer; do not arbitrarily change DPR
  or add High/Balanced/Low modes.
- **Automated evidence:** current build PASS with advisory and scene-budget
  tests; add regression tests only for a measured change.
- **Manual evidence:** low-end startup/FPS/memory profile and settings usability
  review at supported scaling.
- **Recommended subphase:** conditional 6.1.

## 7. Final Phase 6 decomposition

Phase 6 contains two implementation boundaries after this audit:

1. **Phase 6.1 — Release Hardening**
   - decide and implement validated packaged endpoint configuration;
   - add top-level safe render/bootstrap failure handling;
   - restore persisted fullscreen intent;
   - add only evidence-backed targeted asset prewarm or bundle/quality work;
   - add focused automated tests for each changed boundary.

2. **Phase 6.2 — Distribution and Release Verification**
   - wire native icon and one release version source;
   - build and inspect Windows Squirrel and macOS DMG/app artifacts;
   - verify clean install, launch, runtime endpoint, uninstall, and desktop
     security behavior;
   - execute the browser/Electron, live multiplayer/reconnect, accessibility,
     audio, long-session, performance, and OS/viewport acceptance matrix;
   - complete signing/notarization with the release owner where distribution
     requires it.

Auto-update remains post-v1. No third implementation subphase is justified.

## 8. Validation record for this audit

| Command or evidence | Result | Record |
|---|---|---|
| pnpm db:status | **FAIL** | Configured PostgreSQL at 127.0.0.1:5433 returned ECONNREFUSED. Local PostgreSQL integration/restart evidence is NOT RUN. |
| pnpm typecheck | **PASS** | Workspace typecheck completed. |
| pnpm lint | **PASS** | ESLint completed. |
| pnpm test | **PASS** | Desktop 4 files and 12 tests; server 12 files with 149 passed and 10 PostgreSQL-gated skips; client 87 files and 493 tests. |
| pnpm build | **PASS** | Client production build completed; existing large main-chunk advisory remains. |
| pnpm --filter @monopoly/desktop typecheck | **PASS** | Desktop typecheck completed. |
| pnpm --filter @monopoly/desktop test | **PASS** | 4 files and 12 tests after the same-command Windows spawn-EPERM environment retry. |
| pnpm desktop:package | **PASS** | Windows x64 Electron package completed after the same-command spawn-EPERM environment retry. Package is not an install/runtime proof. |
| git diff --check | **PASS** | Final documentation diff must remain whitespace-clean. |
| Current-HEAD deterministic browser UAT | **PASS for fixture rendering** | Current metrics recorded in section 2; no claim of live gameplay, long-session, or audible acceptance. |
| User-supplied remote CI at e4ce23d | **PASS** | CI passed with PostgreSQL 17 and both database variables. |
| User-supplied remote Desktop Build at e4ce23d | **PASS** | Windows and macOS maker jobs passed. This does not prove signed/notarized or installed runtime behavior. |

## 8A. Validation record for the final Phase 6.1 closeout

| Command or evidence | Result | Record |
|---|---|---|
| `pnpm install --frozen-lockfile` | **PASS** | Dependencies were already current; the registry update check emitted a non-blocking warning. |
| `pnpm typecheck` | **PASS** | Workspace typecheck completed on the final source and tests. |
| `pnpm lint` | **PASS** | Final lint completed after the last source/test edits. |
| `pnpm test` | **PASS** | Desktop 7 files/24 tests; server 12 files/149 passed and 10 database-gated skips; client 90 files/499 tests. |
| `pnpm build` | **PASS** | Client production build completed; existing large main-chunk advisory remains. |
| Focused client tests | **PASS** | 3 files/5 tests, covering structured runtime conversion, safe bootstrap copy, and top-level recovery. |
| Focused desktop tests | **PASS** | 3 files/12 tests, covering runtime resolution, all IPC result outcomes, fullscreen settlement, and MIME mappings. |
| `pnpm db:migrate` | **FAIL** | The configured `127.0.0.1:5433` endpoint refused the connection. A process-local retry against the running `5432` PostgreSQL service reached the server but failed password authentication; no credentials or repository database configuration were changed. |
| `pnpm desktop:package` | **PASS** | Windows x64 Electron package completed. Packaging is not install, signing, endpoint, or multiplayer proof. |
| Browser normal startup | **PASS** | Local Vite startup reached Join, reported no browser error/warn logs, and `document.fonts` reported loaded with Be Vietnam Pro available. |
| Electron development startup/fullscreen | **NOT RUN** | This final closeout used the packaged smoke; existing automated fullscreen regression coverage remains PASS, while interactive development restart/native shortcut evidence is retained as a separate gate. |
| Packaged Electron missing endpoint | **PASS** | The built package stayed open on `app://own-the-block` and displayed the runtime-config-safe copy instead of quitting or rendering technical detail. |
| Packaged Electron explicit loopback | **PASS for configuration/renderer smoke** | Explicit `--socket-url=http://127.0.0.1:8080` was accepted and the packaged renderer loaded; no live server endpoint was supplied. |
| Packaged font console/decode inspection | **NOT RUN** | Production asset inventory and MIME tests pass; packaged DevTools/console capture for font decode errors was not available. |
| Docker PostgreSQL stack | **NOT RUN** | Docker Desktop named-pipe access was unavailable. |

## 8B. Validation record for the Phase 6.2 implementation

| Command or evidence | Result | Record |
|---|---|---|
| `pnpm install --frozen-lockfile` | **PASS** | Workspace dependencies were already current with pnpm 11.15.1. |
| `pnpm db:migrate` | **PASS** | Database schema was already up to date. |
| `pnpm typecheck` | **PASS** | All four typed workspace packages completed. |
| `pnpm lint` | **PASS** | ESLint completed after the final source edit. |
| `pnpm test` | **PASS** | Desktop 9 files/38 tests; server 12 files/150 passed and 10 database-gated skips; client 90 files/499 tests. |
| Database-enabled server suite | **BLOCKED** | Not rerun: the safety guard rejected using the configured database URL because isolation was not proven. The root suite retained its 10 database-gated skips. |
| `pnpm db:status` | **PASS** | All nine repository migrations reported applied. |
| `pnpm build` | **PASS** | Production renderer build completed; existing large main-chunk advisory remains. |
| `pnpm --filter @monopoly/client test` | **PASS** | 90 files/499 tests. |
| `pnpm --filter @monopoly/client typecheck` | **PASS** | Client typecheck completed. |
| `pnpm --filter @monopoly/desktop typecheck` | **PASS** | Desktop typecheck completed. |
| `pnpm --filter @monopoly/desktop test` | **PASS** | 9 files/38 tests, including release metadata and Squirrel lifecycle coverage. |
| `pnpm desktop:package` | **PASS** | Windows x64 sanity package completed without a release endpoint. |
| `pnpm desktop:make` | **PASS** | Windows x64 Squirrel maker completed without a release endpoint. |
| `pnpm desktop:release` with controlled endpoint | **PASS** | Windows x64 Squirrel make, endpoint injection, manifest collection, and checksum validation completed. |
| `git diff --check` | **PASS** | No whitespace errors. Git reported only line-ending normalization warnings. |
| Pre-correction Windows install and process launch | **PASS: limited evidence** | Setup created `app-3.0.0`, registry/shortcuts, and an executable process. This did not observe the renderer, Join screen, graceful quit, relaunch, or establish installed-runtime PASS. |
| Pre-correction Windows standard uninstall | **FAIL** | Exit code was 0 and registry/shortcuts were removed, but `app-3.0.0` and updater residue remained after the bounded wait; residue was recorded before exact-root cleanup. |
| Corrected final-artifact Windows install/renderer/quit/relaunch | **PASS** | Fresh final artifact installed; exact registration/shortcuts/config were present; Computer Use observed the Join renderer, graceful close, and Join after relaunch. |
| Corrected final-artifact standard Squirrel uninstall | **FAIL/BLOCKED** | `Update.exe --uninstall` returned 0 and removed the uninstall key and shortcuts, but the exact install root, `app-3.0.0`, and `Update.exe` remained after the bounded wait. Host-launched direct executions also reproduced `0x80000003`; exact residue was cleaned after capture. |
| macOS x64 Release Candidate package | **PASS** | Remote unsigned RC job `98882750073` completed the macOS x64 artifact build; local installation remains unrun on this Windows host. |
| macOS arm64 Release Candidate package | **PASS** | Remote unsigned RC job `98882750053` completed the macOS arm64 artifact build; local installation remains unrun on this Windows host. |
| Real deployed endpoint | **BLOCKED** | No release-owner production URL is present; only the controlled loopback endpoint was injected. |
| Live multiplayer/reconnect/replay matrix | **NOT RUN** | Existing integration tests are supporting evidence, not live browser/Electron proof. |
| Accessibility/scaling/visual comfort | **NOT RUN** | No current Phase 6.2 interactive viewport/OS-scaling pass was run. |
| Audible audio acceptance | **NOT RUN** | Automated AudioEngine coverage is not audible proof. |
| 30–60 minute soak | **NOT RUN** | No timed soak was run. |
| Signing | **BLOCKED** | Local artifact mode was unsigned validation; no certificate was available. |
| Notarization | **NOT RUN** | macOS signing/notarization was not run; production notarization remains blocked. |

## 9. Open manual and external release gates

The following remain open and must be reported separately from automated status:

- live 2, 3, and 4 player browser/Electron sessions;
- idle, dice, movement, pending-card, payment shortfall, forced sale,
  bankruptcy, spectator, FINISHED, Play Again, leave/rejoin, and second-match
  reconnect scenarios;
- audible SFX/music balance, autoplay, clipping, fatigue, and node cleanup;
- 30–60 minute memory/FPS/queue/audio/clutter soak;
- keyboard-only, screen-reader, reduced-motion, focus restore, contrast, and
  100/125/150% scaling review;
- WebGL failure and legacy fallback smoke;
- clean macOS install/launch, real endpoint connectivity, graceful quit,
  native metadata on both operating systems, signing, and notarization;
- the Windows standard-uninstall residue observed in section 8B;
- release-owner confirmation of the actual multiplayer endpoint and version
  source.

Use the existing testcase README and relevant checklists:
testcase/client-state-sync-motion-and-accessibility.md,
testcase/http-runtime-and-deployment.md,
testcase/join-room-and-player-lifecycle.md,
testcase/game-status-bankruptcy-and-winner.md,
testcase/payment-shortfall-and-forced-sale.md,
testcase/shared-contracts-and-board-data.md, and the turn, property, trading,
and chat checklists.

## 10. Scope freeze

The Phase 6.0 audit-time scope freeze authorized documentation and validation
only. It did not authorize:

- rules, economy, GameCore, server authority, V8, migration, or snapshot work;
- board, camera, dice, character, or Phase 4 visual redesign;
- a second presentation queue, event bus, history, or AudioEngine;
- a generic preload pipeline or server asset-ready authority;
- quality modes without measurements;
- analytics, accounts, cloud saves, auto-update, or unrelated refactors;
- push, merge, or release publication.

## 11. Documents changed by this audit

- project-document/ui-ux-overhaul/06A_PHASE_6_0_RELEASE_READINESS_AUDIT.md
- project-document/ui-ux-overhaul/06_PHASE_6_POLISH_DISTRIBUTION.md
- project-document/ui-ux-overhaul/00_MASTERPLAN_UI_UX_OVERHAUL.md only to reflect
  the new two-boundary Phase 6 decomposition
- project-document/ui-ux-overhaul/05_PHASE_5_GAME_FEEL_AUDIO_EFFECTS.md and
  project-document/ui-ux-overhaul/05A_PHASE_5_0_AUDIT_AND_SCOPE.md only to
  correct pushed/remote status; Phase 5 is not marked manually closed
- project-document/ui-ux-overhaul/06B_PHASE_6_2_RELEASE_VERIFICATION.md for
  the current Phase 6.2 evidence ledger

The Phase 6.0 deliverable was one focused local documentation commit. The
Phase 6.1 corrective pass and Phase 6.2 distribution implementation add
evidence records in this document, 06_PHASE_6_POLISH_DISTRIBUTION.md, and the
06B ledger; they do not alter the V8/gameplay scope freeze.
