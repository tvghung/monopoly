# Own the Block — Phase 4.0 Authoritative Gameplay → Presentation Contract Audit

Status: Phase 4.1 implementation-slice audit and Phase 4.2 handoff. The
authoritative roll-identity slice is implemented; richer cause/card/transfer
contracts remain open.

Implementation note (2026-08-22): the bounded remaining client slice consumes
the already-audited public deltas for generic balance, ownership, development,
and proof-gated GO feedback, plus authoritative decision ACK/reset guards. It
does not change the audit verdict or add movement-cause, card-identity,
transfer-attribution, or private-visibility contracts.

Audit date: 2026-08-20 (Asia/Ho_Chi_Minh)

Audited branch: `overhaul/phase-4-gameplay-actions`

Audited base: `5881bbd docs: audit phase 4 gameplay presentation contract`

Phase 3 baseline: `34944d9 feat: complete phase 3 character appearance and movement system`

Primary companion plan: [04_PHASE_4_GAMEPLAY_ACTIONS.md](04_PHASE_4_GAMEPLAY_ACTIONS.md)

## 1. Executive verdict

## PHASE 4.1 READY FOR PHASE 4.2

The Phase 4.1 roll-identity slice is complete. `BoardState.rollSequence` is a
server-owned, public, durable non-negative safe integer. It starts at zero,
increments once inside the committed gameplay `roll dice` transaction after
eligibility and dice generation, includes jail attempts, excludes starting-
player tie-break rolls, and is unchanged by rejected or rolled-back commands.

Protocol and room snapshots are now V6. Existing V5 snapshots receive a zero
baseline through the forward migration, without reconstructing historical roll
count. `ROLL_DICE` derives from an exact one-step sequence advance, so an
identical ordered face pair is still a new roll. Session/reconnect/spectator
resets snap both dice faces and sequence without replaying the baseline.

Movement remains intentionally conservative: a transition is `WALK` only when
the next authoritative dice result and consecutive roll sequence prove the
ordinary destination for the previous current player; all other or ambiguous
relocations use `SNAP`. This resolves the short-distance false-walk risk for
this slice without claiming that the general movement-cause contract exists.

P4-D-002 remains open for semantic movement/card/teleport choreography.
P4-D-003 and P4-D-004 also remain open. This readiness statement is for the
bounded Phase 4.1 foundation and does not authorize those richer contracts.

The following are safe only within the conditions recorded below:

| Safe slice | Current proof | Boundary |
| --- | --- | --- |
| Authoritative board/state updates | Transactional server command, committed room revision, public/private projection | The presentation may show the final state without claiming a hidden cause. |
| Generic balance, ownership, development, jail, finish, turn, and winner feedback | Structured public fields and deterministic snapshot deltas | Do not label payer, receiver, card, GO, bankruptcy cause, or user intent unless the proof conditions hold. |
| Purchase/development completion cues | Pending operation plus constrained ownership/house transition | A cleared decision alone does not prove BUY, BUILD, HOTEL, or user SKIP. |
| Normal movement hops | Only a proven bounded forward route | Current adapter does not prove that route for cards, teleports, backward movement, or jail. |
| Private offer/forced-sale UI | Private socket events and participant-scoped projection | It is not available to the public presentation adapter. |

The Phase 4.1 gate is therefore: resolve the public roll identity contract,
then decide whether richer movement, card, and transfer choreography is
needed. A generic state-driven implementation may be prepared as a separate
approved slice, but it must not silently claim to satisfy the blocked gates.

### Audit classification legend

| Class | Meaning in this audit |
| --- | --- |
| A | Existing authoritative structured state is sufficient for a safe generic presentation. |
| B | Client-only presentation metadata or sequencing is sufficient and must not change gameplay or visibility. |
| C | A new presentation cue may be derived from a proven transition, with explicit audience, duplicate, and reconnect rules. |
| D | The current state/projection cannot prove the semantic fact; a shared/server/protocol contract decision is required. |

Evidence labels used below are `PROVEN` for directly observed
structured behavior, `CONDITIONAL` when all listed proof conditions
must hold, `PRIVATE` for participant-scoped information,
`DISPLAY-ONLY` for logs or visual state, and
`NOT PROVEN` when the current contract cannot establish the fact.

## 2. Authority map

The audit treats the server/GameCore as the source of gameplay truth and the
client as a renderer of committed state.

| Boundary | Observed owner | Evidence | Presentation implication |
| --- | --- | --- | --- |
| Random dice | Server | `apps/server/src/game/dice.ts:rollDice` uses two server-side random 1–6 values. | The client never predicts a face or derives one locally. |
| Movement and GO | Server | `moveBy`, `moveToTile`, and `moveToJail` mutate the authoritative player. | A destination is safe; a route and cause require proof. |
| Tile effects and cards | Server | `apps/server/src/game/tiles.ts:resolveTile/applyCard` draws and resolves effects synchronously. | The client receives resulting state, not an implicit DRAW/CONTINUE workflow. |
| Money and payments | Server | `payment.ts` and `paymentResolution.ts` create, settle, wait, liquidate, or resolve claims. | A balance delta is safe; payment attribution is conditional. |
| Ownership and development | Server | `transfer.ts`, `property.ts`, and turn handlers validate and mutate property state. | Use pending operation context and resulting owner/house state. |
| Jail | Server | `socket/jail.ts`, `handleJailRoll`, and tile resolution own bail, cards, waiting, doubles, and jail effects. | Generic jail state is safe; cause-specific copy is not universal. |
| Bankruptcy, leave, winner | Server | `turn.ts` and `bankruptcy.ts` remove players, record reason, clear assets, and select the winner. | Use structured finish reason; never infer bankruptcy from zero alone. |
| Durable room revision | Persistence transaction | `roomCommandExecutor.ts` loads with a lock, executes, saves expected aggregate version, and runs post-commit work. | One committed command may contain many internal gameplay steps. |
| Public state | Server projection | `services/publicState.ts:projectPublicRoomState` exposes public board/player/decision/shortfall fields and deck counts. | Hidden deck order and private terms stay out of public presentation. |
| Private state | Server projection and private socket events | `projectPrivatePlayerState` and private offer/proposal events are participant-scoped. | A public snapshot adapter cannot use private event identity. |
| Snapshot acceptance | Client | `App.tsx:applyRoom` rejects stale/same versions and passes only live public snapshots to the controller. | Reconnect/session sync snaps instead of replaying history. |
| Presentation | Client | `PresentationController` diffs accepted public snapshots into the single `AnimationQueue` and `PresentationStore`. | It cannot authorize a command or recover facts absent from the projection. |

The authority sequence is:

~~~text
command validation
  -> room FIFO and database/in-memory transaction
  -> authoritative domain mutation
  -> expected-version save and commit
  -> public/private projection
  -> socket delivery
  -> client snapshot diff
  -> presentation queue/store
~~~

## 3. Command, revision, and broadcast matrix

The server normally broadcasts the committed room state before invoking the
success acknowledgement. The acknowledgement revision is evidence that a
commit occurred; it is not currently used as a presentation event identity.

| Command/family | Authoritative commit | Public delivery | Private delivery | ACK/broadcast ordering | Audit result |
| --- | --- | --- | --- | --- | --- |
| Roll dice | Set dice, increment `rollSequence`, mark moved, move/resolve tile, possibly settle or open payment/pending decision | Public `update` with faces and `rollSequence` | Private player state when changed | Broadcast, then ACK with aggregate revision | One committed gameplay roll has one public sequence identity, including repeated faces; one final revision may still contain the full roll resolution. |
| Buy property | Validate pending purchase operation, debit, transfer to bank-owned purchase, clear decision/advance | Public update | Private state if affected | Broadcast, then ACK with revision | Purchase completion is conditionally provable from pending operation plus owner transition. |
| Do not buy | Validate pending operation, clear decision/advance | Public update | None normally | Broadcast, then ACK with revision | Clearing the decision does not distinguish explicit decline from expiry/timeout. |
| Resolve houses/hotel | Validate pending development operation, debit, mutate houses, clear decision/advance | Public update | Forced-sale cancellations/private state where relevant | Private cancellation, broadcast, then ACK | Resulting development delta is structured; action intent is only conditional. |
| Sell house | Validate owner and house count, refund fixed half-cost, mutate property | Public update | Offer cancellations/private state where relevant | Private cancellation, broadcast, then ACK | A constrained house decrease plus exact refund can support a conditional sell cue. |
| Pay bail/use jail card/wait | Validate jail state and action; pay or consume card, or advance turn | Public update | Private jail-free holder state when changed | Broadcast, then ACK | Jail state is authoritative; wait and failed roll can look similar to the adapter. |
| Bank sale | Validate active claim/debtor/property/deadline, sell, progress queue | Public update | Private state/proposal changes as relevant | Private events, broadcast, then ACK | Shortfall may resolve inside the same revision; do not wait for a queue that is no longer public. |
| Forced-sale propose | Persist participant-scoped proposal without transferring property | Public update for public state, private proposal to seller/buyer | Proposal to seller/buyer only | Private proposal, broadcast, then ACK with proposal data/revision | Terms are private; public presentation must not expose them. |
| Forced-sale accept/reject | Validate proposal; accept transfers and progresses queue, reject clears proposal | Public update when state changes | Clear/result to participants | Private clear/result, broadcast when needed, then ACK | Public ownership/balance alone does not prove forced-sale attribution. |
| Trade make/decline | Durable offer row/result; no board state change for make/decline | No public board broadcast for offer-only paths | Offer/result to participants | Private event, ACK | Not a public presentation transition. |
| Trade accept | Execute voluntary cash/property/card transfer, resolve offers, append log | Public update | Private result/cancellations | Private events, broadcast, then ACK with revision | Public diff may resemble rent, sale, purchase, or another transfer. |
| Leave/surrender | Settle or liquidate as rules require, record `LEFT` or `BANKRUPT`, update membership/winner | Public update | Private cancellations/state | Private events, broadcast, then ACK | Structured finish reason is the proof when present. |
| Start game | Choose starting player, shuffle private decks, initialize game | Public update | Private state as needed | Broadcast, then ACK | Deck order remains hidden; starting state is committed. |
| Resume session | Validate resume and return full session result | Full state in ACK, followed by broadcast path | Private resume data | ACK precedes the follow-up broadcast in this special path | This is an exception and must not be generalized to gameplay handlers. |
| Deadline recovery | Commit expiry/settlement/liquidation through the same room command path | Public update | Proposal cancellation/clear events | Private events, broadcast after commit | Can produce a complete resolution without a user command or visible intermediate queue. |

## 4. Atomic revision matrix

The following describes what observers can receive after one committed command.
It does not treat internal function calls as separate public events.

| Scenario | Internal authority path | Public fields in the final snapshot | Private/hidden facts | What the client may safely present |
| --- | --- | --- | --- | --- |
| Normal roll to an unowned property | Roll, move, resolve tile, create pending purchase, stop | Dice, final tile, balance if GO, logs, pending purchase, current player/hasMoved | Exact random generation and internal call order | Dice result if uniquely identified; bounded walk only if route is proven; landing and purchase context. |
| Normal roll to self-owned property | Roll, move, resolve tile, create pending development | Dice, final tile, pending development, owner/houses | Development legality checks and group details | Landing and development context from pending decision; no speculative cost. |
| Affordable rent | Roll, move, create claim, settle claim, complete turn | Dice, final tile, both public balances, logs, next turn; no active shortfall | Claim creation and settlement order; operation/claim may not survive in public state | Generic balance changes and turn/landing state; payer/creditor only under explicit pairing proof. |
| Rent/card payment shortfall | Roll/effect, create claim, settle available amount, wait | Public `paymentShortfall` with debtor, creditor, amount, remaining amount, source, deadline, claim/operation IDs, sellable properties | Exact internal queue transitions and private proposal terms | Debt panel and exact exposed shortfall; no assumption that the queue existed in an earlier snapshot. |
| Positive movement across GO | `moveBy` or qualifying `moveToTile` awards 200 | Final tile, increased balance, log, possibly pending decision/turn | Whether the public balance increase is the GO reward or another reward if no path proof | GO cue only when route/cause is proven; otherwise generic balance change. |
| Card reward/penalty with no unresolved payment | Draw/apply card, possibly continue resolution, complete | Final tile/balance/jail/turn/pending state, logs, deck counts | Card identity and exact effect source are not uniformly projected | Resulting structured state; special tile pulse without naming a card. |
| Card movement or card chain | Draw card, move absolute/relative, resolve destination; may draw another card | One final tile and balance/turn/pending state, public logs, deck counts | Intermediate card IDs, intermediate destinations, and chain order are not structured | Destination snap or bounded walk only when separately proven; never reconstruct a chain from logs. |
| Card sends player to jail | Draw/apply `goToJail`, set tile 10 and jail | Tile 10, `isJail` true, logs, turn/pending state | Whether card, tile, or another rule caused it | Generic jail transition and destination; cause-specific label is not proven. |
| Failed jail roll | Set dice, leave jail true, log failure, complete turn | Dice, unchanged tile/jail, current-player/turn change, logs | Failure reason is a string; no structured failure event | Dice only if roll identity is solved, jail remains; do not promise a distinct failed-roll cue. |
| Successful jail double | Set dice, clear jail, move, resolve destination | Dice, jail false, final tile, balances/pending/turn as applicable | Double semantics are not encoded separately from dice faces | Conditional jail-release movement if the transition is proven; generic state otherwise. |
| Wait in jail | Complete turn with jail unchanged | No dice change, unchanged tile/jail, current-player/turn change, logs | User selected WAIT versus deadline/other handoff | Turn/jail state; no failed-roll copy. |
| Purchase commit | Debit, transfer property to player, clear pending, complete | Owner changes to player, houses 0, balance decreases, pending clears, turn advances | Command identity is not in the public snapshot | Conditional purchase confirmation using pending operation and owner transition. |
| Development commit | Debit, change houses, clear pending, complete | Same owner, house count increases, balance decreases, pending clears, turn advances | BUILD/HOTEL action identity not separately emitted | Conditional build/hotel result; generic development delta is always safe. |
| Bank house sale | Refund, decrement houses, progress any payment queue | Same owner, houses decrease, seller balance increases, possibly shortfall/finish | Bank sale command identity and claim order | Conditional sell-house/refund cue; do not infer if the exact constraints do not hold. |
| Forced-sale accept | Buyer debit, seller credit, transfer property, progress claim | Ownership and balances change; possibly shortfall/finish | Proposal terms are private; public pair may resemble a trade | Generic ownership/balance; participant-only private result can drive private UI. |
| Voluntary trade accept | Cash/property/card exchange, resolve offers, log | Public balances and property owners change; jail-free count may change | Offer terms and cards are private to participants | Generic public changes; participant private result may show trade outcome, but the presentation adapter does not currently consume it. |
| Leave/bankruptcy | Settle/liquidate/remove player, record reason, update winner | Player removed/finished list, balances/ownership, winner, logs | Exact liquidation sequence may collapse | Finish reason when present; never equate temporary zero balance with bankruptcy. |

## 5. Public/private visibility matrix

| Fact | Public projection | Participant/private projection | Hidden or not structured | Presentation consequence |
| --- | --- | --- | --- | --- |
| Current tile, balance, jail flag, character, color | Yes | Yes | No | Class A generic state. |
| Dice faces and roll identity | Yes in `diceValue` and `rollSequence` | Yes | No additional private copy | Faces and sequence are authoritative; sequence identifies each committed gameplay roll. |
| Exact deck order | No; only `deckCounts` | Private deck state is server-held, not generally sent | Yes | Never animate or infer future order. |
| Drawn normal card identity | No uniform public/private field | Not delivered as a general card-reveal event | Yes except contextual cases below | Generic result only unless a safe signal is approved. |
| Active payment source | Yes in `paymentShortfall.source` | Yes | The queue may have already settled | A live shortfall can expose a CARD cardId to every viewer. |
| Held jail-free card IDs | No; public count only | Exact holder IDs | Other viewers | Holder can identify private card use; public adapter cannot. |
| Forced-sale amount, expected houses, expiry | No | Seller/buyer only in proposal | Yes to other viewers | Keep proposal UI participant-scoped. |
| Sellable properties/gross prices in active shortfall | Public | Yes | No | Debt UI can show public liquidation choices; do not expose private proposal terms. |
| Trade offer terms | No | Offer participants only | Yes to other viewers | Offer/decline is private; no public semantic event. |
| Player finish reason | Public finished-player reason when set | Yes | Optional type field can be absent in legacy/fixture state | Use structured reason when present; fall back to generic finish otherwise. |
| Human-readable logs | Public strings | Same room visibility | Not authoritative structured data | Display only; never parse for event identity, cause, or route. |

Important privacy finding: the public projector intentionally exposes only deck
counts, but an active payment shortfall copies the structured `CARD`
source including `cardId` into public state. This is not the same as
exposing deck order, but it is a real card-identity exposure to all room
viewers and must be treated as an audience policy decision.

## 6. Presentation-layer evidence

### 6.1 Snapshot acceptance

`App.tsx:applyRoom` rejects an incoming snapshot whose version is
stale or equal to the accepted version. Live public updates are passed to
`PresentationController.acceptRoomSnapshot` with source
`LIVE_UPDATE`. Session, spectator, and reconnect synchronization
resets the presentation store and queue instead of replaying old history.

Private offers, private player state, and forced-sale proposal events update
React state but are not passed into the presentation controller. This is the
correct privacy boundary for the public adapter, but it means the controller
cannot use participant-only event identity.

### 6.2 Current derived event order

For one accepted live snapshot, the current adapter compares the previous
accepted public snapshot and emits, in this order:

~~~text
ROLL_DICE
MOVE_CHARACTER
LAND_TILE
BALANCE_CHANGED
PROPERTY_OWNERSHIP_CHANGED
PROPERTY_DEVELOPMENT_CHANGED
JAIL_STATE_CHANGED
PLAYER_FINISHED
TURN_CHANGED
GAME_FINISHED
~~~

This is a deterministic local ordering, not an authoritative causal order.
The adapter does not inspect command names, ACK data, logs, deck counts,
pending operation IDs, payment source, or private events.

Non-roll event IDs remain locally derived from room, accepted revision, event
type, and entity. `ROLL_DICE` uses the public room/`rollSequence` pair so a
newer sequence remains distinct even when faces are identical. Session,
spectator, and reconnect snapshots are reset and never replay a baseline.

### 6.3 Queue and store

`PresentationController` uses one `AnimationQueue`.
Events from a later accepted live revision append behind events already
playing; there is no requirement that the queue drain before the next update.
The movement executor walks the locally derived route and never receives an
authoritative route.

`PresentationStore` separates display position from settled position and keeps
the presented `displayRollSequence` beside the presented dice faces. A live
sequence advance publishes the result even when both faces match; reset snaps
both values and increments the presentation reset epoch without a tumble.
Purchase and development prompts use settled arrival, while the authoritative
render model updates from the new snapshot immediately. Skip, reset, and
reconnect use generation/reset protections so stale executors cannot mutate a
new accepted snapshot.

The current queue serializes the entire derived event list. The Phase 4 plan
describes safe overlap for harmless cues, but that is a future sequencing
decision, not current behavior.

## 7. Dice identity audit

| Check | Observed behavior | Result |
| --- | --- | --- |
| Server result authority | `rollDice()` generates the two faces on the server. | Proven. |
| Public result | `BoardState.diceValue` contains `dice1`/`dice2` and public `rollSequence`. | Proven and uniquely identified per committed gameplay roll. |
| Snapshot diff | `derivePresentationEvents` emits `ROLL_DICE` only when `next.rollSequence === previous.rollSequence + 1`. | Repeated faces remain a distinct roll; gaps do not fabricate missing rolls. |
| Ordered swap | `(2,3)` to `(3,2)` is a visible change. | Emits, although it is a different ordered value. |
| Exact repeat | `(2,3)` to `(2,3)` can be a legal next roll. | The higher `rollSequence` emits one derived roll event. |
| Dice visual identity | `Dice.tsx` uses the presented `displayRollSequence` and reset epoch. | Exact repeat tumbles once; reset/reconnect settles without replay. |
| ACK correlation | Gameplay ACKs include the committed aggregate revision, but App command wrappers ignore successful ACK data/revision. | No command-to-roll bridge. |
| Reconnect | Session/spectator sync resets to current faces and `rollSequence` without replaying the prior roll. | Correct recovery baseline; the next live sequence advance can present normally. |

No server rule prevents two consecutive legal rolls from producing the same
ordered pair. The public sequence now identifies that second committed roll;
the sequence is persisted with the room snapshot and V5 rooms start at zero
when upgraded to V6. Starting-player tie-break rolls do not advance it.

Classification: P4-D-001 resolved for this slice. Do not replace the server
sequence with a room revision, log comparison, random client value, or local
click counter.

## 8. Movement and cause audit

### 8.1 Server movement facts

- `moveBy` updates only the final tile and awards GO when a positive
  step count crosses the board boundary.
- `moveToTile` updates only the final tile and may award GO when an
  absolute destination is at or before the source for a non-GO source.
- `moveToJail` sets tile 10 and jail state without a GO reward.
- Relative negative movement does not award GO.
- Card resolution may move, resolve the destination, draw another card, and
  continue synchronously until payment or a pending decision stops it.

### 8.2 Client route heuristic

Phase 4.1 keeps the forward-distance calculation only as the geometric part
of the existing executor. It emits `WALK` only when all of these conditions
hold: the roll sequence advanced exactly once, the previous current player is
the moved player and was legally ready to roll, the next dice faces are valid,
and the observed destination equals the dice destination from the previous
tile. A jailed player must have rolled doubles and left jail. Every other
transition, including a sequence gap or unsupported cause, emits a
destination `SNAP`.

The previously observed threshold-only adapter created concrete false-walk
cases; Phase 4.1 now handles these transitions as follows:

| Authoritative cause | Example final transition | Phase 4.1 adapter result | Finding |
| --- | --- | --- | --- |
| Chance absolute move | Tile 36 to tile 39 or tile 22 to tile 24 | SNAP unless the dice proof independently matches | Absolute card relocation is not treated as ordinary walking. |
| Chance/chest move to GO | Tile 36 to tile 0 or tile 33 to tile 0 | SNAP unless the dice proof independently matches | A card move is not inferred from a short delta. |
| Card go-to-jail | Tile 7 to tile 10 or tile 2 to tile 10 | SNAP | Jail teleport is not treated as a walk. |
| Card back-three | Tile 36 to tile 33 | SNAP because forward distance is 37 | Destination is safe, but cause and route remain hidden. |
| Card chain | Tile 36 to tile 33, then chest effect | SNAP for the collapsed final transition unless the dice proof matches | Intermediate movement/card chain is collapsed. |
| Direct jail/tile effect | Any source to tile 10 | SNAP | Direct movement cause is not in the public diff. |

The conservative Phase 4.1 rule is therefore:

```text
PROVEN DICE ROUTE -> WALK
OTHER / AMBIGUOUS -> SNAP
```

The general movement-cause/route gap remains open; this slice does not add
card, teleport, or route metadata.

Classification:

- Normal movement path: Class A/B only after the roll and cause gates are
  satisfied.
- Cause-specific route, teleport, card chain, and semantic jail movement:
  Class D.
- A client-side threshold change is not a fix; it can only reduce false walks
  while still misclassifying other legal transitions.

## 9. GO audit

The server owns both crossing and the amount:

- Positive `moveBy` awards exactly `START_REWARD` when
  `from + steps >= 40`.
- Absolute `moveToTile` can award the same reward when a non-zero
  source moves to a destination at or before the source.
- Negative movement and `moveToJail` do not award GO.
- Expense/tax tiles currently log a no-payment message and do not debit the
  player.

A destination alone cannot prove a crossing. A balance increase alone cannot
prove GO because card rewards and other bank-to-player changes can produce a
similar delta. The public log is display-only and is not a proof source.

Classification:

- Generic balance change: Class A.
- GO cue: Class C only when the authoritative route/cause is proven by a
  future approved signal or by the strict normal-roll conditions.
- Universal destination-based PASS_GO: Class D and rejected.

## 10. Card audit

The canonical shared data contains 13 Chance cards and 15 Chest cards. The
server draws from private shuffled decks, applies the effect, returns ordinary
cards to the deck, and withholds jail-free cards as held private IDs.

Observed effect families include:

- absolute and relative movement;
- go to jail;
- reward and penalty;
- pay each player and collect from each player;
- jail-free card.

The card message is appended to a public human-readable log, but there is no
uniform structured public/private card-draw event. The public projector exposes
deck counts only, except that an active public payment shortfall includes its
structured CARD source and card ID. A holder's exact jail-free IDs are private,
while other viewers see only the count.

Card movement/effect chains can collapse into one committed public snapshot.
The existing server tests prove a chain from tile 36 through a Chance back-three
to tile 33 and a Chest reward, with both messages in logs but no structured
intermediate presentation record. The log therefore cannot be used to recover
the chain.

Classification:

- Special-tile landing pulse and resulting state: Class A/B.
- Active CARD shortfall source: existing structured public data, but requires
  explicit privacy review because it exposes `cardId` to viewers.
- Holder-specific jail-free use: private structured state for the holder.
- General card identity, effect, chain, or readable card-face reveal: Class D.
- Parsing logs to recover card identity/cause: rejected.

## 11. Payment and transfer audit

### 11.1 Payment queue visibility

Payment creation is server-internal. `progressPaymentQueue` can:

1. settle affordable claims immediately;
2. leave a public shortfall when the debtor still has assets;
3. liquidate/remove a debtor and continue when no assets remain; or
4. complete the entire continuation inside the original command.

Therefore an affordable compulsory rent/card payment may leave no public queue
at all. A later presentation layer must not require an intermediate
`paymentShortfall` snapshot.

When a shortfall remains, the public projection exposes debtor, creditor,
amount, remaining amount, deadline, operation/claim IDs, source, and sellable
property summary. An active CARD source includes the card ID.

### 11.2 Balance attribution

`BALANCE_CHANGED` is safe as a generic per-player delta. A payer,
receiver, cause, or bank direction is safe only if one committed revision (or
approved operation) provides:

- one unambiguous payer and receiver;
- exactly matching amount/sign;
- no competing trade, bail, purchase, development, reward, sale, or
  multi-claim explanation; and
- audience visibility for the parties and cause.

The current public diff does not carry a universal transfer record. Voluntary
trade, forced sale, rent, bank sale, purchase, bail, development, card reward,
and card payment can produce overlapping balance/ownership patterns.

Classification:

- Generic balance cue: Class A.
- Narrow paired transfer cue: Class C after explicit proof.
- Universal rent/tax/card/purchase/forced-sale label: Class D.

## 12. Purchase and development audit

### 12.1 Purchase

A purchase completion can be conditionally proven from the current public
projection when all of the following are true:

1. The previous snapshot has a `PURCHASE` pending decision with
   operation ID, player ID, tile ID, and price.
2. The next accepted revision has no stale replacement pending decision for
   that operation.
3. The property was unowned in the previous snapshot and is owned by the
   pending player in the next snapshot with the expected initial house count.
4. The public transition is not a reconnect/session reset.

The owner transition is the decisive proof; balance decrease is supporting
evidence and must not be used alone. A cleared pending decision without the
owner transition does not prove explicit decline because expiry/deadline
resolution can produce the same outcome.

Classification: generic ownership Class A; purchase confirmation Class C
under the listed proof; user DECLINE intent Class D unless a command/operation
signal is correlated.

### 12.2 Development

A build/hotel result can be conditionally proven when the previous snapshot
contains the matching `DEVELOP_HOUSES` or
`UPGRADE_HOTEL` pending operation, the next snapshot clears it, the
same owner remains on the tile, the house count changes by a legal result, and
the balance delta matches the authoritative unit-cost contract. The current
server prevents selling a house while a pending development decision exists,
which makes this proof stronger than a bare house-count diff.

A generic development delta is always Class A. The exact BUILD versus HOTEL
label is Class C only when the level transition and pending kind prove it. A
cleared decision with no development change does not prove explicit SKIP
because timeout/disconnect handling can resolve the same pending state.

House sale has a separate conditional proof: same owner, house count decreases,
and balance increases by the exact server refund for the sold house, without a
property transfer. Otherwise present a generic development/ownership change.

## 13. Jail audit

The public state proves the current tile and `isJail` flag, and the
private projection can prove a holder's jail-free card change to that holder.
It does not provide a universal cause field.

| Transition | What is proven | What remains ambiguous |
| --- | --- | --- |
| Tile 10/jail false to true | Player is now jailed at tile 10 | Card, jail tile, or another server cause. |
| Jail true to false with no movement and balance -50 | Strong evidence for pay bail under current handlers | No command identity in the public snapshot; avoid universal label without operation correlation. |
| Jail true to false with private jail-free count/ID decrease | Strong private evidence for card use | Other viewers cannot see exact card ID. |
| Jail true to false with movement and a new dice result | Consistent with a successful jail double | Roll identity and exact movement cause still require the dice gate. |
| Jail remains true, tile unchanged, turn advances | Consistent with failed roll or wait | The current adapter ignores log semantics and does not expose a cause. |
| Jail release while turn handoff occurs without movement | Can be the server's jail-round release | Not a user action event. |

The existing JailPanel is correctly server-gated, but it does not separately
wait for the presentation queue to become idle. This is an interaction
sequencing consideration for Phase 4.1, not permission to delay authoritative
jail state.

## 14. Debt, forced sale, and bankruptcy audit

- An active public shortfall is the authoritative debt action surface.
- The debtor may liquidate a property to the bank; the server computes the
  fixed gross price, updates ownership, and progresses the queue.
- A forced-sale proposal carries participant-private terms including proposal,
  payment operation/claim, seller, buyer, tile, gross price, expected houses,
  and expiry.
- Accepting a forced sale can transfer property, change balances, and resolve
  the claim in one committed revision.
- Deadline recovery uses the same commit path and can settle, liquidate, or
  finish a player without an interactive command.
- Ordinary balance zero is solvent; the current bankruptcy check removes a
  player when balance is negative or the payment path exhausts recoverable
  assets.
- Current removal paths write structured `BANKRUPT` or
  `LEFT` reasons to `finishedPlayers` and the public
  projection exposes that reason when present.

Safe presentation:

- Show public debt state while it exists.
- Keep forced-sale terms and accept/reject results participant-scoped.
- Use structured finish reason when present.
- Never infer bankruptcy from a temporary zero balance, a balance decrease, or
  a log string.
- Do not require an intermediate queue snapshot before showing a final
  bankruptcy/finish state.

Classification: debt/shortfall/finish fields Class A; private forced-sale UI
Class A through the private path; participant-only forced-sale semantic cue
Class C only with private event consumption; generic public forced-sale or
bankruptcy-cause label Class D.

## 15. Voluntary trade audit

Make-offer and decline flows are private and do not publish a board state
transition for the offer itself. Accept executes the cash/property/card
exchange, resolves the offer, appends a public log, emits private results, and
broadcasts the changed public state.

The public presentation adapter receives only the public snapshot. It does not
consume the participant-private accepted/cancelled events. A public balance
pair and ownership changes can therefore look like rent, forced sale, bank
sale, purchase, or another transfer. A jail-free card change may be visible as
only a count change to other viewers.

Classification:

- Generic balance/ownership/card-count changes: Class A.
- Participant-only trade confirmation: Class C if the private event is
  intentionally connected to a private presentation path.
- Universal public TRADE label from snapshot diff: Class D.

## 16. UI gating audit

| Surface | Current gate | Evidence | Phase 4.1 implication |
| --- | --- | --- | --- |
| Roll dice | Connected, mutable player, in-progress game, current player, not moved, all settled positions equal authoritative positions, presentation queue idle | `Dice.tsx` and `App.tsx:canMutate` | Retain; consume the authoritative `rollSequence` without local prediction. |
| Buy prompt | Mutable current player, matching pending PURCHASE, local token settled at authoritative tile | `BuyPrompt.tsx` and `Dashboard.tsx:tokenArrived` | Correctly prevents action before visual arrival; server operation ID remains authority. |
| Development prompt | Mutable current player, matching pending development, local token settled | `DevelopmentPrompt.tsx` | Same boundary; do not infer operation from a generic landing. |
| Jail panel | Mutable current player and public jail state | `JailPanel.tsx` | Does not separately wait for queue idle; keep authoritative control visible. |
| Debt panel | Mutable debtor and public shortfall; forced-sale panel uses private proposal | `DebtPanel.tsx` | Can appear while board motion is still queued; any change needs a deliberate UX decision. |
| Trade offer | Mutable connected game participant plus public owner/private card state | `TradeOfferModal.tsx` and offer hooks | No presentation-idle gate and no public semantic event. |
| Board render | Authoritative ownership/buildings plus presentation display positions/signals | `boardRenderModel.ts` and `Board.tsx` | State correction is immediate; visual settling is separate. |

Successful command ACK metadata and revision are currently ignored by the
client wrappers. The authoritative update remains the effective client
sequencing input. This is a Class B client integration gap for presentation
correlation, but the server's broadcast-before-ACK ordering means ACK alone
cannot be used as a pre-update animation boundary without a deliberate change.

## 17. Ordering and concurrency audit

### 17.1 Server

- Room commands are serialized through a per-room FIFO tail.
- The persistence transaction loads the room with a lock, executes domain
  logic, saves the expected aggregate version, and commits before post-commit
  broadcast work.
- A single command can contain a full movement/card/payment/turn handoff.
- Deadline recovery enters the same commit path.
- Normal gameplay handlers generally broadcast public/private state before
  returning the success ACK with the committed revision.
- Resume is a documented exception: it returns the full ACK and then invokes a
  broadcast path.

### 17.2 Client

- Each accepted live revision is diffed immediately.
- Multiple revisions can append to the single FIFO animation queue while an
  earlier revision is still playing.
- If intermediate snapshots are not delivered, the adapter derives only the
  previous-to-next transition; it cannot recover intermediate card/payment
  steps.
- Session/reconnect updates reset/snap and do not replay stale history.
- Skip/reset generation guards protect the store from stale executor
  completion.

### 17.3 Consequence

The presentation contract must be defined over committed snapshots and
approved structured metadata, not over presumed one-command/one-visual-step
behavior. Internal queue creation, logs, and ACK timing are not sufficient
semantic evidence.

## 18. Gap register and Class D options

| ID | Gap | Class | Status | Owner | Smallest safe next step |
| --- | --- | --- | --- | --- | --- |
| P4-D-001 | Repeated ordered dice pair has no per-roll identity | D/P0 | RESOLVED in Phase 4.1 | Shared type, server roll handler/projector, client adapter/Dice, V6 migration and tests | Keep `rollSequence` authoritative, public, durable, and reset-safe. |
| P4-D-002 | Movement cause/route is absent; bounded forward diff can false-walk card/jail/absolute movement | D | OPEN for semantic route choreography; conservative fallback implemented | Server movement projection and shared contract | Approve cause/route metadata only if richer route choreography is required; otherwise retain proven dice route → WALK, other/ambiguous → SNAP. |
| P4-D-003 | General card identity/result/chain is absent | D | OPEN | Server projector/shared visibility contract | Approve audience-scoped card-resolution metadata; never use logs or deck order. |
| P4-D-004 | Public balance/ownership diff lacks universal transfer attribution | D | OPEN | Server command/event contract and client adapter | Approve a structured transfer signal with audience and operation identity, or keep generic deltas. |
| P4-B-001 | ACK revision is ignored and normal broadcast precedes ACK | B | Confirmed sequencing gap | Client command/presentation integration | Use accepted snapshot revision for correlation only after the roll identity/order contract is settled. |
| P4-B-002 | All derived events currently serialize, while the plan permits safe overlap | B | Confirmed implementation mismatch | PresentationController/queue | Decide overlap per event family and test queue append/skip; no second queue. |
| P4-A-001 | Jail, debt, and trade panels do not use a presentation-idle gate | A/B | UX sequencing risk | Client decision surfaces | Decide deliberately whether these authoritative controls remain immediately visible; do not hide debt behind effects. |
| P4-PRIV-001 | Active public CARD shortfall exposes cardId | A/D policy | Confirmed visibility decision | Shared public projector/product policy | Decide whether the existing public source is acceptable; change projection only through an approved contract. |
| P4-STATE-001 | Decline, skip, timeout, and some jail causes collapse to similar final state | D for exact intent | Confirmed | Shared command/transition metadata if copy is required | Keep generic state until an explicit operation/cause signal is approved. |

### 18.1 Class D option matrix

#### P4-D-001 — roll identity

| Option | Authority and audience | Durable/reconnect behavior | Persistence/protocol/security impact | Assessment |
| --- | --- | --- | --- | --- |
| Public monotonic `rollSequence` in authoritative board state | Server increments once per accepted legal roll; public because dice are public | Survives duplicate snapshots and reconnect when persisted with the snapshot | Shared schema, projection, validation, snapshot compatibility, and likely protocol/version review; no hidden data leak | Recommended smallest robust option. |
| Turn-scoped roll identity, such as a committed roll index tied to turn | Server-owned and public | Durable if included in the authoritative snapshot; weaker if derived only from client turn state | Shared contract still changes; must define recovery and repeated-turn semantics | Viable if the invariant is formally specified. |
| Ephemeral structured roll presentation signal | Server emits after commit; public | Must be replayed or intentionally skipped on reconnect; event loss is possible | Socket event ordering, duplicate handling, and reconnect tests; no durable history if visual-only | Smaller wire change but less reliable for snapshot recovery. |

No option should use a client click count, a random local ID, or log parsing.
Phase 4.1 selected the public monotonic `rollSequence` option. It is included
in the V6 public snapshot, validated as a non-negative safe integer, persisted
through V6 room snapshots, and tested for duplicate delivery, reconnect/reset,
room restart, jail attempts, rollback, and same-face repeats.

#### P4-D-002 — movement cause and route

| Option | Authority and audience | Durable/reconnect behavior | Persistence/protocol/security impact | Assessment |
| --- | --- | --- | --- | --- |
| Public movement metadata with cause and route | Server emits committed cause, from/to, and safe route/route kind; public only | Reconnect can snap to current state and skip old choreography, or replay only if history is deliberately retained | Shared schema/projector/client adapter changes; route may reveal card effect and must be audience-safe | Recommended only if product requires semantic walks/teleports/GO. |
| Public cause enum without route | Server says DICE, CARD, JAIL, TELEPORT, or OTHER; client snaps when route is absent | Snapshot-safe for cause copy; no route replay required | Smaller schema but still requires server proof and privacy review | Good minimum for correct copy with destination snap. |
| Client threshold/heuristic | Client guesses from tile delta | Not reliable across reconnect or collapsed card chains | No protocol change but violates authority boundary | Rejected. |

#### P4-D-003 — card identity/result

| Option | Authority and audience | Durable/reconnect behavior | Persistence/protocol/security impact | Assessment |
| --- | --- | --- | --- | --- |
| Audience-scoped committed card-resolution metadata | Server sends card ID/effect/result only to allowed viewers or public room viewers per policy | Visual-only metadata may be skipped on reconnect; state remains authoritative; replay requires retained history | Shared schema, projector, socket events, visibility tests; must not expose deck order or private card terms | Recommended if readable card faces are required. |
| Public last-card field in snapshot | Server includes the most recently resolved public card | Snapshot duplicate-safe; old card may appear again after reconnect unless presentation IDs/age are defined | Public schema and persistence compatibility; potentially leaks more than intended | Only with explicit audience/retention policy. |
| Log parsing/deck count inference | Client guesses card from text or counts | Breaks on localization, chains, duplicate logs, and reconnect | No schema change but not authoritative | Rejected. |

#### P4-D-004 — transfer attribution

| Option | Authority and audience | Durable/reconnect behavior | Persistence/protocol/security impact | Assessment |
| --- | --- | --- | --- | --- |
| Structured committed transfer metadata | Server identifies source, destination/bank, amount, and safe cause/operation | Include in committed snapshot or accept skip-on-reconnect semantics for visual-only cue | Shared contract, projector, command paths, privacy tests; forced-sale terms remain participant-private | Recommended only for product copy that needs direction/cause. |
| Reuse participant-private trade/forced-sale result | Private event identifies the operation for participants; public viewers remain generic | Private reconnect must define whether result is re-sent | Client private presentation path and event dedupe; no public leak | Suitable for participant-only confirmation. |
| Pair public balance diffs | Client pairs signs and amounts | Fails when multiple balances or bank operations coexist | No protocol change but ambiguous | Rejected as a universal rule; allowed only under documented Class C proof. |

### 18.2 Required risk register A–Q

| Risk | Status | Evidence sentence |
| --- | --- | --- |
| A. Identical dice pair does not produce a distinct `ROLL_DICE` | RESOLVED | Public `rollSequence` advances once per committed gameplay roll, and the adapter emits on an exact one-step advance even when faces match. |
| B. Dice spin identity is keyed only by face pair | RESOLVED | `Dice.tsx` uses presented `displayRollSequence` plus the reset epoch, so an exact repeat tumbles once and reset does not replay it. |
| C. Card chains collapse into one public transition | CONFIRMED | `resolveTile` continues synchronously through card movement and destination effects before one committed broadcast. |
| D. Short card movement can be misclassified as `WALK` | MITIGATED | The adapter now requires a consecutive roll and exact dice destination proof; unsupported or ambiguous movement snaps, while the general cause contract remains open. |
| E. Affordable compulsory payment may leave no public queue | CONFIRMED | `progressPaymentQueue` settles affordable claims before the committed public projection is broadcast. |
| F. Public shortfall can expose a CARD `cardId` | CONFIRMED | `projectPublicRoomState` copies the active structured CARD source into public `paymentShortfall`. |
| G. Card identity is not uniform across contexts | PARTIAL | Active CARD shortfall and private jail-free state carry identity in limited contexts, but there is no general card-draw/result event. |
| H. Logs are display-only | CONFIRMED | Logs are human-readable strings and `derivePresentationEvents` never uses them as semantic input. |
| I. Voluntary trade is ambiguous from public diffs | CONFIRMED | Trade accept changes public balances/ownership while its offer terms and private result remain outside the public presentation adapter. |
| J. ACK revision is unused by `PresentationController` | CONFIRMED | Successful command wrappers ignore ACK data/revision and the controller accepts public snapshots only. |
| K. Broadcast can precede ACK | CONFIRMED | Normal gameplay handlers broadcast after commit before returning the success ACK, with resume as a documented exception. |
| L. Multiple revisions can enter one queue | CONFIRMED | `AnimationQueue.enqueueMany` appends later live-snapshot events while earlier events are still playing. |
| M. Expense/tax can be a no-payment transition | CONFIRMED | The expense tile logs that no payment is generated and does not debit the player under the simplified rules. |
| N. Failed jail roll and wait can look similar | CONFIRMED | Both can leave tile/jail unchanged and advance the turn, while the adapter does not consume the log reason or a structured action cause. |
| O. Purchase inference needs explicit conditions | PARTIAL | A pending PURCHASE plus an unowned-to-player owner transition is strong conditional proof, but a generic ownership or cleared-decision diff is not. |
| P. Development inference needs explicit conditions | PARTIAL | A matching pending development operation plus legal house/balance delta can prove a result, but SKIP versus timeout and bare house changes remain ambiguous. |
| Q. `PLAYER_FINISHED.reason` can distinguish finish causes | PARTIAL | Current server removal paths write `BANKRUPT`/`LEFT`, but the shared/public field is optional and may be absent in legacy or fixture state. |

## 19. Phase 4.1 handoff

### Completed for the Phase 4.1 foundation

1. P4-D-001 is resolved with public durable `rollSequence`, V6 compatibility,
   identical-face derivation, and reset/reconnect-safe presentation state.
2. Movement classification uses and tests the conservative rule:
   `PROVEN DICE ROUTE -> WALK`; `OTHER / AMBIGUOUS -> SNAP`.
3. Server authority, the single queue/store, settled-position gating, reset
   epochs, and stale-completion protection remain in place.

### Still open for richer future choreography

1. P4-D-002 movement cause/route metadata is not added; semantic card,
   teleport, and route choreography still require a shared contract.
2. P4-D-003 card identity/result/chain and audience policy remain open.
3. P4-D-004 universal transfer attribution remains open; generic balance and
   ownership deltas remain the safe public fallback.
4. Purchase/development inference remains conditional on pending operation
   state, logs remain display-only, and public/private forced-sale and offer
   boundaries remain unchanged.

### Explicitly not authorized by this audit

- No new gameplay command.
- No client-side dice, movement, rent, tax, card, purchase, development,
  debt, or bankruptcy rule.
- No protocol/shared-type expansion beyond the V6 roll-identity contract.
- No event-history table or reconstruction of historical roll count.
- No visual effect implementation.
- No log parser.
- No promise that ACK order is a presentation sequence.
- No public exposure of private forced-sale terms, exact private card state, or
  deck order.

### Minimum Phase 4.1 test inventory

| Test family | Required cases |
| --- | --- |
| Roll identity | Same ordered pair twice, ordered swap, duplicate/same revision, reconnect, skip, reduced motion. |
| Movement | Ordinary bounded roll, GO crossing, absolute card, relative negative card, card-to-jail, direct jail, card chain, destination snap, stale completion. |
| Payment | Affordable rent/card payment with no public queue, active shortfall, CARD source visibility policy, partial payment, bank sale, forced-sale accept, deadline resolution. |
| Landing decisions | Purchase commit, decline, expiry, stale operation, development build/hotel, skip/timeout, settled-position gate. |
| Jail/finish | Pay bail, jail-free use with private count, failed roll versus wait, doubles, jail release, LEFT versus BANKRUPT, zero balance. |
| Trade | Private make/decline, participant accept result, public generic balance/ownership diff, private visibility. |
| Recovery | Duplicate/stale snapshots, multiple revisions queued, session reset, reconnect during movement/decision, skip/reset stale executor. |
| Validation | Client/server tests, typecheck, lint, build, PostgreSQL separately, browser/Electron/manual separately. |

### Final audit verdict

## PHASE 4.1 READY FOR PHASE 4.2

The authoritative roll identity and safe movement foundation are complete.
Phase 4.2 must treat P4-D-002, P4-D-003, and P4-D-004 as open contracts and
must not infer their richer semantics from logs, room revisions, or short tile
deltas.
