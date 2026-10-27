# Phase 06 — Gameplay Engine Report

> **CURRENT DEVELOPMENT — implemented, not released.** Branch `codex/v1.10.0-refactor`, base HEAD `4c878d67072de6fdfb82457203bfa1d3054fed56`. Working tree remains mixed and uncommitted. Current protocol/snapshot are 16/13; released v1.10.0 remains 14/11.

## Outcome

The server now has runnable handlers for all 30 approved definitions: 22 Active and 8 Reaction cards. The handlers run inside existing room command transactions and use the existing payment queue, property transfer, purchase/build decisions, dice and movement routines. Card identity, target validation, randomness, money, status and reaction decisions remain server-authoritative.

Core implementation is in `apps/server/src/game/powerUps/runtime.ts`, `economy.ts` and `lifecycle.ts`; the official catalog and metadata remain in `catalog.ts` and `packages/shared/src/powerUpEffects.ts`. Transport is `apps/server/src/socket/powerUps.ts`. Protocol 16 and snapshot 13 add the runtime requests and authoritative pending/status state.

## Key rules implemented

- One Active per player turn; inventory capacity three; duplicate definition instances allowed. Requests must match the individual card's allowed target/ingredient/status fields.
- Every targeted player must still be active, be a different player and be a legal opponent under team rules. Property ownership/state, inventory room, sufficient cash, jail/timing, card ownership and pending interactions are checked before effects commit.
- A01 uses floor(10% of available cash), capped at 50 game units; direct player transfer conserves cash. A09 pays the bank through the existing payment path.
- A02/A04/A08 rent modifiers use strongest applicable positive and negative percentages against base rent. Increases round up; reductions round down. U07 pays ceil(125% of list price) through the existing bank/property transfer path and leaves token position and landing state untouched.
- A03 purchase surcharge and U03 discount are applied in the purchase helper. A05 prevents voluntary builds while preserving mandatory debt actions. U09 discount is consumed on a qualifying build. A06 selects randomly from eligible unplayed cards on the server and requires spare capacity.
- D01 rent discount and D08 rent subsidy resolve through rent settlement. D07 contributes at most 100 units to a shortfall once for the originating payment command. D02, D03, D04, D05, D06, D09 and D10 enforce their supported compatibility and target rules.
- D03 is restricted to A03/A04/A05/A07/A10 against the defender or their property. D05 uses effect-specific redirection; monetary reflection transfers from the attacker to the defender, A04 redirects to an attacker-owned property, and A06 excludes the resolving attack card from the steal pool. No reaction opens from a reaction.
- U01/U02/U05/U08 pause after the regular dice result and before movement; the existing movement helper executes once. U04 validates and consumes the activator plus two distinct non-U04, non-Legendary ingredient instances atomically, upgrades one tier above the highest rarity, and samples category then definition uniformly. U06 uses a 15-second consent request, server-random swap and retains the activator on decline while spending the Active allowance. U10 preserves rarity and issues a fresh instance identity.
- D04 expires after three owner turns or two shield interceptions. Other persistent effects expire through owner-turn/start hooks, use counters and existing event completion, not client timers. Disconnect/reconnect restores a pending prompt; absolute server deadlines and serialized commands settle races.

## Reaction compatibility matrix

This matrix records the current server contract in [runtime.ts](../../apps/server/src/game/powerUps/runtime.ts), [validation.ts](../../apps/server/src/game/powerUps/validation.ts) and [economy.ts](../../apps/server/src/game/powerUps/economy.ts). “Eligible” still requires a live target, matching owned instance, and valid effect-specific state at response time.

| Pending event | Eligible defense | Resolution |
| --- | --- | --- |
| Targeted attacks A01, A03, A04, A05, A06, A07, A09, A10 | D05, D06; D02 for A01; D09 for A06; D03 only for A03, A04, A05, A07, A10 | D03 cancels only the approved five attacks directed at the defender or their property. D06 cancels a pending targeted attack before commit. D05 reflects a compatible single target with effect-specific target checks; A08 is global and does not open this window. |
| Rent settlement | D01, D08 | D01 reduces the debtor's amount; D08 contributes from the Bank to the landlord without duplicate income. Rent modifiers resolve before the payment queue commits. |
| Payment shortfall | D07 | One response per originating payment operation; contribution is capped at 100 units, then ordinary liquidation continues for any remainder. |
| Attack targeting a D04-shielded property | The active D04 status, when the event targets that protected tile | The shield consumes one of two successful interceptions and expires after two charges or three owner turns. The runtime regression test exercises an A04 property attack. |

The matrix is not a claim that every listed pair has full socket, browser, boundary and rollback coverage. Those gaps remain in the Phase 08 card matrix.

## Targeted evidence

At the latest focused run after the Phase 06 regression additions:

- `apps/server/src/game/powerUps/runtime.test.ts`: **90 passed** after the final per-card safety expansion. It includes a successful handler case for each Active card, positive Reaction handling for each Reaction definition, and for all 22 Active cases it also asserts that replay, foreign-owner use and invalid timing are rejected without room-state mutation. Other cases cover D03's five approved targets, D07 and rent settlement, D05 reflection/direction, A02 duration/status behavior, modifier stacking and A01 rounding/cap boundaries.
- `apps/server/src/socket.powerUps.integration.test.ts`: **20 passed** in the combined focused run. Coverage includes authenticated activation, target-private Reaction delivery, deadline expiry, bot pass, reconnect, reward lifecycle and injected save failure rollback.
- `pnpm -r typecheck`: all four packages passed.
- Actual browser outcomes and remaining integration gaps: [Phase 08 validation](./08_FINAL_VALIDATION_REPORT.md).

## Known limits

The expanded generic Active checks do not equal the requested full per-card effect-specific negative/target/boundary/transaction-rollback matrix, and comparable rejection/duplicate cases are not exhaustive for every Reaction card. The broader combo/gameflow matrix (teamplay, bankruptcy, auction, mortgage, Chance/Chest and long-running matches) remains partial. The host continues to use RAM-only persistence, so process restart recovery is not provided. This report confirms runnable server handlers; it does not declare all acceptance gates or release readiness complete.
