# Phase 04–05 — START Reward, Selection and Inventory

> **COMPLETE — Phase 04–05, CURRENT DEVELOPMENT.** Implemented 26–27 October 2026 (Asia/Bangkok). No production release, deployment, push or merge.

> **Historical phase record.** The statement below that Phase 06 activation/effects remain unavailable describes the state at Phase 04–05 closeout only. Phases 06–08 are documented separately in `06_GAMEPLAY_ENGINE_REPORT.md`, `07_UI_UX_IMPLEMENTATION_REPORT.md` and `08_FINAL_VALIDATION_REPORT.md`; this report's original test evidence and decisions are retained.

## A. Implementation summary

START cash now produces one authoritative Power-up offer in the existing room transaction. The actual multiplayer client supports three hidden category cards, locked choice, reveal of all three, claim, capacity-three inventory, explicit replacement/decline, reconnect restoration and inspection. Offline and bot resolution preserve existing full hands. Public viewers receive only inventory count/category distribution. Phase 06 activation/effects remain unavailable.

The existing Phase 02 foundation and Phase 03D official registry/config were verified before implementation. They were already present as uncommitted work. The current task explicitly authorizes the previously OPEN full-hand, bot, FIFO, visibility and lifecycle decisions for Phase 04–05; the approved 03C document and historical 02/03D reports are preserved.

Branch: `codex/v1.10.0-refactor`. Initial and current HEAD: `4c878d67072de6fdfb82457203bfa1d3054fed56`. Implementation is in the working tree, with no new commit: its prerequisite Phase 02/03D changes were already uncommitted and interleaved with user work. No unrelated changes were staged or discarded. Preflight file fingerprints are retained outside the repository in `../powerup-phase04-05-baseline.json`; unrelated audit documents, original agent instructions, static registry/config and other pre-existing work were preserved.

Architecture: single START producer → private aggregate → shared priority/saved continuation → authenticated commands → room commit → public/private projector → existing client state and presentation gate. Automatic decisions run in the same draft checkpoint and call the same grant resolver. No new database, standalone animation queue, client random generation or activation engine was added.

## B. Changed files and purpose

New files introduced in this task:

| Files | Purpose |
| --- | --- |
| `apps/server/src/game/powerUps/rewards.ts` | Crypto sampling, START issuance, selection/reveal, grant/replace/decline, automatic policy, cleanup and explicit display projections |
| `apps/server/src/game/powerUps/rewards.test.ts` | Deterministic boundaries, inventory/lifecycle, per-owner scheduling, continuation and bankruptcy regressions |
| `apps/server/src/services/powerUpCheckpoint.ts` | Shared safe checkpoint, offline markers, bot/offline claims and continuation resumption |
| `apps/server/src/socket/powerUps.ts` | Authenticated handlers for select/resolve |
| `apps/server/src/socket.powerUps.integration.test.ts` | Real socket privacy, replay, race, reconnect, priority, recovery and rollback scenarios |
| `apps/client/src/game/ui/powerUps/PowerUpPanel.tsx` | Reward modal, claim/replace/decline and inventory inspection |
| `apps/client/src/game/ui/powerUps/PowerUpCard.tsx` | Category backs, authorized details, rarity/selection styling and reduced motion |
| `apps/client/src/game/ui/powerUps/PowerUps.css` | Entrance/flip/card styling and responsive layout |
| `apps/client/src/game/ui/powerUps/PowerUpPanel.test.tsx` | UI state, secrecy, request/error/loading, inventory and restoration tests |
| `scripts/powerUpAcceptance.check.mjs` | Reproducible real-browser acceptance against the production client and live local server |
| `project-document/monopoly-websockets/Api/socket-powerups.instruction.md` | Socket contract |
| `project-document/monopoly-websockets/Client/power-ups.instruction.md` | Client flow and presentation contract |
| This report | Delivery/evidence/limitations |

Modified implementation files:

- `apps/server/src/game/dice.ts`: capture the existing PASS_GO and issue its offer.
- `apps/server/src/game/turn.ts`: preserve pending turn continuation, guard handoff, clean up eliminated/finished owners; retain bankruptcy successor semantics.
- `apps/server/src/game/powerUps/foundation.ts`: FIFO per owner and one shared interaction-priority predicate.
- `apps/server/src/commands/gameplay.ts`: shared select/resolve command objects and mandatory-reward roll guard.
- `apps/server/src/socket/index.ts` and `apps/server/src/socket/roomCommands.ts`: register handlers and settle reward checkpoints before save.
- `apps/server/src/services/deadlineScheduler.ts`: due recovery, noncurrent disconnect/reconnect and recovered card-movement integration.
- `apps/server/src/rooms.ts`: snapshot 12 and safe scheduling of offline reward deadlines. Expired reward markers remain dormant while a higher-priority decision owns progress.
- `apps/server/src/services/publicState.ts`: explicit public summaries and owner projection on every existing snapshot path.
- `packages/shared/src/powerUps.ts`, `packages/shared/src/types.ts`, `packages/shared/src/stateSchemas.ts`, `packages/shared/src/events.ts` and `packages/shared/src/socketSchemas.ts`: strict state/wire models, outcome/continuation/deadline data and commands; protocol 15.
- `apps/client/src/App.tsx` and `apps/client/src/types.ts`: typed ACK commands and bounded transport-error feedback.
- `apps/client/src/game/ui/hud/BottomDock.tsx` and `apps/client/src/game/ui/hud/RollControl.tsx`: integrate inventory into the existing dock and gate another roll.
- `apps/client/src/i18n/catalog.ts`: Vietnamese/English UI labels; card content still comes from the registry.
- `apps/client/package.json`: full test script uses isolated thread workers instead of VM workers; same test discovery/assertions, no skipped tests.
- `apps/desktop/src/lanFinder.ts`, `apps/desktop/tests/lanFinder.test.ts` and `apps/desktop/update-policy.json`: protocol-15 discovery and explicit compatibility review.
- `scripts/validateV1Contract.mjs` and `scripts/validateV1Contract.check.mjs`: explicit protocol-15 release-contract validation and matching fixtures, retaining rejection cases.

Existing test updates are limited to strict UUID fixtures for START paths, phase assertions superseded by live integration, and current protocol/snapshot expectations: `apps/server/src/game.test.ts`, `apps/server/src/rulesContract.test.ts`, `apps/server/src/rooms.teamplay.test.ts`, `apps/server/src/bots/policy.test.ts`, `apps/server/src/socket/errors.test.ts`, `apps/server/src/statePerformanceCharacterization.test.ts`, `apps/server/src/game/powerUps/foundation.test.ts` and `apps/server/src/game/powerUps/catalog.test.ts`. No classic numeric assertion was relaxed. Temporary scene-test experimentation was removed; that source file has no diff.

Documentation updated: Hub, architecture decisions, F53 traceability, API/client indexes, persistence, shared version history, canonical Power-up domain contract, acceptance checklist and V1 release contract. Earlier phase reports remain historical evidence, not descriptions of the new live state.

## C. START integration and exactly-once evidence

Exact hook: awardStartReward in `apps/server/src/game/dice.ts`. Existing movement qualification and 200-unit cash award are unchanged. The return value of the existing PASS_GO producer supplies offerId; MONEY_TRANSFER remains a separate semantic record of the same cash payment, never another reward trigger.

Candidate generation and cash mutate the same serialized transaction draft. A failed save rolls back cash, queue, choices and revision, and produces no private/public success. A repeated occurrence is checked before RNG and returns stored candidates. Completed identities remain retained for the match even if a granted instance is later replaced or its owner eliminated. Duplicate roll commands remain guarded by current actor/hasMoved/turn state. Distinct rewards in one command create separate offers.

Tests demonstrate forward/absolute/card START, backward/jail exclusions, the original oversized-forward once-per-call rule, PASS_GO identity, duplicate occurrence no redraw, event-tail eviction/hydration, exact cash rollback and real socket dice → reveal → claim → handoff. Sampling tests use injected integer indices, verify 0/59/60/88/89/98/99 boundaries in each category and enumerate every eligible definition. Production RNG is node:crypto.randomInt.

## D. Lifecycle, scheduling, reconnect and cleanup

Manual flow: WAITING → locked REVEALED → explicit claim/decline, or INVENTORY_RESOLUTION → replace/decline → COMPLETED. SELECTED is a transient checkpoint inside the select transaction; no unconfirmed client animation authorizes reveal. The model still supports existing foundation lifecycle checkpoints for hydration. A valid index is immutable once locked. Full CLAIM never silently removes an existing card.

FIFO is per owner, preserving issuance order. A noncurrent waiting owner does not block another owner's eligible head. Human presentation is current-owner only. One shared powerUpInteractionsClear predicate defers behind payment, purchase, development, classic cards and forced sale. completeTurnResolution saves the original continuation; the last resolution resumes it once. Direct nextTurn also guards rewards after balance cleanup, without turning bankruptcy's already-completed handoff into another successor handoff.

Offline current owners reuse the existing absolute recovery deadline. Noncurrent owners use the same configured reconnectGraceMs beginning at disconnect. No reward-specific shorter timer exists, and the 15-second Phase 06 Reaction value is unused. Reconnect before committed recovery clears markers and restores exact candidates/current stage. Due recovery preserves a locked choice or chooses uniformly from the three stored choices; it calls the shared resolver. A full automatic hand discards only the new card. Normal turn recovery continues after required decisions and rewards. A reward generated by recovered classic-card movement inherits the expired recovery deadline, avoiding another grace/re-arm cycle. Due reward markers are not scheduled while a higher-priority interaction is unresolved.

Bots use the safe room checkpoint and the identical grant resolver, uniform stored-candidate choice and discard-new policy when full. No client random-choice capability is introduced. Their classic gameplay remains on the existing BotDriver command path.

Elimination/forfeit cancels unresolved offers and removes unplayed inventory; a revivable bankrupt player starts empty upon revival. Existing cash/property/revival/winner rules are preserved. Match end clears all inventories and pending reward work/deadlines/continuation, retaining occurrence identities until rematch or process exit. Host-process exit still loses the whole volatile match.

## E. UI/UX and real-game integration

The actual game action dock opens inventory and hosts the reward controller. Three category backs expose no hidden details. Selection displays request progress and a tentative highlight; only the committed snapshot reveals the cards and locks the choice. The selected card is marked; both alternatives are visibly discarded. Full hand shows all held cards with explicit replacement buttons or decline. No activation action is offered; details state effects are unavailable.

The existing Modal handles focus trapping, keyboard buttons and decision peek/restore. Closing/reopening through peek sends no command. PresentationController/AnimationQueue idle and classic-card signals delay the interface until the appropriate safe presentation boundary. Reconnect hydrates the authoritative offer; COMPLETED never offers another claim. Client and OS reduced-motion settings both suppress card animation. Responsive cards use the existing scrollable modal. Screenshot review caught an inventory/camera overlap, which was fixed by moving inventory into BottomDock; acceptance asserts no intersection with existing dock controls.

Browser evidence: `test-results/powerup-acceptance/evidence.json` and its five PNGs. The final run uses installed headless Chrome, two independent browser contexts, the production client build and a real local Socket.IO server, with the supported legacy board fallback made visible. Recovery is invoked at the stored deadline +1ms to avoid waiting wall-clock grace; that is disclosed in evidence. No debug HTTP endpoint or production cheat flow is installed. Browser errors: zero.

## F. Authorization and visibility

Actor identity comes exclusively from requirePlayer/authenticated socket state; connection generation is checked again in the serialized executor. Strict payloads carry only offer/selection or offer/action/replacement identity. Invalid indices, foreign offers, later owner offers and foreign/missing replacement instances are rejected without committing mutations. Same-index/completed retries are harmless; conflicting choices race through one room queue.

The public projector serves join, reconnect/full snapshots, incremental broadcasts and spectators. It emits held count/category distribution only. The private projector emits the owner's inventory and their pending offers/latest outcome, never another owner's cards. Pre-reveal candidates are exactly category objects; no definition ID, instance ID, name, rarity, description, effectKey or parameters are delivered for those candidates. Post-reveal display fields are explicitly whitelisted from the registry. Raw private aggregate, full reward ledger, continuation, offline markers and registry internals are never broadcast. Public diagnostics do not name secret cards.

## G. Actual validation evidence

The normal execution tool failed before shell startup with the Windows CET error. Checks ran using direct Node child_process execution against installed project CLIs; desktop packaging ran through cmd.exe/pnpm. No dependency install/lockfile change was needed. Full logs are retained outside the repository in `../powerup-phase04-05-checks/`. Failed intermediate runs were diagnosed and preserved; the final statuses below are updated only from actual successful results.

| Check / actual command | Final result |
| --- | --- |
| Server: node apps/server/node_modules/vitest/vitest.mjs run (cwd apps/server; absolute CLI path) | PASS — 41 files, 781 passed, 2 existing skipped, zero failed |
| Client: node apps/client/node_modules/vitest/vitest.mjs run --environment jsdom --pool=threads --maxWorkers=1 --no-file-parallelism (cwd apps/client; absolute CLI path) | PASS — 269 files, 2701 passed, zero failed/skipped |
| Desktop: node apps/desktop/node_modules/vitest/vitest.mjs run src tests --pool=threads --maxWorkers=1 --no-file-parallelism (cwd apps/desktop; absolute CLI path) | PASS — 41 files, 629 passed, zero failed/skipped |
| New reward unit suite | PASS — 34/34 |
| New real Socket.IO suite | PASS — 16/16 |
| New UI suite | PASS — 8/8 |
| Four packages: node node_modules/typescript/bin/tsc --noEmit -p PACKAGE/tsconfig.json | PASS — shared/server/client/desktop, exit 0 |
| node node_modules/eslint/bin/eslint.js . | PASS — zero errors/warnings |
| node scripts/validateDocs.mjs | PASS — 209 Markdown files, including this report |
| node --test scripts/validateDocs.check.mjs | PASS — 10/10 |
| node scripts/validateV1Contract.mjs | PASS — product 1.10.0, protocol 15 |
| node --test scripts/validateV1Contract.check.mjs | PASS — 34/34 |
| Root perf/registry/art/audio tool tests (explicit seven-file node --test invocation) | PASS — 36/36 |
| Client TypeScript + Vite production build and asset validators | PASS — 26 audio, 28 card artworks, 22 landmark artworks |
| node apps/desktop/scripts/compile.mjs | PASS — desktop main/preload and both server helper bundles |
| cmd.exe /d /s /c "pnpm --filter @monopoly/desktop package" | PASS — Windows x64 package produced in apps/desktop/out; renderer/helper/cloudflared checks ran |
| node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpAcceptance.check.mjs | PASS — seven real-browser scenarios, zero browser errors |
| git diff --check | PASS — no whitespace errors |

The two existing server skips are isolated non-loopback host-admission fixtures; no new skip or weakened gameplay assertion was introduced. VM workers exposed cached renderer/context mocks across the full client suite; isolated thread workers preserve all assertions and avoid that contamination. The client test script now records the reliable mode. A stale LAN request fixture was updated with the protocol bump. Targeted source tests also fixed a blocked-deadline scheduling issue and bankruptcy continuation regression. Build retains the existing >500kB Vite advisory and the pre-existing Node shell-argument deprecation warning.

Actual browser scenarios: multiplayer lobby/start; real dice 200-unit START plus exactly one hidden offer and reload; locked all-card reveal, reconnect and one-card claim with handoff; capacity-three replacement in 900×500 landscape; decline preservation and inventory details; offline full-hand recovery and resolved reconnect; real bot-seat reward. Screenshots also cover 1440×900 desktop and the actual fallback board/HUD. This is browser E2E PASS, not native Electron visual/physical-GPU acceptance.

## H. Limitations and release boundary

- Phase 06 effects, activation commands, reaction runtime and its remaining effect-specific timing/rounding/compatibility decisions are not implemented.
- Native Electron full-match visual UAT, physical WebGL/GPU validation, macOS native packaging/device use and cross-network hosting were not executed for this feature. Windows packaging passed; no new installer was published.
- The final deterministic browser run uses the supported legacy board fallback and a synthetic scheduler clock at the real stored deadline, not a 60-second physical disconnect wait. Unit/socket tests additionally cover scheduler races and classic interactions.
- Match-lifetime completed identities/candidates grow with legitimate START rewards. They are not TTL-evicted; process/rematch cleanup releases them. Public/private network projection is bounded to pending offers and latest owner outcome, not the completed ledger.
- Protocol 15 and RAM snapshot 12 are CURRENT DEVELOPMENT. Published v1.10.0 remains 14/11. The update review is 15 while the historical minimum stays 1.9.0; incompatible handshakes are refused. Before publication, choose a distinct product release identity and review installer/update policy. No product version/tag/release was changed here.

## I. Phase 06 readiness

The official registry/config, instance identities, inventory ownership/capacity, private aggregate, validated commands, safe interaction checkpoint, saved continuation, owner/public projection and reconnect/recovery infrastructure are available. Phase 06 can integrate activation through the existing effect/target/duration interfaces and money/movement/property helpers, after resolving the documented effect-specific P1 gates. It must add authoritative usage allowances, legal activation timing, target validation, reaction-before-commit scheduling and effect lifecycle tests. This report makes no claim that any of the 30 effects is playable.

## Final acceptance

Phase 04–05 is COMPLETE against the requested acceptance criteria. Automated regression suites, real-browser workflow, compatibility checks and Windows packaging pass. Native-device limitations in section H remain unverified and are not represented as completed testing.

- [x] Existing START cash reward remains correct.
- [x] Every valid START cash reward generates exactly one offer.
- [x] Three server-generated candidates are available.
- [x] Pre-reveal card details remain secret.
- [x] Selection is authoritative and cannot be changed.
- [x] All three cards are revealed correctly.
- [x] Only one selected card can be granted.
- [x] Inventory limit of three is enforced.
- [x] Replace/decline works correctly.
- [x] Reconnect restores the correct state.
- [x] Disconnected-owner timeout resolves safely.
- [x] Bots cannot deadlock the reward workflow.
- [x] FIFO offers cannot deadlock unrelated players.
- [x] No unauthorized private card data leaks in the verified projection paths.
- [x] Relevant game and multiplayer regression tests pass.
- [x] Typecheck, lint, contract checks and production build pass.
- [x] Phase 04–05 is integrated into the actual game and verified in browser E2E.
- [x] Documentation is updated.
- [x] Implementation report is complete.
