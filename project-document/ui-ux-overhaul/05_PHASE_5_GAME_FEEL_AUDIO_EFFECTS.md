# Phase 5 — Game Feel, Audio & Visual Feedback

**PHASE 5.2 CORRECTIVE PASS PUSHED at e4ce23d — remote CI and Desktop Build
PASS; live/manual gates remain explicitly open**

The earlier Phase 5.0 handoff was documentation-only. Phase 5.1 and the focused
Phase 5.2 corrective pass are implemented and pushed at e4ce23d; the detailed
audit and scope boundary remain in
[05A_PHASE_5_0_AUDIT_AND_SCOPE.md](05A_PHASE_5_0_AUDIT_AND_SCOPE.md). Remote CI
and Desktop Build passed for that exact corrective baseline. Manual/live
acceptance remains separate and is not closed here.

The current V1 branch supersedes only the background-music implementation details
below with the centralized Phase 5 runtime: the loop is now a synchronized
four-stem, board-state-adaptive composition. Manual listening, long-session and
physical-device acceptance remain open.

## 1. Current scope

The current Phase 5 implementation contains the bounded Phase 5.1 slice and the
focused Phase 5.2 corrective pass:

1. **Phase 5.1 — Centralized Audio, Core SFX, One Background Music Track & Corrective Game Feel**
2. **Phase 5.2 — Remaining Game Feel, Activity Feed, Victory, Play Again & Corrective Pass**

There is no Phase 5.3–5.7 plan. The earlier decomposition is superseded. Phase 5
must preserve server/GameCore authority, the consolidated V8 contract, and the
single
`PresentationController → AnimationQueue → PresentationStore` pipeline.

## 2. Phase 5.1 — Centralized Audio, Core SFX, One Background Music Track & Corrective Game Feel

Implementation status: **CORRECTIVE PASS IMPLEMENTED AND PUSHED at e4ce23d on
2026-08-25**, with remote CI and Desktop Build PASS for that exact baseline and
the separately reported browser/Electron auditory QA and long-session
boundaries. This status covers the centralized runtime, core SFX, one
procedural background music track, and the bounded corrective game-feel work
below. It does not close the manual Phase 5 gates.

### Implemented centralized runtime

- `AudioEngine` is the only production owner of `AudioContext`, gain nodes,
  oscillator/noise synthesis, the one looped music source, voice limits,
  cooldowns, abort-bound playback and disposal. No component creates a separate
  sound source or timing queue.
- One typed registry covers UI, Dice, Movement, Money, Property, Build, Card,
  Jail, Bankruptcy and Victory. Every Phase 5.1 cue is a short original
  procedural Web Audio recipe; there are no downloaded assets and no fake asset
  preload stage. The registry source descriptor remains the replacement seam for
  later approved assets.
- Existing settings storage remains version `own-the-block.settings.v1` with
  `masterVolume`, `musicVolume` and `sfxVolume`; `musicVolume` is intentionally
  retained. Master / Music / SFX buses update live. The Music bus owns one
  deterministic procedural loop and ambience is not introduced.
- Audio context creation/resume occurs only from trusted pointer, keyboard or
  button interaction. Gameplay cues before unlock are dropped, not queued for
  replay. The current first UI click may unlock and play its own cue.
- The provider owns one stable engine, one centralized enabled-button click path,
  a `data-audio-click="off"` escape hatch, and StrictMode-safe listener/engine
  cleanup. It also owns document visibility handoff for the persistent music
  source. Unsupported or suspended Web Audio degrades without throwing.
- `play()` is fire-and-forget. Per-cue gain, cooldown, voice limits and
  `AbortSignal` cleanup are independent of animation speed and never delay an
  `AnimationQueue` item until a sound finishes.

### Implemented presentation integration

- `App` injects the provider's stable audio port into the existing single
  `PresentationController`, which passes it to the existing dice, movement,
  basic and semantic executor factories. Default no-op injection preserves
  isolated tests and non-provider call sites.
- Normal dice play shake at roll start, `dice.impact` at the shared 72% primary
  visual contact point, and settle after the remaining bounce. Reduced Motion
  uses one restrained impact cue. Abort/reset/skip cannot produce a late impact.
- Proven `WALK` movement attempts one subtle hop cue after each completed hop;
  `SNAP`, reconnect snap and Reduced Motion snap do not. A proven GO crossing
  plays one receive accent at tile `0`, with the duplicated semantic reward lane
  already suppressed by the V7 adapter.
- `MONEY_TRANSFER` routes BANK-to-player, player-to-BANK and player-to-player to
  receive, pay and one compact transfer cue. `BALANCE_CHANGED` remains visual
  only and cannot duplicate transfer audio.
- `PROPERTY_TRANSFER` distinguishes BANK purchase, bank release/sale, and generic
  transfer. Fallback `PROPERTY_OWNERSHIP_CHANGED` is deliberately generic.
  Development distinguishes house increase, exact `4 -> 5` hotel upgrade and
  decrease/removal.
- Card audio uses `card.draw` exactly when a new `AWAITING_DRAW` interaction starts
  its physical flight and `card.reveal` only when authoritative `REVEALED`
  begins. `SENT_TO_JAIL` sounds only after arrival at jail; fallback jail entry, failed
  jail roll and release use their bounded authoritative events without log or
  private-state inference.
- Building audio follows the shared visual house schedule: one pop per newly
  appearing house, with the hotel cue delayed to the hotel's actual appearance
  point. The final movement contact is owned by `movement.land`, not a duplicate
  final hop cue.
- Presentation-scoped voices are centrally stopped on reset, session/spectator
  sync, skip-all, and disposal even after their executor has resolved. UI clicks
  and background music remain independent.
- One original deterministic procedural background music loop starts only after
  trusted Web Audio unlock while a room session is active. Four cached stereo
  stem buffers share one start timestamp and loop length, remain one logical
  composition through lobby/game/reconnect revisions, fade for hidden documents
  and room leave, and apply live Master/Music gain changes.
- The current composition is 64 bars / 256 beats at 110 BPM (about 2:20), in F
  major with 55% swing. Its INTRO/A/A'/B/BRIDGE/C/D/A''/LOOP BRIDGE structure uses
  a piano lead, marimba answers, upright-bass-style foundation, brushed percussion
  and restrained character layers. Melody data stays in F4-E5, includes explicit
  rests/descending answers, and caps synthesized partials at 4.8 kHz.
- Presentation-only intensity `0..3` derives deterministically from public property
  ownership (40%), development (25%), turn progression (20%) and financial/
  elimination pressure (15%). A 3.5-point hysteresis band prevents threshold
  chatter; stem gains ramp over two beats beginning at the next four-bar boundary.
- `PLAYER_FINISHED` plays bankruptcy only for `BANKRUPT`. `GAME_FINISHED` plays
  the short stinger only with a committed non-null winner. End-game UI is
  unchanged.
- `SESSION_SYNC` and `SPECTATOR_SYNC` still reset/snap without derived events.
  Queue abort signals stop active presentation voices; queued or stale executors
  cannot schedule later sounds. Already-started UI one-shots remain independent.

### Phase 5.1 evidence boundary

- Automated coverage owns gain/mute, unsupported/suspended fallback, first
  interaction unlock, no pre-unlock replay, cooldown/polyphony, abort, disposal,
  StrictMode listeners, dice contact/abort, movement/landing/GO, sequential
  building/hotel timing, semantic money/property/development, card draw/reveal,
  jail/bankruptcy/victory, music lifecycle and presentation-tail reset cleanup.
- Browser auditory QA, Electron auditory QA, long-session fatigue, clipping,
  memory and listener observations are reported separately from tests/builds.
  Unrun scenarios remain `NOT RUN`; a package build is not auditory evidence.
- This client-only slice changes no server, GameCore, shared contract, protocol,
  snapshot, migration, database, board/dice/character/building renderer, camera,
  motion timing or WebGL fallback. Audio adds zero render draw calls.

## 3. Phase 5.2 — Remaining Game Feel, Activity Feed, Victory, Play Again & Corrective Pass

Phase 5.2 owns the bounded activity, victory and replay corrective scope below. Ambience
remains deferred unless separately approved. It preserves the Phase 4
tile STEP/LAND feedback, destination preview, ownership/development feedback,
construction puff, money-transfer coins, dice/card presentation, fixed board and
camera, Reduced Motion, Skip, reconnect and WebGL fallback boundaries. It must not
introduce a global particle engine, second effects bus, postprocessing pipeline,
cinematic camera or permanent decorative particles.

### A. Structured activity feed

Upgrade the existing `Log` surface. Use a bounded server-authored structured
activity tail projected safely for public/reconnect use and rendered in that same
Log surface:

```text
server-authored structured activity
  → public/reconnect-safe projection
  → existing Log UI
```

The implementation defines typed categories, ordering, reconnect hydration,
spectator visibility, gameplay/chat visual distinction, ARIA/readability, and a
128-event bounded tail. It records join/chat/start/dice/purchase/transfer/
development/card/jail/bankruptcy/finish facts at authoritative server producer
points. Card activity starts only after reveal; private deck order, hidden cards,
offers and continuations are never exposed.

The shared schema is V8 `ActivityEvent`/`ActivityFeed`; migration 009 leaves the
typed tail empty for historical rows, so the client may retain a plain-text legacy
prefix/context before later typed events. Fresh V8 typed activity suppresses its
duplicate legacy strings. Legacy logs are never parsed for gameplay categories;
the existing Log gates live activity through the existing
PresentationController/AnimationQueue.

### B. Victory/end-game

The implemented winner presentation uses the approved V1 summary:

- winner name;
- character/mascot;
- player color;
- final cash;
- property count;
- house count;
- hotel count.

Level `5` in `ownedProps` counts as one hotel and zero houses in the summary.

Use current authoritative final state only. Do not add net worth, historical match
statistics, rent paid/received, turns played, cards drawn totals, transaction
history, historical build counters, or a historical-statistics contract.

The short committed-winner victory SFX already uses the Phase 5.1 sink. Confetti,
mascot celebration and subtle board celebration remain future visual work. No
cinematic camera is allowed. Reconnect into `FINISHED` shows the final state
immediately without replaying stale celebration audio/FX.

### C. Host-only same-room Play Again

Phase 5 includes `Play Again`; it does not include a separate `New Room` action.
The approved lifecycle is:

```text
LOBBY → IN_PROGRESS → FINISHED → LOBBY
```

`Play Again` must be an authoritative server command with a transaction-safe,
persistence/recovery-safe room transition. The same room retains its room id and
room code, host identity where still eligible, valid player sessions, and
connected eligible participants. Eligible existing players return to the lobby /
mascot picker with `ready = false`; their current appearance is the initial choice,
they may change mascot/color, and normal uniqueness rules still apply. New players
may join available slots. Bankrupt players from the completed match are eligible
to return. Players who explicitly left are not revived. Spectators are not
converted into players.

Use the canonical/fresh game-state construction path rather than manual
field-by-field mutation. The next match must not inherit the old winner, finished
players, positions, balances, properties, houses/hotels, dice, roll sequence, turn
state, pending landing/card/debt/payment operations, decks, completed card
operations, forced-sale state, semantic event tails, match logs/activity, or
presentation identities.

The local runtime implements this boundary with a typed `play again` command,
canonical fresh-state reconstruction, same-room broadcast/ACK ordering, and
`REPLAY_SYNC` presentation reset. It is still subject to the manual UAT gates below.

### D. Corrective validation boundary

Required evidence includes typecheck, lint, tests, database status/integration
where required, build, deterministic renderer fixtures, browser UAT,
Electron/package UAT, 2-player and 4-player sessions, Play Again, returning
bankrupt player, explicit-left player not revived, new player joining the replay
lobby, host-only replay authorization, reconnect before/after `FINISHED`, activity
feed reconnect, Reduced Motion, Skip, WebGL fallback, 30–60 minute session, SFX
fatigue, background-music fatigue, particle/label clutter, audio source/node cleanup,
active animation cleanup, draw calls/triangles, and remote CI reported separately.

No guardrail may be weakened to make Phase 5 pass. Automated, database, browser,
Electron/manual, remote-CI, commit, and push status remain separate evidence
categories.

## 4. Explicitly removed or deferred from current Phase 5

- rich particle system and permanent decorative particles;
- new floating-text visual pass and extended reusable tile FX;
- ambience content; the earlier ambience-only / `Music → Ambience` direction is
  superseded by the user's manual-testing decision, while background music is
  now one Phase 5.1 track;
- full global visual-polish pass; the fact-only victory summary is implemented,
  while confetti/celebration remains out of scope;
- multiplayer emotes, including command, broadcast, persistence, rate limiting,
  bubbles, selector, and protocol changes; existing local reaction primitives are
  not deleted by this documentation task;
- historical statistics and net worth;
- `New Room`;
- voice chat;
- voice acting;
- cutscenes;
- huge particle systems;
- cinematic camera;
- board redesign.

## 5. Contract/version rule

Phase 5.2 made one consolidated contract revision: protocol V8 and room snapshot
V8. Migration `009_activity_feed_v8.sql` initializes an empty typed activity tail
for V7 rows and does not reconstruct legacy logs. No second protocol/snapshot bump
or ambience migration is part of this phase.

Next: keep automated/database gates, browser/Electron, multiplayer, long-session,
and remote evidence separate. Remote CI and Desktop Build are PASS for
e4ce23d; local database and live/manual gates still require their own evidence.
Phase 6 is the next planned phase after corrective implementation and automated
validation; Phase 5 is not claimed fully closed while manual gates remain NOT
RUN.
