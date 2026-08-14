# Phase 1 Implementation Plan

The implementation follows the dependency order from the phase prompt:

1. Add the isolated Electron workspace and typed secure bridge.
2. Add client runtime configuration, bootstrap stages, and injected socket
   creation without changing the existing `RESTORING`/`JOIN`/`JOINING`/`LOBBY`/
   `GAME`/`RECONNECTING`/`REPLACED`/`ERROR` state machine.
3. Add design tokens, primitives, settings, audio gain metadata, and effective
   reduced-motion handling.
4. Add the snapshot-to-presentation adapter, deterministic events, queue,
   minimal presentation store, and movement executor.
5. Migrate token display positions and prompt/turn gating, then remove the old
   component-local movement stepper after parity tests.
6. Redesign lobby/HUD/property-card foundations and centralize modal mechanics.
7. Add desktop quit/fullscreen integration, production renderer loading, and
   Forge packaging configuration.
8. Update client/source-of-truth documentation and run package-level plus full
   validation, recording environment-blocked checks separately.

The plan intentionally does not modify server/game-core code or shared network
contracts unless a later implementation proves a client boundary cannot be
implemented safely without it.

## Phase 1.1 — Stabilization & acceptance closure

Phase 1.1 is limited to closure of the Phase 1 desktop/presentation foundation:

- Bundle `apps/desktop/src/preload.ts` into the exact `dist/preload.js` artifact
  used by the BrowserWindow while retaining `sandbox`, `contextIsolation`,
  `nodeIntegration: false`, and `webSecurity`.
- Make all-in-one and shell-only desktop development compile main/preload on a
  clean checkout; keep packaged DevTools disabled and production reload/history
  shortcuts blocked.
- Snap accepted presentation state on reconnect, skip-all, and reduced-motion
  changes, invalidating stale executor finishes; retain FIFO animation for normal
  live updates.
- Synchronize native fullscreen changes into settings and reset native fullscreen
  when restoring defaults; add a lobby-only character placeholder with
  `characterId: null` and no Phase 3 server state.
- Preserve the canonical 00–06 phase documents unchanged. Phase 2–6 implementation
  remains out of scope until manual acceptance of Phase 1.

See [PHASE_1_1_MANUAL_ACCEPTANCE.md](./PHASE_1_1_MANUAL_ACCEPTANCE.md) for the
environment procedure and manual scenarios. Native `.icns` artwork/signing and
notarization remain deferred distribution work.
