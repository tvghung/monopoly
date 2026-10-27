# Phase 02 — Power-up architecture and foundation

> **CURRENT DEVELOPMENT — foundation implemented, live activation deferred.** 2026-10-26, repository monopoly-v1.10.0-refactor. Baseline HEAD: `4c878d67072de6fdfb82457203bfa1d3054fed56`. The pasted Phase 02 request is the task authority; the supplied masterplan is design context. No later phase is authorized by this report.

## Source verification and scope

The Phase 01 report was not present in this checkout or the other workspace Markdown files searched. Relevant findings were rechecked directly against source rather than assumed. Existing untracked technical audit documents were preserved. Documentation lives under project-document per the repository hub, rather than introducing a competing docs tree.

- `apps/server/src/game/dice.ts`: awardStartReward is the sole START cash hook; moveBy grants once on a forward crossing, moveToTile once on a clockwise crossing/landing at START, moveToJail never grants. Large forward movement still follows the existing once-per-call behavior; no new lap rule.
- `apps/server/src/game/semanticEvents.ts`: recordPublicGameplayEvent returns a UUID-identified PASS_GO event, then awardStartReward emits a distinct MONEY_TRANSFER. Both describe one award. The tail is bounded to 64 events and cannot be the deduplication ledger.
- `apps/server/src/game/tiles.ts` and `apps/server/src/game/decks.ts`: classic-card operation, draw/rotate, reveal/dismiss and movement behavior are independent of the new registry and remain unchanged.
- `apps/server/src/rooms.ts`: hydrate/store structured-clone private state; fresh matches have no powerUps field.
- `apps/server/src/services/roomCommandExecutor.ts`, `apps/server/src/socket/roomCommands.ts`, `apps/server/src/persistence/inMemory.ts`: serialized draft commands, expected-version saves, atomic RAM transactions, publication after commit.
- `apps/server/src/services/publicState.ts`: explicit public/player allowlists omit the new aggregate. `apps/server/src/socket/broadcast.ts` delivers existing private projections by player; no new transport is introduced.
- `apps/server/src/services/deadlineScheduler.ts`: current-player disconnect arms recovery; classic-card REVEALED is dismissed on recovery expiry, landing decisions skip, idle turns advance. A Power-up selection has different semantics and must not inherit auto-dismiss/auto-selection.

## Architecture and implemented data model

| Component | Implementation / responsibility |
| --- | --- |
| PowerUpDefinition | Validated immutable category, rarity, activation, identity, text and effectKey; no executable effect or official catalog |
| PowerUpRegistry | Server map, immutable copies, duplicate/unknown definition rejection |
| PowerUpInstance | Independent instance UUID, definitionId, ownerPlayerId, obtainedFromOfferId |
| PowerUpInventory | Per-player cards and explicit capacity number/null; full-hand rejection leaves existing cards intact |
| PowerUpRewardOffer | UUID derived from authoritative occurrence, owner, three stored candidates, lifecycle and locked selection |
| PowerUpRewardQueue | Global FIFO within the match; completed prefix retained for idempotency |
| PowerUpState | Optional private inventories + queue inside authoritative room state |
| PowerUpEffectEngine | Validate/apply interfaces over the caller’s transaction draft; no handlers |
| PowerUpTargetResolver | Server target resolution interface for player/tile targets |
| PowerUpDurationManager | Turn/player-removal extension interface only |
| PowerUpDisconnectPolicy | Required recovery extension with no implicit default |

Supported categories: ATTACK, DEFENSE, UTILITY. Rarities: COMMON, RARE, EPIC, LEGENDARY. Activation types: ACTIVE, REACTION, TRAP. Definition IDs and instance IDs are separate. Multiple instances may refer to one definition; duplicate instance IDs and repeated grants from one offer are invalid. Registry contents are process-static; keep a definitionId immutable throughout a match and introduce a new ID for changed semantics.

No default inventory size, rarity weights, usage caps, duration/stacking rules, sampling implementation or demo catalog is shipped. Tests use isolated fixture-only definitions. Unlimited capacity must be explicitly requested with null; it is a model option, not a selected live rule.

## Lifecycle and turn integration

`OFFER_GENERATED -> WAITING -> SELECTING -> SELECTED -> REVEALED -> INVENTORY_RESOLUTION -> COMPLETED`

OFFER_GENERATED is transient construction; insertion validates candidates and atomically stores WAITING. All other checkpoints are retained as data. Only the owned pending FIFO head advances. SELECTED requires an index 0–2 and locks it; invalid jumps/reselection do not mutate state. A later grant/decline command must resolve inventory and completion together; the scaffold’s transition helper does not claim or discard cards. No timeout exists.

canPresentPowerUpReward defers behind payment, purchase, development, classic-card and forced-sale interactions and requires the current owner. assertPowerUpTurnCanEnd rejects any pending mandatory reward for that player. These helpers are tested but **not yet connected to actual handoff/recovery paths**. Phase 02 deliberately creates no live offers, so existing gameplay never encounters an offer it cannot resolve. There is no selection command/UI in this phase.

## START occurrence and exactly-once design

The adapter enqueueStartRewardOffer accepts only PASS_GO. It uses `offerId = occurrence.eventId` with source START_REWARD; the same occurrence cannot create a second offer even after completion, reconnect hydration or event-tail eviction. Distinct occurrence UUIDs in the same roll remain distinct FIFO offers. Retaining completed records avoids a TTL-based deduplication hole; RAM grows with genuine rewards for the current match and is released with the room/process. Assess long-match bounds before rollout without expiring identities silently.

The intended Phase 04 wiring is to capture the return value of awardStartReward’s existing PASS_GO call, check the queue by occurrence UUID before candidate generation, then call the adapter on that same draft. Do not subscribe to MONEY_TRANSFER, inspect amount 200, add another event producer or use roll/turn/operation as the offer identity. No monetary statement or movement condition was changed here. The adapter requires exactly one registered candidate in each category and stores the order supplied by the future approved provider.

A failed transaction discards cash, queue, choices and identity together; retry produces the next committed occurrence. Nothing failed is visible to clients. An event UUID is sufficient because there is no reconnect-time event replay producer; command-level replay safety still uses existing authority/command guards. The adapter does not make moveBy itself idempotent or deduplicate newly generated UUIDs from illegally replayed movement.

## Reconnect, disconnect and deadlock analysis

Store/hydrate preserves the exact pending stage, selected index and candidates. The owner projector never generates choices. Recovery applies only while the same host process lives; a host exit permanently loses rooms/tokens under the current product contract. There is no filesystem/database restoration.

Current disconnect behavior leaves membership/assets intact and arms an absolute turn recovery deadline (configured default 60 seconds). Scheduler expiry applies classic-card dismiss, skips purchase/development, or calls nextTurn. commitRoomCommand re-arms an absent current actor on subsequent state changes. Simply blocking nextTurn for mandatory rewards would therefore keep rearming recovery indefinitely. Reusing classic-card dismissal would silently choose or drop a reward, violating the request.

**Activation prerequisite:** approve a disconnected-owner and bot policy, then integrate the policy and all completion guards in the same change. One possible proposal is to preserve the offer and suspend its turn requirement while the owner is offline, resuming later; this is not implemented or accepted as a product rule. No random choice, expiry deletion or new deadline is installed. Removal, bankruptcy/revival and match-end ownership also require approved semantics. Current Phase 02 cannot introduce a runtime deadlock because no production code initializes or enqueues Power-up offers, and existing scheduler behavior is untouched. Live Power-up disconnect acceptance remains NOT RUN, not implied by regression tests.

## Private/public projection

| Audience/path | Phase 02 data |
| --- | --- |
| Server room draft | Full definitions via registry, full inventories and choices |
| Existing public update / spectator snapshot | No Power-up aggregate or card IDs/effects |
| Existing private player snapshot | Existing jail/semantic/proposal fields only; no new wire payload |
| Future owner projection helper | Own inventory with definitions, own offers with category backs until REVEALED; all three definitions from REVEALED |
| Opponent via helper | Only their own data; no other owner inventory or choices |

The future transport must derive owner ID from the authenticated actor and deliver on the private player room after commit. No raw room spread is permitted. Owner helper results are detached copies. Card name, rarity, ID and effect remain hidden even from the owner before reveal. Post-reveal public visibility is still a product decision; this implementation grants it only to the owner helper.

## Protocol and compatibility

Socket protocol remains **14**: events.ts, socketSchemas.ts, existing DTOs/projectors and client callers are unchanged. The optional private field extends only the RAM aggregate. Snapshot schema stays **11**: current validator accepts both old absent-field shapes and enriched shapes; fresh matches retain existing state. This follows existing optional-field conventions and does not promise reverse loading by older executables. No updater/release-policy version edit or migration is necessary. Reassess protocol, snapshot invariants and update policy when live commands/delivery/game rules are introduced.

## Files created or modified

New implementation/test files:

- `packages/shared/src/powerUps.ts`
- `apps/server/src/game/powerUps/registry.ts`
- `apps/server/src/game/powerUps/contracts.ts`
- `apps/server/src/game/powerUps/foundation.ts`
- `apps/server/src/game/powerUps/foundation.test.ts`

Modified implementation files: `packages/shared/src/types.ts`, `packages/shared/src/stateSchemas.ts`, `packages/shared/src/index.ts`.

New documentation: this report, `project-document/monopoly-websockets/GameCore/power-ups.instruction.md`, `project-document/monopoly-websockets/testcase/power-ups.md`.

Updated documentation: `AGENTS.md` and `CLAUDE.md` (matching feature count only), `project-document/README.md`, `project-document/monopoly-websockets/GameCore/README.md`, `project-document/monopoly-websockets/testcase/README.md`, `project-document/monopoly-websockets/FEATURE_TRACEABILITY.md`, `project-document/monopoly-websockets/Shared/socket-and-state-contracts.instruction.md`, `project-document/monopoly-websockets/Persistence/README.md`, `project-document/monopoly-websockets/ARCHITECTURE_DECISIONS.md`.

## Validation evidence

| Check | Result |
| --- | --- |
| Full server Vitest suite | PASS — 37 files, 656 passed, 2 existing skips, 658 total; 8.66 s |
| New foundation suite after final test-fixture lint repair | PASS — 17/17, no new skips |
| TypeScript: shared, server, client, desktop | PASS — all four packages; server/shared rechecked after final code changes |
| Full repository ESLint | PASS — zero warnings/errors |
| Documentation validator | PASS — 204 Markdown files |
| Documentation validator self-tests | PASS — 10/10 |
| V1 release contract validator | PASS — Own the Block 1.10.0, protocol 14 |
| git diff --check | PASS |
| Live Power-up socket/recovery/UI acceptance | NOT RUN — not activated in Phase 02 |

The two unchanged skips are in `apps/server/src/hostAdmission.integration.test.ts` (non-loopback isolated-peer fixtures). No existing tests were modified or skipped. Full regressions include game.test, turnHandoff, semanticEvents, Socket.IO, teamplay, host continuity/admission, persistence/inMemory, deadlineScheduler, roomCommandExecutor, card and rules-contract coverage. New tests include definition validation/immutability, configurable inventory, stable occurrence identity, duplicate prevention after completion and hydration, same-roll FIFO, lifecycle/selection lock, blocked presentation, all-stage snapshot preservation, private projection and save-failure cash/offer/revision rollback. Snapshot hydration is the new reconnect-state evidence; actual Power-up socket delivery remains a later gate.

Node 24.22.0 ran installed Vitest/TypeScript/ESLint CLIs directly through child_process because the standard shell runner failed at startup with a Windows CET error. Equivalent package commands are server test, per-package typecheck, root lint, validate:docs, test:docs and validate:v1-contract. No dependency or lockfile changes were made.

## Owner decisions and Phase 03–08 consequences

1. **Phase 03:** approve catalog, rarity weights, capacity, duplicate policy, timing/target/effect/duration/stacking contracts and per-turn limits. Category/rarity/activation enums support these decisions without selecting defaults.
2. **Phase 04:** install the single START producer adapter with approved sampling; preserve original cash and classic-card rules. Check the retained occurrence ledger before any draw.
3. **Phase 05:** add authenticated selection/locked reveal/grant commands, full-hand replace/decline behavior and private delivery; review protocol version. Connect turn blocking together with approved offline, bot, elimination/revival and game-end behavior. Add actual socket reconnect/live recovery tests.
4. **Phase 06:** implement validated engine, target and duration adapters through existing money/movement/property APIs; add reaction/trap data only for approved contracts.
5. **Phase 07:** render categories before reveal and authoritative checkpoints after selection; presentation never creates offers or grants cards.
6. **Phase 08:** complete live A1–A7 acceptance, performance/memory and release checks. Foundation tests prove primitives, not a playable reward flow.

No subsequent phase, playable effect, selection UI, official card or new persistence has been implemented.
