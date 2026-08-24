# Phase 5 — Game Feel, Audio & Visual Feedback

**IN PROGRESS — Phase 5.1 implemented locally; later Phase 5 work remains open**

The earlier Phase 5.0 handoff was documentation-only. Phase 5.1 now implements
the bounded audio slice below; the detailed pre-implementation audit and scope
boundary remain in [05A_PHASE_5_0_AUDIT_AND_SCOPE.md](05A_PHASE_5_0_AUDIT_AND_SCOPE.md).

## 1. Current scope

Phase 5 is split into the completed local audio slice and a later closure slice:

1. **Phase 5.1 — Centralized Audio & Core SFX**
2. **Phase 5.2 — Remaining Game Feel, Activity Feed, Victory, Play Again & Final Closure**

There is no current Phase 5.3–5.7 plan. The earlier decomposition is superseded.
Phase 5 must preserve server/GameCore authority, the V7 contract until an
implementation-level review proves otherwise, and the single
`PresentationController → AnimationQueue → PresentationStore` pipeline.

## 2. Phase 5.1 — Centralized Audio & Core SFX

Implementation status: **COMPLETE LOCALLY on 2026-08-24**, subject to the
separately reported browser/Electron auditory QA and remote-CI boundaries. This
status covers only the centralized runtime and core SFX below; it does not mark
the rest of Phase 5 complete.

### Implemented centralized runtime

- `AudioEngine` is the only production owner of `AudioContext`, gain nodes,
  oscillator/noise synthesis, voice limits, cooldowns, abort-bound playback and
  disposal. No component creates a separate sound source or timing queue.
- One typed registry covers UI, Dice, Movement, Money, Property, Build, Card,
  Jail, Bankruptcy and Victory. Every Phase 5.1 cue is a short original
  procedural Web Audio recipe; there are no downloaded assets and no fake asset
  preload stage. The registry source descriptor remains the replacement seam for
  later approved assets.
- Existing settings storage remains version `own-the-block.settings.v1` with
  `masterVolume`, `musicVolume` and `sfxVolume`. Master / SFX / Music buses update
  live; all current cues route through SFX and the Music bus remains dormant.
  Phase 5.1 adds no second settings model and performs no field/version migration.
- Audio context creation/resume occurs only from trusted pointer, keyboard or
  button interaction. Gameplay cues before unlock are dropped, not queued for
  replay. The current first UI click may unlock and play its own cue.
- The provider owns one stable engine, one centralized enabled-button click path,
  a `data-audio-click="off"` escape hatch, and StrictMode-safe listener/engine
  cleanup. Unsupported or suspended Web Audio degrades without throwing.
- `play()` is fire-and-forget. Per-cue gain, cooldown, voice limits and
  `AbortSignal` cleanup are independent of animation speed and never delay an
  `AnimationQueue` item until a sound finishes.

### Implemented presentation integration

- `App` injects the provider's stable audio port into the existing single
  `PresentationController`, which passes it to the existing dice, movement,
  basic and semantic executor factories. Default no-op injection preserves
  isolated tests and non-provider call sites.
- Normal dice play shake at roll start and impact at authoritative settle;
  Reduced Motion uses one impact cue. Abort/reset/skip cannot produce a late
  settle cue.
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
- Card audio starts only when `CARD_INTERACTION_CHANGED` enters `REVEALED`.
  `SENT_TO_JAIL` sounds only after arrival at jail; fallback jail entry, failed
  jail roll and release use their bounded authoritative events without log or
  private-state inference.
- `PLAYER_FINISHED` plays bankruptcy only for `BANKRUPT`. `GAME_FINISHED` plays
  the short stinger only with a committed non-null winner. End-game UI is
  unchanged.
- `SESSION_SYNC` and `SPECTATOR_SYNC` still reset/snap without derived events.
  Queue abort signals stop active presentation voices; queued or stale executors
  cannot schedule later sounds. Already-started UI one-shots remain independent.

### Phase 5.1 evidence boundary

- Automated coverage owns gain/mute, unsupported/suspended fallback, first
  interaction unlock, no pre-unlock replay, cooldown/polyphony, abort, disposal,
  StrictMode listeners, dice/movement/GO, semantic money/property/development,
  card/jail/bankruptcy/victory, generic-balance suppression and reconnect reset.
- Browser auditory QA, Electron auditory QA, long-session fatigue, clipping,
  memory and listener observations are reported separately from tests/builds.
  Unrun scenarios remain `NOT RUN`; a package build is not auditory evidence.
- This client-only slice changes no server, GameCore, shared contract, protocol,
  snapshot, migration, database, board/dice/character/building renderer, camera,
  motion timing or WebGL fallback. Audio adds zero render draw calls.

## 3. Phase 5.2 — Remaining Game Feel, Activity Feed, Victory, Play Again & Final Closure

Phase 5.2/future bounded Phase 5 work owns ambience content and every visual or
product surface explicitly deferred from Phase 5.1. It must preserve the Phase 4
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

The implementation must define categories, ordering, reconnect hydration,
spectator visibility, gameplay/chat visual distinction, ARIA/readability, and
bounded tail behavior. Target categories include rolled, property bought,
rent/payment, property built/upgraded, safely represented card draw/resolution,
jail, bankruptcy, and game finished.

The exact shared schema/event design must be derived from the real server model
during implementation. Existing string logs and chat may remain for
compatibility/history where appropriate. Do not create a second history surface or
reconstruct gameplay facts by parsing HTML logs.

### B. Victory/end-game

Replace/extend the current winner-only presentation with the approved V1 summary:

- winner name;
- character/mascot;
- player color;
- final cash;
- property count;
- house count;
- hotel count.

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

The current runtime remains one-way until this future command is implemented; this
document records the approved implementation boundary and does not change runtime
behavior.

### D. Final closure and validation

Required evidence includes typecheck, lint, tests, database status/integration
where required, build, deterministic renderer fixtures, browser UAT,
Electron/package UAT, 2-player and 4-player sessions, Play Again, returning
bankrupt player, explicit-left player not revived, new player joining the replay
lobby, host-only replay authorization, reconnect before/after `FINISHED`, activity
feed reconnect, Reduced Motion, Skip, WebGL fallback, 30–60 minute session, SFX
fatigue, ambience fatigue, particle/label clutter, audio source/node cleanup,
active animation cleanup, draw calls/triangles, and remote CI reported separately.

No guardrail may be weakened to make Phase 5 pass. Automated, database, browser,
Electron/manual, remote-CI, commit, and push status remain separate evidence
categories.

## 4. Explicitly removed or deferred from current Phase 5

- rich particle system and permanent decorative particles;
- new floating-text visual pass and extended reusable tile FX;
- structured activity/event feed in the existing `Log` surface;
- ambience content and any background music content;
- full victory/end-game visual redesign and final global visual-polish pass;
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

Phase 5.2 may require shared/network contract expansion for structured activity
and Play Again. During implementation, inspect compatibility rules first. If a
protocol revision is genuinely required, prefer one consolidated Phase 5.2
revision for the approved contract changes. Do not state that a particular
revision is required until implementation inspection proves it. Change the
snapshot version only if the durable persisted snapshot shape actually changes.
This documentation task does not modify V7 code or contracts.

Next: Phase 5.2 planning and the separately reported Phase 5.1 manual auditory gates.
