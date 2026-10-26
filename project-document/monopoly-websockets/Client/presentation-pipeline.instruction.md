# Client presentation pipeline

Status: CURRENT (release baseline v1.10.0; later CURRENT DEVELOPMENT sections are labeled). Foundation rules: [monopoly.client.instructions.md](../monopoly.client.instructions.md), [monopoly.shared.instructions.md](../monopoly.shared.instructions.md).

## Scope and UI entry

- Screen: the in-game Board (phase `GAME`, player or spectator) and every surface that reads display state
  (board/tokens/dice, HUD player cards, activity log, buy/development prompts, debt hold, winner banner).
- Trigger: every authoritative room `update` and every private player state the client accepts. There is no URL route,
  no user action and no permission framework here: the pipeline only turns committed state into timed display state.
- Out of scope: how a decision is sent (see [turn-actions.instruction.md](./turn-actions.instruction.md)), WebGL rendering
  of the display state (see [game-board.instruction.md](./game-board.instruction.md) "State/rendering" and "Motion/turn UX").

## Code ownership

| Concern | Code |
| --- | --- |
| Controller: accepts snapshots, derives events, owns queue/store, gates the activity tail | `apps/client/src/game/presentation/PresentationController.ts` (one instance, constructed in `apps/client/src/App.tsx`) |
| React boundary: applies speed/reduced-motion preferences, retain/release, live store context | `apps/client/src/game/presentation/PresentationProvider.tsx` (wraps the whole rendered tree of `apps/client/src/App.tsx`) |
| Slice subscription (re-render only when the selected slice changes) | `apps/client/src/game/presentation/usePresentationSelector.ts`, `apps/client/src/game/presentation/store/selectors.ts` |
| FIFO queue: pause/resume/skip/reset/speed, always resolves | `apps/client/src/game/presentation/queue/AnimationQueue.ts` |
| Display state (positions, settled positions, balances, ownership hold, dice, card presentation, reset epoch) | `apps/client/src/game/presentation/store/presentationStore.ts`, `apps/client/src/game/presentation/store/types.ts` |
| Event derivation from two public snapshots plus the semantic tail | `apps/client/src/game/presentation/events/derivePresentationEvents.ts`, `apps/client/src/game/presentation/events/types.ts` |
| Executors | `apps/client/src/game/presentation/executors/basicExecutors.ts`, `apps/client/src/game/presentation/executors/diceExecutor.ts`, `apps/client/src/game/presentation/executors/movementExecutor.ts`, `apps/client/src/game/presentation/executors/semanticExecutors.ts` |
| Timings and house/hotel build schedule | `apps/client/src/game/presentation/timings.ts`, `apps/client/src/game/presentation/buildingSchedule.ts` |
| Server-side bot pacing budget that mirrors the client timings | `packages/shared/src/botPacing.ts` |
| Producer of public `gameplayEvents` and the private per-player semantic lane | `apps/server/src/game/semanticEvents.ts` (bounded by `MAX_GAMEPLAY_SEMANTIC_EVENTS`) |

## Current behavior

### Snapshot sources

`PresentationController.acceptRoomSnapshot(room, source)` takes a `SnapshotSource` chosen in `apps/client/src/App.tsx`:

| Source | When | Effect |
| --- | --- | --- |
| `LIVE_UPDATE` | an accepted newer authoritative room `update` while the session is already active | the only source that derives and enqueues animation events from the previous to the next snapshot |
| `SESSION_SYNC` | first accepted snapshot of a resume, or an accepted newer authoritative `update` while phase is `RESTORING`/`JOINING`/`RECONNECTING` | `queue.reset(room)`: snap display state to the snapshot |
| `SPECTATOR_SYNC` | spectator admission ACK | same reset/snap |
| `REPLAY_SYNC` | the same room goes `FINISHED` → `LOBBY` (`play again`) | same reset/snap; private state and private offers are cleared first |

**CURRENT DEVELOPMENT — E1-FIX-001:** `App.tsx` xử lý riêng event `update` cùng version: merge whitelist public presence vào room replica, không gọi controller hoặc queue. Quy tắc identity, ordering và field được phép chỉ thuộc [client snapshot/presence contract](./join-room.instruction.md#public-snapshot-và-presence-current-development--e1-fix-001). Presence không đổi display state, không replay animation, không reset/skip movement hoặc card đang chạy và không phát gameplay command. Admission/resume ACK hoàn tất muộn không dùng nhánh này.

An older snapshot is ignored. Equal-version `LIVE_UPDATE` is ignored; equal-version session/spectator/replay sync still resets active presentation. Even a `LIVE_UPDATE` resets
instead of animating when: a player disappeared while the queue was busy, a player appeared (2v2 revive), the
`rollSequence` jumped by more than one, or the public semantic tail has a gap (`semanticEventsSince` returns `null`).
The private lane (`acceptPrivatePlayerState`) only animates `MONEY_TRANSFER` events for `LIVE_UPDATE`; a sequence gap there
also resets to the current room snapshot.

### Queue and store

- `AnimationQueue` runs one executor at a time. Every item resolves whether its executor succeeds, throws or is aborted
  (`finally` path); errors go to `onError` and never block the queue. `reset` aborts the current item, resolves all pending
  items, unpauses and calls `onReset`, which stops presentation audio voices and snaps the store
  (`resetFromSnapshot` increments `presentationResetEpoch`). A generation counter stops a stale executor from finishing
  after a reset.
- Speed is clamped to 0.75–2 (`PRESENTATION_MIN_SPEED`/`PRESENTATION_MAX_SPEED`); reduced motion makes ordinary item durations 0 (`AnimationQueue`) and executors skip
  reactions/tweens and snap. The fixed 3-second REVEALED-card reading duration uses `waitForDuration`, so speed and reduced motion do not shorten it, and
  switching reduced motion on calls `skipAllAndSnap()`. Preferences come from Settings through `PresentationProvider`
  (see [settings-and-audio.instruction.md](./settings-and-audio.instruction.md)).
- Display maps (`displayPositions`, `settledPositions`, `displayBalances`, `displayOwnership`, dice, card presentation) are
  presentation only. Prompts wait on `settledPositions`/queue idle, but commands always use authoritative state. Display
  state never replaces authoritative room state; see the invariants in [README.md](./README.md#client-invariants).
- Ownership flags and building levels are held at their old display value until the queued purchase/transfer/build
  executor starts (`holdOwnership`, `syncDisplayDevelopmentLevels`).

### Event order and the card reveal

`derivePresentationEvents` emits only what two snapshots and the semantic tail prove: dice → closing card (when the
previous card closes) → movement (walk up to 12 tiles; backward/teleport snaps) → `LAND_TILE` → semantic consequences →
opening card → balances → ownership → development → jail → finished players → turn change → game finished. A card reveal is
therefore queued after the authoritative LAND boundary; session/reconnect hydration snaps to the current revealed card
without replaying a draw or flight.

A REVEALED card blocks this client's FIFO queue for `CARD_MINIMUM_VISIBLE_MS = 3,000`. The overlay starts its own countdown when the local card is rendered and reads from the presentation signal, so a slow observer still sees the complete card after the authoritative state clears. Server dismissal checks the reveal timestamp independently; it never waits for a client. A bot uses the movement estimate plus the same 3-second minimum.

### Activity tail gate

The log and the typed activity feed shown to players (`displayLogs`, `displayActivity`) wait on the same queue: after a live
diff with events the controller holds the tail until the queue is `idle`, the turn has handed off (or the actor has not
moved yet, or the game finished) and no card interaction, landing decision or payment shortfall is pending. Chat is not gated (`mergeUngatedChat` in `apps/client/src/components/Log.tsx`). A reset
replaces the tail with the snapshot's feed at once. Reconnect never replays history.

### Bot pacing

`packages/shared/src/botPacing.ts` (`ROLL_PRESENTATION_BUDGET_MS`, `BOT_THINKING_PAUSE_MS`, `estimateRollPresentationMs`)
lets the server-side bot wait about as long as clients take to play a roll at normal speed before it decides. It is pacing
only: the server never waits on a client, and a slower client still shows events in order because its queue holds them. `CARD` adds the 3-second revealed-card minimum after the movement estimate.
`apps/client/src/game/presentation/botPacing.test.ts` fails when the shared budget and `timings.ts` drift apart.

## Constraints and regression risks

- Never animate a `SESSION_SYNC`/`SPECTATOR_SYNC`/`REPLAY_SYNC` snapshot or fabricate a cause (rent, transfer) from a diff
  that the semantic stream does not prove; reset/snap instead.
- Every queue item must resolve; a hung executor would freeze surfaces gated on idle/settled state (the debt hold has
  `DEBT_HOLD_FALLBACK_MS` = 12 s and the winner banner `VICTORY_FALLBACK_MS` = 8 s as safety nets; other prompts have no
  documented fallback, NOT VERIFIED per prompt).
- Do not read display state as authority (e.g. to decide whose turn it is for a command).
- Keep `timings.ts` and `packages/shared/src/botPacing.ts` in step.
- Listener/timer cleanup must survive React `StrictMode` (`retain`/`release` disposes in a microtask only when unused).

## Change impact

- New public semantic event: server producer (`apps/server/src/game/semanticEvents.ts`), shared types/schemas, event
  derivation, an executor, audio cue if any, and tests on both sides.
- New timing: `timings.ts`, possibly `packages/shared/src/botPacing.ts`, and `botPacing.test.ts`.
- New snapshot source or phase: `App.tsx` source selection and `PresentationController.test.ts`.

## Verification

Automated (Vitest, `pnpm --filter @monopoly/client test`):

- `apps/client/src/game/presentation/PresentationController.test.ts` (sync snaps vs live diffs, reconnect hard-snap, revive,
  roll-sequence and semantic gaps, log gating, card hydration, replay reset)
- `apps/client/src/game/presentation/PresentationProvider.test.tsx`, `apps/client/src/game/presentation/usePresentationSelector.test.tsx`
- `apps/client/src/game/presentation/PresentationFreezeChain.test.tsx` (purchase actions wait for the landing)
- `apps/client/src/game/presentation/botPacing.test.ts`, `apps/client/src/game/presentation/ownershipHold.test.ts`
- `apps/client/src/game/presentation/queue/AnimationQueue.test.ts`, `apps/client/src/game/presentation/store/presentationStore.test.ts`
- `apps/client/src/game/presentation/events/derivePresentationEvents.test.ts`
- `apps/client/src/game/presentation/executors/basicExecutors.test.ts`, `apps/client/src/game/presentation/executors/diceExecutor.test.ts`,
  `apps/client/src/game/presentation/executors/movementExecutor.test.ts`, `apps/client/src/game/presentation/executors/semanticExecutors.test.ts`,
  `apps/client/src/game/presentation/executors/audioExecutors.test.ts`
- Server producer: `apps/server/src/game/semanticEvents.test.ts`

Manual: [../testcase/client-state-sync-motion-and-accessibility.md](../testcase/client-state-sync-motion-and-accessibility.md)
(session/sync, motion, reduced motion, reconnect without replay).

## Related docs

- [README.md](./README.md), [game-board.instruction.md](./game-board.instruction.md), [turn-actions.instruction.md](./turn-actions.instruction.md),
  [activity-log-and-chat.instruction.md](./activity-log-and-chat.instruction.md), [settings-and-audio.instruction.md](./settings-and-audio.instruction.md)
- [../GameCore/bot-players.instruction.md](../GameCore/bot-players.instruction.md) (bot pacing on the server)
- [../FEATURE_TRACEABILITY.md](../FEATURE_TRACEABILITY.md), [../ARCHITECTURE_DECISIONS.md](../ARCHITECTURE_DECISIONS.md)

## Motion timing and first-hop diagnostics

Movement `START` signals carry the monotonic start timestamp and roll sequence. `CharacterBillboard` consumes them in a layout effect and starts from its last rendered world position; hop progress uses elapsed monotonic time rather than the first R3F delta. This keeps an idle period out of the first sample while retaining queue-resolved durations and authoritative tile order.

For a local development trace, add `?motion-trace=1` to the game URL and inspect `window.__OWN_THE_BLOCK_MOVEMENT_TRACE__`. Entries include store/billboard START, COMPLETE and SNAP, roll and movement sequences, reset epoch, display/settled tile, target anchor, rendered XYZ, elapsed/duration, raw frame delta, scheduler time/frame sequence, scene lifecycle and queue/presentation resets. First and later hops can be separated by roll sequence and movement sequence. The trace is opt-in in development or explicit UAT builds and capped at 512 records. Ordinary production builds disable it. START records expose nominal timestamps; resets expose only public settled positions.

Source inspection found that the store advances the display tile and publishes START together, while the billboard formerly handled START in a passive effect. A demand-rendered frame could therefore observe the new tile anchor before the hop was initialized; the next frame then returned to the origin. The first frame after `frameloop="never"` could also carry idle time in its delta. Layout-phase signal consumption, the rendered-position origin and the signal timestamp remove those two ordering/timing hazards. Confirm the full visual result with the owner checklist before acceptance.

## B8 interruption and cadence policy (CURRENT DEVELOPMENT)

Walk hops carry nominal monotonic boundaries; late timer delivery consumes remaining time instead of adding drift to every hop. The deliberate GO checkpoint hold rebases the next hop, preserving its overlapping coin effect and subsequent LAND ordering.

The provider snaps to the latest accepted authoritative snapshot on hidden/visible, page hide/show and freeze/resume. Hidden public updates hydrate directly; private sequence cursors advance without emitting obsolete effects. A visible blur lasting at least one second snaps on focus return; brief blur leaves ordinary movement intact.

An existing queue wait delivered at least one second late invokes the same reset. There is no recurring watchdog or idle polling. Reset aborts stale continuations and resolves pending promises. Equal-version reconnect sync also resets active presentation; older snapshots remain rejected.

Recovery may omit interrupted cosmetic feedback. Positions, balances, buildings, pending card and activity tail hydrate from the snapshot. No authoritative command is dropped or replayed. The existing three-second card-reading policy remains. Server authority, socket protocol and persistence do not change.

Evidence: [B8 record](../../ui-ux-overhaul/08L_PHASE_B8_IMPLEMENTATION.md). Tests: `apps/client/src/game/presentation/movementCadence.test.ts`, `apps/client/src/game/presentation/interruptionRecovery.test.tsx`, `apps/client/src/game/presentation/interruptionMeasurements.test.tsx`.
