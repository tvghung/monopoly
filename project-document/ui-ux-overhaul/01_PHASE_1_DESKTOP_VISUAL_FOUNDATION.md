# Phase 1 — Desktop & Visual Foundation

## Scope

Phase 1 adds an Electron shell around `apps/client`, a secure typed preload
bridge, a web/desktop runtime configuration boundary, staged bootstrap, a
semantic design system, persistent settings, a presentation event adapter, a
framework-agnostic animation queue, and the first lobby/HUD/modal foundations.

The existing 2D board remains in use. No R3F, 3D board, new character data,
gameplay rule, economy, database schema, sound library, updater, signing, or
custom titlebar is part of this phase.

## Non-negotiable behavior

- Server snapshots update authoritative client state immediately.
- Stale room revisions are ignored.
- Session hydration/reconnect resets the presentation queue and snaps display
  state to the accepted snapshot without historical replay.
- Disconnect does not leave a room. Active-game desktop quit confirmation only
  decides whether the native window may close; it never emits `leave room`.
- The browser renderer works when `window.ownTheBlockDesktop` is undefined.
- Electron exposes only typed runtime/window/fullscreen/quit/external-link
  capabilities and never exposes game actions or Node APIs.

## Validation targets

Automated checks cover runtime/security helpers, settings fallback, queue FIFO,
pause/resume, skipping, reset, executor failure recovery, event ordering,
reconnect reset, lobby rules, HUD selectors, modal confirmation behavior, and
the existing admission/private-state/session tests. Manual checks cover web
regression, desktop launch/resize/fullscreen/quit, and desktop reconnect.

