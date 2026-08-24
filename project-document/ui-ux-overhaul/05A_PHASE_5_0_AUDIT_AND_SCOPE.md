# Phase 5.0 — Current-Code Audit and Draft Scope Decomposition

**DRAFT — awaiting user review and scope approval**

Audit date: 2026-08-24
Branch: `overhaul/phase-5-game-feel-audio-effects`
Base: `main` at `955e74233e7ae91c0aeb990633295257ea9e3be4` (`Merge Phase 4 gameplay presentation`)
Protocol: V7
Status: documentation-only Phase 5.0 audit; no Phase 5 feature implementation

## 1. Readiness summary

Phase 4 is closed for feature work. The current code already has a substantial
gameplay-presentation foundation: authoritative V7 snapshots and semantic event
lanes, proven movement and consequence executors, bounded tile/building/coin/card
feedback, reduced-motion/skip/reconnect boundaries, and a measured renderer
diagnostic path. Phase 5 should extend those capabilities rather than introduce a
second effects bus, animation queue, log-derived event path, or renderer.

The main capability gap is audio. Settings values and an `AudioProvider` mix
context exist, but the current repository has no playback engine, central asset
registry, audio files, playback calls, priority policy, music loop, or ambience
runtime. The old Phase 5 document therefore describes intent, not an existing
audio implementation.

The other large gaps are multiplayer emotes, a structured compact event-feed
contract, a complete victory surface, and the long-session/manual validation
gate. Current visual feedback is useful and should be preserved: tile impacts,
destination preview, ownership/development feedback, construction puff, coin
transfers, dice contact shadows, card presentation, jail/bankruptcy reactions,
and reconnect-safe presentation already exist.

This document proposes a reviewable decomposition. It does not approve an audio
engine, select or add assets, add socket events, bump the protocol, change
GameCore, or implement any visual/audio feature.

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
the required runtime or contract is absent. `DEFER / OUT OF PHASE 5` is reserved
for work that should not be part of this phase; no whole Phase 5 area is classified
that way, although several optional items inside areas are explicitly deferred.

## 3. Original Phase 5 requirement matrix

Each original area has exactly one classification.

| Original area | Classification | Concrete current-code evidence and owner | Works now | Missing or not proven | Proposed Phase 5 slice |
|---|---|---|---|---|---|
| 1. Centralized audio | **MISSING** | `apps/client/src/audio/AudioProvider.tsx` publishes only a gain object; `apps/client/src/audio/types.ts` contains only `AudioMix`; `apps/client/src/app/bootstrap/AppBootstrap.tsx` mounts the provider. No registry, player, asset loader, `AudioContext`, `HTMLAudioElement`, or playback call is present. | Settings can expose three gain values to a provider. | No sound can currently be played or deduplicated. No event-to-sound ownership or priority policy exists. | Add one client-owned registry/runtime after engine and licensing approval. It must consume accepted typed presentation semantics and remain outside GameCore. |
| 2. Master/Music/SFX controls | **PARTIAL** | `apps/client/src/settings/types.ts`, `defaults.ts`, `storage.ts`, `SettingsProvider.tsx`, `SettingsPanel.tsx`, and `selectors.ts` define, normalize, persist, edit, and expose `masterVolume`, `musicVolume`, `sfxVolume`, animation speed, reduced motion, and fullscreen. `settings.test.ts` and `SettingsProvider.test.tsx` cover normalization/persistence and native fullscreen behavior. | Values are clamped to `0..1`, versioned in local storage, editable in the panel, and mapped to `AudioMix`. | There is no playback consumer, so “controls hoạt động” is not proven as audible behavior. Optional unfocused mute and ambience controls do not exist. | Keep the settings contract and make the existing mix operational in the approved audio runtime. Decide separately whether unfocused mute and ambience belong in V1. |
| 3. Gameplay SFX priorities | **MISSING** | Presentation has typed owners for dice, movement, landing, balance, ownership, development, cards, jail, finish, and semantic transfers in `apps/client/src/game/presentation/events/types.ts`, `derivePresentationEvents.ts`, `executors/*`, and `store/types.ts`; there is no audio sink. | The visual event boundaries needed for a future audio sink are mostly present. | No button/dice/movement/money/purchase/build/card/jail/bankruptcy/victory sounds, concurrency cap, dedupe, ducking, or priority ordering exists. | Bind an audio sink to existing accepted signals; do not infer causes from logs or create an audio queue parallel to `AnimationQueue`. |
| 4. Particles | **PARTIAL** | `TileImpactHighlightBatch.tsx` is one instanced additive tile batch; `BuildingLayer.tsx` owns an 11-particle instanced `ConstructionPuff`; `MoneyTransferLayer.tsx` uses shared instanced coin geometry/materials; dice/card/character layers already provide bounded physical feedback. | Tile pulse, dust/build puff, coin movement, dice contact shadow, card motion, and character reactions are bounded and demand-rendered. | No reusable sparkle, impact-ring, coin-burst, or victory-confetti family exists. Current active effects are not a general particle system. | Extend the existing instanced/shared-resource approach only where a tested gameplay consequence is clearer. A new global postprocess or unbounded particle engine is not proposed. |
| 5. Floating text/consequence | **PARTIAL** | `PresentationStore` exposes typed `BalanceDeltaSignal`, `MoneyTransferSignal`, `OwnershipChangeSignal`, `DevelopmentChangeSignal`, and `GoCrossingSignal`; `TileActionFeedback.tsx` shows `Nhận chủ`, `Trả chủ`, `Đổi chủ`, `+N Nhà`, `Khách sạn`, and `Qua Xuất Phát`; station SDF text shows authoritative balance. | Exact balance and property/development consequences already have one-shot signals, timing, reset clearing, and readable tile feedback. | No bounded `+$200`/`-$450` floating label family or explicit `RENT`/`DOUBLE`/`JAIL`/`BANKRUPT` consequence surface exists. No semantic label should be inferred from HTML logs. | Add a small, typed consequence presentation in the existing store/render model, with exact amounts/typed reasons only and a non-WebGL semantic fallback. |
| 6. Tile feedback | **COMPLETE** | `Board.tsx`, `TileAssembly.tsx`, `TileDestinationPreview.tsx`, `TileImpactHighlightBatch.tsx`, `TileMotionController.ts`, `TileActionFeedback.tsx`, `OwnershipFlag.tsx`, and the tile interaction/accessibility controls cover interactive and presentation states. | Hover/selected/active/landed/purchase/build feedback, destination preview, ownership flag, and reduced-motion behavior exist without flashing-heavy treatment. | Optional danger/high-rent emphasis is not a current requirement or proven contract. Manual readability across all requested viewports remains a validation gate. | Preserve the current tile feedback and timing. Only fix a reproducible readability problem; do not redesign the Phase 4 board/camera or add a second tile-effects path. |
| 7. Reactions/multiplayer emotes | **PARTIAL** | `CharacterReactionKind` in `presentation/store/types.ts` includes `happy`, `sad`, `jail`, `bankrupt`, and `emote`; `characterReaction.ts` and `CharacterBillboard.tsx` implement a short imperative reaction controller. `basicExecutors.ts` and `semanticExecutors.ts` produce jail/sad/bankrupt reactions. `packages/shared/src/events.ts` and `socketSchemas.ts` contain chat but no emote command/event. | Local character reaction primitives, reduced motion, cleanup, and bankruptcy/jail/sad producers exist. | No V1 emote enum, emoji bubble, producer, server validation, audience broadcast, rate limit, reconnect policy, or spectator policy exists. | Decide and then add the smallest dedicated emote transport; route it into the existing presentation controller, never through chat and never through GameCore rules. |
| 8. Event feed | **PARTIAL** | Server `apps/server/src/game/text.ts` owns a bounded 500-entry `logs` history; `apps/server/src/socket/chat.ts` appends escaped chat with a 750 ms per-socket throttle. Client `apps/client/src/components/Log.tsx` renders the same `boardState.logs`/`PresentationStore.displayLogs` as one combined history-and-chat surface. | Reconnect receives authoritative history; presentation gating prevents the log from racing ahead of queued consequences; chat is escaped and available to spectators. | There is no structured compact event-feed contract, category model, event-feed ownership, or separate semantic tail. Parsing HTML log strings is prohibited. | Prefer one authoritative history concept and refine the existing surface. A structured activity tail requires explicit shared/API approval; do not create two competing histories. |
| 9. Music/ambience | **MISSING** | The same audio audit applies: no audio assets/extensions or playback runtime are present in `apps/client`; `AudioProvider` only maps settings to gains. | The settings model has a music gain slot. | No loop, ambience layer, browser autoplay/unlock behavior, focus policy, fade, ducking, licensing decision, or fatigue test exists. | Decide whether V1 includes music, ambience, both, or neither; implement only after the runtime and licensing slice is approved. |
| 10. Victory/end-game | **PARTIAL** | Server `apps/server/src/game/turn.ts` `checkWinner` sets authoritative `boardState.winner` once and writes a winner log; `commitRoomCommand` transitions the room to `FINISHED`; `services/publicState.ts` projects winner, finished players, current players, balances, ownership, and development. Client `WinnerBanner.tsx` is a winner-name/color modal included by `Dashboard.tsx`. | Winner authority, terminal room status, winner name/color, character id in the contract, finished-player records, current balances, and current properties are available. | Current UI does not display character, summary, key stats, net-worth breakdown, replay/new-room actions, confetti, mascot bounce, board celebration, or victory audio. Historical statistics and replay semantics are not in the contract. | Build a fact-only end screen from the current authoritative snapshot first. Treat stats, replay/new room, and any new final-summary contract as approval-gated follow-up work. |
| 11. Visual polish | **PARTIAL** | Existing design tokens/CSS, `BoardShell`, `Dashboard`, `Log`, settings/modal components, `BoardAccessibilityControls`, fixed orthographic scene, and Phase 4 readability fixtures provide a strong baseline. | Hierarchy, disabled states, modal primitives, board readability diagnostics, keyboard/accessibility controls, reduced motion, and WebGL fallback exist. | A Phase 5-specific visual review and manual 2–4-player/long-session sign-off have not been completed; broad “polish” is not a license to alter frozen Phase 4 composition. | Limit this to targeted issues found by UAT: overlay hierarchy, consequence readability, emote bubble placement, feed density, and victory composition. Preserve board/camera/material architecture. |
| 12. Long-session/clutter/audio-fatigue/performance validation | **PARTIAL** | `GameScene.tsx` exposes draw calls, triangles, drawing buffer, active animated objects, card/station/coin diagnostics; `sceneBudget.ts` defines `210/240` draw and `80k/100k` triangle limits; `Phase4UatHarness.tsx` has deterministic action, reduced-motion, skip, reconnect, board-readability, and stress scenarios. | There is a repeatable deterministic fixture and a measurable renderer budget. | The 30–60 minute manual session, audio-fatigue check, particle-overload check, multi-action clutter review, and live browser/Electron/remote gates are not proven by the fixture. | Carry the existing diagnostics unchanged and add a Phase 5 long-session/UAT matrix. Do not replace the heavy `~227` board-readability/stress evidence with a lighter sample. |

**Classification count: 1 COMPLETE, 8 PARTIAL, 3 MISSING, 0 DEFER / OUT OF PHASE 5.**

## 4. Capability inventory

### 4.1 Settings and audio foundation

**Proven in current code**

- `GameSettings` is versioned and contains master/music/SFX volume, animation
  speed, reduced motion, and fullscreen.
- `normalizeSettings` clamps volume values, validates animation-speed options, and
  supplies defaults for malformed values.
- `SettingsProvider` reads and writes the versioned local-storage record on
  changes, exposes patches, and synchronizes native fullscreen state.
- `SettingsPanel` exposes editable Master, Music, and SFX controls as well as
  animation speed, reduced motion, and desktop fullscreen.
- `useEffectiveReducedMotion` combines the user preference with the operating
  system preference.
- `AudioProvider` is mounted at bootstrap and maps settings to
  `{ masterGain, musicGain, sfxGain }`.

**Not proven / absent**

- No `AudioContext`, `HTMLAudioElement`, playback hook, sound registry, asset
  loader, audio file, or audio dependency exists in the current repository.
- No component currently plays a sound or subscribes to a gameplay presentation
  signal for audio.
- The three sliders therefore change stored values and context values, but cannot
  yet change audible output.

### 4.2 Presentation architecture and safe sources

The preserved path is:

`authoritative snapshot / accepted V7 semantic lane` → `PresentationController` →
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
  proven roll identity, semantic V7 events, movement proof, card boundaries, and
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
- Do not derive SFX, floating labels, emotes, or feed entries by parsing HTML
  logs. Logs are a display/history projection, not a gameplay event contract.
- Do not send emotes through `send chat`. Chat has a different audience, history,
  escaping, rate-limit, and persistence purpose.
- Do not infer rent, card identity, transfer attribution, or a richer movement
  route when the current public lane does not prove it. Use the typed V7 semantic
  reason/event only where its audience and identity are explicit.
- Do not add per-instance Three.js materials, geometries, textures, or a second
  postprocess renderer for small feedback. Reuse instanced/shared resources and
  preserve the demand-rendering model.
- Do not create a second event history merely to make the feed look compact. The
  current `logs` history and chat need one authoritative reconnect story.
- Do not compute victory stats from logs, `lastAction`, or client timing. Use only
  current authoritative final state or a separately approved server contract.
- Do not let a victory overlay, audio cue, or particle cleanup delay the terminal
  authoritative state or turn-room transition.

## 6. Inherited constraints and validation status

### 6.1 Authority and protocol

- Server/GameCore/PostgreSQL remain authoritative for rules, pending operations,
  card order, revisions, winner, and public/private visibility.
- V7 remains the baseline. `packages/shared/src/types.ts` contains bounded public
  `GameplaySemanticEvent` types for money transfer, property transfer, GO, jail,
  failed jail roll, and jail release. `apps/server/src/game/semanticEvents.ts`
  owns the 64-event public/private tails and stable event ids.
- `packages/shared/src/events.ts` currently has `send chat` but no emote command or
  server-pushed transient emote event. Any such addition is a contract decision;
  do not bump V7 in Phase 5.0.
- `FinishedPlayer` and `Winner` expose current identity fields and optional final
  balance, but not a complete historical statistics model.

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

## 7. Audio scope and proposed architecture

### Current finding

The settings foundation is usable, but audio runtime is missing. The first audio
slice must solve playback and ownership before adding a large catalog of sounds.
No audio file or dependency should be selected or added as part of this audit.

### Proposed shape for review

1. Keep `SettingsProvider` as the source of persisted mix values.
2. Extend the current `AudioProvider` into one client-owned runtime/registry with
   group metadata (`UI`, `DICE`, `MOVEMENT`, `MONEY`, `PROPERTY`, `BUILD`, `CARD`,
   `JAIL`, `BANKRUPTCY`, `VICTORY`, `EMOTE`, `AMBIENCE`, `MUSIC`) and the approved
   Master/Music/SFX gain graph.
3. Attach one `AudioBridge` to accepted presentation semantics. It is a sink, not
   a new queue: it uses the existing accepted event identity, reset epoch, and
   lifecycle to suppress duplicate playback and avoid replaying on reconnect.
4. Keep all rule and semantic-authority decisions in server/GameCore. The client
   may play a sound for a proven signal but may not invent a gameplay event for a
   sound.
5. Add a global concurrency/priority policy so dice impact, money, purchase,
   build, card, jail, bankruptcy, and victory do not all play at full intensity.
   The exact policy needs approval with the engine choice.
6. Defer focus mute, ambience, music, and crossfade behavior until their product
   policy and licensing are approved.

### Audio-specific acceptance boundaries

- A setting change changes the approved runtime gain in a browser/Electron smoke
  check, not only local storage.
- One accepted event id produces at most one sound per selected group policy;
  snapshot hydration and reconnect produce no duplicate sound.
- Audio has no renderer draw-call or triangle contribution.
- Browser autoplay/first-gesture unlock, missing asset, disposal, focus policy,
  and package loading behavior are tested explicitly.
- Audio manual UAT is reported separately from visual UAT and from automated tests.

## 8. Visual feedback, particles, and floating consequences

### Proposed visual rules

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
- Use the existing character reaction controller for a future emote bounce; a
  bubble is a separate bounded visual child, not a second animation system.

### Proposed transient budgets for review

These are proposed entry budgets, not current implementation facts:

| Proposed family | Idle contribution | Transient cap | Resource rule |
|---|---:|---:|---|
| Typed consequence label | `0` | At most 4 simultaneous labels per board | Reuse existing SDF/DOM text path; settle/remove by signal id. |
| Small gameplay particle burst | `0` | At most 3 concurrent bursts, one shared instanced draw family per effect type | Shared geometry/material; bounded instance count; no per-particle material allocation. |
| Emote bubble | `0` | At most one active bubble per character, with a room-level server/client rate limit | Billboard/UI resource reused; auto-dismiss and reset-cleared. |
| Victory celebration | `0` after settle | One bounded celebration sequence, with a single shared confetti/burst owner | No permanent board objects, no camera cinematic, no global postprocess. |
| All visual additions together | `0` steady-state growth | Deterministic peaks must remain below `<240` draws and `<100,000` triangles, including the heavy `~227` baseline fixture | If a slice cannot fit, consolidate or defer it; do not weaken the guardrail. |

Every proposed visual slice must capture diagnostics during: settled board,
active effect, simultaneous stress, 1280×720, 1440×900, and 1920×1080. The
current `board-readability` and `stress` fixtures remain mandatory.

## 9. Reactions and multiplayer emotes

### Current capability

The local primitive is real but incomplete: `CharacterReactionKind` already
contains `emote`, `characterReaction.ts` can animate it, and
`CharacterBillboard.tsx` consumes reactions. There is no producer for network
emotes, bubble asset/model, shared enum, socket schema, broadcast, or policy.

### Smallest proposed architecture

Subject to approval:

- Use the original six V1 ids: `laugh`, `cry`, `angry`, `cool`, `heart`, `skull`.
- Add a dedicated validated emote command and a typed server-to-client transient
  event if multiplayer emotes are approved. Do not use `send chat`.
- The server authenticates the actor from socket/session authority, validates the
  enum, checks room membership/status, applies a server rate limit, and broadcasts
  to the approved room audience.
- Route the received event into `PresentationController` and
  `PresentationStore.emitCharacterReaction`/a typed bubble signal. The network
  event must not directly mutate the scene.
- Recommended first policy: transient only, no persistence, no replay on
  reconnect, and no semantic gameplay-lane entry. The server event id may be used
  for client dedupe during one connection. If reconnect replay is required, it is
  a new shared snapshot/history contract and a protocol decision.
- Recommended first audience: active players and spectators may see emotes;
  whether spectators may send them is a product decision. The server must not
  trust a client-only throttle.

### Required contract decisions before implementation

- dedicated ephemeral socket event versus durable/public semantic lane;
- player-only versus spectator sending and viewing policy;
- exact rate limits and room-wide spam cap;
- protocol version/bump policy from V7;
- bubble representation and accessibility fallback;
- reconnect behavior and whether emotes are intentionally not in history.

## 10. Event-feed strategy

### Current finding

There is one server-authoritative `boardState.logs` array, bounded to 500 entries.
It contains gameplay history and escaped chat. `Log.tsx` renders that same source,
using `PresentationStore.displayLogs` while the presentation queue is active, and
the client scrolls/attenuates the combined surface when idle. This is a coherent
reconnect story, but it is not a typed compact event feed.

### Recommended strategy

Do not add a second history. Choose one of these after review:

1. **Refine the existing source without new semantics:** improve grouping,
   spacing, density, and chat/gameplay visual separation while keeping the current
   authoritative strings and reconnect behavior. This cannot safely provide typed
   categories beyond what the server already writes.
2. **Add a structured activity tail to the existing authoritative room projection:**
   introduce a bounded typed event representation for rolled/bought/rent/build/
   card/jail/bankrupt, keep it server-authored and reconnect-hydrated, and render
   it in the existing Log surface. This is the recommended path if category icons,
   filtering, or semantic accessibility are required, but it needs shared/API
   contract approval and likely a protocol version decision.

The implementation must not parse HTML logs to reconstruct these events. If the
structured contract is not approved, the compact semantic feed is deferred and
only a visual refinement of the current history is in scope.

## 11. Victory and end-game strategy

### Current authority and UI

- `apps/server/src/game/turn.ts` declares the winner once, only after the game has
  started, one live player remains, and at least one player is in
  `finishedPlayers`. The write and winner log are idempotent.
- `apps/server/src/socket/roomCommands.ts` changes the room to `FINISHED` after
  authoritative winner state is present and clears active turn/debt state.
- `apps/server/src/services/publicState.ts` exposes the authoritative winner,
  finished-player records, current balances, owned properties, development, and
  room membership state.
- `apps/client/src/components/dashboard/WinnerBanner.tsx` currently renders a
  winner-name/color modal. `Dashboard.tsx` owns its placement in the existing
  gameplay action layer.

### Safe first slice

Build the end screen from the current snapshot only: winner name, character id if
available, display color, final current balance, and an explicitly defined current
property/development summary. The final surface must not block room terminal state,
and a reconnect into a finished room must open from authoritative state without
replaying the celebration.

### Deferred or approval-gated items

- “Net worth” needs an agreed valuation formula. Current `ownedProps` and
  `accountBalance` may support a bounded current-state summary, but the audit does
  not invent sale values or historical cash flows.
- Key stats such as turns, rent paid/received, builds, cards, or bankruptcies need
  authoritative server counters/history; they cannot be computed from logs.
- Replay/new-room actions need explicit room-lifecycle behavior and authorization.
  They are not implied by the current terminal room status.
- Confetti, mascot bounce, board celebration, and victory sound are presentation
  effects after the fact contract is settled. They must not change winner
  authority or delay final-state display.

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
- new bounded consequence-label, particle, emote, feed, and victory fixtures only
  when their corresponding slice is approved.

### Manual and unavailable gates

Report separately:

- automated unit/typecheck/lint results;
- deterministic renderer fixture metrics;
- live browser visual UAT and viewport evidence;
- Electron/package visual and semantic UAT;
- manual 30–60 minute clutter/audio-fatigue session;
- database proof, remote CI, commit, and push/merge status.

The deterministic fixture must not be presented as proof of live sound output,
browser autoplay behavior, Electron packaging, multiplayer emotes, or a long
session.

## 13. Proposed decomposition for review

These are proposed implementation slices, not approved work. Each slice keeps its
own tests and UAT evidence and has explicit non-goals.

### Proposed Phase 5.1 — Audio runtime and centralized registry

**Objective:** make the existing Master/Music/SFX settings operational through one
client-owned registry/runtime and one presentation-attached audio sink.

**Systems and exact missing:** extend `AudioProvider`, `AudioMix`, settings tests,
bootstrap lifecycle, and the presentation integration point; add the missing
playback engine, asset registry/loading policy, listener unlock, group gain graph,
event-id dedupe, cleanup, and priority/concurrency hooks. Do not add a large sound
catalog in this slice.

**Scope and paths:** client only, primarily `apps/client/src/audio/*`,
`apps/client/src/settings/*`, `apps/client/src/app/bootstrap/*`, and the existing
`game/presentation/*` boundary. No server, shared contract, GameCore, migration,
or socket change.

**Dependencies:** user approval of engine choice, asset source/licensing, browser
autoplay policy, and whether focus mute is V1. Any dependency addition and asset
selection happens only after approval.

**Non-goals:** music/ambience content, emote transport, event-feed contract,
victory design, new particle systems, and Phase 4 board changes.

**Tests and deterministic UAT:** settings normalization/persistence; registry
group gain calculation; playback dedupe for one accepted event id; reset/skip/
reconnect produces no replay; missing-asset/disposal behavior; reduced motion
does not silently mutate audio policy. Use a deterministic presentation fixture
that emits one dice/money/build/card sequence and asserts the audio sink sees the
same accepted identities once.

**Manual audio/visual UAT:** browser first-gesture unlock, Master/Music/SFX
sliders, mute-at-zero behavior, sound overlap, reconnect, WebGL fallback, and
Electron smoke after a fresh package build. Report visual output and audio output
separately.

**Performance budget:** zero renderer draw/triangle increase; bounded audio voice
count and disposal; no persistent timer/AudioNode leak after a 30-minute smoke.

**Reduced/skip/reconnect:** audio follows approved event identity; reduced motion
only changes visual timing unless a separate audio policy says otherwise; skip and
snapshot reset cancel pending audio handles where required; reconnect never
replays historical presentation.

**Completion criteria:** approved runtime plays a controlled test sound, all three
settings measurably affect output, one central registry owns playback, no
component plays a file directly, automated tests pass, and manual browser/
Electron status is recorded rather than inferred.

### Proposed Phase 5.2 — Gameplay SFX priorities and mix

**Objective:** cover the original core SFX list through the Phase 5.1 runtime:
button click, dice shake/impact, tile hop, money receive/pay, purchase, build,
card flip, jail, bankruptcy, and victory.

**Systems and exact missing:** add approved sound identifiers/assets and map them
from existing typed presentation semantics; implement priority, concurrency,
cooldown, and optional ducking. Reuse `timings.ts`/event owners rather than
creating a sound-specific gameplay timeline.

**Scope and paths:** client audio registry plus existing presentation executors or
an audio bridge under `apps/client/src/game/presentation/*`; no GameCore audio and
no new shared event unless an existing signal is genuinely insufficient.

**Dependencies:** Phase 5.1, approved asset licensing, and a reviewed sound
priority table. Use existing V7 signal identities and semantic reasons.

**Non-goals:** music, ambience, voice, voice chat, cutscenes, camera work, and
unproven semantic labels from logs.

**Tests and deterministic UAT:** one test per trigger, duplicate snapshot and
reconnect suppression, simultaneous multi-action priority, zero-volume behavior,
and event ordering. Extend the Phase4 harness action sequences without changing
their authoritative state.

**Manual audio/visual UAT:** 2-player and 4-player sequences covering dice,
movement, rent/payment, purchase, build, card, jail, bankruptcy, and victory;
verify no harsh overlap, no sound replacing a visual cue, and no audio drift after
skip or reconnect.

**Performance budget:** no draw growth; bounded concurrent voices; no long-lived
source/node per action; audio loading must not block board rendering.

**Reduced/skip/reconnect:** visual reduced-motion behavior remains unchanged;
audio is independently specified; no sound for snapshot-only hydration or stale
executor completion.

**Completion criteria:** every approved core SFX has a centralized id, priority,
asset provenance, deterministic trigger test, and separate manual audio result.

### Proposed Phase 5.3 — Bounded visual consequences and particle reuse

**Objective:** add only the visual feedback still missing from the original list:
bounded floating money/consequence labels and carefully selected sparkle,
impact-ring, coin-burst, or victory-particle primitives where they clarify action.

**Systems and exact missing:** extend existing `PresentationStore`/render-model
signals and existing tile/station/character owners; add no second effects bus.
Use exact balances, typed transfer reasons, ownership/development, GO, jail, and
finish signals. Add a typed signal only if current public state proves its identity
and lifecycle.

**Scope and paths:** client presentation/scene/UI under
`apps/client/src/game/presentation/*`, `game/scene/*`, and existing board feedback
components. No server/shared change unless a missing semantic fact is approved
first; no new GameCore behavior.

**Dependencies:** Phase 4 baseline and performance fixtures; approved label
wording/locale and visual resource budget. Audio can be developed independently
but must not be used as the source of visual semantics.

**Non-goals:** global postprocessing, flashing danger treatment, cinematic camera,
per-particle resources, decorative idle effects, or changing fixed board geometry.

**Tests and deterministic UAT:** store signal dedupe/cap/reset tests; exact amount
and typed-reason mapping; reduced-motion immediate state; skip/reconnect cleanup;
particle instance/budget tests; board-readability/stress captures at all required
viewports.

**Manual audio/visual UAT:** visual review of money labels, 4-player clutter,
multi-action sequences, reduced motion, WebGL fallback, and 30–60 minute overload
session. Audio status is reported separately.

**Performance budget:** no idle growth; at most four consequence labels, three
concurrent particle bursts, one shared instanced draw family per effect type, and
combined peak below `<240` draws/`<100,000` triangles including the `~227` heavy
baseline. If the cap cannot be met, consolidate or defer.

**Reduced/skip/reconnect:** labels settle immediately under reduced motion; skip
clears them; reset/reconnect hydrates only the authoritative result; important
meaning remains in existing text/log/status surfaces.

**Completion criteria:** each new visual family has one owner, one lifecycle,
shared resources, measured active/settled budgets, deterministic tests, and manual
visual evidence at the required viewports.

### Proposed Phase 5.4 — Reactions and multiplayer emotes

**Objective:** complete the original V1 emote experience using the existing local
reaction primitive and the smallest approved network contract.

**Systems and exact missing:** add the approved six-id enum, client bubble mapping,
dedicated validated command/event, server audience/rate policy, client routing
through `PresentationController`, and reconnect/reset cleanup. Do not extend the
gameplay semantic lane unless durability is explicitly chosen.

**Scope and paths:** shared types/schemas/events, server socket/room broadcast and
rate validation, client network/presentation/character scene. Exact paths depend on
the transport decision. No GameCore rule mutation and no chat reuse.

**Dependencies:** user decisions on V1 set, audience, rate limit, transport,
durability, protocol bump, and spectator behavior.

**Non-goals:** voice, chat history changes, gameplay effects, durable replay, or a
new animation queue.

**Tests and deterministic UAT:** shared schema rejects unknown ids; server rejects
unauthorized/stale/over-rate commands; broadcast audience is correct; duplicate
events do not restart indefinitely; snapshot/reconnect does not replay transient
emotes; bubble auto-dismiss and reduced motion are tested.

**Manual audio/visual UAT:** 2-player/4-player and spectator visibility, rapid
click spam, disconnect/reconnect, overlapping character movement, keyboard/focus,
and WebGL fallback. Emote sound is optional and must not be assumed.

**Performance budget:** one bubble per character, bounded room-level active
transients, zero idle growth, shared billboard/UI resources, and no budget breach
on the heavy board/stress fixtures.

**Reduced/skip/reconnect:** reduced motion shows a static/short semantic bubble or
no bounce; skip/reset removes the transient; recommended transient policy does
not replay after reconnect.

**Completion criteria:** approved contract/version policy is documented, server
authority/rate limits are tested, the existing reaction controller remains the
only character motion owner, and manual audience behavior is recorded.

### Proposed Phase 5.5 — Activity feed decision and implementation

**Objective:** make rolled/bought/rent/build/card/jail/bankrupt activity compact,
readable, and reconnect-safe without creating a second history.

**Systems and exact missing:** first decide between refining current string logs or
adding a structured bounded activity tail to the existing authoritative projection.
If structured, add server-authoritative entries, shared schema, projection, and
client rendering in the existing Log surface; never parse HTML.

**Scope and paths:** visual-only refinement is client `Log.tsx`/`style/Log.css`;
structured activity requires shared types/schema, server text/event projection,
public-state projection, and client Log/presentation integration. The exact
contract path is intentionally not invented in Phase 5.0.

**Dependencies:** event-feed strategy approval, reconnect/history semantics,
audience/privacy policy, and any protocol decision. No dependency on emote
transport is assumed.

**Non-goals:** full chat rewrite, second scrolling history, log parsing, client
fabricated events, or replacing authoritative server history with local state.

**Tests and deterministic UAT:** 500-entry bound/trim behavior, HTML escaping,
chat throttling, structured event ordering/dedupe if approved, reconnect hydration,
spectator visibility, presentation gating, and keyboard/ARIA log behavior.

**Manual audio/visual UAT:** feed density/readability during 4-player multi-action
sequences, idle attenuation, chat/gameplay separation, reconnect, small and wide
viewports, and long-session clutter.

**Performance budget:** no board draw growth; bounded DOM rows/structured tail;
avoid re-rendering the entire room for every transient presentation signal.

**Reduced/skip/reconnect:** semantic history remains visible under reduced motion;
skip affects presentation timing only; reconnect uses authoritative history/tail,
not replayed local queue events.

**Completion criteria:** one clearly owned history/feed source, category semantics
are server-proven if introduced, reconnect and spectator behavior are tested, and
no log-derived gameplay effects exist.

### Proposed Phase 5.6 — Victory/end-game presentation

**Objective:** replace the winner-only modal with a complete but authority-safe
end screen using current final facts, then separately evaluate stats/replay.

**Systems and exact missing:** extend `WinnerBanner`/`Dashboard` and existing
modal/design-system surfaces for winner identity, color, character, final balance,
and an agreed current property/development summary. Add bounded victory visual/audio
effects only through the approved presentation/audio sinks.

**Scope and paths:** client `apps/client/src/components/dashboard/*`, board/UI
presentation paths, and existing formatters. Server/shared changes are required
only for an approved final-summary/statistics contract. GameCore winner authority
is preserved.

**Dependencies:** net-worth formula, stats availability, replay/new-room behavior,
victory audio/asset approval, and whether a new final-summary contract is needed.

**Non-goals:** recomputing history from logs, changing winner rules, automatically
starting a new room, cinematic camera, or a celebration that delays terminal state.

**Tests and deterministic UAT:** winner/finished-player fixtures, bankrupt/left
reason display, reconnect into finished room, spectator view, missing character
fallback, exact balance/property summary, and no duplicate celebration on repeated
snapshots.

**Manual audio/visual UAT:** 2-player and 4-player victory, color/character
readability, fixed-camera board relationship, reduced motion, keyboard/modal focus,
audio/mute behavior, and fresh Electron package smoke.

**Performance budget:** no steady-state cost before victory; one bounded celebration
sequence after terminal display; peak remains below hard budget and cleans all
resources after dismissal/room exit.

**Reduced/skip/reconnect:** reduced motion uses a static final state; skip settles
the screen without changing winner data; reconnect opens the final state without
replaying confetti/audio unless explicitly approved.

**Completion criteria:** all displayed facts are authoritative or explicitly
derived by an approved formula, terminal room behavior is unchanged, the current
winner modal is not duplicated, and automated/manual visual/audio evidence is
separate.

### Proposed Phase 5.7 — Long-session, clutter, accessibility, and performance closure

**Objective:** close the Phase 5 validation debt after the feature slices exist.

**Systems and exact missing:** extend the existing Phase4 harness/diagnostics and
manual UAT checklist for sound fatigue, particle overload, feed density, 4-player
clutter, repeated reset/reconnect, browser/Electron, and long-session resource
cleanup. Do not change guardrail constants to make a fixture pass.

**Scope and paths:** client diagnostics/harness/tests and documented manual UAT;
remote CI or packaging evidence remains a separate environment gate. No gameplay
authority change.

**Dependencies:** all approved feature slices and assets/runtime; live browser and
Electron access for the manual gates.

**Non-goals:** new effects, renderer redesign, postprocess, or unrelated cleanup.

**Tests and deterministic UAT:** full nearest-regression test set, typecheck/lint,
all approved fixture combinations, active/settled metrics, reset/skip/reconnect,
and explicit `≤210`/`<240`/`≤80k`/`<100k` reporting.

**Manual audio/visual UAT:** 30–60 minute 2-player and 4-player sessions, volume
changes, music/ambience policy, audio fatigue, particle overload, feed readability,
reduced motion, viewport resize, WebGL fallback, and Electron package smoke.

**Performance budget:** no regression against the unchanged budgets; record memory,
active objects, audio sources/nodes, draw calls, triangles, and cleanup after the
session.

**Reduced/skip/reconnect:** repeat every approved family under each boundary and
report unavailable gates as NOT RUN, never as pass.

**Completion criteria:** evidence is classified by automated/database/browser/
Electron/manual/remote-CI/commit/push status, and unresolved gaps are explicitly
deferred rather than hidden by a lighter fixture.

## 14. Dependencies and proposed order

```text
Phase 5.0 audit and user decisions
        |
        +--> 5.1 audio runtime --> 5.2 gameplay SFX
        |
        +--> 5.3 bounded visual consequences
        |
        +--> 5.4 emotes (after transport/protocol decision)
        |
        +--> 5.5 activity feed (after history/contract decision)
        |
        +--> 5.6 victory (after final-facts/stats/replay decision)
        |
        +--> 5.7 long-session and performance closure
```

5.3 can proceed without audio once its visual budgets are approved. 5.4 and 5.5
may be parallelized only after their separate contract decisions. 5.6 should use
the current winner contract first; richer stats/replay must not block the fact-only
end state unless the product explicitly makes them one acceptance bundle.

## 15. Decisions requiring user approval

The following are intentionally not decided by this audit:

1. **Audio engine:** native Web Audio, HTML audio, or an approved dependency.
   Recommendation for review: a small native Web Audio runtime if sound routing,
   concurrency, and ducking are required; keep the implementation small and
   browser/Electron-testable.
2. **Audio licensing and asset source:** original assets, commissioned assets,
   approved library, or no music in V1. No asset is selected here.
3. **Music/ambience V1:** music only, ambience only, both, or defer both. Decide
   loop length, focus behavior, and fatigue target.
4. **V1 emote set:** confirm the original six ids (`laugh`, `cry`, `angry`, `cool`,
   `heart`, `skull`) or approve a different bounded set.
5. **Emote transport/durability/protocol:** recommended dedicated transient socket
   event, no reconnect replay, and no gameplay lane; confirm audience, spectator
   sending, rate limits, and whether V7 can remain unchanged.
6. **Event-feed strategy:** refine the current combined history/chat surface or
   approve a structured bounded activity tail rendered in the same Log surface.
7. **Victory facts and stats:** approve a net-worth formula and which current-state
   facts are sufficient; decide whether historical key stats require a new server
   contract.
8. **Replay/new-room behavior:** confirm whether Phase 5 includes actions and what
   room/session lifecycle they invoke, or defer them.
9. **Phase 4 visual polish boundary:** recommendation is to preserve the current
   fixed camera, board proportions, material system, and measured guardrails; only
   approve targeted UAT-backed adjustments.
10. **Reduced-motion/audio policy:** confirm that reduced motion changes visual
    motion only by default, with audio independently controlled by volume/mute.

## 16. Risks and explicit deferrals

- Audio autoplay and Electron packaging may behave differently from a browser
  fixture; both need fresh manual evidence.
- Unlicensed or inconsistent audio assets can block 5.1/5.2 even if code is ready.
- A new emote or activity contract can expand V7 compatibility and reconnect
  obligations; no protocol bump is hidden in the proposed client slices.
- The `~227` board-readability baseline leaves limited draw-call headroom. Effects
  that look small in isolation may breach the hard budget when combined with card,
  construction, money, or dice fixtures.
- Floating labels, emote bubbles, and feed rows can compete for the same fixed
  viewport. Readability and clutter are manual gates, not assumptions from a unit
  test.
- Current winner state does not contain historical stats. Stats, replay, and new
  room are deferred unless the user approves their contracts and lifecycle.
- No current live browser/Electron, remote-CI, or 30–60 minute audio-fatigue
  evidence was promoted to PASS by this audit.
- Out-of-scope items remain voice chat, complex cutscenes, character voice acting,
  huge particle systems, cinematic camera work, and gameplay-rule complexity.

## 17. Phase 5.1 entry criteria

Phase 5.1 implementation should not start until:

- this draft has user review and explicit scope approval;
- the audio engine, asset licensing/source, music/ambience policy, focus policy,
  and reduced-motion/audio policy are decided;
- the single presentation-to-audio integration boundary, event identity/dedupe,
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

## 18. Phase 5.0 handoff

This artifact is the proposed scope boundary for review. It does not claim that
Phase 5 is implemented or that any proposed decomposition is final. The next
action is user review of the classifications, decisions, and subphase boundaries;
only after approval should Phase 5.1 feature work begin.
