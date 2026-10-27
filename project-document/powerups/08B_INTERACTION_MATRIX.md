# Phase 08B — Interaction matrix

CURRENT DEVELOPMENT, 2026-10-27. Definitions/approved values unchanged.

## Explicit Attack / Reaction eligibility

All 80 cells have named `$attack + $defense` cases in `apps/server/src/game/powerUps/stabilization.test.ts`. Y means eligible before commit with a valid owned instance and legal effect-specific target; N means no compatible attack response is opened. D05/A04 also needs an attacker-owned destination; D05/A06 needs another stealable attacker card and capacity after consuming D05. D01/D07/D08 instead belong to payment events.

| Attack | D01 | D02 | D03 | D05 | D06 | D07 | D08 | D09 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | N | Y | N | Y | Y | N | N | N |
| A02 | N | N | N | N | N | N | N | N |
| A03 | N | N | Y | Y | Y | N | N | N |
| A04 | N | N | Y | Y | Y | N | N | N |
| A05 | N | N | Y | Y | Y | N | N | N |
| A06 | N | N | N | Y | Y | N | N | Y |
| A07 | N | N | Y | Y | Y | N | N | N |
| A08 | N | N | N | N | N | N | N | N |
| A09 | N | N | N | Y | Y | N | N | N |
| A10 | N | N | Y | Y | Y | N | N | N |

## Required combinations and actual outcomes

| Combination | Result | Asserted behavior |
| --- | --- | --- |
| A02 + A04 + A08 | PASS | Strongest increase and reduction against base; 1/3/101/250/400, one use only |
| A03 + U03 | PASS | Exact component caps/rounding; actual purchase with low-cash rejection and coupon retention |
| A05 + U09 | PASS | Real build rejected; SKIP remains legal; no discount consumption on failure |
| A06 + D09 | PASS | Pre-commit block and unused-card timeout theft ownership |
| A07 + rent modifiers | PASS | Base 101 → adjusted 77 → landlord 39 / beneficiary 38 |
| A07 + D01 / D08 | PASS | Collected-revenue split, 100 cap, partial cash/bankruptcy and Bank contribution |
| A10 + D01 / D08 | PASS | Independent Bank surcharge retained after rent-only protection |
| A03/A04/A05/A07/A10 + D03 | PASS | All five statuses prevented before creation; unsupported types excluded |
| A04 + D04 | PASS | Exactly two interceptions; third-owner-turn expiry |
| A04 + D06 | PASS | Pre-commit cancellation leaves no rent penalty |
| A04 + D10 | PASS | Only future remainder removed; no retroactive money |
| D05 + targeted attacks | PASS | All eight targeted attack directions; property ownership, A06 resolving-card exclusion/capacity |
| D07 + payment shortfall | PASS | Five shortfall boundaries, one originating operation, Bank cap and remaining liquidation |
| U01 + U02 + U05 + dice rules | PASS — invalid same-turn sequence rejected | Movement checkpoint and Active allowance; raw dice and original no-extra-roll rules preserved |
| U04 + U10 | PASS — invalid same-turn sequence rejected | U04 output same rarity transform only on a later turn; new instance IDs |
| U06 + full inventory / disconnect | PASS | Full-hand swaps, decline/timeout retain activator, target reconnect, pending removal |
| U07 + normal purchases | PASS | Owned/non-property/low cash rejected; 125% remote purchase does not land or award START |
| U08 + START Reward | PASS | Actual helper crossing grants exactly one 200-unit transfer and one offer |
| Reaction timeout + rollback | PASS | Exact deadline, duplicate scheduler calls, failed save preserves pending state, retry once |
| Elimination + statuses / pending state | PASS | All card cleanup; three-seat Reaction/consent removal leaves executable turn |
| A04 + D05 + D04 | PASS | Reflected attack encounters passive shield and opens no Reaction chain |
| A07 + liquidation / bankruptcy / team rescue | PASS | Cumulative receipts and cap; net rescue cost if beneficiary is rescuer |

The first 20 requested interaction groups all have passing evidence. The additional two rows cover defects discovered during stabilization. Source references: `stabilization.test.ts`, `runtime.test.ts`, `socket.powerUps.allCards.integration.test.ts`, `socket.powerUps.integration.test.ts`, and `bots/driver.test.ts` under `apps/server/src/` (runtime files are in `game/powerUps/`). The socket suite exercises real purchase/build decisions, multiplayer races, deadline save rollback and reconnect.

## Other pairs and financial integrity

All Active cards share one per-turn allowance: a second activation in the same turn is rejected. Instant effects do not create artificial persistent combinations; unrelated statuses can coexist and follow their own owner/source/use lifecycle. This is an eligibility and meaningful-interaction matrix, not a claim that all 900 ordered pairs and every game state were separately played.

Money, grants and cards change only inside the cloned room transaction. A07 stores cumulative collected/forwarded amounts in a private rent claim; payer insurance, Bank subsidy and Bank surcharge remain distinct. All 30 card command cases compare the entire room after an injected save failure and a rejected replay. No public projection exposes held definition/instance IDs or private rent-allocation metadata.
