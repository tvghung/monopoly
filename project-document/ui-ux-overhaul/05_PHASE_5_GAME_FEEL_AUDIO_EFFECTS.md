# Phase 5 — Game Feel, Audio & Visual Feedback

**APPROVED — current Phase 5 plan**

Phase 5 is documentation-only in this handoff. The detailed audit and scope
boundary are in [05A_PHASE_5_0_AUDIT_AND_SCOPE.md](05A_PHASE_5_0_AUDIT_AND_SCOPE.md).

## 1. Current scope

Phase 5 contains exactly two implementation subphases:

1. **Phase 5.1 — Core Game Feel, Audio & Visual Feedback**
2. **Phase 5.2 — Activity Feed, Victory, Play Again & Final Closure**

There is no current Phase 5.3–5.7 plan. The earlier decomposition is superseded.
Phase 5 must preserve server/GameCore authority, the V7 contract until an
implementation-level review proves otherwise, and the single
`PresentationController → AnimationQueue → PresentationStore` pipeline.

## 2. Phase 5.1 — Core Game Feel, Audio & Visual Feedback

### Audio runtime

- Use the Native Web Audio API.
- Keep one centralized client-owned audio registry and one audio integration/sink
  attached to accepted typed presentation semantics.
- Audio is a consumer of approved identities, not a second gameplay scheduler,
  animation queue, or effects bus.
- Use Master / Ambience / SFX gain groups.
- Migrate the current client-local settings field `musicVolume` to
  `ambienceVolume` through an explicit settings-version normalization path. Do
  not reinterpret the old field name indefinitely; no server protocol or database
  migration is required for this local migration.
- Provide browser first-interaction/autoplay unlock, asset loading/caching,
  explicit traceable asset provenance/licensing, missing-asset fallback,
  duplicate-event suppression, bounded concurrency/priority/cooldown, and
  audio-node/source disposal.
- Preserve snapshot/reconnect no-replay and clean reset/skip behavior. Optional
  ducking is allowed only when justified by the approved mix design.

### Core gameplay SFX

Use proven typed/current presentation identities for UI/button, dice shake, dice
impact, tile hop, landing, money receive, money pay, property purchase, house
construction, hotel upgrade, card draw/reveal, sent to jail, failed jail attempt
where appropriate, bankruptcy, and victory. Never infer gameplay meaning from
HTML log strings.

### Ambience

Phase 5 uses ambience only: low intensity, loopable, non-melodic, long-session
friendly, separately gained, Master-gained, smoothly started/stopped/faded where
useful, and subordinate to SFX. Background music is explicitly removed/deferred
from Phase 5.

### Remaining visual game feel

Preserve the Phase 4 tile STEP/LAND feedback, destination preview, ownership and
development feedback, construction puff, money-transfer coins, dice and card
presentation, jail/bankruptcy reactions, fixed board/camera/material system,
Reduced Motion, Skip, reconnect, and WebGL fallback boundaries.

Only add bounded missing feedback such as exact `+$amount`/`-$amount`, small typed
consequence labels where authoritative semantics prove them, or a carefully
bounded sparkle/impact ring/small burst that improves comprehension. Keep the
existing limits: no steady-state draw-call growth by default, at most four
consequence labels, at most three transient particle bursts, shared resources,
instancing/batching, `frameloop="demand"`, active-only invalidation, and cleanup
on skip/reset/reconnect.

Do not create a global particle engine, second EffectsBus, postprocessing
pipeline, cinematic camera, or permanent decorative particles.

### Phase 5.1 acceptance evidence

Automated audio-runtime, settings-migration, trigger/dedupe, reconnect/reset,
missing-asset, and cleanup tests; browser autoplay/unlock; Electron audio smoke
after a fresh package; visual consequence fixtures; Reduced Motion; Skip; WebGL
fallback; renderer diagnostics; and separate audio versus visual evidence are
required. Existing hard draw/triangle budgets remain unchanged.

## 3. Phase 5.2 — Activity Feed, Victory, Play Again & Final Closure

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

Victory SFX, confetti, mascot celebration, and subtle board celebration may reuse
the Phase 5.1 sinks. No cinematic camera is allowed. Reconnect into `FINISHED`
shows the final state immediately without replaying stale celebration audio/FX.

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

- multiplayer emotes, including command, broadcast, persistence, rate limiting,
  bubbles, selector, and protocol changes; existing local reaction primitives are
  not deleted by this documentation task;
- background music; ambience only remains;
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

Next: Phase 5.1 — Core Game Feel, Audio & Visual Feedback
