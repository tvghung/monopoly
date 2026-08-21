# Phase 4 - Gameplay Actions and Presentation Orchestration

Status: Phase 4.2.2 final dice feel and rent feedback polish implemented; Phase 4.2.1
gameplay HUD hardening and dice visual polish implemented; Phase 4.2
board-centered dice and gameplay HUD implemented; Phase
4.0/4.1 contract audit: [04A_PHASE_4_0_CONTRACT_AUDIT.md](04A_PHASE_4_0_CONTRACT_AUDIT.md).
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
needed for authoritative roll identity and safe movement classification. Phase
4.2.2 now adds the bounded dice-feel and rent-feedback polish below without
expanding the gameplay protocol. It does not implement the richer Phase 4
visual/action polish described below.

### Phase 4.2.2 implemented slice

- Dice use the existing procedural geometry with an 8.5% edge radius, five
  edge segments, and separate level-10 spherical patches over the eight
  corners. The body uses the dice-only `diceBody` profile
  (`roughness: 0.16`, `metalness: 0.02`); face materials remain neutral white
  with `roughness: 0.18` and `metalness: 0.02`.
- Pips remain genuine instanced shallow-cylinder geometry, oriented to each
  physical face with a 21% die-width circular footprint. Their bodies are
  embedded behind the face plane and their caps are flush with the white face,
  with all six face orientations preserved.
- The visible dice arena floor was removed. Dice and the result total are
  positioned from the canonical `AirportField` top surface, keeping the board
  center free of a second visible floor.
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
- Server rent logs are emitted once, immediately before the authoritative
  payment queue starts, using the exact queued amount and shared money
  formatter. Dice-origin rent includes the dice total; rent reached through a
  card destination uses generic wording so the log does not invent a dice
  cause. Normal-property labels distinguish base rent, `1`-`4` houses, and a
  hotel; railroad and utility amounts use their existing server calculations.
- The Roll reset epoch clears both a pending command and a stale error. The
  legacy overlay no longer contributes a second live announcement source.

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

Plan:

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
unchanged. WebGL dice now use the shared `RoundedBoxMesh` with an 8.5% edge
radius and three bevel segments, a bright near-neutral white standard material,
dark three-dimensional sphere pips, all six physically mapped faces, and a small
face-plane epsilon to avoid coplanar z-fighting. The pips remain real geometry,
but the 21 pips for each die share one `InstancedMesh` draw.

The settled dice-only code-level budget measurement (arena surface and result
text excluded) changed from 56 draws / 3,408 triangles to 16 draws / 4,560
triangles. The triangle increase is the measured cost of the rounded body; the
draw reduction preserves the current 210 target-call and 240 stress-call
guardrails. This is a geometry-budget test, not a live viewport capture.

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

Plan:

- Detect a dedicated GO crossing only when the authoritative movement path or
  an approved server presentation signal proves that the token crossed GO.
- If crossing is not provable, present the committed balance change without
  claiming a GO reward.
- When proven, use a compact GO tile pulse, positive amount cue, and HUD
  update. Keep it non-blocking and shorter than the movement sequence.
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
decision, reconnect while the prompt is open, and a purchase that changes the
turn-resolution state.

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

The future visual may use a floating amount, directional emphasis, and HUD
count-up/count-down. It must not simulate individual coins or require a
permanent particle loop. Test:

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
authoritative tile state. Phase 4 should add a short presentation around the
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
