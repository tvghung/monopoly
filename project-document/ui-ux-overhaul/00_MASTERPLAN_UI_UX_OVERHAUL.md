# Own the Block — UI/UX Overhaul Masterplan

This document defines the presentation and desktop direction for the existing
authoritative Cờ Tỷ Phú Việt Nam runtime. It is a client/shell plan, not a
gameplay-rule or persistence plan.

## Architectural boundary

The server and PostgreSQL-backed room aggregate remain authoritative for dice,
movement results, money, ownership, rent, development, turns, jail, payment,
bankruptcy, trading, winners, and room/session state. The React client renders
that state and may maintain a deliberately lagging presentation state for
animation. Electron is a native shell for the same React renderer; it does not
contain game state or game commands.

```text
PublicRoomState
  -> snapshot acceptance and revision protection
  -> authoritative React state
  -> presentation adapter
  -> presentation events
  -> framework-agnostic animation queue
  -> minimal presentation state
  -> current 2D UI or a future R3F renderer
```

Animation never delays authoritative state, performs game mutations, or replays
historical movement after a session resume. A reconnect resets presentation to
the accepted snapshot.

## Delivery phases

- Phase 1 establishes the desktop shell, runtime/bootstrap boundary, design
  tokens, reusable UI primitives, settings, presentation events, animation
  queue, movement migration, lobby/HUD foundations, and safe quit semantics.
- Phase 2 may replace the board renderer while retaining networking, session
  recovery, presentation events, queue, settings, and HUD contracts.
- Later phases may add richer board visuals, characters, animation, and audio;
  none of those features should become a second game authority.

## Product constraints

- Web mode remains supported when the desktop bridge is absent.
- Player-facing text and money formatting remain Vietnamese and VNĐ.
- Stable `PlayerId` and reconnect-token behavior remain unchanged.
- Closing the desktop window is a disconnect, not a `leave room`/forfeit command.
- Explicit `Bỏ cuộc` remains the separate leave-room action.

