# Phase 5.0 — Current-Code Audit and Approved Scope

**APPROVED — Phase 5 scope finalized after user review**

Audit date: 2026-08-24
Branch: `overhaul/phase-5-game-feel-audio-effects`
Base: `main` at `955e74233e7ae91c0aeb990633295257ea9e3be4` (`Merge Phase 4 gameplay presentation`)
Protocol: V7
Status: approved Phase 5.0 audit, amended for the current Phase 5.1 corrective
implementation; Phase 5.2 remains open

## 1. Readiness summary

Phase 4 is closed for feature work. The current code already has a substantial
gameplay-presentation foundation: authoritative V7 snapshots and semantic event
lanes, proven movement and consequence executors, bounded tile/building/coin/card
feedback, reduced-motion/skip/reconnect boundaries, and a measured renderer
diagnostic path. Phase 5 should extend those capabilities rather than introduce a
second effects bus, animation queue, log-derived event path, or renderer.

The original audit's main capability gap was audio. Phase 5.1 now closes that
client-only gap with one `AudioEngine`, typed procedural SFX, one deterministic
background music loop, trusted-interaction unlock, live Master/Music/SFX gains,
and presentation-scoped cleanup. The user's manual-testing decision supersedes
the earlier ambience-only direction: `musicVolume` is intentionally retained,
one background music track is in Phase 5.1, and ambience is deferred unless
separately approved.

The other large gaps are a structured authoritative activity tail in the existing
Log surface, a complete fact-only victory surface, the approved same-room Play
Again lifecycle, and the long-session/manual validation gate. Multiplayer emotes
are explicitly deferred/out of Phase 5; existing local reaction primitives remain
implementation detail and are not a multiplayer feature requirement. Current
visual feedback is useful and should be preserved: tile impacts, destination
preview, ownership/development feedback, construction puff, coin transfers, dice
contact shadows, card presentation, jail/bankruptcy reactions, and
reconnect-safe presentation already exist.

This document records the approved scope and a reviewable implementation
boundary. It does not select or add assets, add socket events, bump the protocol,
change GameCore, or implement any visual/audio feature.

## 2. Audit method and authority boundary

The audit used the current implementation as the source of truth and compared it
with:

- `CLAUDE.md` and the chained Client, Shared, API/socket, GameCore, and testcase
  instructions;
- `project-document/ui-ux-overhaul/00_MASTERPLAN_UI_UX_OVERHAUL.md`;
- `project-document/ui-ux-overhaul/04_PHASE_4_GAMEPLAY_ACTIONS.md`;
- `project-document/ui-ux-overhaul/05_PHASE_5_GAME_FEEL_AUDIO_EFFECTS.md`;
- current client, shared-contract, server, renderer, presentation, settings, and
  test sources.

`COMPLETE` below means the current implementation provides the capability that
Phase 5 should preserve; it does not mean that every manual, Electron, remote-CI,
or long-session gate has passed. `PARTIAL` means a usable foundation exists but
the original acceptance intent still needs a bounded extension. `MISSING` means
the required runtime or contract is absent. `DEFER / OUT OF PHASE 5` is used for
work that should not be part of this phase. The multiplayer-emote area is
intentionally classified that way; local reaction primitives remain untouched
implementation detail.

## 3. Original Phase 5 requirement matrix

Each original area has exactly one classification.

| Original area | Classification | Concrete current-code evidence and owner | Works now | Missing or not proven | Approved Phase 5 slice |
|---|---|---|---|---|---|
| 1. Centralized audio | **COMPLETE LOCALLY; MANUAL GATE OPEN** | `apps/client/src/audio/AudioEngine.ts` is the only production `AudioContext` owner; `audioRegistry.ts` contains typed procedural SFX; the engine also owns one procedural music source, buses, cooldowns, scopes, and disposal. | Centralized playback, trusted unlock, no pre-unlock replay, one music source, and live gain routing are implemented and covered by focused tests. | Browser/Electron auditory quality, clipping, long-session fatigue, and speaker output remain separate manual evidence. | Preserve the single runtime and report manual auditory gates separately. |
| 2. Master/Music/SFX controls | **IMPLEMENTED LOCALLY; MANUAL GATE OPEN** | `apps/client/src/settings/types.ts`, `defaults.ts`, `storage.ts`, `SettingsProvider.tsx`, `SettingsPanel.tsx`, and `AudioProvider.tsx` retain `masterVolume`, `musicVolume`, and `sfxVolume`; `AudioEngine` updates all three buses live. | Values are clamped to `0..1`, versioned in local storage, editable in the panel, and mapped to live Master/Music/SFX gains. | Actual speaker-level slider/mute behavior still needs browser/Electron auditory evidence. No `ambienceVolume` migration is approved. | Keep `musicVolume`; do not migrate the settings field to ambience. |
| 3. Gameplay SFX priorities | **IMPLEMENTED LOCALLY; MANUAL GATE OPEN** | Accepted typed presentation events feed the existing executor path; the typed registry and engine enforce cue cooldowns, voice caps, AbortSignal cleanup, and presentation-scope cleanup. | Dice, movement/landing, money, property, development, card draw/reveal, jail, bankruptcy, and victory cues are bound without log inference or a parallel queue. | Manual balance/readability and long-session fatigue remain separate gates. | Extend only through the existing AudioPort/executor path. |
| 4. Particles | **PARTIAL** | `TileImpactHighlightBatch.tsx` is one instanced additive tile batch; `BuildingLayer.tsx` owns an 11-particle instanced `ConstructionPuff`; `MoneyTransferLayer.tsx` uses shared instanced coin geometry/materials; dice/card/character layers already provide bounded physical feedback. | Tile pulse, dust/build puff, coin movement, dice contact shadow, card motion, and character reactions are bounded and demand-rendered. | No reusable sparkle, impact-ring, coin-burst, or victory-confetti family exists. Current active effects are not a general particle system. | Extend the existing instanced/shared-resource approach only where a tested gameplay consequence is clearer. A new global postprocess or unbounded particle engine is not proposed. |
| 5. Floating text/consequence | **PARTIAL** | `PresentationStore` exposes typed `BalanceDeltaSignal`, `MoneyTransferSignal`, `OwnershipChangeSignal`, `DevelopmentChangeSignal`, and `GoCrossingSignal`; `TileActionFeedback.tsx` shows `Nhận chủ`, `Trả chủ`, `Đổi chủ`, `+N Nhà`, `Khách sạn`, and `Qua Xuất Phát`; station SDF text shows authoritative balance. | Exact balance and property/development consequences already have one-shot signals, timing, reset clearing, and readable tile feedback. | No bounded `+$200`/`-$450` floating label family or explicit `RENT`/`DOUBLE`/`JAIL`/`BANKRUPT` consequence surface exists. No semantic label should be inferred from HTML logs. | Add a small, typed consequence presentation in the existing store/render model, with exact amounts/typed reasons only and a non-WebGL semantic fallback. |
| 6. Tile feedback | **COMPLETE** | `Board.tsx`, `TileAssembly.tsx`, `TileDestinationPreview.tsx`, `TileImpactHighlightBatch.tsx`, `TileMotionController.ts`, `TileActionFeedback.tsx`, `OwnershipFlag.tsx`, and the tile interaction/accessibility controls cover interactive and presentation states. | Hover/selected/active/landed/purchase/build feedback, destination preview, ownership flag, and reduced-motion behavior exist without flashing-heavy treatment. | Optional danger/high-rent emphasis is not a current requirement or proven contract. Manual readability across all requested viewports remains a validation gate. | Preserve the current tile feedback and timing. Only fix a reproducible readability problem; do not redesign the Phase 4 board/camera or add a second tile-effects path. |
| 7. Reactions/multiplayer emotes | **DEFER / OUT OF PHASE 5** | `CharacterReactionKind` in `presentation/store/types.ts` includes local reaction values, including `emote`; `characterReaction.ts` and `CharacterBillboard.tsx` implement a short imperative reaction controller. `basicExecutors.ts` and `semanticExecutors.ts` produce jail/sad/bankrupt reactions. `packages/shared/src/events.ts` and `socketSchemas.ts` contain chat but no multiplayer-emote command/event. | Local character reaction primitives, reduced motion, cleanup, and bankruptcy/jail/sad producers exist as current implementation detail. | No multiplayer-emote contract exists, and none is approved for Phase 5. | Do not add an emote command, broadcast, persistence, rate limit, bubble, selector, or protocol change. Do not delete existing reaction code in this documentation task; classify the original emote requirement as deferred/out of Phase 5. |
| 8. Event feed | **IMPLEMENTED LOCALLY; UAT GATE OPEN** | Server `apps/server/src/game/activity.ts` owns the bounded V8 `ActivityFeed`; authoritative producers append typed chat/dice/purchase/transfer/development/card/jail/finish events. `publicState.ts`, `PresentationController.ts`, and `Log.tsx` preserve public projection and queue gating in the existing surface. | Reconnect/spectator projection, monotonic UUID/sequence ordering, public-safe card reveal, text-rendered chat, gameplay/chat distinction, and legacy-log compatibility are implemented and covered by automated tests. | Browser readability, long-session clutter, and live multi-player evidence remain separate manual gates. | Preserve one bounded typed activity tail and the existing Log/presentation architecture. |
| 9. Ambience | **DEFERRED / OUT OF CURRENT 5.1** | No ambience layer is added. The existing Music bus is intentionally used for the one approved background music track. | Ambience remains outside the current decision and may be separately approved later. | No `ambienceVolume` field, ambience asset, or ambience runtime should be invented in this pass. | Keep `musicVolume` and the single Phase 5.1 background music track; defer ambience. |
| 10. Victory/end-game | **IMPLEMENTED LOCALLY; UAT GATE OPEN** | Server `checkWinner` sets authoritative `boardState.winner` once and `commitRoomCommand` transitions the room to `FINISHED`; `publicState.ts` projects winner, finished players, current players, balances, ownership, and development. `WinnerBanner.tsx` renders the fact-only summary and host-only Play Again action. | Winner name/mascot/color, final cash, property count, houses, hotels, reconnect-safe terminal state, and same-room host replay are implemented and covered by automated tests. | Browser/Electron end-game, reconnect, second-match, and manual celebration/audio evidence remain separate gates; historical statistics and New Room remain out of scope. | Preserve the authoritative fact-only victory surface and same-room `FINISHED → LOBBY` lifecycle. |
| 11. Visual polish | **PARTIAL** | Existing design tokens/CSS, `BoardShell`, `Dashboard`, `Log`, settings/modal components, `BoardAccessibilityControls`, fixed orthographic scene, and Phase 4 readability fixtures provide a strong baseline. | Hierarchy, disabled states, modal primitives, board readability diagnostics, keyboard/accessibility controls, reduced motion, and WebGL fallback exist. | A Phase 5-specific visual review and manual 2–4-player/long-session sign-off have not been completed; broad “polish” is not a license to alter frozen Phase 4 composition. | Limit this to targeted consequence, feed, victory, and accessibility readability issues found by UAT. Preserve board/camera/material architecture. |
| 12. Long-session/clutter/audio-fatigue/performance validation | **PARTIAL** | `GameScene.tsx` exposes draw calls, triangles, drawing buffer, active animated objects, card/station/coin diagnostics; `sceneBudget.ts` defines `210/240` draw and `80k/100k` triangle limits; `Phase4UatHarness.tsx` has deterministic action, reduced-motion, skip, reconnect, board-readability, and stress scenarios. | There is a repeatable deterministic fixture and a measurable renderer budget. | The 30–60 minute manual session, music/SFX fatigue checks, particle-overload check, multi-action clutter review, and live browser/Electron/remote gates are not proven by the fixture. | Fold the complete long-session, accessibility, renderer, audio-cleanup, browser, Electron, and remote-CI evidence matrix into Phase 5.2. Do not replace the heavy `~227` board-readability/stress evidence with a lighter sample. |

The original pre-implementation count was `1 COMPLETE, 7 PARTIAL, 3 MISSING,
1 DEFER / OUT OF PHASE 5`. Rows 1–3 and 9 above are amended to reflect the
current Phase 5.1 implementation and the still-separate manual evidence gates.

## 4. Capability inventory

### 4.1 Settings and audio foundation

**Proven in current code**

- `GameSettings` is versioned and currently contains master/music/SFX volume,
  animation speed, reduced motion, and fullscreen.
- `normalizeSettings` clamps volume values, validates animation-speed options, and
  supplies defaults for malformed values.
- `SettingsProvider` reads and writes the versioned local-storage record on
  changes, exposes patches, and synchronizes native fullscreen state.
- `SettingsPanel` currently exposes editable Master, Music, and SFX controls as
  well as animation speed, reduced motion, and desktop fullscreen.
- `useEffectiveReducedMotion` combines the user preference with the operating
  system preference.
- `AudioProvider` is mounted at bootstrap and currently maps settings to
  `{ masterGain, musicGain, sfxGain }`.

**Implemented locally; not yet proven by live auditory UAT**

- `AudioEngine` owns the single `AudioContext`, SFX registry, Music bus, one
  deterministic procedural loop, voice limits, cooldowns, presentation scope,
  and disposal. No downloaded or third-party audio asset is required.
- `PresentationController` injects the stable `AudioPort` into the existing
  executor path. Reset/session sync/skip/disposal stop presentation tails while
  UI clicks and music remain independent.
- The three sliders change live Master/Music/SFX bus gains in runtime; actual
  speaker output remains a browser/Electron/manual gate.
- `musicVolume` is intentionally retained. No `ambienceVolume` migration is
  part of the current Phase 5.1 decision.

### 4.2 Presentation architecture and safe sources

The preserved path is:

`authoritative snapshot / accepted typed semantic lane` → `PresentationController` →
`AnimationQueue` + `PresentationStore` → `BoardRenderModel` and existing scene/UI
executors.

Relevant owners are:

- `apps/client/src/game/presentation/PresentationController.ts` for snapshot,
  private-lane, reset, skip, and stale-completion boundaries;
- `apps/client/src/game/presentation/queue/AnimationQueue.ts` for one ordered
  presentation lifecycle, resolved durations, skip, and generation protection;
- `apps/client/src/game/presentation/store/presentationStore.ts` and `store/types.ts`
  for bounded one-shot signals and reset-cleared transient state;
- `apps/client/src/game/presentation/events/derivePresentationEvents.ts` for
  proven roll identity, typed semantic events, movement proof, card boundaries, and
  duplicate suppression;
- `apps/client/src/game/presentation/executors/basicExecutors.ts`,
  `semanticExecutors.ts`, `movementExecutor.ts`, and `diceExecutor.ts` for current
  action ownership and timing;
- `apps/client/src/game/presentation/timings.ts` for the current timing map;
- `apps/client/src/game/scene/board/boardRenderModel.ts` for the single scene
  render model.

Phase 5 effects and audio may add consumers or typed fields at these boundaries,
but must not parse `boardState.logs`, `lastAction`, private implementation state,
or inferred face-pair/version heuristics. A signal is safe only when the current
public snapshot or approved public/private lane proves its identity, audience,
sequence, and consequence.

### 4.3 Current FX inventory and disposition

| Trigger | Current owner and lifetime | Reduced motion / skip / reset / reconnect | Draw and resource implications | Phase 5 disposition |
|---|---|---|---|---|
| `STEP` / `LAND` tile impact | `TileMotionController` and `TileImpactHighlightBatch`; current timing is about 36/78 ms for step and 52/68 ms for land. | Reduced motion resets with no press; reset epoch clears it; skip snaps; reconnect does not replay transient impacts. | One shared instanced tile batch, zero idle intensity, demand invalidation. | **Preserve.** Reuse as the visual anchor for movement sound/impact-ring decisions. |
| Destination preview / active destination | `TileDestinationPreview` within `TileFxAnchor`; current pulse is a bounded signal with static reduced-motion opacity. | Signal id clears on replacement/unmount; snapshot/reset clears; no replay on reconnect. | Two tile meshes for the active preview; current Phase 4 fixture measures the heavy board path. | **Preserve and measure.** No extra glow layer without a reproducible readability need. |
| Tile action consequence | `TileActionFeedback` reads latest typed ownership/development/GO signals and dwells about 900 ms after a short pulse. | Reduced motion keeps semantic text but removes pulse; timers are cleaned; reset removes transient signals. | One SDF text per tile feedback instance, `useFrame` only while active. | **Preserve.** Extend only for typed floating consequence labels; do not duplicate this feedback. |
| Ownership acquisition/change | `OwnershipFlag` reads `OwnershipChangeSignal`; current pop is about 180 ms and initial/reconnect state is static. | Reduced motion and snapshot state avoid acquisition pop; reset/unmount cleanup is local. | One flag mesh/draw per displayed flag; geometry is disposed on unmount. | **Preserve.** Reuse the signal for safe ownership SFX. Investigate batching only if UAT shows a budget issue. |
| House/hotel construction | `BuildingLayer`, `HouseMesh`, `HotelMesh`, and `ConstructionPuff`; house pop about 180 ms with 125 ms stagger, hotel transition about 520 ms. | Reduced motion/downward/snapshot paths render authoritative shapes without puff; component cleanup ends local animation. | Current puff is an instanced 11-particle mesh per animated building; shared facade resources; transient draw cost is already measured. | **Preserve and consolidate.** Add a build sound or bounded dust variation only through this owner. |
| Money transfer / balance consequence | `MoneyTransferLayer` and `PresentationStore.emitMoneyTransfer`; duration about 1300 ms, coin count bounded from 2 to 8. | Store timers clear; queue reset/skip clears or settles; reconnect hydrates balances without replaying the transfer. | Shared coin geometry and three shared finish materials; up to three finish draws for one transfer. | **Preserve.** Add exact typed money SFX/labels without a second coin burst system. |
| Station and bank wealth | `PlayerStationLayer` and `coinVisuals.ts`; permanent bank/station piles use shared instancing and SDF labels. | Authoritative snapshot display; no transient replay. | Three shared finish instanced meshes; current station/bank diagnostics expose instance counts. | **Leave as baseline.** Do not add idle particles or animated wealth. |
| GO crossing | `movementExecutor` and `semanticExecutors` produce `GoCrossingSignal` only for a proven physical entry to tile `0`; a typed money transfer may follow. | Reduced motion keeps safe semantic cue while snapping; reset/skip guard queued writes. | Coins are bounded and included in active-object diagnostics. | **Preserve.** Any audio/label must use the proven GO signal, not a log phrase. |
| Dice roll / result | `DiceLayer`, `diceExecutor`, and `DiceContactShadowBatch`; current roll is about 640 ms plus 140 ms result hold. | Reduced motion settles immediately; skip settles; reset/reconnect hydrates authoritative face without replay. | Procedural dice and one instanced contact-shadow batch; diagnostic fixture measures rolling and settled states. | **Preserve.** Add dice audio only after the runtime supports sequence dedupe. |
| Card draw/reveal/focus | `PhysicalCardDecks`, `CardFocusLayer`, card presentation signals, and durable pending-card stages. | Reconnect hydrates `AWAITING_DRAW`/`REVEALED` without replay; skip closes current work safely; reduced motion snaps stages. | Shared deck geometry/materials plus a focused demand canvas; active focus is measured separately and combined. | **Preserve.** Card flip/draw audio can consume typed stage transitions; no audio on snapshot hydration. |
| Jail / failed jail / release | `basicExecutors.ts` and `semanticExecutors.ts` emit jail transfer/reaction or sad reaction from typed semantic events; current jail reaction is about 120 ms. | Unsupported ambiguity snaps; reduced motion removes nonessential reaction; reset clears. | Character reaction is imperative and local; no particle family. | **Preserve and extend cautiously.** A jail SFX can use `SENT_TO_JAIL`/`JAIL_ROLL_FAILED`; release currently has no visual executor. |
| Bankruptcy / finish reaction | `PLAYER_FINISHED` produces `bankrupt` or `sad`; `CharacterReactionController` owns about 180 ms reactions; `GAME_FINISHED` has a timed executor but the UI is still a winner modal. | Reset/skip prevents stale reaction writes; reconnect does not replay old transient reactions. | Character sprite animation only; no confetti or board celebration. | **Extend in victory slice.** Keep bankruptcy authority and add celebration only after final-state policy is approved. |
| Generic sparkle / impact ring / confetti | No current owner or reusable family. | No current contract. | Any implementation would create new transient resource/draw decisions. | **New, bounded only.** Prefer one shared instanced family or DOM/UI treatment; no global effects renderer. |

## 5. Duplicate-system risks to avoid

- Do not add `EffectsBus`, `AudioQueue`, `ParticleQueue`, or a second random/event
  scheduler beside `PresentationController → AnimationQueue → PresentationStore`.
- Do not derive SFX, floating labels, or feed entries by parsing HTML logs. Logs
  are a display/history projection, not a gameplay event contract.
- Do not turn the existing local reaction primitive into a multiplayer-emote
  feature in Phase 5. Chat has a different audience, history, escaping,
  rate-limit, and persistence purpose.
- Do not infer rent, card identity, transfer attribution, or a richer movement
  route when the current public lane does not prove it. Use the typed semantic
  reason/event only where its audience and identity are explicit.
- Do not add per-instance Three.js materials, geometries, textures, or a second
  postprocess renderer for small feedback. Reuse instanced/shared resources and
  preserve the demand-rendering model.
- Do not create a second event history merely to make the feed look compact. The
  current `logs` history and chat need one authoritative reconnect story.
- Do not compute victory data from logs, `lastAction`, or client timing. Use only
  the approved current authoritative final state.
- Do not let a victory overlay, audio cue, or particle cleanup delay the terminal
  authoritative state or turn-room transition.

## 6. Inherited constraints and validation status

### 6.1 Authority and protocol

- Server/GameCore/PostgreSQL remain authoritative for rules, pending operations,
  card order, revisions, winner, and public/private visibility.
- Phase 5.2 is now implemented on consolidated V8. `packages/shared/src/types.ts`
  contains bounded public
  `GameplaySemanticEvent` types for money transfer, property transfer, GO, jail,
  failed jail roll, and jail release. `apps/server/src/game/semanticEvents.ts`
  owns the 64-event public/private tails and stable event ids.
- `packages/shared/src/events.ts` now includes the no-payload `play again` command;
  `BoardState.activityFeed` is the typed public event tail. The implementation made
  one consolidated protocol/snapshot revision to V8 and migration `009`, which
  initializes empty activity rather than reconstructing legacy logs.
- `FinishedPlayer` and `Winner` expose current identity fields and optional final
  balance, but not historical statistics. Phase 5.2 uses only the approved current
  summary facts.

### 6.2 Renderer and performance

The unchanged guardrails are:

| Budget | Target / hard limit | Phase 5 rule |
|---|---:|---|
| Normal steady state | `≤210` draw calls | Preserve as the normal goal. |
| Stress / heavy transient | `<240` draw calls | Never accept a new transient peak at or above the hard limit. |
| Normal triangles | `≤80,000` | Preserve. |
| Hard triangles | `<100,000` | Never regress above this limit. |
| Demand rendering | `frameloop="demand"` | Every new animated owner must invalidate only while active and settle cleanly. |
| Heavy Phase 4 readability fixture | about `227` draw calls | Carry this heavier fixture as the guardrail; do not replace it with a lighter `~199` sample. |

The current diagnostics are in `GameScene.tsx`,
`game/scene/board/architecture/sceneBudget.ts`, and
`dev/phase4-uat/Phase4UatHarness.tsx`. Recorded deterministic harness metrics are
useful evidence, but they are not live browser/Electron UAT, remote-CI proof, or
a 30–60 minute session result. Those statuses remain separate.

### 6.3 Accessibility and interruption contract

Every approved effect family must define all of the following before code work:

| State | Required behavior |
|---|---|
| Normal motion | Full bounded effect with an explicit owner and lifetime. |
| Reduced motion | Preserve the semantic result, remove bounce/flight/pulse where nonessential, and settle immediately or use a static readable cue. |
| Skip | Cancel stale visual work and snap to the newest accepted authoritative state; no queued effect may write after skip. |
| Reset/reconnect | Hydrate current state without replaying old spectacle; clear transient signals and timers. |
| Audio | Reduced motion is not a mute switch. Audio policy must be independently documented, deduplicated by accepted identity, and safe when a snapshot replaces queued work. |
| WebGL fallback | Important meaning remains available through existing DOM/log/status/accessibility surfaces; a decorative WebGL effect must never be the only explanation of a consequence. |

## 7. Audio scope and approved architecture

### Current finding

Phase 5.1 uses the Native Web Audio API and solves playback and ownership through
one client-owned runtime. SFX and one original deterministic background music
loop are procedural; no downloaded or third-party audio asset is selected or
added. Any future asset still needs explicit, traceable provenance/licensing.

### Approved shape for implementation

1. Keep `SettingsProvider` as the source of persisted mix values.
2. Extend the current `AudioProvider` into one client-owned runtime/registry with
   group metadata (`UI`, `DICE`, `MOVEMENT`, `MONEY`, `PROPERTY`, `BUILD`, `CARD`,
   `JAIL`, `BANKRUPTCY`, `VICTORY`) and the approved Master/Music/SFX gain graph.
   Retain the persisted `musicVolume` field intentionally; do not introduce an
   `ambienceVolume` migration.
3. Attach one audio sink to accepted presentation semantics. It is a consumer,
   not a new queue: preserve
   `PresentationController → AnimationQueue → PresentationStore`, use accepted
   event identities and reset epochs, suppress duplicate playback, and do not
   replay on reconnect.
4. Keep all rule and semantic-authority decisions in server/GameCore. The client
   may play a sound for a proven signal but may not invent a gameplay event for a
   sound.
5. Add bounded concurrency, priority, cooldown, and missing-asset fallback so
   dice impact, money, purchase, build, card, jail, bankruptcy, and victory do not
   all play at full intensity. Optional ducking is allowed only if justified by
   the approved mix design.
6. Handle browser first-interaction/autoplay unlock, procedural source creation,
   disposal/resource cleanup, and browser/Electron lifecycle explicitly. Phase
   5.1 uses one low-intensity, non-recognizable, long-session-friendly background
   music loop through the Music bus, subordinate to SFX. Ambience is deferred.

### Audio-specific acceptance boundaries

- `musicVolume` remains the versioned local Music gain; no settings migration,
  server protocol change, or database migration is needed.
- A setting change changes the approved runtime gain in a browser/Electron smoke
  check, not only local storage.
- One accepted event id produces at most one sound per selected group policy;
  snapshot hydration and reconnect produce no duplicate sound.
- Audio has no renderer draw-call or triangle contribution.
- Browser autoplay/first-gesture unlock, missing asset, disposal, focus policy,
  and package loading behavior are tested explicitly.
- Audio manual UAT is reported separately from visual UAT and from automated tests.

## 8. Visual feedback, particles, and floating consequences

### Approved visual rules

- Reuse `PresentationStore` signals, existing executors, `BoardRenderModel`, and
  current tile/station/character owners.
- Prefer the current instanced/shared-resource style. A new family must document
  geometry/material reuse, maximum instances, disposal, and demand invalidation.
- Use exact `BalanceDeltaSignal`/`MoneyTransferSignal` amounts and typed semantic
  reasons for money labels and SFX. Do not derive `RENT`, `DOUBLE`, or any cause
  from log text.
- Keep board meaning readable above decoration. Floating labels must be short,
  bounded, quickly settled, and not cover the fixed-camera board.
- Preserve `TileActionFeedback` for property/build/GO text rather than creating a
  second tile-label overlay.
- Existing jail, bankruptcy, and local reaction primitives remain current
  presentation detail. Phase 5 does not add a multiplayer-emote bubble, selector,
  transport, or reaction feature.

### Approved transient budgets

These are approved entry budgets for implementation, not current implementation facts:

| Approved family | Idle contribution | Transient cap | Resource rule |
|---|---:|---:|---|
| Typed consequence label | `0` | At most 4 simultaneous labels per board | Reuse existing SDF/DOM text path; settle/remove by signal id. |
| Small gameplay particle burst | `0` | At most 3 concurrent bursts, one shared instanced draw family per effect type | Shared geometry/material; bounded instance count; no per-particle material allocation. |
| Victory celebration | `0` after settle | One bounded celebration sequence, with a single shared confetti/burst owner | No permanent board objects, no camera cinematic, no global postprocess. |
| All visual additions together | `0` steady-state growth | Deterministic peaks must remain below `<240` draws and `<100,000` triangles, including the heavy `~227` baseline fixture | If a slice cannot fit, consolidate or defer it; do not weaken the guardrail. |

Every Phase 5 visual slice must capture diagnostics during: settled board,
active effect, simultaneous stress, 1280×720, 1440×900, and 1920×1080. The
current `board-readability` and `stress` fixtures remain mandatory.

## 9. Reactions and multiplayer emotes — DEFER / OUT OF PHASE 5

The local primitive is real but remains current implementation detail:
`CharacterReactionKind` includes `emote`, `characterReaction.ts` can animate it,
and `CharacterBillboard.tsx` consumes reactions. Phase 5 does not add a
multiplayer-emote feature.

Do not implement an emote command, broadcast, persistence, rate limit, bubble,
selector, reconnect policy, spectator policy, or protocol change. Do not delete
the existing local reaction code in this documentation task. Any future emote
product decision belongs to a separate scope after Phase 5.

## 10. Structured activity feed in the existing Log

### Current finding

There remains a compatibility `boardState.logs` array bounded to 500 entries.
V8 adds a bounded server-authoritative typed `boardState.activityFeed`; `Log.tsx`
renders that tail, using `PresentationStore.displayActivity` while the existing
presentation queue is active. The legacy array is not parsed or duplicated.

### Approved direction for Phase 5.2

Upgrade the existing `Log` surface with a bounded structured authoritative
activity tail. The target architecture is:

```text
server-authored bounded structured activity
  → public/reconnect-safe projection
  → presentation-aware existing Log UI
```

The target categories include rolled, property bought, rent/payment,
property built/upgraded, safely represented card draw/resolution, jail,
bankruptcy, and game finished. The implementation must define ordering,
reconnect hydration, spectator visibility, gameplay/chat visual distinction,
ARIA/readability, and bounded tail storage.

The shared `ActivityEvent`/`ActivityFeed` schema is implemented from the real server
producers with monotonic sequence/UUID identity, a 128-event tail, public-safe card
reveal data, spectator/reconnect projection and the existing queue gate. Existing
strings remain compatibility data; gameplay categories are never reconstructed by
parsing HTML strings. No second gameplay-history panel or client-fabricated event
source is allowed.

## 11. Victory, end-game, and same-room Play Again

### Current authority and UI

- `apps/server/src/game/turn.ts` declares the winner once, only after the game has
  started, one live player remains, and at least one player is in
  `finishedPlayers`. The write and winner log are idempotent.
- `apps/server/src/socket/roomCommands.ts` changes the room to `FINISHED` after
  authoritative winner state is present and clears active turn/debt state.
- `apps/server/src/services/publicState.ts` exposes the authoritative winner,
  finished-player records, current balances, owned properties, development, and
  room membership state.
- `apps/client/src/components/dashboard/WinnerBanner.tsx` renders the fact-only
  winner summary and host-only Play Again control. `Dashboard.tsx` owns its
  placement in the existing gameplay action layer.

### Approved V1 victory surface

The implemented Phase 5.2 surface displays only current authoritative facts:

- winner name;
- character/mascot;
- player color;
- final cash;
- property count;
- house count;
- hotel count.

Do not add net worth, historical match statistics, rent paid/received, turns
played, cards drawn totals, transaction history, historical build counters, or a
historical-statistics contract. Do not infer any displayed fact from logs or
client timing. Bounded victory SFX, confetti, mascot celebration, and subtle board
celebration may reuse Phase 5.1 infrastructure, with no cinematic camera.

Reconnect into a `FINISHED` room shows the final state immediately without replaying
stale confetti or audio; replay uses the existing `REPLAY_SYNC` reset boundary.

### Approved same-room Play Again boundary

Phase 5.2 includes a host-only `Play Again` action. It is an authoritative server
command, not a UI-only reset, and the approved lifecycle is:

```text
LOBBY → IN_PROGRESS → FINISHED → LOBBY
```

The same room retains its room id and room code, keeps the host identity where it
is still eligible, preserves valid player sessions and connected eligible
participants, and returns eligible existing players to the lobby/mascot picker
with `ready = false`. They may change mascot or color; the current appearance is
the initial lobby choice unless normal uniqueness rules require adjustment. New
players may join available slots. Bankrupt players from the completed match may
return. Players who explicitly left are not revived, and spectators are not
converted into players.

Implementation uses a transaction-safe, persistence/recovery-safe room transition
and the canonical/fresh game-state construction path. The fresh match does not leak
winner or finished players, positions, balances, properties, houses/hotels, dice,
roll sequence, turn state, pending landing/card/debt/payment operations, decks, completed card
operations, forced-sale state, semantic event tails, match logs/activity, or
presentation identities from the old match. `New Room` is not a Phase 5 action.

The command and reset boundary are implemented in the current Phase 5.2 slice;
the remaining evidence is reported separately by validation category.

## 12. Performance and UAT plan

### Mandatory performance behavior for every visual slice

- No new steady-state draw-call or triangle growth is the default goal.
- Transient additions must be instanced/batched or DOM/UI when they do not need
  world-space depth. No per-instance material/geometry allocation.
- `useFrame`/invalidation runs only while an effect is active; timers and signal
  ids are cleaned on settle, unmount, skip, reset, and reconnect.
- The heavy board-readability fixture remains the baseline. A visual slice must
  record settled and active numbers, not only a lighter idle sample.
- No postprocess, full-screen bloom, scene-wide glow, or separate renderer is
  proposed without a measured need and an approved budget plan.

### Deterministic fixture coverage

The Phase 4 harness should be extended only with Phase 5-specific states; its
existing scenarios remain required:

- `board-readability` at 1280×720, 1440×900, and 1920×1080;
- `stress` with simultaneous active objects;
- stations/coin materials, money transfer/balance gate, construction, hotel,
  owner recolor, cards, jail, bankruptcy;
- reduced motion, skip during active motion/card work, reconnect at durable card
  stages, spectators, and opponent turn;
- new bounded consequence-label, particle, activity-feed, victory, and Play Again
  fixtures only when their corresponding Phase 5.1/5.2 slice is implemented.

### Manual and unavailable gates

Report separately:

- automated unit/typecheck/lint results;
- deterministic renderer fixture metrics;
- live browser visual UAT and viewport evidence;
- Electron/package visual and semantic UAT;
- manual 30–60 minute clutter/music-fatigue/SFX-fatigue session;
- database proof, remote CI, commit, and push/merge status.

The deterministic fixture must not be presented as proof of live sound output,
browser autoplay behavior, Electron packaging, or a long session.

## 13. Approved Phase 5 decomposition

The earlier draft decomposition into seven implementation slices is superseded
and has been removed from the current plan. Phase 5 has exactly two
implementation subphases. The audit evidence above remains historical/current
code evidence; this section is the only current decomposition.

### Phase 5.1 — Core Game Feel, Audio & Visual Feedback

**Objective:** make core action feedback audible and visually legible while
preserving the existing authoritative presentation architecture and hard budgets.

#### Audio runtime and retained Music settings

- Use the Native Web Audio API.
- Extend one centralized client-owned audio registry/runtime and one audio
  integration/sink attached to accepted presentation semantics.
- Preserve `PresentationController → AnimationQueue → PresentationStore`; audio
  consumes approved identities and is not a second gameplay scheduler or queue.
- Use Master / Music / SFX gain groups. Retain the current client-local
  `musicVolume` representation intentionally; no settings-version migration is
  required. No gameplay protocol or database migration is required for this
  client-only slice.
- Handle browser first-interaction/autoplay unlock, asset loading/caching,
  explicit traceable asset provenance/licensing, missing-asset fallback,
  disposal/resource cleanup, duplicate-event suppression, reconnect/snapshot
  no-replay, and bounded concurrency/priority/cooldown. Optional ducking is allowed
  only if justified by the approved mix design.

#### Core gameplay SFX and one background music track

Approved typed/current presentation categories include UI/button, dice shake,
dice impact, tile hop, landing, money receive, money pay, property purchase,
house construction, hotel upgrade, card draw/reveal, sent to jail, failed jail
attempt where appropriate, bankruptcy, and victory. All triggers must use proven
typed/current presentation identities; HTML logs are never gameplay evidence.

Phase 5.1 includes one original deterministic background music loop: low
intensity, warm, non-recognizable, separately gained through Music, smoothly
started/stopped/faded where useful, and subordinate to SFX. Ambience is deferred
unless separately approved later.

#### Remaining visual game-feel work

Preserve the existing Phase 4 tile STEP/LAND feedback, destination preview,
ownership feedback, development feedback, construction puff, money-transfer
coins, dice presentation, card presentation, jail reactions, bankruptcy reactions,
board/camera/material system, and reconnect/Reduced Motion/Skip boundaries.

Only add bounded missing feedback such as exact `+$amount`/`-$amount`, small typed
consequence labels where authoritative semantics prove them, or a carefully
bounded sparkle/impact ring/small burst where it improves comprehension. Do not
create a global particle engine, second EffectsBus, postprocessing pipeline,
cinematic camera, or permanent decorative particles.

Carry the existing constraints unchanged: zero steady-state draw-call growth by
default; no more than four simultaneous consequence labels; no more than three
concurrent transient particle bursts; shared geometry/materials;
instancing/batching; `frameloop="demand"`; active-only invalidation; and clean
skip/reset/reconnect disposal.

#### Phase 5.1 validation

Include automated audio-runtime, settings-migration, trigger/dedupe,
reconnect/reset, missing-asset, and cleanup tests; browser autoplay/unlock;
Electron audio smoke after a fresh package; visual consequence fixtures; Reduced
Motion; Skip; WebGL fallback; renderer diagnostics; and separate audio versus
visual evidence. Completion leaves all existing hard budgets unchanged.

### Phase 5.2 — Activity Feed, Victory, Play Again & Final Closure

**Objective:** close the approved activity, end-game, reusable-room, and
long-session boundaries without adding a second history or client authority.

#### A. Structured activity feed

Upgrade the existing `Log` surface with a bounded server-authored structured
activity tail. Use the architecture and categories in Section 10; derive the
exact shared schema/event design from the real server model during implementation.
Cover ordering, reconnect hydration, spectator visibility, gameplay/chat visual
distinction, ARIA/readability, bounded storage/tail behavior, and no HTML-log
parsing. Existing strings/chat may remain for compatibility/history where
appropriate; no second gameplay-history UI is allowed.

#### B. Victory/end-game

The current winner surface is extended using only the approved facts: winner,
mascot, color, final cash, property count, house count, and hotel count. No net
worth and no historical-statistics contract. Reuse Phase 5.1 celebration sinks for
bounded victory SFX/FX. Reconnect into `FINISHED` shows final state immediately and
does not replay stale confetti/audio.

#### C. Host-only same-room Play Again

Implement a server-authoritative, transaction-safe, persistence/recovery-safe
command for `FINISHED → LOBBY` in the same room. Preserve room id, room code,
eligible host identity, valid sessions, and connected eligible participants;
return eligible existing players, including bankrupt players, to the lobby with
`ready = false`; retain current appearance as the initial choice; allow normal
mascot/color changes and new players in available slots; do not revive explicit
leaves or convert spectators. Use canonical/fresh game-state construction so no
old match-specific state, activity, or presentation identity leaks. Do not add a
separate `New Room` action and do not prescribe manual field-by-field reset.

#### D. Final closure and validation

Required evidence includes typecheck, lint, tests, database status/integration
where required, build, deterministic renderer fixtures, browser UAT,
Electron/package UAT, 2-player and 4-player sessions, Play Again, returning
bankrupt player, explicit-left player not revived, new player joining the replay
lobby, host-only replay authorization, reconnect before/after `FINISHED`, activity
feed reconnect, Reduced Motion, Skip, WebGL fallback, 30–60 minute session, SFX
fatigue, music fatigue, particle/label clutter, audio source/node cleanup,
active animation cleanup, draw calls/triangles, and remote CI reported separately.
No guardrail may be weakened to make Phase 5 pass. Automated, database, browser,
Electron/manual, remote-CI, commit, and push status remain separately reported.

#### Contract/version rule

The implementation consolidated structured activity and Play Again on protocol
version 8 and room snapshot schema version 8. Migration `009_activity_feed_v8.sql`
upgrades V7 snapshots by initializing an empty activity tail; it does not
reconstruct legacy log strings. No second Phase 5.2 contract revision is planned.

## 14. Dependencies and approved order

```text
Phase 5.0 approved scope
        |
        +--> Phase 5.1 — Core Game Feel, Audio & Visual Feedback
                     |
                     +--> Phase 5.2 — Activity Feed, Victory, Play Again & Final Closure
```

Phase 5.2 depends on the Phase 5.1 audio/visual sinks and the preserved Phase 4
presentation baseline. The activity contract and Play Again command were derived
from the real server model and are now implemented; remaining work is validation
and evidence capture.

## 15. Implementation-level decisions recorded

The product scope and Phase 5.2 implementation decisions are resolved. The
following records preserve the original implementation questions and their result:

1. **Exact audio asset pack and provenance:** select only assets with explicit,
   traceable licensing/provenance and record the source for every shipped asset.
2. **Exact structured activity schema/event design:** implemented as the shared
   V8 `ActivityEvent`/`ActivityFeed` contract with authoritative producer points,
   UUID/sequence identity, public-safe card reveal, reconnect projection, and a
   bounded 128-event tail.
3. **Protocol compatibility outcome:** implemented as one consolidated protocol /
   snapshot V8 revision with migration `009`; no second bump is planned.
4. **Detailed runtime policy:** finalize the bounded SFX priority/cooldown table,
   missing-asset behavior, and optional ducking only within the approved mix and
   resource budgets.

## 16. Risks and explicit deferrals

- Audio autoplay and Electron packaging may behave differently from a browser
  fixture; both need fresh manual evidence.
- Unlicensed or inconsistent audio assets can block 5.1 even if code is ready.
- The structured activity and Play Again contracts are implemented on V8; migration
  and reconnect obligations remain validation gates rather than deferred scope.
- The `~227` board-readability baseline leaves limited draw-call headroom. Effects
  that look small in isolation may breach the hard budget when combined with card,
  construction, money, or dice fixtures.
- Floating labels, victory celebration, and feed rows can compete for the same
  fixed viewport. Readability and clutter are manual gates, not assumptions from a
  unit test.
- Current winner state does not contain historical statistics. Historical stats,
  net worth, and New Room are not Phase 5 acceptance requirements; Play Again has
  the approved same-room lifecycle recorded in Sections 11 and 13.
- No current live browser/Electron, remote-CI, or 30–60 minute music/SFX-fatigue
  evidence was promoted to PASS by this audit.
- Multiplayer emotes remain deferred/out of Phase 5. Other out-of-scope items
  remain voice chat, complex cutscenes, character voice acting, huge particle
  systems, cinematic camera work, and gameplay-rule complexity.

## 17. Phase 5.1 completion and corrective criteria

The current Phase 5.1 implementation satisfies the client-only entry boundary;
remaining completion gates are evidence categories, not scope expansion:

- this approved scope remains the current source of truth;
- the Native Web Audio runtime boundary, original procedural source provenance,
  browser unlock behavior, and Master/Music/SFX gain policy are recorded;
- retained `musicVolume` settings, the presentation-to-audio integration boundary,
  event identity/dedupe,
  reset/reconnect behavior, and concurrency policy are written down;
- the current Phase 4 baseline/guardrails remain unchanged and the heavy
  `board-readability` fixture is retained;
- no Phase 4 feature work, board redesign, renderer replacement, log parsing, or
  GameCore audio is included in the approved slice;
- test/UAT ownership is assigned for automated, browser, Electron, manual,
  performance, and unavailable remote-CI gates;
- any dependency or asset addition is separately approved and traceable;
- the implementation branch remains based on the merged Phase 4 main commit and
  the first Phase 5 commit is limited to the approved slice.

## 18. Phase 5.2 entry criteria and closure

The following entry criteria were recorded before implementation. The current
Phase 5.2 slice satisfies the implementation prerequisites; automated, database,
browser, Electron/manual, performance, commit, and remote-CI evidence remains
reported separately:

- Phase 5.1 audio/visual boundaries and hard budgets are recorded, including
  cleanup, Reduced Motion, Skip, reconnect, and WebGL fallback behavior;
- the real server model has been inspected for the bounded structured activity
  projection and for the canonical fresh game-state construction/reset path;
- activity categories, ordering, reconnect hydration, spectator visibility,
  gameplay/chat distinction, accessibility, and tail bounds are specified without
  inventing unimplemented fields;
- the host-only Play Again authorization, same-room `FINISHED → LOBBY` transition,
  eligible-session rules, bankrupt/left/spectator behavior, ready/appearance rules,
  transaction boundary, persistence/recovery behavior, and no-leak reset boundary
  are specified;
- the approved victory summary facts and no-historical-statistics boundary are
  covered by authoritative fixtures;
- protocol/snapshot compatibility has been inspected and any required change is
  consolidated for the Phase 5.2 contract rather than assumed in advance;
- the full Phase 5.2 validation matrix has owners for automated, database,
  browser, Electron/manual, performance, remote-CI, commit, and push evidence.

## 19. Approved Phase 5 handoff

This artifact remains the approved scope boundary. The current Phase 5
implementation includes centralized audio, core SFX, one original background
music track, typed activity, fact-only victory presentation, and host-only
same-room Play Again. It preserves the Phase 4 board/camera/gameplay baseline and
uses the single presentation/audio architecture. The implementation milestones are:

1. Phase 5.1 — Core Game Feel, Audio & Visual Feedback.
2. Phase 5.2 — Activity Feed, Victory, Play Again & Final Closure.
