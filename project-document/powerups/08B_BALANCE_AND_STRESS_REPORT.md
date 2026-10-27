# Phase 08B — Balance and stress evidence

CURRENT DEVELOPMENT, 2026-10-27. No approved effect, amount, rarity, duration, card or global rule was changed. Recommendations below are proposals for the Product Owner only.

## Seeded full-game endurance

Command: `pnpm --filter @monopoly/server exec vitest run src/game/powerUps/endurance.test.ts` (also included in the complete server suite). Seeds: 80801, 80802, 80803, 80804. One connected human seat is controlled by the existing bot policy; three real bot seats act through `runGameCommand`. Human Reaction prompts pass; bot reactions use the production automatic pass. Virtual time advances 3 seconds per decision and can jump to an actual server deadline. Policy RNG and card/dice test entropy are seeded; UUID identities remain random.

The no-Power-up test harness suppresses only START offer issuance; product code is unchanged. Shared RNG consumption differs once card decisions occur, so matched seeds are repeatable scenarios, not identical-dice counterfactuals. No full-match results are inferred from draw sampling.

| Seed | Power-ups | Completed | Commands | Turns | Reconnects | Rejected policy choices |
| --- | --- | --- | --- | --- | --- | --- |
| 80801 | baseline | yes | 394 | 240 | 0 | 0 |
| 80802 | baseline | yes | 408 | 261 | 0 | 0 |
| 80803 | baseline | yes | 218 | 132 | 0 | 0 |
| 80804 | baseline | yes | 573 | 392 | 2 | 0 |
| 80801 | enabled | yes | 379 | 232 | 1 | 0 |
| 80802 | enabled | yes | 288 | 156 | 1 | 0 |
| 80803 | enabled | yes | 405 | 246 | 1 | 0 |
| 80804 | enabled | yes | 426 | 263 | 2 | 0 |

- Completion: **8/8**, no detected deadlocks, no command-limit exhaustion, no rejected policy choices. Total commands: **3,091**.
- Final run: 101.572 seconds wall time. The report is an in-process integration workload, not eight human-paced network matches.
- Command processing: p50 18.157 ms, p95 42.537 ms, max 373.927 ms over 3091 samples. Other validation jobs ran on the same Windows host, so timings are observational.
- Peak sampled match snapshot: 106,396 bytes. Maximum retained reward offers in these matches: 42; maximum simultaneous statuses: 2. Every completed match clears pending movement/reaction/trade and active statuses. Reaction identity retention is asserted <=256.
- Process heap: 37.95 MiB at start; 209.84 MiB at end; sampled high-water 386.50 MiB. This includes Vitest, retained finished rooms and uncollected garbage; it is **not proof of leak freedom**.

## Long retained-history workload

Command: `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpHistoryStress.mjs`. This synthetic single-room workload performs 3,000 actual START grants and production reward completions, always choosing stored candidate zero. The first three cards fill the hand; subsequent offers discard the new card. It is not a full match or a draw-frequency result. Each sampled size performs five clone/schema checks.

| Completed rewards | Snapshot bytes | Owner Power-up projection bytes | Clone + schema validation range (ms) | Semantic tail |
| --- | --- | --- | --- | --- |
| 0 | 1991 | 144 | 0.59–8.05 | 0 |
| 100 | 96740 | 2572 | 5.21–14.52 | 64 |
| 500 | 305827 | 2656 | 10.18–22.43 | 64 |
| 1000 | 520892 | 2614 | 12.78–28.68 | 64 |
| 3000 | 1381019 | 2569 | 36.93–50.78 | 64 |

Workload wall time: 1237.57 ms. START cash was asserted at exactly 1,500 + 3,000×200, every offer completed, capacity stayed three, and owner projection sent at most one completed offer. Completed occurrence/offer identities are intentionally retained to prevent replay, so RAM snapshot growth is linear; the semantic tail and owner projection stay bounded. At 3,000 rewards the snapshot is about 1.32 MiB and clone/schema checks remain below 50.78 ms. No history was pruned to hide this cost. A lifetime retention policy is a future architectural proposal, not a changed gameplay rule.

## Draw and recipe sampling

Command: `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpsBalance.mjs`. Seed 0xb10c2026; 200,000 offers / 600,000 production-generated candidates, plus a distinct 200,000-recipe scenario. The recipe scenario now excludes **both Legendary and U04 ingredients**, matching approved legality. It is a distribution/scenario analysis, separate from the full matches above. Natural offered rarity percentages: {"COMMON":{"count":360035,"percent":60.006},"RARE":{"count":173886,"percent":28.981},"EPIC":{"count":59968,"percent":9.995},"LEGENDARY":{"count":6111,"percent":1.018}}. U04 outputs: {"COMMON":{"count":0,"percent":0},"RARE":{"count":79072,"percent":39.536},"EPIC":{"count":81350,"percent":40.675},"LEGENDARY":{"count":39578,"percent":19.789}}.

## Evidence and Product Owner proposals

| Area | Evidence / finding | Recommendation — not implemented |
| --- | --- | --- |
| Attack / Defense / Utility | Scenario suite verifies monetary outcomes; full-match policy uses only the documented bounded Active heuristic and passes reactions | No causal category ranking from this policy; run human strategic trials |
| Legendary natural draw | 1.018% of 600,000 candidates; 2033 selected Legendary among 200,000 uniform choices | Keep approved 1%; collect real-category choice telemetry |
| U04 | 19.789% Legendary outputs from 200,000 legal independently sampled ingredient pairs | Strong amplification is approved. Monitor strategic Epic+Common recipes; any tuning requires PO approval |
| Inventory saturation | 55.77% of 4617 command-state hand samples were full | Bot strategy does not use all Utility/Reaction cards; avoid treating saturation as a player prediction |
| Defensive reactions | D01 saves up to 80; D07 contributes up to 100; D08 covers up to 200; D03/D04/D05 prevent/redirect targeted outcomes | Human reaction-value trials needed; auto-pass policy understates their strategic value |
| Rent distortion | Base 101 with A02+A04+A08 becomes 77; A07 then splits 39/38; A10 remains separate Bank income | Watch high-rent late game and global A08. Do not change the approved values |
| Cash-flow integrity | A07 corrected for actual receipts, cumulative rounding, D08 and team rescue; no extra payer charge | Retain financial regression cases |
| Movement Utility | U02 +2; U05 -3..3/min1; U01 mandatory reroll; U08 chosen property; START once at 200 | Opportunity advantage depends on destination risk; no automatic value ranking |
| Early / middle / late | Command-state means are recorded below; strongest property effects become more valuable as rents/buildings grow | Observe player strategies across match stages |
| Match length | Baseline mean 256.25 turns; Power-up mean 224.25 turns across four seeds each | Small-sample scenario result, not causal proof or a rebalance mandate |
| U10 | Two cards become one same-rarity card; empty same-category Epic pools reject; a fresh U10 is legal | Situational hand/category management; no unauthorized buff proposal implemented |

Command-state phase sample means (not independent player observations):

| Phase | Sampled states | Mean total player cash (units) | Mean owned properties |
| --- | --- | --- | --- |
| early | 275 | 4003.70 | 10.30 |
| middle | 528 | 2797.10 | 19.86 |
| late | 695 | 3287.50 | 21.45 |

Raw machine-readable evidence: `test-results/powerup-08b/endurance.json`, `history-stress.json`; full command logs and a preserved copy are in the external Phase 08B evidence directory recorded in the stabilization report. No statistical significance, optimized all-card bot strategy, physical memory leak certification or human balance acceptance is claimed.
