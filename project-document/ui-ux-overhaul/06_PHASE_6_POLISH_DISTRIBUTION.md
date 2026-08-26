# Phase 6 — Polish & Distribution

**Status: Phase 6.0 audit and scope lock complete; Phase 6.1 and 6.2
implementation not started**

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

## 2. Phase 6.1 — Release Hardening

Implement only the confirmed boundaries from the audit:

1. Decide and inject the real packaged multiplayer endpoint at release time.
   Validate it, fail closed when a packaged value is missing, retain loopback
   only for development, and expose a safe bootstrap failure state. Do not
   invent or commit a deployment URL.
2. Add one top-level React failure boundary and safe production bootstrap error
   copy while retaining the existing SceneErrorBoundary-to-legacy fallback.
3. Restore persisted fullscreen intent once at desktop startup, then keep native
   enter/leave events authoritative. Preserve reset-to-windowed behavior.
4. Add targeted board asset prewarm or bundle/quality work only if cold-start or
   device profiling proves a material problem.
5. Add focused tests for every changed boundary.

No rules, economy, GameCore, server authority, V8, migration, board/camera,
dice, character, presentation, audio, or unrelated refactor belongs here.

## 3. Phase 6.2 — Distribution and Release Verification

Complete the release boundary after 6.1:

- choose one release version source and configure native Windows .ico and macOS
  .icns metadata;
- build and inspect Windows Squirrel and macOS DMG/app outputs;
- verify clean install, launch, packaged endpoint connectivity, quit behavior,
  security policy, and uninstall;
- run live 2, 3, and 4 player gameplay and all reconnect/recovery scenarios;
- verify spectator, FINISHED, Play Again, leave/rejoin, and second-match
  behavior;
- run browser/Electron accessibility, reduced-motion, focus, contrast, scaling,
  audio, and visual comfort checks;
- run a 30–60 minute memory, renderer, queue, activity, and audio soak;
- complete signing/notarization with the release owner when distribution
  requires it;
- preserve the existing remote CI and Desktop Build evidence boundaries.

Packaging or maker success is not installation, runtime, signing, notarization,
multiplayer, or audible proof.

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
