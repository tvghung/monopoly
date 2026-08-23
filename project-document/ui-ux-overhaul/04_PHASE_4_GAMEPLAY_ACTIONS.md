# Phase 4 - Gameplay Actions and Presentation Orchestration

Status: The bounded corrective Phase 4 client implementation slice (A-F) and
the final pre-Phase-5 board readability pass are complete in this branch,
including gameplay HUD/consequence hardening and the existing dice/rent
presentation work. Live 2-player WebGL gameplay UAT and Electron gameplay UAT,
database, remote-CI, and unavailable-environment checks remain separately
reported as PASS/PARTIAL/NOT RUN gates; this document does not turn those
unavailable checks into passes. Richer
movement-cause, card-identity, and transfer-attribution contracts remain open.
Phase 4.0/4.1 contract audit:
[04A_PHASE_4_0_CONTRACT_AUDIT.md](04A_PHASE_4_0_CONTRACT_AUDIT.md).
Movement cause/route, card identity, and transfer attribution remain open
contracts.

Base: the completed Phase 3 character and movement system on
overhaul/phase-3-character-system.

Phase 4 must make gameplay consequences easy to follow without moving game
rules into the client. The server and GameCore remain authoritative for dice,
movement, tile resolution, money, ownership, development, jail, debt,
bankruptcy, turn order, and the winner. The client presents committed state
transitions through the existing presentation pipeline.

The Phase 4.1 foundation implemented the smallest shared/server/client contract
needed for authoritative roll identity and safe movement classification. The
Phase 4.2.2 dice/rent polish and the corrective client slice below remain
client-only presentation work without expanding the gameplay protocol. The
manual gameplay UAT gates are still outstanding.

### Phase 4.2.2 implemented slice

- Dice use the existing procedural `SelectiveRoundedBoxGeometry` with a 1.70
  linear scale from the approved 0.78 base body to `1.326`, an 8.5% edge
  radius, `10` edge segments, and `10` corner segments. Because the edge and
  corner values are equal, the current geometry does not append the older
  separate higher-density corner-patch pass. The body uses the dice-only
  `diceBody` profile (`roughness: 0.16`, `metalness: 0.02`); face materials
  remain neutral white with `roughness: 0.18` and `metalness: 0.05`.
- Pips remain genuine instanced shallow-cylinder geometry, oriented to each
  physical face with the same absolute base-die dimensions: radius `0.1053`
  (`BASE_DICE_SIZE * 0.135`), depth `0.01404` (`BASE_DICE_SIZE * 0.018`), and
  `16` radial segments. Their position spacing follows the enlarged body at
  `DICE_SIZE * 0.22` (`0.29172`). Their bodies are embedded behind the face
  plane and their caps are flush with the white face. The pip material uses
  `roughness: 0.46` and `metalness: 0.08`.
  It also uses an explicit negative polygon-offset bias
  (`factor: -1`, `units: -1`) to resolve the coplanar cap/face depth conflict;
  normal depth testing remains enabled and no render-order dependency is used.
  All six face orientations are preserved.
- The visible dice arena floor was removed. Dice and the result total are
  positioned from the canonical `AirportField` top surface, keeping the board
  center free of a second visible floor. The logical arena center is
  `(0, -1.65)` in board-world x/z coordinates. The settled die centers use the
  deterministic `-0.884` and `+0.884` x positions; their y position is the
  field top plus `DICE_SIZE / 2`. The result text is at the field top plus
  `0.014` y and uses a `1.033` z offset from the arena center. The logical-only
  arena is derived from the enlarged body footprint and remains clear of
  authored center paths.
- The settled result total uses the existing `SdfSurfaceText` component at
  `fontSize: 0.42` (up from `0.36`, approximately 16.7% larger), without a
  transform-only scale or a second announcement source.
- The existing 640 ms roll and 140 ms result hold are unchanged. On reroll, the
  committed previous dice pair is captured in the presentation transient;
  each die holds its previous settled face while lifting through the first 18%
  of the roll, then follows a deterministic tumble and settles on the new
  authoritative face. The first-roll entry remains the existing raised/drop
  path. Reduced motion, skip, reset, and sequence guards remain authoritative
  presentation boundaries.
- Server rent liability is calculated authoritatively on the server and logged
  once immediately before the payment queue starts, using the exact amount
  passed to payment processing and the shared money formatter. Dice-origin rent
  includes the committed dice total; rent reached through a card destination
  uses generic wording so the log does not invent a dice cause. Normal-property
  labels use the street name at base level, `1`-`4` Nhà labels, and a Khách sạn
  label at level `5`; railroad and utility amounts use their existing server
  calculations. The client does not calculate rent.
- The Roll reset epoch clears both a pending command and a stale error. The
  legacy overlay no longer contributes a second live announcement source.

### Corrective Phase 4 bounded implementation slice (A-F)

This slice stays within the existing public event taxonomy, one
`PresentationController`, one `AnimationQueue`, and one `PresentationStore`.
The implementation and focused automated coverage are complete; live gameplay
UAT remains a separate closure gate. It does not add a shared/server protocol
field or a client gameplay rule.

- **A, bounded presentation signals:** `PresentationStore` now exposes typed
  one-shot balance deltas, ownership transitions, development deltas, and
  proven GO crossings. Each signal carries a stable event id, sequence, and
  resolved duration; balance signals retain exact `from`, `to`, and signed
  `delta` values. Signal ids are deduplicated, capped at 64 per family, and
  cleared by snapshot reset/reconnect.
- **B, consequence feedback:** the existing balance, ownership, and
  development executors publish committed feedback without changing
  authoritative state. Tile cues use the existing `TileFxAnchor` and SDF text
  path; authoritative ownership flags, house counts, base tile materials, and
  Phase 3 tile-impact layers remain separate. The cues are bounded and
  demand-rendered, with no per-frame React state loop.
- **C, player HUD:** the compact top strip shows a fixed-space signed balance
  delta beside the authoritative balance. A single concise polite live region
  announces the latest committed balance change and active turn without adding
  a second announcement source. Reduced motion retains the text/state cue.
- **D, GO:** a GO cue is emitted only when a proven `WALK` execution enters
  tile `0`, including its reduced-motion semantic snap. `SNAP`, reconnect,
  card/teleport/ambiguous movement, and destination-only updates do not emit
  the cue. The client does not show or calculate a GO reward amount.
- **E, decisions:** purchase and development prompts remain hidden until
  `settledPositions` reaches the authoritative destination. Each prompt
  accepts one in-flight request, disables duplicate clicks, waits for the
  authoritative decision transition, and re-enables with localized ACK error
  feedback. Operation changes, reset, reconnect, permission loss, and prompt
  disappearance clear local pending state. Jail, debt, and forced-sale
  actions receive the same bounded duplicate-click protection where exposed.
- **F, conservative remaining families:** cards remain generic and do not use
  logs, private deck data, `DRAW`, `CONTINUE`, or a fabricated `V7` contract.
  Debt stays visible and actionable from `paymentShortfall`; finish and
  bankruptcy remain driven by structured authoritative state, never a zero
  balance alone. Turn, jail, forced-sale privacy, and simplified property
  rules remain server-controlled.

Focused coverage includes exact signal fields, id dedupe and bounds, reset and
stale-executor guards, strict WALK-only GO behavior, speed resolution at
0.75x/1x/1.5x/2x, reduced motion, settled landing gating, one-click decision
locks, ACK failure recovery, and operation replacement. Browser and Electron
UAT remain separate manual checks.

## 1. Design direction

This is an in-game product surface, not a marketing landing page. The Taste
guidance is therefore applied narrowly to hierarchy, tactile feedback,
readability, visual rhythm, accessibility, and motion restraint. It does not
introduce a landing-page design system or a second UI architecture.

| Design dial | Phase 4 choice | Reason |
| --- | --- | --- |
| Design variance | 4/10 | Keep the board, player colors, mascot system, and existing visual language recognizable. |
| Motion intensity | 5/10 | Use short, purposeful motion for cause and consequence; avoid cinematic interruption. |
| Visual density | 5/10 | Show the active decision and its result clearly while keeping the board readable. |

The intended rhythm for a gameplay action is:

1. Anticipate the action.
2. Acknowledge the committed result.
3. Present the consequence.
4. Settle the board and expose the next decision.

The rhythm may overlap harmless feedback, but it must not hide a required
server decision or imply an outcome that has not been committed.

### Explicit non-goals

- No client-side dice, rent, tax, card, purchase, development, debt, or
  bankruptcy calculations.
- No rewrite of the Phase 3 hop, landing, tile-impact, renderer, or character
  motion architecture.
- No second animation queue, parallel event bus, or duplicated presentation
  store.
- No old mortgage, open-market, or auction rules.
- No client gameplay commands named DRAW or CONTINUE unless a separately
  approved protocol design introduces them. They are not current commands.
- No automatic push, merge, or Phase 5 implementation as part of this plan.

## 2. Authority and presentation pipeline

The planned flow is:

~~~text
authoritative server state or committed command acknowledgement
  -> public/private state projection
  -> client snapshot diff and event identity
  -> derivePresentationEvents
  -> PresentationController
  -> AnimationQueue and PresentationStore
  -> imperative R3F/DOM presentation
~~~

| Layer | Owns | Must not own |
| --- | --- | --- |
| Server and GameCore | Random dice result, movement route, tile effects, payment, ownership, development, jail, debt, turn, winner | Client animation timing or local visual state |
| Shared protocol and public projector | Publicly safe state and command/event contracts | Hidden deck order, private forced-sale terms, speculative outcomes |
| Client event adapter | Detecting proven state transitions, stable event ids, presentation grouping | Inventing causes, prices, transfer parties, or card results |
| AnimationQueue | Ordered client presentation, duration resolution, skip, stale-completion protection | Authorizing a gameplay action |
| PresentationStore | Display positions, settled positions, display dice, transient dice-roll lifecycle, visual reaction and tile-impact signals | Source of truth for game state |
| React, DOM, and R3F layers | Rendering current presentation state and controls | Writing authoritative board state or resolving rules |

Server command acknowledgements are usable as a sequencing boundary only after
the server has committed the command. A button may optimistically show a
pending state, but ownership, balance, payment, and turn changes come from the
next authoritative state.

## 3. Current architecture inventory

The following is the observed baseline to preserve while implementing Phase 4.

| Area | Current implementation | Phase 4 reuse boundary |
| --- | --- | --- |
| Event derivation | apps/client/src/game/presentation/events/derivePresentationEvents.ts | Extend only when a transition is proven by state or by an approved contract. |
| Event types | ROLL_DICE, MOVE_CHARACTER, LAND_TILE, BALANCE_CHANGED, PROPERTY_OWNERSHIP_CHANGED, PROPERTY_DEVELOPMENT_CHANGED, JAIL_STATE_CHANGED, PLAYER_FINISHED, TURN_CHANGED, GAME_FINISHED | Prefer composing these events before adding a new event type. |
| Orchestration | PresentationController.ts | Keep snapshot/session reset behavior and the single presentation lifecycle. |
| Queue | presentation/queue/AnimationQueue.ts | Use resolved durations, skipCurrent, skipAll, and generation protection. |
| Store | presentation/store/presentationStore.ts | Keep displayPositions separate from settledPositions and use sequence namespaces. |
| Movement | presentation/executors/movementExecutor.ts | Reuse the Phase 3 tile-by-tile path and landing handoff. |
| Basic events | presentation/executors/basicExecutors.ts | Reuse semantic reactions and the existing timing map. |
| Board render | GameScene.tsx and Board3D.tsx | Keep demand rendering, instancing, orthographic framing, and server-derived board state. |
| Tile feedback | TileMotionController, TileMotionProvider, TileBodyBatch, TileSurfaceBatch, TileImpactHighlightBatch | Add action feedback through existing lifecycle signals and imperatively updated layers. |
| Dice | Board3D renders a procedural R3F DiceLayer in a board-world center arena; RollControl calls the existing server roll command | Keep the server result authoritative, preserve the fixed camera, and keep the client wrapper protocol-compatible. |
| Decision UI | Dashboard.tsx and the existing BuyPrompt, DevelopmentPrompt, JailPanel, DebtPanel, ForcedSaleProposalPanel, plus compact PlayerHud, RollControl, and OwnedPropertiesControl | Keep decision components alive as a lightweight action layer; separate stable turn/property access from transient decisions. |
| Shared state | packages/shared/src/types.ts | Use pendingLandingDecision, paymentShortfall, ownership, development, jail, turn, deckCounts, and forced-sale fields as exposed. |
| Commands | packages/shared/src/events.ts and server socket handlers | Use the existing command names and operation ids. Any new command needs a protocol review. |
| Tile resolution | apps/server/src/game/tiles.ts | Treat card draw and tile effects as server-internal unless an approved safe presentation signal is added. |
| Authority handlers | apps/server/src/socket/turn.ts, debt.ts, jail.ts, and building.ts | Do not reproduce these rules in client executors. |

The current Dice roll gate already requires the local turn, no movement having
been made, all tokens being settled, and an idle presentation queue. Phase 4
must retain those guards.

## 4. Phase 3 freeze and reusable primitives

Phase 3 is the movement foundation. It is approved and frozen for Phase 4.
Gameplay work may consume these primitives, but must not retune them casually.

| Primitive | Frozen behavior |
| --- | --- |
| Tile hop | One hop starts, schedules one delayed STEP impact, waits one resolved hop duration, completes, then starts the next hop. There is no trailing dead pause; the rebound can overlap the next hop. |
| STEP impact | At 1x, the 180 ms hop uses a 36 ms depress, 78 ms rebound, and a 144 ms delay before the impact begins. |
| LAND impact | LAND uses a 52 ms depress and 68 ms rebound at 1x. Landing is a separate semantic event from the final movement hop. |
| Tile depth | STEP depth is 0.036 world units and LAND is 0.058 world units. |
| Highlight | TileImpactHighlightBatch is a separate warm additive highlight layer with opacity 0.12, STEP strength 0.68, LAND strength 1, and zero contribution at idle. |
| Base materials | Tile body and surface materials remain unchanged. There is no darkening, no permanent instance-color multiplication, and no impact modulation in the base tile batches. |
| Hot path | TileMotionController.tick and R3F useFrame paths update imperative roots and instance matrices. React notifications are lifecycle/status signals, not per-frame impact updates. |
| Character motion | TILE_HOP, SLOT_REFLOW, SNAP, and NONE reuse presentation timings and the existing landing anchor and neutral landing sample. |
| Timing | diceRoll 640 plus a 140 ms result hold, tileHop 180, slotReflow 110, landing 120, balanceChange 120, propertyPurchase 180, buildPop 140, turnChange 80, finish 180. |
| Reactions | happy 120, sad 180, jail 120, bankrupt 180, emote 160. |
| Preferences | Supported speed multipliers are 0.75x, 1x, 1.5x, and 2x. Reduced motion resolves visual durations to zero and suppresses non-essential impacts. |
| Recovery | PresentationController reset/snap behavior, reset epochs, sequence namespaces, and stale completion guards remain the recovery boundary. |

Phase 4 acceptance tests must assert reuse of these values and behavior rather
than silently creating action-specific motion constants. The dice roll and
result-hold values are the Phase 4.2 board-centered presentation contract;
the movement values remain the frozen Phase 3 contract.

## 5. Event taxonomy and adapter policy

### 5.1 Existing event taxonomy

The current adapter emits:

- ROLL_DICE
- MOVE_CHARACTER
- LAND_TILE
- BALANCE_CHANGED
- PROPERTY_OWNERSHIP_CHANGED
- PROPERTY_DEVELOPMENT_CHANGED
- JAIL_STATE_CHANGED
- PLAYER_FINISHED
- TURN_CHANGED
- GAME_FINISHED

These events are state-transition presentations, not new gameplay authority.
They should remain the first choice for Phase 4 sequences.

| Desired user-visible moment | Current evidence | Phase 4 policy |
| --- | --- | --- |
| Dice result | ROLL_DICE and displayDice | Reuse the event. |
| Normal movement | MOVE_CHARACTER with the Phase 4.1 proven-dice-route classifier | Reuse the Phase 3 executor only for a proven route; snap other or ambiguous destinations. |
| Final landing | LAND_TILE | Reuse the landing executor and wait for settledPositions before enabling a decision. |
| Balance change | BALANCE_CHANGED | Present a balance delta. Do not label payer, receiver, rent, tax, or card cause unless it is proven. |
| Ownership change | PROPERTY_OWNERSHIP_CHANGED | Use authoritative owner and balance state to update the board and decision UI. |
| Building change | PROPERTY_DEVELOPMENT_CHANGED | Animate the authoritative house count delta through the existing building layer. |
| Jail state | JAIL_STATE_CHANGED | Use the current jail panel and semantic reaction. Cause-specific language requires more evidence. |
| Player completion | PLAYER_FINISHED | Present a finish state; do not equate every finish event with bankruptcy. |
| Turn change | TURN_CHANGED | Update active-player presentation and roll gating after the queue is safe. |
| Game completion | GAME_FINISHED | Present the winner from authoritative state without blocking the final state indefinitely. |

### 5.2 Candidate semantic labels that are not automatically new events

PASS_GO, PROPERTY_LANDED, TRANSFER, CARD_REVEAL, PAYMENT_REQUIRED,
BANKRUPTCY, FORCED_SALE, and PURCHASE_CONFIRMED are useful product concepts.
They are not permission to add a parallel event taxonomy. For each one, the
implementation must first answer:

1. Which authoritative state transition proves it?
2. Can the same transition be caused by more than one rule?
3. Is the information public, player-private, or hidden?
4. Does the presentation need it, or is a generic state change sufficient?
5. Can the event id remain stable across reconnect and repeated snapshots?

If the answer is not deterministic, present the safe generic state change and
record the richer semantic label as an open contract decision.

### 5.3 Known snapshot limits

The current snapshot adapter can derive a bounded forward movement path, with a
maximum of 12 steps, from the available state. A snapshot alone does not always
prove whether a move came from dice, a card, a teleport, a backward effect, or
another server rule.

The current public state also exposes deck counts, not deck order or a
guaranteed card identity/result event. The server draws and applies cards
inside tile resolution.

The current balance event is a balance transition, not a guaranteed
source/destination transfer record. A pair of balance differences may be
correlated only when the same authoritative revision makes the parties and
amount unambiguous.

These limits are presentation-contract limits, not permission to guess.

Phase 4.1 resolves the repeated-dice identity gate with a server-owned public
durable `BoardState.rollSequence` in protocol/snapshot V6. It starts at zero,
increments once per committed gameplay roll (including jail attempts), excludes
starting-player tie-break rolls, and is preserved by persistence, duplicate
snapshot handling, reconnect/reset, and spectator sync. `ROLL_DICE` derives
only from an exact one-step sequence advance, so identical faces still present
as a new roll.

Movement uses the conservative Phase 4.1 boundary:
`PROVEN DICE ROUTE -> WALK`; `OTHER / AMBIGUOUS -> SNAP`. The general
movement-cause/route, card-identity, and transfer-attribution decisions remain
open for later phases.

## 6. Serial versus overlapping presentation

The queue policy should be explicit for every workstream.

| Presentation segment | Default policy | Reason |
| --- | --- | --- |
| Server roll acknowledgement before normal movement | Serial | The player must see which committed result drives the movement. |
| Tile-by-tile movement | Serial per movement path | A token cannot present two authoritative positions at once. |
| STEP depress/rebound | Overlap inside the movement executor | This is already the frozen Phase 3 rhythm. |
| Final LAND and decision availability | Serial | Buy, development, jail, or debt controls must wait for settledPositions and authoritative pending state. |
| Balance count-up/count-down | Overlap after the balance transition is known | It explains consequence without holding the next harmless board cue. |
| Ownership marker and tile color | Overlap after committed ownership state | The board can update while a short purchase reaction runs. |
| House or hotel pop | Overlap after committed development state | The building count is authoritative; the pop is only feedback. |
| GO cue | Overlap | It must not delay the movement or a required decision. |
| Deck pulse or authorized card reveal | Serial only when it communicates an actual result | Do not make a decorative pulse block server state. |
| Debt and forced-sale controls | Serial for the decision state | The debtor and eligible buyer need a stable, readable action surface. |
| Turn cue | Overlap after the queue reaches a safe handoff | The roll button must not enable before the local state and queue agree. |
| Reconnect or session reset | Snap/reset | Never replay stale history as if it were a new server action. |

The existing AnimationQueue remains the ordered lifecycle. Safe overlap should
use executor timing, PresentationStore lifecycle signals, or imperative R3F
state. If a future action truly needs another concurrency channel, extend the
existing queue/store contract explicitly and test its ownership; do not create
a second animation architecture.

## 7. Phase 4 workstreams

### 7.1 Workstream A - Contract and taxonomy audit

Before adding visuals:

- Build a transition matrix from server command to committed public/private
  state changes.
- Map each transition to existing presentation events and current executors.
- Mark each candidate semantic event as A, B, C, or D using Section 8.
- Identify whether a transition can produce more than one snapshot in a single
  turn-resolution handoff.
- Preserve the resolved `rollSequence` identity gate documented in
  [04A_PHASE_4_0_CONTRACT_AUDIT.md](04A_PHASE_4_0_CONTRACT_AUDIT.md) when
  extending universal ROLL_DICE presentation.
- Add fixtures for normal movement, purchase, development, payment shortfall,
  jail, forced sale, and reconnect.

Deliverable: a reviewed event/state matrix and tests for stable event ids,
ordering, duplicate snapshot handling, and reset behavior.

### 7.2 Workstream B - Dice result presentation and gameplay HUD

Current contract baseline:

- The former gameplay side HUD/right rail is gone. The board renderer occupies
  the primary single-column screen area, and the current `PlayerHud`,
  `Dashboard`, `RollControl`, `OwnedPropertiesControl`, and `Log` are mounted
  as overlays inside that board renderer. The compact player strip remains at
  the top, the Roll CTA is bottom-centered, and property access is a separate
  control rather than part of the Roll CTA.
- The existing authoritative decision panels remain mounted in the gameplay
  action layer. Buy and development decisions use authoritative pending state
  and remain gated by `settledPositions`/token arrival; the client presents
  those decisions but does not authorize gameplay or calculate rent.
- Board3D uses a procedural R3F DiceLayer centered in the existing board-world
  airport field. The arena is sized and checked against the authored center
  paths and tile clearance; the fixed orthographic camera is unchanged.
- The client sends the existing roll-dice command through a Promise-returning
  internal wrapper. The socket event and shared protocol are unchanged.
- The server decides the result.
- ROLL_DICE enters a transient `PresentationStore.diceRoll` lifecycle, then
  commits `displayDice` and `displayRollSequence` after the visual roll.
- Public `rollSequence` identifies each committed gameplay roll, including
  repeated ordered faces; session/reconnect sync snaps the baseline.
- Movement remains behind the same FIFO queue: 640 ms at 1x for the roll,
  followed by a 140 ms result hold, then the already-proven movement event.
- The result total is shown only after the dice settle. The last committed
  result remains visible across turn changes, while reset/reconnect/spectator
  sync snaps without replaying.

Implemented bounded behavior:

- Keep the procedural dice geometry local to the client render layer; it uses
  no physics or random client result. Use diceRoll 640 ms at 1x plus a 140 ms
  result hold, both resolved through the existing speed preference.
- Present anticipation, roll, and settle only after the server result is
  available. The animation may disguise timing, never the face value.
- Start movement from the committed movement event, not from a local dice
  callback.
- In reduced motion, show the authoritative face immediately and preserve the
  same event ordering.
- Keep the local-turn, current-state, settled-token, pending-decision, and
  no-double-roll gates in RollControl and the server. The CTA locks before
  emitting and unlocks only after an authoritative sequence or turn outcome.
- Use a compact top player strip, a stable bottom-centered Roll CTA, and a
  separate owned-property access button. Dashboard decision components remain
  mounted in the lightweight action layer and continue to use authoritative
  state and existing modals.

Required tests:

- The displayed face equals the server result for every legal result.
- A missing or stale result does not start movement.
- A second click cannot create a duplicate committed roll sequence.
- Identical faces with a higher sequence trigger one presentation update;
  duplicate sequence/faces are a no-op.
- The transient dice state remains separate from the committed display baseline
  until the roll duration completes, and the result hold precedes movement.
- The player strip, turn label, CTA lock, property access path, keyboard status,
  and reduced-motion behavior remain readable without covering the board.
- Skip, reduced motion, speed changes, and reconnect leave the dice and queue
  consistent.

No server or shared-source changes are required for this Phase 4.2 slice; the
existing V6 `rollSequence` contract and Phase 4.1 movement classifier are
consumed as implemented.

### 7.2.1 Phase 4.2.1 hardening and dice visual polish

This client-only follow-up keeps the Phase 4.2 authority and timing contract
unchanged. WebGL dice use the shared `RoundedBoxMesh` with an 8.5% edge radius,
`10` edge segments, and `10` corner segments, a bright near-neutral white
standard material, dark three-dimensional shallow-cylinder pips, all six
physically mapped faces, and an explicit negative polygon-offset material bias
(`factor: -1`, `units: -1`) against the white face. With equal edge and corner
segment values, the current selective geometry does not add a separate
higher-density corner-patch pass. The cap remains geometrically flush, depth
testing stays enabled so hidden faces remain occluded, and the 21 pips for each
die share one `InstancedMesh` draw without relying on `renderOrder`.

The repeated pips remain instanced, while exact dice draw-call and triangle
totals remain implementation measurements rather than a fixed Phase 4.2
contract. The current documentation therefore keeps the existing qualitative
scene-budget guardrails without presenting an unverified dice-specific count.

Roll recovery adds a bounded 8-second client-only ACK timeout and immediate
disconnect rejection without retrying the non-idempotent command. The local
lock clears on transport loss, presentation reset, or an authoritative higher
`rollSequence`; a committed reconnect state therefore cannot cause a duplicate
request. The visible turn label and player strip follow
`displayActivePlayerId`, while Roll permission continues to use authoritative
state. `LegacyDiceOverlay` consumes the same `DiceRenderModel`, hides sequence
zero/reset baselines, and presents settled or rolling authoritative values
without a second queue, random source, or state machine.

Automated coverage covers face orientation/opposites, edge/material/epsilon
contracts, the dice budget, ACK timeout/disconnect/settled-commit recovery,
presentation reset, visual turn sequencing, legacy dice, reduced motion, Phase
3/Phase 4 timing boundaries, 40 semantic tile controls, property/debt/jail/trade
surfaces, and reconnect-safe presentation. Browser/Electron multi-viewport UAT
remains a separate manual check until it is run and recorded.

### 7.3 Workstream C - Movement orchestration

For a normal dice movement:

~~~text
committed ROLL_DICE
  -> MOVE_CHARACTER
  -> Phase 3 tile-by-tile hops
  -> LAND_TILE
  -> committed landing consequence
~~~

Reuse movementExecutor, CharacterBillboard, PresentationStore display versus
settled positions, and the Phase 3 TileMotionController path. Do not add a
second hop loop for cards, corners, or special tiles.

The adapter must distinguish these cases:

- A normal forward path that is provable from the snapshot.
- A destination-only update whose path is not provable.
- A server-driven movement caused by a card or another tile effect.
- A backward, absolute, teleport, or jail movement.

The Phase 4.1 classifier treats the first case as `WALK` only when the public
roll sequence and next dice result prove the exact destination from the prior
current-player tile. For the other cases, snap to the authoritative
destination or wait for an approved movement metadata contract. Do not
fabricate intermediate tiles.

Landing prompts continue to use settledPositions. A visual token arriving at a
tile does not itself authorize a purchase, development action, payment, or
card action.

### 7.4 Workstream D - Pass GO

The server owns GO crossing, reward amount, and balance update.

Implemented bounded behavior:

- Detect a dedicated GO crossing only when the authoritative movement path or
  an approved server presentation signal proves that the token crossed GO.
- If crossing is not provable, present the committed balance change without
  claiming a GO reward.
- When proven, use the existing GO tile FX anchor and generic HUD balance
  update. Keep it non-blocking and do not expose a reward amount.
- Never calculate the reward, infer a pass from a destination alone, or issue a
  second client command.
- Test a path that crosses GO, a path that lands before GO, a direct
  destination-only update, and reconnect during the cue.

### 7.5 Workstream E - Landing and property context

LAND_TILE is the boundary between movement and the resulting context. The
presentation must support at least:

1. Unowned property: show the current price and the purchase decision exposed
   by pendingLandingDecision.
2. Property owned by the current player: show ownership and any development
   decision exposed by the server.
3. Property owned by another player: show owner context and the committed
   payment or debt state when exposed.

The price, owner, level, maximum quantity, unit cost, and operation id come
from the current shared state. No landing event may carry a client-calculated
price that overrides the snapshot.

If a payment creates paymentShortfall, DebtPanel and the existing debt flow
take priority over decorative landing feedback. The action surface must remain
available to the debtor and must not be hidden behind a transient board effect.

### 7.6 Workstream F - Purchase

Current commands are buy property and do not buy. The pending purchase decision
contains an operation id and authoritative tile/price context. The server
commits the decision before the client receives the ownership and balance
changes.

Preferred presentation sequence:

~~~text
settled LAND_TILE
  -> purchase decision is readable
  -> player sends the existing command with operationId
  -> committed BALANCE_CHANGED and PROPERTY_OWNERSHIP_CHANGED
  -> tile ownership marker and board color update
  -> short happy or confirmation reaction
~~~

The balance and ownership events may overlap after commit. The decision
controls must be disabled while the request is pending or expired. A decline
must not show a purchase animation. An unaffordable purchase must remain
disabled based on authoritative state and must not be reimplemented in the
client.

Required tests include purchase, decline, duplicate operation id, stale
decision, reconnect while the prompt is open, ACK failure recovery, and a
purchase that changes the turn-resolution state. The implemented prompt keeps
the server's pending operation visible until its authoritative transition.

### 7.7 Workstream G - Money transfer and balance consequence

Money presentation is a reusable consequence layer, not a new rule engine.
Candidate directions include player to player, player to bank, and bank to
player. These directions are valid product concepts only when the transition
contract identifies them.

Current BALANCE_CHANGED should be treated as a balance delta. The adapter may
pair source and destination changes only when all of the following are true:

- The changes belong to the same authoritative revision or committed
  operation.
- The amount and sign match exactly.
- There is one unambiguous payer and receiver.
- The information is public to the viewer.

If any condition fails, show a safe balance change without a payer/receiver
label. Do not invent rent, tax, card, bail, purchase, development, or forced
sale attribution from timing alone.

The implemented visual uses a compact signed HUD delta and does not simulate
individual coins or require a permanent particle loop. Test:

- player to player rent or forced-sale payment;
- player to bank purchase, tax, bail, or development payment;
- bank to player reward or sale proceeds;
- partial payment and paymentShortfall;
- simultaneous balance changes that cannot be uniquely paired;
- private forced-sale terms visible only to eligible participants.

### 7.8 Workstream H - Development and building changes

Development uses the server's pending decision and resolve-development
command. Current decisions expose the operation id, tile, level, maximum
quantity, and unit cost. The client must send the selected action and quantity,
not calculate legality or final cost.

The existing Board3D building layer already renders houses and hotels from
authoritative tile state. The client adds a short presentation around the
committed PROPERTY_DEVELOPMENT_CHANGED event:

- House count increases: one or more short build pops, with bounded total time.
- Hotel upgrade: a distinct but compact replacement/pop treatment.
- House sale through sell house: a removal or reverse-pop presentation.
- State correction or reconnect: snap to the authoritative count without
  replaying old building history.

Use buildPop 140 ms at 1x. If a single action changes multiple house levels,
sequence the visual sub-pops only if the resulting duration remains bounded;
the authoritative count must appear immediately in the render model. Preserve
all current server validation, group constraints, affordability checks, and
hotel rules.

### 7.9 Workstream I - Chance and Khí Vận cards

Observed server behavior:

- apps/server/src/game/tiles.ts draws a card internally during tile
  resolution.
- Card effects are applied by the server and may include payment, movement,
  GO-related effects, or jail.
- Public state exposes deck counts, not deck order.
- The current client/server command surface does not contain DRAW or CONTINUE
  commands.

The old plan's flow of showing a DRAW button and waiting for CONTINUE is
therefore removed from the baseline.

Phase 4 baseline:

- Present a special-tile pulse when the authoritative landing is known.
- Present only a card identity or result that the current public/private
  contract safely exposes.
- Let resulting MOVE_CHARACTER, LAND_TILE, BALANCE_CHANGED, JAIL_STATE_CHANGED,
  and other state events drive the consequence.
- Do not reveal deck order or private card data to viewers.
- Do not make a decorative card animation block a committed state update.

If an explicit card reveal is required, first design a safe presentation
signal. The design must specify audience, card identity, text, effect,
sequence id, reconnect behavior, and whether the effect is already committed.
If the client needs a fact that cannot be derived from public/private state,
this becomes a shared/server contract change under Section 8. It is not a
client-only animation task.

Required tests cover both decks, a card with no movement, a card that moves
the player, a card that changes balance, a jail card, hidden deck order,
duplicate snapshots, skip, reduced motion, and reconnect.

### 7.10 Workstream J - Jail

Current JailPanel actions are pay bail, use a jail-free card, and wait in jail.
The server owns the bail amount, card validity, jail rounds, dice result, and
turn outcome. The client sends the existing commands:

- pay bail;
- use jail card;
- wait in jail.

Use JAIL_STATE_CHANGED and the existing jail reaction timing. A compact lock,
slot, or status cue may reinforce the state, but it must not obscure the
action panel or require a camera move.

The current rules and docs state that a failed jail roll ends the turn and do
not grant an extra roll for a double. Preserve that behavior. A destination
change to jail does not by itself prove whether the cause was a card, a tile,
or a failed jail attempt. Cause-specific copy requires a safe signal.

### 7.11 Workstream K - Bankruptcy, debt, and forced liquidation

The current simplified debt flow is:

- paymentShortfall is authoritative;
- the debtor may sell owned property to the bank through the existing command;
- the debtor may propose a forced sale to an eligible buyer;
- the fixed gross forced-sale terms are private to the relevant participants;
- accept, reject, cancel, and payment outcomes are server-controlled;
- PLAYER_FINISHED and the public player state drive final presentation.

There is no Phase 4 mortgage, redemption, open-market sale, or legacy auction
flow.

Presentation rules:

- Keep the debt action surface visible until the server resolves or expires
  the decision.
- Treat a forced-sale proposal as a relational/private UI state, not a public
  board animation.
- Use critical balance/debt cues without covering the exact shortfall,
  creditor, deadline, or available action.
- Show bankruptcy or finish treatment only when the authoritative state and
  event prove it. Do not infer bankruptcy from a temporary zero balance.
- Do not delay the server's final state for a one-to-two-second decorative
  sequence. The visual may finish or snap after the state is safe.

Required tests cover bank sale, forced-sale proposal, accept, reject, cancel,
deadline/expiry, insufficient buyer funds, partial payment, player finish,
reconnect, and private/public visibility.

### 7.12 Workstream L - Turn transition

TURN_CHANGED is the handoff boundary. The planned presentation is compact:

- previous active-player emphasis clears;
- next player emphasis appears;
- the turn indicator and HUD update;
- the local Roll button enables only when local authority, settled positions,
  and queue status all permit it;
- a short turn cue may overlap the board state.

Use turnChange 80 ms at 1x. Do not use a full-screen interruption for ordinary
turns. A stale TURN_CHANGED event must not re-enable a local action after
reconnect or a newer authoritative snapshot.

### 7.13 Workstream M - Speed, reduced motion, skip, and reconnect

The supported speed multipliers are 0.75x, 1x, 1.5x, and 2x. Reduced motion
is a separate preference, not a fifth speed.

Required policy:

- Resolve a segment's duration through AnimationQueue at segment start.
- A preference change must affect pending work; an already-started physical
  segment should complete or snap according to the existing queue contract,
  not jump unpredictably.
- Reduced motion resolves visual durations to zero, suppresses non-essential
  tile impacts and reactions, and preserves semantic ordering.
- skipCurrent finishes the current presentation safely and continues from the
  next event when the state is still current.
- skipAll and PresentationController.skipAllAndSnap cancel stale visual work
  and snap display and settled state to the latest accepted snapshot.
- A skip never sends a fake gameplay command to the server.
- A session or spectator reset uses resetFromSnapshot and reset epochs; it does
  not replay old animations.
- Reconnect during a decision re-reads authoritative pending state and
  operation id before enabling controls.
- Generation and sequence guards must prevent old executors from changing the
  new board after skip, reset, or reconnect.

Test each action family at all four speeds, reduced motion, skip during each
serial segment, skip during overlap, reconnect during movement, reconnect
during a pending decision, and a snapshot arriving after a stale executor
completes.

## 8. Data-contract boundary

Every proposed Phase 4 change must be classified before implementation.

| Class | Meaning | Examples | Approval bar |
| --- | --- | --- | --- |
| A | Existing authoritative data is sufficient. | Current position, balance, owner, houses, hotel level, jail state, pendingLandingDecision, paymentShortfall, turn, winner. | Client adapter and tests only. |
| B | Client-only presentation metadata. | Stable event id, grouping events from one snapshot revision, local duration, visual strength, DOM copy chosen from known state. | Must not change gameplay or reveal hidden data. |
| C | New presentation signal derived from a proven state transition. | A safe GO-crossing cue, an unambiguous paired balance transfer, or a card reveal where the current projection already proves identity and audience. | Document the proof, visibility, duplicate-snapshot behavior, and reconnect behavior. |
| D | A genuine shared/server/protocol change is needed. | Movement cause or route not present in state, card identity/result not exposed safely, ambiguous transfer attribution, a new player action. | Update shared types, server projector/handler, client adapter, tests, and docs together. Add persistence/migration only if durable history is actually required. |

For this handoff, the baseline should maximize A and B. C is allowed only
after a focused adapter review. D is an explicit design decision, not an
implementation detail hidden inside a React component.

No Phase 4 handoff should add a client command merely to make an animation
sequence symmetrical. If a card effect is already committed by the server,
the client presents the resulting state. If the product requires a player
choice before a card effect, that is a rule and protocol change requiring
separate approval.

## 9. UI hierarchy, accessibility, and motion rules

The existing Dashboard and decision panels remain the primary interaction
surface.

- One primary action should be visually dominant in a decision panel.
- Secondary, decline, cancel, and wait actions must remain discoverable but
  should not compete with the primary action.
- Pending, disabled, expired, rejected, and reconnecting states need explicit
  copy and keyboard-accessible status.
- Do not rely on color alone for owner, debt, jail, or turn state. Pair color
  with text, icon, shape, or status semantics.
- Use player color and existing board tokens as accents; do not add generic
  gradients or decorative loops for their own sake.
- Keep the board, token position, amount, and required CTA visible in the same
  mental frame whenever possible.
- Use one short tactile cue for a consequence. Do not stack a tile pulse,
  camera move, banner, particle burst, and modal when one or two signals are
  enough.
- Preserve the existing typography, surface, and responsive conventions unless
  a measured usability issue requires a targeted change.
- Reduced motion must preserve meaning through immediate state, text, focus,
  and status updates.
- The board must remain usable with keyboard navigation and screen-reader
  status announcements for committed decisions.

## 10. Testing strategy

### 10.1 Unit and adapter tests

Cover:

- event ordering from one authoritative snapshot;
- stable event ids and duplicate snapshot suppression;
- normal dice path and bounded movement derivation;
- destination-only, backward, teleport, card, and jail movement fallbacks;
- GO detection only when proven;
- landing cases for unowned, self-owned, and other-owned properties;
- purchase and decline operation ids;
- balance deltas with and without unambiguous transfer pairing;
- development increase, hotel upgrade, and house sale;
- card result handling without deck-order leakage;
- jail state transitions and action gating;
- paymentShortfall, bank sale, forced sale, finish, and private visibility;
- turn handoff and local roll gating;
- all speed values, reduced motion, skipCurrent, skipAll, reset, reconnect,
  and stale completion.

### 10.2 Executor, store, and renderer tests

Assert that:

- Phase 3 hop timing and STEP/LAND overlap remain unchanged;
- settledPositions changes only at the correct authoritative presentation
  boundary;
- landing decisions cannot enable before token arrival;
- imperative tile and character motion does not notify React every frame;
- base tile materials are unchanged at idle and during impact;
- skip/reset cannot let an old executor mutate a new snapshot;
- board building counts always settle to authoritative state;
- reduced motion produces the same semantic state with no unnecessary motion.

### 10.3 Server and integration tests

Use the existing server command and state contracts for:

- roll, movement, landing, purchase, rent/payment, development, cards, jail,
  debt, forced sale, finish, turn, and game completion;
- operation id replay and stale commands;
- reconnect and snapshot recovery;
- public versus private card and forced-sale visibility;
- PostgreSQL-backed persistence and socket flows when the configured database
  is available.

Database coverage must be reported separately from client/unit coverage. A
skipped database test is not equivalent to a passed integration test.

### 10.4 Browser, desktop, and manual UAT

Test a 2 to 4 player room in the supported browser path and the Electron path
where available. Record separately:

- automated test results;
- browser inspection;
- Electron/manual inspection;
- unavailable viewport or environment checks;
- unverified remote CI.

Manual scenarios:

- roll and normal movement;
- cross GO;
- unowned purchase and decline;
- rent or other payment;
- development and hotel;
- Chance and Khí Vận resulting state;
- jail actions;
- debt, bank sale, forced sale, and finish;
- speed changes and reduced motion;
- skip during movement and decision display;
- reconnect during movement and a pending decision;
- resize while the board and HUD are active.

## 11. Performance and visual verification

The current scene budget is the guardrail:

- target triangles: 80,000;
- hard triangle limit: 100,000;
- target draw calls: 210;
- stress draw-call limit: 240;
- tile texture anisotropy remains capped at 8.

Phase 4 action feedback must:

- preserve GameScene demand rendering and the current DPR contract;
- use instancing or existing layers for repeated board effects;
- keep transient effects bounded and remove or settle them;
- avoid a new permanent RAF loop or per-frame React update;
- measure CSS size, drawing-buffer size, DPR, draw calls, triangles, and active
  animated objects;
- report whether an FPS value represents RAF cadence or actual render
  behavior, rather than using the label without evidence;
- validate the normal four-player board and a stress case with simultaneous
  balance, building, token, and tile feedback.

Do not raise the scene budget to accommodate an unmeasured effect. If a
presentation cannot fit the budget, simplify or instance it first.

## 12. Implementation order

### Step 0 - Facts and contracts

Produce the transition matrix, current-state fixtures, visibility matrix, and
open-decision list. No visual implementation begins until the card, movement
cause, and transfer-attribution limits are explicit.

### Step 1 - Event adapter and sequencing

Strengthen event identity, snapshot grouping, serial/overlap policy, and stale
reset tests. Reuse the existing event taxonomy wherever possible.

### Step 2 - Dice to movement

Implement the committed dice presentation and normal movement handoff using
the Phase 3 executor. Add destination-only and unsupported-cause fallbacks
without inventing paths.

### Step 3 - Landing and purchase

Wire settled landing state to the existing decision panels. Present purchase,
decline, balance, and ownership consequences only after committed state.

### Step 4 - GO, transfer, and development

Add proven GO feedback, safe balance-delta presentation, and committed
house/hotel changes. Introduce no transfer labels that the state cannot prove.

### Step 5 - Cards, jail, debt, forced sale, and turn

Add generic card-result presentation first. Only implement an explicit reveal
after its visibility and protocol contract is accepted. Finish jail, debt,
forced-sale, finish, and turn handoffs using current server commands.

### Step 6 - Interruption, performance, and UAT

Complete speed, reduced-motion, skip, reconnect, stale-completion, browser,
Electron, and scene-budget verification. Document unavailable environments
instead of treating them as passed.

Each step should be a reviewable implementation slice with focused tests. Do
not bundle a protocol change, renderer rewrite, and gameplay rule change into
one visual commit.

## 13. Definition of Done

Phase 4 is complete only when all of the following are true:

- Dice presentation always matches the committed server result.
- Normal movement uses the frozen Phase 3 hop and landing primitives.
- Unsupported movement causes do not create fabricated paths.
- GO feedback is emitted only when crossing is proven.
- Landing, purchase, payment, development, jail, debt, forced sale, finish,
  and turn states remain server-authoritative.
- Balance presentation never invents a payer, receiver, amount, or cause.
- Card presentation does not leak deck order or rely on nonexistent DRAW or
  CONTINUE commands.
- Existing simplified rules remain intact, with no mortgage, open-market, or
  legacy auction behavior.
- Required decision controls wait for settledPositions and current operation
  ids.
- 0.75x, 1x, 1.5x, 2x, reduced motion, skip, and reconnect are tested.
- Reset and stale-completion guards protect every presentation family.
- Keyboard, focus, status, contrast, and reduced-motion behavior are verified.
- Client tests, server tests, typecheck, lint, and build pass.
- PostgreSQL-backed tests are either passed with the configured database or
  clearly reported unavailable.
- Browser and Electron/manual checks are reported independently.
- Scene measurements remain within the current triangle and draw-call budget.
- No duplicate animation architecture or client-side rule authority was added.

## 14. Open decisions and handoff gates

The bounded Phase 4.2 client slice consumes the Phase 4.1 foundation. The
repeated-dice-pair identity gate is resolved by `rollSequence`; the following
three richer contract decisions remain explicit:

1. Movement cause and route: exact card, teleport, backward, and jail paths
   need a safe signal if the product requires a semantic route instead of a
   destination snap.
2. Card reveal: card identity and result need an audience-safe projection if
   the product requires a readable card face. Deck order must remain private.
3. Transfer attribution: exact payer, receiver, and cause need a proven
   transition contract when a balance diff is ambiguous.

The movement, card, and transfer decisions are blockers only for promising the
corresponding richer semantic choreography without a contract decision. Until
then, retain the documented fallback and do not silently treat a changed room
revision or short tile delta as a new roll or proven route.

Phase 4.1 changed the shared/server/client roll-identity contract and its
forward migration. Phase 4.2 consumes that contract without further shared or
server changes; it does not authorize card reveal, transfer attribution, or
new client rule authority.

## 15. Final Phase 4 experience pass (2026-08-22)

This section supersedes the three open contract gates in section 14. It records
the implemented V7 contract and the evidence gathered for the final experience
pass. It does **not** close Phase 4: the complete browser and packaged Electron
manual matrix has not passed.

### 15.1 V7 authoritative contract

- Protocol V7 adds bounded public semantic gameplay events plus per-player
  private lanes. Every committed event has a stable id and a monotonic sequence;
  snapshots retain at most 64 events per lane.
- Structured facts cover exact committed money transfers, property transfers,
  GO rewards, jail entry, failed jail rolls, and jail release. Payer, recipient,
  amount, property, cause, and audience come from the authoritative mutation
  path rather than balance diffs or log parsing.
- Private trade and forced-sale terms remain in the authorized player's private
  lane. Public ownership consequences can still be presented without disclosing
  private financial terms.
- The durable card interaction is `AWAITING_DRAW -> REVEALED -> DISMISS`. Draw
  and dismiss commands carry an operation id, reject stale/unauthorized use,
  survive reconnect, and use server deadlines for auto-draw/auto-dismiss. Card
  consequences occur only after dismissal; a legitimate card chain creates a
  new operation instead of reusing or collapsing the previous one.
- `008_semantic_card_v7.sql` upgrades only V6 snapshots, initializes empty
  semantic histories without inventing past facts, adds the completed-operation
  ledger, uses explicit JSONB text casts, and bumps aggregate versions inside
  the migration transaction. Shared state and socket schemas validate the new
  fields strictly.

### 15.2 Presentation implementation

- The client still has one `PresentationController`, one `AnimationQueue`, and
  one `PresentationStore`. V7 event gaps reset to the snapshot baseline; old
  non-blocking spectacle is not replayed on reconnect.
- A proven dice `WALK` gets the destination preview and the frozen Phase 3 hop
  motion. SNAP, jail transfer, card relocation, and ambiguous causes never
  fabricate a walking route. Proven GO crossings pause at GO and combine the
  authoritative reward event with the central stage and bank-to-player coins.
- Deterministic world-space player stations replace the old top HUD. Local
  players keep BOTTOM, opponents keep TOP/LEFT/RIGHT by stable membership order,
  spectator layout uses canonical order, and LEFT/BANKRUPT players retain their
  original slot. Station anchors are shared by station and money-transfer FX.
- `BoardEventStage` presents exact source, destination, amount, purchase,
  ownership, GO, jail, card, and development semantics. Physical animation
  scales with presentation speed; semantic dwell retains a readable minimum at
  2x and under Reduced Motion.
- The board contains a clear bank endpoint, symbolic instanced coin piles, and
  two low-poly physical card stacks. Blocking cards dim the board, expose the
  active-player CTA only, restore their durable stage after reconnect, and
  enforce the reveal dismissal guard.
- Building anchors are stable 2x2 house slots. Only newly committed houses
  animate, in sequence; the hotel transition and lightweight construction FX
  settle to the authoritative count. Reduced Motion shows the final committed
  model and semantic result without bounce or particles.
- A compile-time-gated deterministic UAT harness supplies rare presentation
  states through the real controller/store/queue. Normal production output uses
  the empty virtual-module stub; neither the client distribution nor packaged
  `app.asar` contains the UAT labels.

### 15.3 Automated validation evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Typecheck | **PASS** | desktop, shared, client, and server workspace checks passed. |
| Lint | **PASS** | Full workspace lint passed. |
| Client tests | **PASS** | 77 files, 370 tests. The sandbox attempt hit Windows `spawn EPERM`; the identical approved Windows-safe retry passed. |
| Server tests without configured database | **PASS** | 12 files passed, 1 skipped; 142 tests passed, 9 database-gated tests skipped. |
| PostgreSQL-backed server tests | **PASS** | Single-worker Windows-safe run: 13 files and 151 tests passed with `TEST_DATABASE_URL`, including V6-to-V7 snapshot migration. |
| Desktop tests | **PASS** | 4 files, 12 tests. The sandbox attempt hit `spawn EPERM`; the identical approved retry passed. |
| Production client build | **PASS** | Vite production build passed; the UAT virtual stub is 0.04 kB and fixture labels are absent. |
| Production Electron package | **PASS** | Win32 x64 package completed and packaged `app.asar` has no Phase 4 UAT labels. |
| Diff whitespace check | **PASS** | `git diff --check` passed; Git reported only the repository's CRLF conversion warnings. |
| Fresh V6 migration path | **PASS** | PostgreSQL integration test upgrades a locked V6 room to empty V7 lanes without changing prior gameplay facts. |
| Configured developer DB migrate/status | **FAIL** | This session applied an earlier draft of migration 008 before its completed-operation ledger was finalized. The tracked checksum now differs from the local migration ledger. The database was audited read-only and left untouched because checksum/snapshot repair was not authorized. |
| Remote CI | **NOT RUN** | No push or remote workflow was authorized. |

The configured developer-database failure is separate from the passing fresh
V6 migration test. It must be repaired explicitly before `db:migrate` and
`db:status` can pass against that already-modified local database.

### 15.4 Visual UAT and measured scene metrics

The first in-app-browser pass at 1440x900 verified WebGL rendering, the 2-player
and 4-player station layouts, the absence of the old top HUD, and idle cleanup.
Recorded browser baselines were 177 draw calls / 40,120 triangles / 0 active
animations for two players and 185 / 40,628 / 0 for four players. After hot
reload, the browser safety policy rejected further localhost navigation; no
alternate browser surface was used.

The packaged Electron UAT recorded:

- two players: 178 draw calls / 40,120 triangles / 0 active animations;
- four players: 186 / 40,628 / 0;
- dice/normal walk: 202 / 53,924 / 2 while rolling, 204 / 53,928 / 1 during
  destination preview, then 203 / 53,926 / 0 after LAND;
- PASS GO: the central `QUA XUẤT PHÁT` and `+200.000 ₫` stage was visible with
  bank-to-An coins at 206 / 54,122 / 5, and then settled;
- property purchase: the settled authoritative result showed An at 1,440,000 ₫,
  `-60,000 ₫`, ownership of Cà Mau, and 187 / 40,604 / 0; the full transient
  purchase-stage gate was not captured;
- blocking card reveal: the revealed card and shared dimmed backdrop were
  visible, and dismissal remained disabled inside the first approximately
  700 ms. A card-chain fixture restored a new revealed `Lùi lại 3 ô.` card.

All recorded measurements remain below the 80,000-triangle target and
210-draw-call target. `active 0` after settle confirms that retained one-shot
history is not counted as an active renderer and does not keep demand rendering
alive.

| Manual scenario | Browser | Packaged Electron |
| --- | --- | --- |
| 2-player and 4-player station layouts | **PASS** | **PASS** |
| Roll -> destination highlight -> movement | **NOT RUN** | **PASS** |
| PASS GO with bank-to-player coins | **NOT RUN** | **PASS** |
| Buy property, money flow, and central purchase moment | **NOT RUN** | **NOT RUN** - settled result observed; full transient gate not captured |
| Decline without a global event | **NOT RUN** | **NOT RUN** |
| Rent player-to-player | **NOT RUN** | **NOT RUN** |
| Partial debt | **NOT RUN** | **NOT RUN** |
| Bank sale | **NOT RUN** | **NOT RUN** |
| Forced-sale ownership transfer | **NOT RUN** | **NOT RUN** |
| Houses 1/2/3/4 and hotel | **NOT RUN** | **NOT RUN** |
| Chance draw/reveal | **NOT RUN** | **PASS** - reveal and dismissal guard observed |
| Khí Vận draw/reveal | **NOT RUN** | **NOT RUN** |
| Pay-each / collect-each after card close | **NOT RUN** | **NOT RUN** |
| Card movement into a new card interaction | **NOT RUN** | **PASS** - new revealed chain card observed |
| Go-to-jail card/tile | **NOT RUN** | **NOT RUN** |
| Just Visiting | **NOT RUN** | **NOT RUN** |
| Failed jail roll and bail/jail-free release | **NOT RUN** | **NOT RUN** |
| Bankruptcy station remains grey in its slot | **NOT RUN** | **NOT RUN** |
| Player leaves mid-animation | **NOT RUN** | **NOT RUN** |
| Reconnect at awaiting-draw and revealed stages | **NOT RUN** | **NOT RUN** |
| Spectator global/card view with zero CTA | **NOT RUN** | **NOT RUN** |
| Speeds 0.75x / 1x / 1.5x / 2x | **NOT RUN** | **NOT RUN** |
| Reduced Motion | **NOT RUN** | **NOT RUN** |
| Skip during physical animation | **NOT RUN** | **NOT RUN** |
| Resize during gameplay | **NOT RUN** | **NOT RUN** |
| Keyboard, focus, backdrop, and Escape card behavior | **NOT RUN** | **NOT RUN** |

Phase 4 therefore remains **NOT CLOSED**. Automated contract coverage is green
apart from the explicitly identified configured-database checksum state, but
the missing browser and Electron manual gates cannot be promoted to passes by
unit tests or fixture availability.

## 16. Historical final visual correction pass closure (superseded, 2026-08-22)

This section records the earlier visual pass and is retained as historical
evidence only. Section 17 is the current record for the focused correction pass
requested after that review. The implementation and validation statements below
were superseded where they conflict with the current source of truth.

### 16.1 Final presentation architecture

- `PlayerStationLayer` is now the visible station system. Each player has a
  raised world-space platform at the center of its viewer-relative board edge,
  portrait/mascot, readable SDF identity and exact balance, property/house/
  hotel counts, bounded symbolic wealth coins, turn state, and connection or
  bankruptcy/leave styling. The old DOM station cards remain only as a
  screen-reader status surface.
- Station anchors derive from `OUTER_BOARD_SIZE`; the camera fit includes the
  complete outside station extents and the fixed isometric direction is
  unchanged. `MoneyTransferLayer` consumes the same anchors, including the
  explicit BANK endpoint.
- Coins use one shared low-poly geometry/material family. The bank footprint,
  permanent bank pile, station piles, and transfer coins use the measured
  physical scale without representing one mesh per currency unit.
- `PhysicalCardDecks` uses authoritative public `deckCounts` and one physical
  instanced mesh layer per remaining card, with cached beveled geometry and
  deck-specific backs. The detached top card remains the same 3D object through
  face-down flight, authoritative reveal, front-facing message, and dismissal.
- The V7 `AWAITING_DRAW -> REVEALED -> DISMISS` contract remains unchanged.
  Reconnect restores the durable stage without replay, Reduced Motion removes
  flight/spin, and Skip only settles physical presentation. No second queue,
  client rule authority, log-derived event, or V8 contract was added.
- PASS GO is now a compact exact amount above the receiving station plus the
  existing bank-to-player coins; the global `QUA XUẤT PHÁT` banner is gone.
  Board-tile jail preserves the proven walk to tile 30 before the direct jail
  transfer to tile 10, while card jail uses the authoritative source directly.

### 16.2 Automated validation evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Root typecheck | **PASS** | Workspace TypeScript checks passed after the final renderer/package changes. |
| Lint | **PASS** | Full workspace lint passed. |
| Client tests | **PASS** | 82 files, 393 tests. Windows `spawn EPERM` was handled with the approved safe retry where required. |
| Server tests without database | **PASS** | 12 files, 142 tests passed; 1 file and 9 database-gated tests skipped. |
| PostgreSQL-backed server tests | **PASS** | 13 files, 151 tests passed with `TEST_DATABASE_URL`. |
| Desktop tests | **PASS** | 4 files, 12 tests passed. |
| Production build | **PASS** | Client/Vite build passed; the production UAT stub remained 0.04 kB. |
| Win32 Electron package | **PASS** | `pnpm desktop:package` completed for Windows x64 after the final source fixes. |
| Production artifact UAT-label scan | **PASS** | No Phase 4 UAT labels were present in the rebuilt client distribution or packaged output. |
| Database migration status | **PASS** | Migrations 001 through 008 reported applied. |
| `git diff --check` | **PASS** | No whitespace errors. |
| Remote CI / push / merge | **NOT RUN** | No remote operation was authorized. |

### 16.3 Deterministic visual UAT and measured scene metrics

The deterministic harness used the real presentation controller, store, queue,
and renderer. The visible DOM station count was zero in every settled fixture.

| Fixture | Draw calls | Triangles | Active animations | Result |
| --- | ---: | ---: | ---: | --- |
| 2 players, settled | 194 | 53,010 | 0 | **PASS** |
| 4 players, settled | 206 | 55,150 | 0 | **PASS** |
| Active Chance card, `AWAITING_DRAW` | 198 | 53,254 | 0 | **PASS** |
| Active Chance card, `REVEALED` | 199 | 53,256 | 0 | **PASS** |
| Stress fixture peak | 216 | 56,042 | 25 | **PASS**; below 240 draw calls / 100,000 triangles |

The 2-player and 4-player station layouts passed at 1280x720, 1440x900, and
1920x1080. Chance and Khí Vận face-down stacks, actual card click, physical
reveal, spectator waiting, reconnect at both durable card stages, pay-each
after close, amount-only PASS GO, BANK transfer, bankrupt and left-player
stations, dice-to-Go-To-Jail-to-jail, Reduced Motion, 0.75x/1x/1.5x/2x,
physical-flight skip, reveal skip, and stress metrics all passed in the
deterministic harness. Resize-specific manual capture was **NOT RUN**.

### 16.4 Live multiplayer and Electron UAT

- **Live browser: PASS.** Host and guest joined room `P4UAT22`; both clients
  observed the same authoritative `3 + 2 = 5` roll, the guest bought Ga Hà
  Nội and both clients showed the same ownership/balance result, and a later
  host `6 + 2 = 8` roll matched on both clients. World-space stations were
  visible without the old DOM HUD.
- **Packaged Electron visual smoke: PASS.** The rebuilt
  `OwnTheBlock.exe` joined `P4UAT22` through the dedicated validation socket,
  rendered the board, dice, physical decks, and colored outside-edge stations,
  and exposed the spectator state without a CTA. The earlier stale package
  showing black stations was discarded; the final package was rebuilt before
  this check.
- Full semantic Electron gameplay coverage (all card, debt, development,
  reconnect, reduced-motion, skip, and resize combinations) remains
  **NOT RUN** in the packaged client. Remote CI remains **NOT RUN**.

### 16.5 Manual-gate summary

| Manual gate | Browser deterministic | Live browser | Packaged Electron |
| --- | --- | --- | --- |
| Outside-edge stations / no DOM HUD | **PASS** | **PASS** | **PASS** |
| Bank, decks, coins, and settled scene budget | **PASS** | **PASS** | **PASS** visual smoke |
| Card face-down, click, reveal, spectator, reconnect | **PASS** | **NOT RUN** | **NOT RUN** full semantic matrix |
| PASS GO amount-only and BANK endpoint | **PASS** | **NOT RUN** | **NOT RUN** |
| Jail walk/transfer, bankrupt/left station styling | **PASS** | **NOT RUN** | **NOT RUN** |
| Reduced Motion, speed, and Skip | **PASS** | **NOT RUN** | **NOT RUN** |
| Resize during gameplay | **NOT RUN** | **NOT RUN** | **NOT RUN** |
| Remote CI and push/merge | **NOT RUN** | **NOT RUN** | **NOT RUN** |

The requested visual correction implementation is complete and locally
validated. Full Phase 4 remains open only for the explicitly listed manual
Electron/resize and remote-CI gates; no test-only result is being promoted to
those unavailable checks.

## 17. Focused Phase 4 visual/presentation correction pass (2026-08-22/23)

This is the current source-of-truth record for the focused correction pass.
Section 16 is historical and is superseded where it describes platforms,
portraits, active rings, informational event stages, or earlier metrics.

### 17.1 Contract and presentation architecture

- A live authoritative snapshot containing dice, a final Chance/Khí Vận tile,
  and `pendingCardInteraction` now queues `ROLL_DICE -> WALK -> LAND_TILE ->
  CARD_INTERACTION_CHANGED`. `boardRenderModel` no longer exposes the pending
  card directly before the queued landing completes.
- Session sync/reconnect hydrates `AWAITING_DRAW` or `REVEALED` into
  `PresentationStore` without replaying deck flight or reveal. Live card
  visibility is queue-driven.
- `CardInteractionOverlay` is a root-level fixed four-panel cut-out layer
  above the room toolbar. It blocks unrelated controls while leaving only the
  active physical card region clickable. Revealed cards retain the lock,
  active-player authority, backdrop/Escape dismissal, and server timeout, but
  have no visible instruction or X control.
- The obsolete `BoardEventStage` informational modal and semantic dwell waits
  were removed. Physical movement, coin transfer, ownership/building effects,
  jail reactions, and required decisions remain queued.
- Visible gameplay logs use the client-side presentation-safe gate. New
  authoritative gameplay logs buffer until the presentation/decision boundary
  is safe; historical reconnect logs hydrate immediately; chat is not parsed
  for gameplay meaning.

### 17.2 Visual corrections

- The renderer border is transparent while preserving its measured geometry.
- Bank, station, and transfer coins use deterministic shared copper/silver/gold
  materials with normalized relative weights `60:20:10`, shared geometry, and
  metallic roughness tuned for the existing low-poly board lighting.
- Player stations are minimal edge-centered clusters: readable name, physical
  mixed-metal wealth pile, and exact money value. Platforms, portraits,
  connection dots, property/building counts, labels, and active-turn rings are
  removed from the visible world-space presentation. Stations are farther from
  the board and camera-fit bounds include the new extents.
- Destination preview uses a brighter tinted surface and a shared bright edge
  frame with anticipation/persistent phases. It is created only for a proven
  normal dice walk and clears on landing.
- Physical decks are enlarged to approximately `2.2 x 1.38`, placed
  symmetrically on the Parking-to-Start axis with card long axes perpendicular
  to that diagonal, and use shared Chance question-mark and Khí Vận wheel
  backs for idle and detached cards. The Bank label is removed.
- The Roll CTA is rendered only for the local legally rollable turn (with
  pending-request feedback); opponent turns retain screen-reader status only.
- PASS GO remains amount-only with Bank-to-player coins. Informational rent,
  purchase, transfer, development, jail, and PASS GO modals are not rendered.

### 17.3 Automated validation

| Gate | Result | Evidence |
| --- | --- | --- |
| Root typecheck | **PASS** | `pnpm typecheck` |
| Workspace lint | **PASS** | `pnpm lint` |
| Client tests | **PASS** | 82 files, 395 tests |
| Server tests without database | **PASS** | 12 files, 142 passed; 1 file and 9 database-gated tests skipped |
| PostgreSQL-backed server tests | **PASS** | 13 files, 151 passed with `TEST_DATABASE_URL` |
| Desktop tests | **PASS** | 4 files, 12 tests |
| Production build | **PASS** | Vite build completed; only the existing large-chunk warning remained |
| Win32 desktop package | **PASS** | Final x64 package completed after releasing the smoke-test executable lock |
| Database migration status | **PASS** | Migrations 001 through 008 applied |
| Production artifact stale-UAT-label scan | **PASS** | No Phase 4 harness labels in rebuilt client/package artifacts |
| `git diff --check` | **PASS** | No whitespace errors; CRLF normalization warnings only |
| Remote CI / push / merge | **NOT RUN** | Not authorized |

### 17.4 Deterministic harness evidence

The existing `Phase4UatHarness` was extended; no second harness was created.
The observed normal card trace was `PREVIEW > WALK > LAND > CARD`, with the
preview present before the first hop and still present before landing.

| Scenario / viewport | Draw calls | Triangles | Active animations | Result |
| --- | ---: | ---: | ---: | --- |
| 2 players, settled | 192 | 50,872 | 0 | **PASS** |
| 4 players, settled | 202 | 51,716 | 0 | **PASS** |
| Chance landing / awaiting draw | 210 | 63,112 | 0 | **PASS** |
| Khí Vận landing / awaiting draw | 210 | 63,112 | 0 | **PASS** |
| Roll gate early / after handoff | 208 / 206 | 63,122 / 63,112 | 1 / 0 | **PASS** |
| Reconnect awaiting / revealed | 193 / 195 | 49,814 / 50,122 | 0 / 0 | **PASS** |
| Stress peak / settled | 214 / 208 | 52,616 / 52,484 | 25 / 5 | **PASS**; below 240 draw calls / 100,000 triangles |

The 2-player and 4-player station layouts passed at 1280x720, 1440x900, and
1920x1080 without clipping. Deterministic checks also passed for the two deck
icons, mixed-metal piles, absent character/station rings, invisible renderer
border, absent informational modals, amount-only PASS GO, opponent-hidden Roll,
revealed-card cleanup, Reduced Motion, 0.75x/1x/1.5x/2x, reconnect log
hydration, and log flush at turn handoff.

### 17.5 Live browser and Electron evidence

- **Live browser: PARTIAL PASS.** In room `P4UAT22`, two real clients
  completed a normal roll, a purchase, presentation-safe log delay/flush, and
  local Roll hiding/reappearing across the authoritative turn handoff. Live
  Chance, Khí Vận, rent, and development paths were **NOT RUN** because the
  second player disconnected before those paths could be reached.
- **Packaged Electron: PASS for visual smoke.** The final rebuilt x64
  executable was launched against a scoped CORS-enabled validation server;
  two fresh clients joined, selected mascots, started a room, and rendered the
  board, toolbar, physical decks/icons, dice, edge stations, and Roll state.
  Full packaged card, rent, development, reduced-motion, skip, reconnect, and
  resize semantics remain **NOT RUN**. The earlier card-focus interaction was
  also exercised in the packaged client before the final source/package
  rebuild; the deterministic harness is the final evidence for revealed-face
  copy and dismissal semantics.

### 17.6 Current status and remaining gaps

The implementation and local automated/deterministic evidence for this focused
correction pass are complete. This does not close every requested Phase 4
manual gate: live multiplayer rent/development/Chance/Khí Vận, full packaged
semantic coverage, resize during gameplay, and remote CI remain **NOT RUN**.
No gameplay rule, server authority, V8 contract, Phase 3 hop baseline, fixed
camera direction, Reduced Motion/Skip guarantee, or semantic event privacy
boundary was expanded to compensate for those unavailable manual paths.

## 18. Focused Phase 4 visual/presentation correction pass (2026-08-23)

This section records the follow-up correction pass implemented on top of the
reviewed Phase 4 branch. The implementation was inspected against the current
branch before editing. It remains V7-only: one `PresentationController`, one
`AnimationQueue`, one `PresentationStore`, the approved dice implementation,
the Phase 3 hop baseline, fixed isometric camera direction, demand rendering,
and the existing reconnect/Reduced Motion/Skip guarantees are preserved.

### 18.1 Presentation architecture corrections

- A live authoritative snapshot containing dice, a final Chance/Khí Vận tile,
  and `pendingCardInteraction` now queues `ROLL -> WALK -> LAND -> CARD`.
  `pendingCardInteraction` is not exposed as a live card presentation before
  the landing animation completes. Session sync/reset hydrates the centered
  face-down or revealed card directly without replaying deck flight/reveal.
- Card focus is now a dedicated root-level portal with one fixed full-viewport
  scrim and a transparent R3F focus canvas. It covers the toolbar, FPS,
  settings, leave/forfeit controls, outer teal area, and renderer surroundings;
  only the physical card region remains interactive. The former R3F scrim is
  no longer the main dimming layer. The revealed view retains authoritative
  backdrop/Escape dismissal and reveal locking but has no visible instruction
  copy or close button.
- Development levels are presentation-owned until the queued construction
  change is displayed, preventing authoritative building state from flashing
  before payment/building presentation. The client log gate buffers gameplay
  logs through movement, decisions, card interaction, and physical effects,
  then flushes in original order at a safe turn handoff. Historical reconnect
  logs hydrate immediately; chat remains independent when no gameplay gate is
  active. Expected queue aborts do not surface as presentation errors.

### 18.2 Visual corrections

- Board/station/player/transfer coins use one shared low-poly geometry and
  deterministic copper/silver/gold materials normalized from `60:20:10`.
  Metalness/roughness are tuned for the existing board lights rather than
  adding a separate lighting system.
- Stations are farther from the board and intentionally contain only a
  prominent player name, a physical mixed-metal wealth pile, and the exact
  money value. Visible platforms, portraits, connection dots, property/building
  counts, labels, and active-turn rings are removed. Bank identity is a pile,
  not a visible `NGÂN HÀNG` label.
- Destination preview is created only for a proven normal `DICE_WALK`, appears
  before the first hop, remains through approach, and clears at `LAND`. The
  surface/edge contrast and restrained pulse are stronger while preserving
  readability of characters, buildings, and property information. Reconnect,
  card movement, direct jail movement, and reduced-motion SNAP do not invent a
  route preview.
- Physical decks are `2.2 x 1.38`, derived from the Parking-to-Start board
  diagonal, symmetric around board center, and oriented with their long axis
  perpendicular to that diagonal. Existing Chance question-mark and Khí Vận
  wheel assets are shared across idle and detached backs. The renderer border
  is transparent without changing its measured geometry.
- Informational BoardEventStage cards and their presentation-only dwell waits
  are retired. Physical payment coins, ownership feedback, construction,
  movement, jail reactions, decisions, and card interaction remain. PASS GO is
  amount-only with Bank-to-player coins. Roll is absent on opponent turns and
  appears only for a locally safe legal turn.

### 18.3 Automated validation

| Gate | Result | Evidence |
| --- | --- | --- |
| Root typecheck | **PASS** | `pnpm typecheck` |
| Workspace lint | **PASS** | `pnpm lint` |
| Client tests | **PASS** | 82 files, 400 tests |
| Server tests without database | **PASS** | 12 files, 142 passed; 1 file and 9 database-gated tests skipped |
| PostgreSQL-backed server tests | **PASS** | 13 files, 151 tests with `TEST_DATABASE_URL` |
| Desktop tests | **PASS** | 4 files, 12 tests |
| Production build | **PASS** | Vite build completed; only the existing large-chunk warning remained |
| Win32 desktop package | **PASS** | rebuilt `apps/desktop/out/Own the Block-win32-x64` |
| Database migration status | **PASS** | migrations 001 through 008 applied |
| `git diff --check` | **PASS** | no whitespace errors; CRLF normalization warnings only |
| Remote CI / push / merge | **NOT RUN** | not authorized |

### 18.4 Deterministic harness evidence

The existing `Phase4UatHarness` was updated; no second harness was created.
At the available in-app browser viewport of `1280x720`, observed evidence was:

| Scenario | Evidence | Result |
| --- | --- | --- |
| Normal roll destination preview | `PREVIEW > WALK > LAND`; preview before first hop and before LAND | **PASS** |
| Chance / Khí Vận landing | `PREVIEW > WALK > LAND > CARD`; card remains in deck until LAND completes | **PASS** |
| Root card focus | fixed `1280x720` scrim, blur `5px`, no split panels; focus ratio `42%` | **PASS** |
| Idle/deferred card backs | Chance question mark and Khí Vận wheel visible on idle and active backs | **PASS** |
| 2-player stations | settled `194` draw calls / `53,064` triangles; 2 stations, 57 shared coin instances | **PASS** |
| 4-player stations | settled `187` draw calls / `53,590` triangles; 4 stations, 94 shared coin instances | **PASS** |
| Active card focus | scene `191` / `53,278` plus focus `5` / `314`, combined `196` / `53,592`; width ratio `42%` | **PASS** |
| Building preflash | queued sample observed `build 0/1` before animation and `build 1/1` after; Reduced Motion was immediate | **PASS** |
| Informational events / PASS GO | no BoardEventStage or visible rent/purchase/development/PASS GO modal; amount-only transfer retained | **PASS** |
| Roll gate | opponent count `0`; local safe turn count `1`, enabled | **PASS** |
| Log gate | roll/card logs absent during active presentation and present in order after handoff | **PASS** |
| Stress budget | peak `216` draw calls / `56,584` triangles with 25 animated objects; settled `206` / `56,032` | **PASS**; under `240` / `100,000` |

The active-card sample used the shared root focus canvas at `42%` viewport
width and approximately `46.8%` viewport height; the stress sample returned to
focus `0%` after cleanup. Browser capability did not expose runtime viewport
resizing, so live resize at `1280x720`, `1440x900`, and
`1920x1080` is **NOT RUN**; layout/camera unit coverage remains automated.

### 18.5 Live browser and Electron evidence

- **Live browser: PARTIAL PASS.** In the real server-backed room `P4UAT22`, a
  normal roll produced an authoritative `2+5=7` destination and purchase
  decision. Declining purchase completed the presentation; the roll log was
  not visible during the decision/animation, then appeared after handoff, and
  the next-player Roll CTA became visible only for the eligible player. Live
  Chance, Khí Vận, rent, and development were **NOT RUN** because the second
  player disconnected before those paths could be reached.
- **Electron: PARTIAL PASS for rebuilt-shell smoke.** The rebuilt x64 package
  launched at `1440x900`; title, branded recovery screen, loading state, and
  accessibility tree were observed. With no persisted desktop session, the
  package stayed at `Đang khôi phục ván chơi…`, so packaged Join/Board/card/
  rent/development/Reduced Motion/Skip/reconnect/resize semantics are **NOT
  RUN**. A scoped `--socket-url`/environment launch attempt failed at the
  Windows process layer before Electron created a window; no source change was
  made for that validation-only environment issue.

### 18.6 Requested behavior status

The following statuses are for this correction pass, not inferred from
historical logs: card-after-LAND **PASS**; full-viewport card focus and input
isolation **PASS**; invisible renderer border **PASS**; mixed metallic coins
**PASS**; simplified/farther stations for 2 and 4 players **PASS**; removed
character/station active rings **PASS**; visible destination preview **PASS**;
retired informational modals and PASS GO modal **PASS**; deck icons and
diagonal enlargement **PASS**; opponent-hidden/local-safe Roll **PASS**;
revealed-card cleanup **PASS**; delayed roll/card logs and turn-handoff flush
**PASS**; reconnect log/card hydration **PASS**; Reduced Motion and speed
settings **PASS**; stress budget **PASS**. Live Chance/Khí Vận/rent/development,
full packaged gameplay semantics, and live viewport-resize checks are **NOT
RUN**. No remaining gameplay-rule, authority, V8, Phase 3 movement, camera,
privacy, or Phase 5-audio gap was introduced by this pass.

## 19. Focused Phase 4 rendering/presentation correction pass (2026-08-23)

This narrower follow-up pass addresses five reviewed rendering/presentation
issues without changing the V7 gameplay contract. The current branch was
inspected before editing. One presentation controller, animation queue, and
presentation store remain in use; the approved dice, Phase 3 hop behavior,
fixed camera direction, demand rendering, reconnect hydration, and
Reduced Motion/Skip guarantees remain unchanged.

### 19.1 Implemented corrections

- Shared coin piles now use a beveled, low-poly circular geometry with
  deterministic copper/silver/gold assignment normalized from `60:20:10`.
  The shared station, bank, and transfer paths use brighter practical
  metallic materials and retain instanced pile placement.
- Card focus now uses a normalized orthographic camera/depth contract rather
  than viewport-sized local geometry. Shared Chance question and Khí Vận wheel
  textures are prewarmed, and the card frame is consistently `0.05` world
  units. The physical card remains the single active card implementation.
- Optional SDF outline fields are available only to the station name/status,
  exact balance, and temporary amount text. They use thin dark outlines with
  warm fills and restrained opacity.
- Destination-preview elevation is derived from the canonical tile-surface
  position and clearance constants, with a regression test proving the
  surface and edge remain above the actual tile surface.
- `displayBalances` is presentation-owned. A live
  `BALANCE_CHANGED` event keeps the prior visible balance until its
  queued executor starts, then atomically commits the event's `to` value
  and emits the existing balance delta signal. Session sync/reset hydrates
  authoritative balances directly without replay.

### 19.2 Automated validation

| Gate | Result | Evidence |
| --- | --- | --- |
| Root typecheck | **PASS** | `pnpm typecheck` |
| Workspace lint | **PASS** | `pnpm lint` |
| Client tests | **PASS** | 83 files, 408 tests |
| Server tests without database | **PASS** | 12 files passed; 142 passed and 9 skipped |
| PostgreSQL-backed server tests | **PASS** | 13 files, 151 tests |
| Desktop tests | **PASS** | 4 files, 12 tests |
| Production client build | **PASS** | `pnpm build`; existing large-chunk warning only |
| Win32 desktop package | **PASS** | rebuilt `apps/desktop/out/Own the Block-win32-x64` |
| Database migration status | **PASS** | migrations 001 through 008 applied |
| `git diff --check` | **PASS** | no whitespace errors; CRLF normalization warnings only |
| Remote CI / push / merge | **NOT RUN** | not authorized |

### 19.3 Deterministic Phase4UatHarness evidence

The existing `Phase4UatHarness` was extended; no second harness was created.
The available browser viewport was `1280x720`.

| Scenario | Observed evidence | Result |
| --- | --- | --- |
| Destination preview | `PREVIEW > WALK`; preview-before-walk and preview-before-land both `yes`; active `218 / 78,554` | **PASS** behavior; normal draw target is **CONDITIONAL** |
| Chance / Khí Vận landing | `PREVIEW > WALK > LAND > CARD`; card handling follows LAND | **PASS** |
| Card focus depth | unit coverage for `1280x720`, `1440x900`, `1920x1080`; focus depth approximately `9.914–10.086` around camera Z `10` | **PASS** |
| Full-viewport focus layer | root/scrim `1280x720`, transparent focus canvas, scrim `rgba(3,16,21,.72)` with `blur(5px)`, no visible close copy/button | **PASS** |
| Active focused card | combined `204` draw calls / `65,248` triangles; focus width `42%`; depth `safe-contract` | **PASS** |
| Copper/silver/gold coins | deterministic material/geometry tests and visible shared piles | **PASS** |
| 2-player stations | settled `198` draw calls / `60,132` triangles | **PASS** |
| 4-player stations | settled `212` draw calls / `67,148` triangles | **CONDITIONAL**; two above the `<=210` normal target |
| Active money transfer | balance gate active `206` draw calls / `65,814` triangles; display balance held before commit | **PASS** |
| Balance gate | `BALANCE_HELD > BALANCE_COMMITTED`; held `1,500/1,420`, then `1,420/1,420` | **PASS** |
| Stress budget | peak `226` draw calls / `68,736` triangles with 25 active objects | **PASS**; below hard `240 / 100,000` |

The current four-player and active-preview measurements are slightly above the
stated normal draw-call target, while all observed paths remain below the
stress hard limit and under `80,000` triangles. This is the remaining measured
performance gap for the pass; the correction itself did not add a second
renderer, random coin placement, or a new presentation queue.

### 19.4 Live browser, Electron, and viewport evidence

- **Live browser: PARTIAL PASS.** A real server-backed normal roll produced a
  Chance destination, showed the face-down physical card only after landing,
  revealed the card through the physical interaction, and dismissed it via
  the authoritative backdrop path. After the presentation completed, the
  corresponding gameplay logs appeared; the revealed view showed no visible
  instruction or X. Live Khí Vận, rent, development, and a second eligible
  local-player turn were **NOT RUN** because the available room's other
  player was disconnected.
- **Electron visual/semantic smoke: NOT RUN.** The updated Win32 package was
  rebuilt successfully, but this session has no cross-application desktop
  interaction/capture capability. Packaging is not treated as visual UAT.
- **Live resize: NOT RUN.** The in-app browser capability did not apply the
  requested runtime viewport override. Card depth/layout tests cover all three
  requested CSS viewport sizes.

### 19.5 Requested behavior status and remaining gap

Mixed-metal coins, normalized card focus depth, root card-focus treatment,
station-only SDF outlines, canonical destination elevation, and
presentation-owned balance timing are **PASS** by code/tests and deterministic
harness evidence. Live gameplay coverage beyond the observed normal
Chance-card path, Electron visual/semantic UAT, and runtime resize remain
**NOT RUN**. The only measured implementation gap is the normal draw-call
target in the four-player settled and active-preview fixtures (`212` and
`218`; stress hard budget passes). No gameplay-rule, server-authority,
V8, Phase 3 movement, fixed-camera, privacy, or Phase 5-audio boundary was
expanded.

## 20. Focused Phase 4 game-feel visual polish pass (2026-08-23)

This pass is limited to the four reviewed visual goals: destination-preview
readability, shared metallic coin finish, faster construction/ownership pops,
and a slightly smaller, more dimensional focused card. V7 authority, the
single PresentationController/AnimationQueue/PresentationStore, approved dice,
Phase 3 movement, fixed camera direction, display-balance/development timing,
card LAND-before-draw/reconnect behavior, Reduced Motion, Skip, and
`frameloop="demand"` remain unchanged. No V8 or Phase 5 audio work was added.

### 20.1 Destination preview

`TileDestinationPreview` now uses normal transparent alpha blending for both
existing meshes (`depthWrite=false`) instead of additive blending. The wash and
frame remain translucent white, with a deterministic shaped pulse at `460ms`:
surface `0.12–0.37`, frame `0.42–0.88`; Reduced Motion holds a static `0.20`
surface / `0.62` frame. The canonical surface elevation and the existing
PREVIEW → WALK → LAND lifecycle were preserved. The existing UAT fixture now
publishes sampled alpha evidence as well as `preview-before-walk` and
`preview-before-land` flags; the `5`-step walk spans multiple pulse cycles.

### 20.2 Shared metallic currency

The shared coin is one low-poly `LatheGeometry` profile with a thicker outer
edge, subtly raised rim, recessed face, and soft bevel. Copper, silver, and
gold use shared `MeshPhysicalMaterial` finishes in the approved deterministic
`6:2:1` sequence. A single `RoomEnvironment` PMREM is generated per board
renderer and assigned only to those shared coin materials; `scene.environment`
remains unset. Material tuning is copper `0.74/0.17`, silver `0.80/0.13`, and
gold `0.77/0.15` for metalness/roughness, with finish-specific environment
intensity `1.08/1.24/1.14` and emissive intensity `0`. Selected station and
transfer coins receive deterministic small X/Z tilts; bank, station, and
transfer paths retain instanced shared geometry.

### 20.3 Construction and ownership timing

Final presentation timings are:

| Effect | Final value | Visual contract |
| --- | ---: | --- |
| House pop | `180ms` | one `1.30` overshoot, then exact scale `1` |
| House stagger | `125ms` | sequential house slots remain `1 → 4` |
| Hotel transition | `520ms` | house compression, burst, `1.25` hotel overshoot, settle |
| Construction burst | `130ms` base | 11 instanced owner/dust particles, speed-scaled |
| Ownership flag pop | `180ms` | `0 → 1.28 → 1`, no acquisition replay on sync |

House-step and burst durations derive from the already speed-resolved
development signal, keeping queue and R3F timing synchronized at `0.75×`,
`1×`, `1.5×`, and `2×`. Reduced Motion renders no construction particles and
snaps the building/flag to the authoritative result.

### 20.4 Focused card composition

Focused card width is now `39%` of the normalized orthographic viewport. The
camera-space base tilt is yaw `6°`, pitch `4°`, roll `0.5°`; reveal spin is
composed on top and settles back to that same tilt. The normalized depth
contract remains safe at `1280×720`, `1440×900`, and `1920×1080`. The active
card screenshot shows the root scrim covering the toolbar and board while the
physical card remains undimmed; the revealed screenshot contains no visible
instruction or close button.

### 20.5 Automated validation

| Gate | Result | Evidence |
| --- | --- | --- |
| Root typecheck | **PASS** | `pnpm typecheck` |
| Workspace lint | **PASS** | `pnpm lint` |
| Client tests | **PASS** | 83 files, 419 tests |
| Server tests without database | **PASS** | 12 files, 142 passed; 9 database-gated tests skipped |
| PostgreSQL-backed server tests | **PASS** | 13 files, 151 tests |
| Desktop tests | **PASS** | 4 files, 12 tests |
| Full workspace tests | **PASS** | desktop 12; server 142; client 419 |
| Production client build | **PASS** | `pnpm build`; existing large-chunk warning only |
| Win32 desktop package | **PASS** | `pnpm desktop:package` rebuilt x64 package |
| Database migration status | **PASS** | migrations 001 through 008 applied |
| `git diff --check` | **PASS** | no whitespace errors; only CRLF normalization warnings |
| Remote CI / push / merge | **NOT RUN** | not authorized |

### 20.6 Deterministic harness and visual evidence

The existing `Phase4UatHarness` was extended; no second harness was created.
At its default `1280×720` browser viewport:

| Scenario | Observed evidence | Result |
| --- | --- | --- |
| Destination flicker | `PREVIEW > WALK > LAND`; preview before first hop and before LAND; alpha sample `0.12 → 0.36` and repeated console samples across the `460ms` period | **PASS** |
| Chance landing | fresh fixture settles at `PREVIEW > WALK > LAND > CARD`, then face-down Chance card awaits draw | **PASS** |
| Khí Vận landing | fresh fixture settles at `PREVIEW > WALK > LAND > CARD`, then face-down Khí Vận card awaits draw | **PASS** |
| Shared coins | LatheGeometry, `sceneEnvironment=false`, env maps true only on coin finishes; 4-player finish instances `61/23/10` | **PASS** |
| 2-player settled | `198` draw calls / `58,992` triangles | **PASS** |
| 4-player settled | `208` draw calls / `65,268` triangles | **PASS** |
| Active destination | `218` draw calls / `76,674` triangles; pulse samples include surface `0.125/0.364`, edge `0.430/0.869` | **FAIL** normal target; **PASS** hard limit |
| Active money transfer | `204` draw calls / `63,874` triangles; balance remains held during queue | **PASS** |
| Active 4-house build | `203` draw calls / `64,064` triangles; `build 0/4` sampled while active and `4/4` after settle | **PASS** |
| Active hotel build | `215` draw calls / `66,304` triangles | **FAIL** normal target; **PASS** hard limit |
| Active focused card | scene `199` / `63,054`, focus `5` / `314`, combined `204` / `63,368`; width `39%` | **PASS** |
| Stress | `222` draw calls / `66,836` triangles with 25 active objects | **PASS**; below `<240` / `<100,000` |
| Resize sweep | names and board content present at `1280×720`, `1440×900`, `1920×1080`; settled 4-player `212` / `65,268` at each viewport run | **CONDITIONAL**; layout readable, normal target varies by fixture |

The active destination and hotel samples remain above the normal `≤210`
draw-call target; no budget was raised. All observed samples remain below the
hard stress limits. The deterministic card screenshots show full-viewport
scrim/blur, readable question-mark back, focused 39% card with visible edge
depth, and a clean revealed card without visible instruction or X.

### 20.7 Live browser and Electron evidence

- **Live browser: PARTIAL PASS.** A fresh two-player server-backed room was
  created using isolated local origins. The guest-only Roll CTA was visible;
  the host did not receive it. A real `6 + 2 = 8` roll landed on Cần Thơ,
  showed the authoritative purchase decision, kept the roll/purchase logs out
  of the visible log during presentation, then flushed them after purchase.
  The property became owned and the next-turn Roll CTA appeared only for the
  host. The host then made a real `5 + 4 = 9` roll to Hải Phòng and declined
  purchase. A later guest `6 + 5 = 11` roll produced renderer diagnostics for
  an active tile-19 preview with repeated alpha samples (`0.123`, `0.302`,
  `0.120`, `0.369`, `0.878` frame peak) before the preview cleared at LAND.
  Real live property acquisition, declined purchase, and station coins were
  observed. Chance/Khí Vận landing, house/hotel construction, and focused card were not
  reached in this short authoritative session; the deterministic fixtures
  cover those paths.
- **Electron visual/semantic smoke: NOT RUN.** The Win32 package was rebuilt,
  but this session did not have cross-application Electron capture/control.
  Packaging success is not counted as visual UAT.

### 20.8 Requested behavior status and remaining gap

| Behavior | Result |
| --- | --- |
| Normal-alpha destination pulse, persists through WALK, clears at LAND | **PASS** by code/tests, deterministic visual harness, and live renderer diagnostics |
| Reduced Motion static destination highlight | **PASS** by test and harness control |
| One shared raised-rim coin geometry, PMREM coin-only reflection, deterministic 6:2:1 finishes/tilts | **PASS** |
| Bank/station/transfer shared coin system | **PASS** by shared path/diagnostics and visual fixtures |
| Punchier house/hotel/flag timing and speed synchronization | **PASS** by tests and deterministic fixtures |
| Initial/reconnect ownership does not replay acquisition pop | **PASS** by presentation boundary and static-sync behavior |
| Focused card `39%` with subtle 3D tilt, reveal composition, safe depth | **PASS** |
| Live browser gameplay coverage requested above | **PARTIAL PASS** |
| Electron visual/semantic smoke | **NOT RUN** |
| Normal draw-call target for active destination/hotel fixtures | **FAIL**; measured `218` and `215`, hard budget still passes |

Remaining gaps are limited to the two normal-budget fixture overages, live
Chance/Khí Vận/build/card paths not reached during this short server-backed
session, and Electron visual/semantic UAT not run. No gameplay-rule,
server-authority, V8, Phase 3 movement, reconnect, privacy, fixed-camera, or
Phase 5-audio gap was introduced.

## 21. Corrective pre-Phase-5 board proportion/readability pass (2026-08-23)

This client-only corrective pass closes the requested pre-Phase-5 board
proportion/readability scope. It changes no server rule, protocol, authoritative
state, movement baseline, dice/card contract, reconnect behavior, reduced-motion
semantics, presentation queue, or render architecture.

### 21.1 Final geometry and visual contract

- The canonical registry now uses `EDGE_TILE_WIDTH=1.6`,
  `EDGE_TILE_DEPTH=3.2`, `CORNER_SIZE=2.46`, and `TILE_GAP=0.05`. Body,
  surface, socket, foundation, frame and outer accent derive from this layout;
  there are no per-tile geometry overrides.
- `CENTER_PLATFORM_SIZE` derives from `INNER_TILE_SURFACE_BOUNDARY * 2`; the
  distorted-layout compensation `CENTER_PLATFORM_INSET=0.6` is removed.
  `BOARD_FRAME_WIDTH=0.14` and `CENTER_ORTHOGONAL_PATH_WIDTH=0.44` retain a
  continuous readable ring without overlapping the airport field. The middle
  foundation is `boardBase #70787b`, between the existing dark lower and light
  upper layers.
- Local SDF text remains inward-facing and capped at two lines. Final sizes are
  normal `0.40/0.33`, special `0.36/0.30`, with max width `94%` of the usable
  panel. The existing 70/30 panel and canonical SVG/icon anchors remain shared.
- Ownership remains the authoritative `ownedProps → BoardRenderModel →
  TileOwnershipLayer` path. The flag is now `0.56` pole height with cloth
  `0.48 × 0.25`, canonical player colors, and tile-local placement outside the
  upper panel so it remains separate from text, divider and buildings.
- Start derives its scale from tile `0`'s real corner panel and targets `92%`
  of usable corner width. Its planted left-pointing body, enlarged posts and
  label remain inside the corner surface.
- Jail now uses `72%` corner width and `68%` depth without the old `0.9` depth
  cap. Parking keeps the clean `78%` asphalt footprint while scaling actual
  cars `1.18×` and tightening their spacing. Go To Jail handcuffs use `89%`
  corner width and `82%` height; side railroad, utility, Chance and Khí Vận
  safe ratios remain unchanged.
- House/hotel dimensions and `tileAnchors` were enlarged together. Levels 1–4
  still render Nhà and level 5 still renders Khách Sạn; existing sequential
  build, hotel transition, recolor, reconnect and Reduced Motion paths remain.
- Fixed orthographic direction, distance and board/dice/station fit points are
  unchanged; `FixedBoardCamera` applies centralized
  `ORTHOGRAPHIC_READABILITY_ZOOM=1.08`. The board remains uncropped at `1280×720`,
  `1440×900` and `1920×1080`.

### 21.2 Deterministic UAT fixture and visual evidence

The existing `Phase4UatHarness` was extended with one static
`board-readability` scenario; no second harness was created. It renders all 40
semantic tiles, all four corners, short and two-line Vietnamese names, special
SVGs, unowned tiles, four canonical ownership colors, 1/2/4-house examples,
hotel, Start, Jail, Parking, Go To Jail, dice/station context and the grey
foundation. The four owned examples are tiles `1`, `3`, `6`, and `9` so the
fixture remains representative without adding unnecessary render load.

| Viewport | Visual result | Renderer diagnostics |
| --- | --- | --- |
| `1280×720` | Full board, natural side proportions, enlarged corners, readable text/icons/buildings, visible Start | `227` draw / `68,230` triangles |
| `1440×900` | Same fixed direction and complete ring; Start and station/HUD context remain visible | `227` draw / `68,230` triangles |
| `1920×1080` | Same proportions with clear center ring and all four sides/corners | `227` draw / `68,230` triangles |

The fixture is below the hard `<240` draw-call and `<100,000` triangle limits;
it is above the normal `≤210` target because it deliberately combines four
players with all four ownership/building cases. No budget constant was raised.
The stored captures are `corrective-board-readability-after-1280x720.png`,
`corrective-board-readability-after-1440x900.png` and
`corrective-board-readability-after-1920x1080.png`; the earlier 1280 capture is
the same-fixture before evidence for the proportion comparison. A separate
`roll-chance` check showed the dice arena at 1280×720 with `216` draw calls and
`76,304` triangles; only the existing Three.js deprecation warning appeared.

The same harness also completed `house-4` (`queue idle`, `build 4/4`), `hotel`
(`queue idle`, `build 5/5`), `construction-reduced` (`queue idle`, `active 0`)
and `owner-recolor` (`build 4/4`). Browser logs contained only the pre-existing
Three.js `THREE.Clock` deprecation warning; no runtime error was observed.

### 21.3 Validation status for this pass

| Gate | Result | Evidence |
| --- | --- | --- |
| Database migration status | **PASS** | `pnpm db:status`; migrations 001–008 applied |
| Root typecheck | **PASS** | `pnpm typecheck` |
| Workspace lint | **PASS** | `pnpm lint` |
| Full workspace tests | **PASS** | desktop 12; server 142 passed with 9 database-gated skipped; client 422 |
| PostgreSQL-backed server tests | **NOT RUN** | no `TEST_DATABASE_URL` execution in this pass |
| Production client build | **PASS** | `pnpm build`; existing large-chunk warning only |
| Focused board tests | **PASS** | board/layout, text, ownership, special, building and camera suites |
| Phase4UatHarness visual fixtures | **PASS** | board readability at all three viewports; building/reduced-motion fixtures above |
| Electron visual/semantic smoke | **NOT RUN** | no cross-application capture/control in this pass |
| Remote CI / push / merge | **NOT RUN** | not authorized |

The implementation is ready for Phase 5 as a local working-tree change. Live
multiplayer gameplay evidence and Electron visual evidence remain separate
unavailable gates, not inferred from the deterministic board fixture.
