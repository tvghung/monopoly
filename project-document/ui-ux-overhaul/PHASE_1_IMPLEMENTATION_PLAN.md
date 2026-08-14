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

