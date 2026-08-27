# Phase 6 — Polish & Distribution

**Status: Phase 6.0 audit and scope lock complete; Phase 6.1 code-hardening
closeout complete; Phase 6.2 implementation complete; release gates open**

Phase 6 is bounded by the current V8 server/shared contract and the existing
client presentation architecture:

SERVER OWNS TRUTH → PresentationController → AnimationQueue →
PresentationStore → GameScene/R3F or the legacy board fallback

Audio remains the single AudioEngine and AudioProvider path. Phase 6 does not
add a second queue, event bus, history, AudioEngine, renderer, or asset-ready
authority.

The detailed evidence and classifications are in
06A_PHASE_6_0_RELEASE_READINESS_AUDIT.md.

## 1. Phase 6.0 — Release Readiness Audit and Scope Lock

This audit phase is documentation and validation only. It reconciles the old
polish/distribution plan with current code and records:

- baseline branch and SHA;
- current bootstrap, settings, session/reconnect, presentation, audio,
  renderer, cache, accessibility, Electron, server, persistence, contract,
  Forge, and CI evidence;
- exact A/B/C/D/E/F classifications;
- current renderer measurements and separate automated, database, browser,
  Electron, manual, remote-CI, commit, push, and merge status;
- genuine implementation gaps and conditional profiling work.

Phase 6.0 makes no production code, protocol, migration, dependency, asset, or
UI change.

### 1.1 Phase 6.1 corrective implementation record — 2026-08-26

The corrective pass reconciled the previous implementation with the Phase 6.0
scope lock before adding release-hardening code:

- The generic critical-asset readiness manager, room asset gate, asset progress
  plumbing, character preload lease, SVG preload/retry additions, and Electron
  MIME additions that existed only to support that gate were removed. No
  profiling or UAT evidence justified a new generic authority. The existing
  reference-counted character cache, shared SVG/card ownership, procedural
  assets, lazy scene loading, and SceneErrorBoundary-to-legacy fallback remain.
  No new targeted prewarm was added.
- Development keeps the loopback socket fallback. Packaged Electron now
  requires an explicitly injected absolute HTTP(S) socket endpoint through the
  supported CLI or environment mechanism; an explicitly supplied loopback URL
  is accepted as configuration but is not a release endpoint. Missing or
  invalid packaged configuration is rejected through the renderer bridge after
  the BrowserWindow has loaded, and the renderer shows safe localized copy.
  The real production endpoint remains an open release-owner decision.
- One top-level React failure boundary now protects the app outside the
  existing scene boundary, logs technical details, and offers a safe reload
  action. Bootstrap failures likewise log details without rendering raw
  exception text.
- Persisted fullscreen intent is captured and applied once at desktop startup;
  settled native enter/leave events then remain authoritative. Settings-panel
  toggling and reset-to-windowed behavior remain intact.

Local validation for this corrective pass completed with root typecheck, lint,
database-enabled tests, production build, focused client/desktop tests, and
Windows x64 desktop packaging passing. The build retains the existing large
main-chunk advisory. Browser Join and Electron development startup/fullscreen
restart/reset smoke checks passed; live multiplayer, deliberate live
top-level-failure smoke, installed-runtime, audible, accessibility, soak,
signing, notarization, and real-endpoint connectivity remain separate open
gates. Remote CI/Desktop Build status is verified against the pushed SHA and
reported separately; Phase 6.2 remains deferred.

### 1.2 Final Phase 6.1 closeout record — 2026-08-27

The two remaining verified runtime gaps are now closed within the Phase 6.1
implementation boundary:

- Desktop runtime configuration uses an explicit serializable bridge result:
  `{ ok: true, config: DesktopRuntimeConfig }` or
  `{ ok: false, code: 'PACKAGED_SOCKET_URL_MISSING' | 'SOCKET_URL_INVALID' }`.
  Expected main-process failures log technical details in the main process and
  return only the code; unexpected failures still reject. The renderer converts
  the expected result to a local typed `RuntimeConfigLoadError`, and
  `AppBootstrap` classifies it with a renderer-local predicate rather than an
  IPC error name or message.
- The final renderer build emitted `.woff`, `.woff2`, and `.ttf` files. The
  packaged `app://own-the-block` protocol now serves them as `font/woff`,
  `font/woff2`, and `font/ttf`; the existing HTML, script, stylesheet, SVG,
  image, and unknown-file mappings remain unchanged.
- Focused tests cover the four main IPC outcomes, renderer conversion, safe
  runtime-config copy, raw-detail absence, actual emitted font extensions, and
  the existing MIME mappings. The generic asset-readiness architecture and all
  unrelated Phase 6.1 boundaries remain unchanged.

This closes Phase 6.1 from a code-hardening perspective. It does not make the
distributed desktop app release-ready: the actual production endpoint value
and normal installed-app injection, native metadata, clean install/launch/
uninstall, live multiplayer/reconnect, spectator and second-match behavior,
accessibility/scaling, audible validation, 30–60 minute soak, and
signing/notarization remain Phase 6.2 or external release gates.

### 1.3 Phase 6.2 implementation and verification record — 2026-08-27

Phase 6.2 implementation is complete within the bounded distribution scope.
The factual evidence ledger is
[06B_PHASE_6_2_RELEASE_VERIFICATION.md](06B_PHASE_6_2_RELEASE_VERIFICATION.md).

- The root `package.json` version `3.0.0` is the release source. The desktop
  workspace manifest is a checked mirror, and release metadata validation fails
  on version drift. Forge uses the canonical version for Electron metadata and
  the Squirrel setup name.
- The approved `apps/client/public/favicon.svg` source was rasterized into
  `apps/desktop/assets/own-the-block.ico` and
  `apps/desktop/assets/own-the-block.icns`. Deterministic validation checks the
  native headers, required icon entries, and package metadata.
- Release builds require `OWN_THE_BLOCK_RELEASE_SOCKET_URL` and generate the
  packaged `resources/release-config.json`. CLI and environment overrides retain
  precedence for QA; ordinary sanity packages remain possible without an
  endpoint and fail closed at runtime when packaged configuration is missing.
- Production server CORS now explicitly allows `app://own-the-block` by
  default while preserving explicit `CORS_ORIGIN` override and same-origin
  browser behavior. A real Socket.IO polling handshake test covers the allowed
  packaged origin and a disallowed origin.
- Windows x64 Squirrel packaging, artifact collection, SHA-256 validation, a
  clean install, and installed execution-stub launch were observed. The
  Squirrel lifecycle handler fixed the install-hook timeout and produced
  uninstall registration/shortcuts. The standard uninstaller removed those
  registrations but left the test directory, so uninstall remains a failed
  release gate until resolved.
- The distinct release-candidate workflow covers Windows x64, macOS x64, and
  macOS arm64, with secure signing/notarization inputs only from CI secrets.
  The current branch has not yet had its exact-SHA workflow runs inspected.

No gameplay, protocol, migration, GameCore, presentation, queue, renderer
architecture, or audio architecture change was introduced by Phase 6.2. This
phase is not marked complete or release-ready while the gates in the evidence
ledger remain open.

## 2. Phase 6.1 — Release Hardening (closed)

The confirmed code-hardening boundaries from the audit are implemented and
validated as recorded above. The release-owner decisions and external proof
remain open:

1. Supply the real packaged multiplayer endpoint at release time. The code
   validates the supplied value, fails closed when a packaged value is missing,
   retains loopback only for development, and exposes a safe bootstrap failure
   state. No deployment URL is invented or committed here.
2. Add one top-level React failure boundary and safe production bootstrap error
   copy while retaining the existing SceneErrorBoundary-to-legacy fallback.
3. Restore persisted fullscreen intent once at desktop startup, then keep native
   enter/leave events authoritative. Preserve reset-to-windowed behavior.
4. Add targeted board asset prewarm or bundle/quality work only if cold-start or
   device profiling proves a material problem.
5. Add focused tests for every changed boundary.

No rules, economy, GameCore, server authority, V8, migration, board/camera,
dice, character, presentation, audio, or unrelated refactor belongs here.

## 3. Phase 6.2 — Distribution and Release Verification (implementation complete; gates open)

The release boundary is implemented and partially verified:

- canonical version, native icon metadata, release configuration injection,
  artifact checksums, and the release-candidate workflow are implemented;
- Windows x64 Squirrel output, clean install, installed launch, and packaged
  endpoint/configuration inspection pass under the controlled local endpoint;
- the standard Squirrel uninstall leaves an `own_the_block` test directory after
  removing its registry entry and shortcuts, so this gate is **FAIL**;
- macOS x64/arm64 output, real deployed endpoint connectivity, live multiplayer
  and recovery, accessibility/scaling, audible audio, long-session soak, and
  signed/notarized distribution remain **NOT RUN**, **BLOCKED**, or **FAIL** as
  recorded in 06B.

Packaging or maker success is not installation, runtime, signing, notarization,
multiplayer, or audible proof. The current Windows artifacts used only
`http://127.0.0.1:8080` as a controlled test endpoint; it is not a production
release endpoint.

## 4. Explicitly deferred or superseded

- The old generic “critical assets must all preload” gate is superseded by the
  current local-bundle, procedural, lazy, and bounded-cache architecture. Add
  only targeted prewarm after evidence of pop-in.
- High/Balanced/Low quality modes and arbitrary render-scale changes are
  conditional on profiling.
- Auto-update is post-v1.
- Analytics, accounts, cloud saves, voice, emotes transport, historical
  statistics, new-room redesign, board/camera redesign, rules/economy changes,
  and unrelated cleanup are outside Phase 6.

## 5. Release stop conditions

Do not call the distributed desktop build release-ready while any of these
remain unresolved:

- no explicit production multiplayer endpoint;
- fullscreen preference restoration is still broken if that behavior is
  promised;
- a top-level render failure can blank the client without safe recovery;
- native icon/version provenance is unresolved for the target artifacts;
- live multiplayer/reconnect, installed-runtime, accessibility, audible,
  long-session, signing, or notarization gates are unrun where required.

Automated PASS, package PASS, and remote CI PASS must continue to be reported
separately from these gates.
