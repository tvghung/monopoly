# Power-up gameplay runtime

> **CURRENT DEVELOPMENT — Phases 04–08, protocol 16 / RAM snapshot 14.** The Phase 04–05 START reward and inventory flow remains active. All 30 official definitions now have server-side Active or Reaction handlers. The published v1.10.0 release remains protocol 14 / snapshot 11. This work is unreleased; [Phase 09A](../../powerups/09A_GIT_CONSOLIDATION_REPORT.md) records local Git consolidation and preserved uncommitted work.

## Authority and source of truth

- Approved gameplay parameters and card names: [03C approved rules](../../powerups/03C_POWERUP_GAMEPLAY_RULES_SPEC_APPROVED.md) and [03D card registry report](../../powerups/03D_CARD_DEFINITIONS_REPORT.md).
- Immutable definitions and effect metadata: `apps/server/src/game/powerUps/catalog.ts`, `packages/shared/src/powerUpEffects.ts`, `packages/shared/src/powerUpConfig.ts`.
- Runtime: `apps/server/src/game/powerUps/runtime.ts`, economy hooks in `apps/server/src/game/powerUps/economy.ts`, durations/cleanup in `apps/server/src/game/powerUps/lifecycle.ts`.
- Socket commands and private/public projection: `apps/server/src/socket/powerUps.ts`, `apps/server/src/game/powerUps/rewards.ts`, `apps/server/src/services/publicState.ts`.
- Earlier inventory/reward decisions and evidence remain in the historical [Phase 04–05 report](../../powerups/04_05_IMPLEMENTATION_REPORT.md); this page supersedes its Phase 06-deferred status.

Every state change runs through the existing serialized room command draft and commit path. Player identity is derived from the authenticated socket. The client submits instance/target/choice IDs only; server validation, random choices, effect resolution, money and ownership changes remain authoritative. Failed draft or save does not publish partial state. Power-up state remains process-local RAM and is lost when the host process exits.

## Activation and interaction rules

- Inventory capacity is three; duplicate definitions are separate UUID instances.
- One Active card per player turn. The server checks ownership, current player, jail, turn timing, target membership/team, card-specific target state, inventory capacity, active allowance, existing payment/card/landing/forced-sale interactions and exact effect fields.
- Active effects consumed on use; U06 is held while consent is pending and is retained if declined. A decline still spends the initiator's Active allowance.
- Movement cards U01/U02/U05/U08 pause after the authoritative dice result and before movement. Dice and movement are committed once through the existing movement helper; doubles and START behavior remain in the regular game path.
- Eligible Attack and rent events open an absolute server deadline 15 seconds in the future. Only the eligible target receives its private prompt. The response and deadline are serialized; one response/pass/timeout resolves the pending event and resumes the turn once. Bots pass eligible reactions.
- Reactions resolve before affected payment/status effects commit. D03 blocks only A03/A04/A05/A07/A10 directed at the defender or their property. D05 uses effect-specific redirection and is never recursively reactable. D06 cancels a pending targeted Attack before its status or immediate effect is applied.
- Expiry uses owner-turn completion and start-of-turn hooks, use counters, shield charges, or pending event deadlines. It does not use client time as authority. Elimination and match completion clear applicable runtime state.

## Effect groups

| Group | Implemented behavior | Runtime integration |
| --- | --- | --- |
| A01–A10 | Cash theft; rent increase/reductions; purchase surcharge; building restriction; random card theft; rent diversion; building levy; rent surcharge | `runtime.ts`, `economy.ts`; purchase/build/rent/payment hooks |
| D01–D10 | Rent discount/subsidy; cash/card protection; D03 cancellation; two-charge property shield; effect-specific reflection; pre-commit cancellation; shortfall subsidy; inventory protection; prospective status removal | `runtime.ts`, `economy.ts`, `lifecycle.ts`; rent/payment/ownership hooks |
| U01–U10 | Reroll, movement adjustment/redirect, purchase/build discounts, atomic mixed-rarity upgrade, consent trade, 125% remote purchase, same-rarity transformation | `runtime.ts`, `economy.ts`; dice, movement, purchase and build paths |

Rent modifiers apply the strongest applicable increase and strongest reduction against base rent using integer game units; increases round up and reductions round down. Rent share, surcharge and subsidies are separate payment claims or explicit bank transfers so their destinations and caps are visible in the existing payment transaction. U07 uses the existing property transfer helper and does not move the token or resolve a landing.

## Verification evidence and limits

- `apps/server/src/game/powerUps/runtime.test.ts` exercises each of the 22 Active handlers and all eight Reaction definitions, including D03's approved five-card compatibility, D07 shortfall, rent defenses, D05 redirects, A01 cash boundaries, modifier stacking, status expiry and request validation.
- `apps/server/src/socket.powerUps.integration.test.ts` covers authenticated activation, private targeted reaction, timeout, bot pass, reconnect, reward lifecycle and save rollback.
- Browser acceptance uses the built client and real Socket.IO server; it covers an A01/D05 reflection through reconnect and U07 property purchase. Its complete results are in [Phase 08 validation](../../powerups/08_FINAL_VALIDATION_REPORT.md).
- The Phase 08 matrix distinguishes handler/unit evidence from real socket and browser coverage. Some card combinations, all-card adversarial/rollback permutations, teamplay, bankruptcy and native Electron visual acceptance remain outside the verified scope; do not infer full scenario coverage from a card handler or UI control.


## Phase 08B closure

- A07 is a single rent obligation with private cumulative receipt allocation. Percentage rounding uses total collected rent, not each cash fragment. The 100-unit cap includes Bank contributions. If the beneficiary is also the payer, the atomic settlement nets its guaranteed receipt; it cannot strand the last integer unit. D01 reduces eligible rent first; D08 covers at most 200; A10 remains a separate Bank surcharge. D07 and Emergency Rescue use the same receipt helper. Leaving beneficiaries/landlords clear their obsolete private allocation.
- D05 reflection can free its own inventory slot before receiving an A06 card; reflected A04 still encounters an existing passive D04 shield without another Reaction Window. U10 excludes the transformed original definition, and can generate a fresh U10 while transforming another Rare card. D10 removes only its owner's participation in global A08.
- Every direct current-player elimination handoff runs start-of-turn expiry. U05 range/integer checks run before any spending.
- Tests and all 30 concrete card assertions: [coverage matrix](../../powerups/08B_CARD_TEST_COVERAGE_MATRIX.md). Eighty explicit Attack/Reaction eligibility pairs and multi-card financial paths: [interaction matrix](../../powerups/08B_INTERACTION_MATRIX.md). Native, endurance and release limits are reported separately in [08B stabilization](../../powerups/08B_STABILIZATION_REPORT.md).
