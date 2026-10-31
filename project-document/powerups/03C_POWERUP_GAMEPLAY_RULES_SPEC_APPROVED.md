# OWN THE BLOCK — PHASE 03C: POWER-UP GAMEPLAY RULES SPECIFICATION

- **Spec ID:** OTB-PU-03C
- **Version:** 1.1 — P0 sign-off (26/10/2026)
- **Status:** **APPROVED FOR PHASE 03D — all four P0 groups approved by owner; later-phase P1/live-integration decisions remain open**
- **Basis:** 30-card Catalog V1.1 approved by owner; Phase 02 Technical Design (26/10/2026); Phase 03C decisions in current discussion.
- **Scope:** Game rules and implementation contracts. **This document does NOT authorize live START wiring, playable effects, UI, or additional phases.**
- **Interpretation:** `LOCKED` = owner explicitly approved in conversation; `CATALOG-APPROVED` = included in the 30-card approved catalog; `PROPOSED` = recommendation not included in the approved P0 set; `OPEN` = unspecified and requires technical/product decision.

## 1. Locked product decisions

| ID | Rule | Status |
|---|---|---|
| L-01 | Keep the existing Chance (Cơ Hội) and Community Chest (Khí Vận) rules and cells unchanged. There is **no dedicated Power-up tile**. | LOCKED |
| L-02 | **Every successful existing START cash reward of 200 game units (200,000 VND) grants exactly one Power-up offer**; no alternative lap detector, no additional route or cooldown condition. | LOCKED |
| L-03 | Each START offer contains **three pre-generated cards**, exactly one each in ATTACK, DEFENSE and UTILITY, category visible but name, rarity and effect hidden until choice. Player chooses one; all three are revealed; only selected card can enter inventory. | LOCKED |
| L-04 | Catalog V1.1 consists of **30 card definitions** (10 per category), as recorded below. | CATALOG-APPROVED |
| L-05 | **D03 changes from 'Phá Bẫy' to 'Phá Mưu'**: a Reaction that prevents an ATTACK effect with a persistent/deferred negative outcome from being applied. Target eligibility is defined by the approved P0 compatibility set in L-12. | LOCKED |
| L-06 | **U04 uses two other ingredient cards of any rarities** and grants one random card **one rarity tier above the highest ingredient** (not restricted to equal rarities). | LOCKED |
| L-07 | **Reaction Window lasts 15 seconds**; this is the response interval, not the disconnected-turn recovery duration. | LOCKED |
| L-08 | When the disconnected owner's existing recovery deadline expires while an START Reward offer is awaiting decision, **the server chooses a card randomly for them**. This is automatic server action and must not require a live client. Inventory-full resolution policy is OPEN. | LOCKED |
| L-09 | Previously recommended variants retained in approved Catalog V1.1: A04 reduces rent 25% up to 3 target-owner turns / 2 successful reductions; D04 blocks 2 attacks or expires after 3 owner turns, whichever first. | CATALOG-APPROVED |
| L-10 | P0 global defaults: capacity 3, rarity 60/29/10/1 per category, Active max 1 per turn, Reaction max 1 per player per event, duplicate instances permitted. | LOCKED (P0 sign-off) |
| L-11 | U04 cannot consume Legendary ingredients; invalid combinations must be rejected before spending any cards. | LOCKED (P0 sign-off) |
| L-12 | D03 compatibility IDs A03/A04/A05/A07/A10 when targeting the defending player or owned property; excludes A08 global and immediate A01/A06/A09. | LOCKED (P0 sign-off) |
| L-13 | U04 output sampling: uniformly choose among eligible categories of target rarity, then uniformly among definitions in chosen category; duplicate definitions including a consumed definition are allowed (new instance ID). | LOCKED (P0 sign-off) |

**Fundamental mapping:** The source of truth is the **existing grant from `awardStartReward`**, not simply `balance += 200`, not scanning the last 64 semantic events, and not listening independently to both PASS_GO and MONEY_TRANSFER.

## 2. Current Phase 02 baseline (verified from supplied Phase 02 report)

- Repo: `monopoly-v1.10.0-refactor`; pnpm/TypeScript monorepo, server-authoritative with serialized room commands and RAM transaction draft/commit.
- `apps/server/src/game/dice.ts`: `awardStartReward` issues the existing START cash award and PASS_GO / MONEY_TRANSFER events. `PASS_GO` has a UUID event ID. Movement semantics must remain unchanged.
- New Phase 02 server foundation: immutable registry, distinct definition/instance IDs, configurable per-player inventory, retained FIFO offers, an offer identity tied to the PASS_GO event ID, private owner projection helpers and effect/target/duration/disconnect interfaces.
- Phase 02 has **no official registry/catalog; no weights or capacity defaults; no live hook, socket delivery, effects, or scheduler integration**. Reported validation: 656 passing server tests, 17 new tests, 2 pre-existing skips, typecheck/lint/docs/release-contract pass. No independent rerun performed for this specification.
- Existing process-local RAM room state survives reconnect while host lives; host exit loses state. Do not invent durable DB persistence as a Phase 03D requirement.
- Phase 02 projectors do not emit new Power-up public/private transport payloads; owner projection helpers only are implemented. Current protocol 14, room snapshot schema 11; reassess only when wire contracts change.

## 3. Global rules — approved P0 defaults and remaining proposals

| Concern | Proposed V1 rule | Status |
|---|---|---|
| Hand capacity | 3 card instances/player; configurable, not hardcoded in foundation | LOCKED (P0 sign-off) |
| Active cap | Maximum **one Active activation per player turn**, including an attempted U06 declined by target | LOCKED (P0 sign-off) |
| Reaction cap | Maximum **one Reaction per responding player per originating event** | LOCKED (P0 sign-off) |
| Traps | Engine enum remains supported, but Catalog V1.1 contains **no Trap**; do not implement a non-existent trap-specific playable effect | PROPOSED |
| Duplicate definition | Multiple instances with the same `definitionId` can be held | LOCKED (P0 sign-off) |
| Hand lifetime | Unused cards do not expire; applied timed effects do | PROPOSED |
| Full inventory | On manual claim: choose one existing card to replace OR decline the selected new card; never silently replace | PROPOSED |
| Opponent knowledge | Show only inventory count and category counts; hide specific IDs, rarity and effect | PROPOSED |
| Trading | No general free-form card trading; U06 is an explicit exception | PROPOSED |
| Rarity draw weights | Per category, COMMON 60%, RARE 29%, EPIC 10%, LEGENDARY 1% | LOCKED (P0 sign-off) |
| Definition sampling | Equal likelihood among eligible definitions within the drawn category + rarity | LOCKED (P0 sign-off) |
| Card content confidentiality | Before reveal even card owner sees only category; after reveal owner gets all 3; opponents do not get selected definition/effects | START hiding LOCKED; opponent post-reveal detail PROPOSED |

The number of distinct definitions in each rarity tier is **not** the probability of that tier. The current Catalog V1.1 split is 5 Common, 3 Rare, 1 Epic, 1 Legendary per category.

### U04 upgraded rarity logic — owner-approved formula

Tier order: `COMMON (0) -> RARE (1) -> EPIC (2) -> LEGENDARY (3)`.

`outputTier = tier(max(ingredientA.rarity, ingredientB.rarity)) + 1`

| Ingredients (examples) | Output |
|---|---|
| Common + Common | Rare |
| Common + Rare | Epic |
| Rare + Rare | Epic |
| Common + Epic | Legendary |
| Rare + Epic | Legendary |
| Epic + Epic | Legendary |
| Any pair including Legendary | **INVALID — prohibited, reject before card consumption** |

- U04 itself is a Rare Active and is **consumed as the activator**, in addition to the two other inventory instances sacrificed. Result: 3 cards spent, 1 granted.
- Output definition and category random; its rarity is fixed by the formula, **not** the default 60/29/10/1 rarity pool.
- Do not allow U04 itself as one of its own two ingredients.
- The owner knowingly chose the stronger mixed-rarity design. **Do not silently substitute same-tier ingredients or silently nerf output.**
- **Approved guardrail:** reject ingredient sets containing a Legendary; show invalid recipe before consuming cards. Output is allowed to equal a consumed `definitionId` (new instance UUID); duplicate instances are allowed.
- Balance risk: Epic + Common forces a Legendary; this can increase Legendary frequency far above 1%. Track via telemetry/playtesting, not by changing the approved rule secretly.

## 4. Activation, resolution, timing

### 4.1 Activation windows

1. **ACTIVE:** Only current player, at a legal declared timing point, at most one Active per player turn (proposed cap).
2. **REACTION:** Open for eligible threatened actor(s) **before affected transaction/effect commits**; 15-second response window (locked). A pass/no-response resolves without the Reaction.
3. **TRAP:** Data type supported, but no playable Trap in V1.1 catalog after A03 replacement; D03 is now `Phá Mưu` (Reaction).
4. **Dice and movement:** U01 / U05 require a *post-roll, pre-movement* resolution checkpoint. U02 requires pre-movement. `rollDiceCommand` currently combines rolling and movement; **Phase 06 must adapt the authoritative command flow**, not rewrite committed history.
5. **Purchase/build:** U03 and U09 may only alter an upcoming eligible transaction; no retroactive refunds. U07 requires separate validated remote-purchase handling.
6. **Rent/debt:** D01/D08 and D07 react prior to final monetary commit/shortfall settlement. Card-specific constraints must be enforced on the server.

### 4.2 Suggested authoritative resolution pipeline

`validate actor+ownership+timing -> validate legal target -> announce pending effect privately/publicly as allowed -> 15s Reaction Window if eligible -> resolve prevention/redirection -> compute base economic event -> apply eligible modifiers once -> apply payer mitigation/third-party subsidy -> validate debt/bankruptcy -> atomic commit -> broadcast -> animate`.

- Do **not** invoke client-only timers to decide acceptance or calculate money. Persist an **absolute server deadline** or equivalent authoritative expiry metadata with the pending interaction; scheduler expiry must be idempotent, serializable with user commands, and decided by actual server time.
- A Reaction cannot itself open another Reaction in V1 (proposed anti-chain rule). This does **not** mean it can be applied after its event has committed.
- A target-changing Reaction (D05) must have explicit effect-specific semantics (e.g. for a cash steal, initial target becomes recipient while attacker becomes payer). Avoid merely swapping `targetId` if that would cause a self-transfer.
- Effects applied in past committed transactions must **never be undone** through D10 or other cards.

### 4.3 Rent math — proposed technical convention

1. Obtain rent from current Monopoly rules (do not redefine housing, ownership or mortgage logic).
2. Resolve card-based increases and decreases: only the **largest positive** and **largest negative** eligible modifier, calculated against base rent; additive relative to base, not sequential multipliers. Floor at zero.
3. Resolve the final landlord receipt and payer obligation, and only then payer insurance/subsidy and income split. A07's share is from realized eligible landlord revenue and is capped per card definition; it should not generate extra payer costs.
4. A10's extra 50% charge, capped at 100k, is an **independent surcharge paid to the bank**, not income to the landlord; D01/D08 rent-only protection does not automatically exempt it.
5. Use existing game monetary unit: `1 game unit = 1,000 VND` (e.g. 50k = 50 units). **OPEN:** integer rounding and whether to floor each component or only the settled transaction; settle before Phase 06.

### 4.4 Durations, stacking, status

- Prefer **Turn Manager's authoritative player-turn identity/sequence**, not browser time, for turn-based expiry. **OPEN:** whether extra turns from doubles count as independent turns or one player's cycle; verify actual turn model.
- A04: 25% rent penalty for the target property, expiry after 3 turns of owner or 2 successful affected rents, whichever first (catalog approved).
- D04: one property, 2 shield charges, expiry after 3 turns of property owner or 2 blocked compatible incoming effects, whichever first (catalog approved).
- A02: +25% rent on next eligible collection on one owned property, expires after 2 turns of owner without use (catalog approved).
- A03: +20% cost on target's next *eligible* unowned purchase, cap 50k, expires after target's 2 upcoming turns (catalog approved).
- A05: cannot voluntarily build/upgrade in target's next turn; debt-resolution mandatory acts remain allowed.
- A07: 50% of target's next rent received to attacker, capped at 100k; expires after 2 target turns without rent.
- A08: all opponents' rent reduced 50% until attacker's next turn begins; does not affect attacker's own properties.
- A10: a one-time surcharge on target's next eligible rent paid, within two target turns.
- D10: removes **future** remainder of one qualifying negative status; no retroactive compensation.
- **OPEN:** multiple independent instances of identical status on same target; recommended: prohibit stacking identical statuses, resolve strongest compatible source and document consumption behavior.

## 5. START reward + disconnected owner — locked principle, open execution details

### 5.1 Identity and atomicity

- **One existing PASS_GO occurrence = one 200-unit grant + exactly one offer**; `offerId = occurrence.eventId` (foundation identity). Generate offer *inside the same room transaction draft* as the START award; no duplicate offer on reconnect/client retry.
- Make sure to test STOP/GO cards and unusual movement paths based on actual `awardStartReward()` behavior. No extra laps or special-case filtering.
- START cash payout remains unchanged and immediate under existing rules. Offer UI may be delayed behind payment, land-purchase, classic-card or forced-sale interactions.
- Distinct awards must remain distinct FIFO identities, even when produced in a single command. Draw candidates once and persist all three before selection.

### 5.2 Manual offer handling (proposed)

- Current player: present the oldest **eligible** mandatory offer when blockers clear; cannot voluntarily end turn with an eligible pending offer.
- Player selects among 3 stored options; the index is locked once; reveal all; then resolve capacity through explicit keep/replace/decline; never reroll on refresh.
- The display/snapshot for another player must not leak hidden definition IDs or rarity.

### 5.3 Disconnected-owner recovery (locked rule; implementation TBD)

- Current product has deadline scheduler that defaults to **60 seconds** for disconnected active player (configurable; not an invented 15-second timer). **At recovery timeout, choose randomly from the three cards already stored for each pending START offer**; do not regenerate cards or use a new weighted rarity draw.
- The random choice must be made **by the authoritative server**, persisted atomically with `SELECTED -> REVEALED -> inventory resolution -> COMPLETED`, and be idempotent against scheduler re-entry/reconnect races.
- After resolving due offers, the existing turn recovery may proceed. A disconnected player must not deadlock their own or another player's queue.
- **OPEN / blocking for live Phase 04–05:** if the disconnected player's hand is full, should server (A) discard newly selected card, (B) auto-replace an existing card, or (C) another deterministic policy? Random choice does not specify this. Recommendation: default discard the *new* card, preserve existing inventory to avoid destructive involuntary replacement.
- **OPEN:** if a disconnected/noncurrent owner has queued offers, determine whether recovery must wait until they are current or process all valid offers per owner without violating global FIFO. Current foundation FIFO allows only owned pending head; needs test-backed scheduling solution.
- **OPEN:** handling a pending offer when actor is eliminated, revived, resigns or match ends.
- **OPEN:** bot selection: bot is not the same as disconnected human. Recommend choose automatically by bot strategy or uniformly at server discretion, but confirm explicitly before live rollout.

## 6. Card Catalog V1.1 — approved functional baseline (30)

**Notes:** Monetary figures are VND display units; translate to integer game units when implementing. Short entries reference approved earlier detailed descriptions. D03 is superseded by user's Phase 03C decision; U04 mixed-rarity formula supersedes the earlier same-rarity suggestion. The listed timings and target constraints reflect prior catalog; any newly uncovered conflict must be flagged, not silently changed.

### ATTACK (10)

| ID | Rarity | Type | Name | Approved effect / limits |
|---|---|---|---|---|
| A01 | Common | Active | Móc Túi | Steal 10% of a chosen opponent's available cash, max 50k; reactable. |
| A02 | Common | Active | Tăng Phí Đột Xuất | +25% next eligible rent for one owned property; no rent-buff stacking; expires after 2 owner turns. |
| A03 | Common | Active | Hợp Đồng Bất Lợi | Chosen opponent pays +20% to bank on next eligible unowned-property purchase (max 50k) within 2 target turns. |
| A04 | Common | Active | Tung Tin Đồn | Chosen opponent's property rent -25% up to 3 owner turns or 2 successful reduced rents, whichever first. |
| A09 | Common | Active | Thanh Tra Bất Ngờ | Chosen opponent pays bank 10k per house, max 50k; hotel counts as five houses. |
| A05 | Rare | Active | Phong Tỏa Xây Dựng | Target cannot voluntarily build or upgrade in their next turn; mandatory debt resolution not blocked. |
| A06 | Rare | Active | Trộm Thẻ | Take a random unplayed inventory card from an opponent; must have spare capacity at activation. |
| A10 | Rare | Active | Gánh Nặng Tiền Thuê | On target's next eligible rent paid in next 2 turns: +50% surcharge capped at 100k to bank; once. |
| A07 | Epic | Active | Chiếm Đoạt Doanh Thu | Claim 50% of next eligible rent received by target, max 100k; no extra payer charge; expiry after 2 target turns. |
| A08 | Legendary | Active | Khủng Hoảng Thị Trường | All opponents' property rents -50% until the attacker's next turn begins; attacker properties unaffected. |

### DEFENSE (10)

| ID | Rarity | Type | Name | Approved effect / limits |
|---|---|---|---|---|
| D01 | Common | Reaction | Bảo Hiểm Tiền Thuê | Reduce one rent obligation by 40%, max discount 80k, before settlement. |
| D02 | Common | Reaction | Ví Chống Trộm | Block up to 50k of an incoming direct Power-up cash theft. |
| D03 | Common | Reaction | **Phá Mưu** | Before status creation, block targeted ongoing/deferred ATTACKs A03/A04/A05/A07/A10 against the defender or a property they own. Excludes global A08 and instant A01/A06/A09. |
| D04 | Common | Active | Lá Chắn Bất Động Sản | Protect one owned property against 2 compatible direct Power-up attacks; expires after 3 owner turns or 2 charges. |
| D09 | Common | Reaction | Khóa Kho Thẻ | Block involuntary Power-up theft/forced swap on own inventory; not voluntary U06 trades. |
| D05 | Rare | Reaction | Phản Đòn | Reflect a compatible single-target Attack onto attacker; effect-specific direction and beneficiaries; no Reaction-on-Reaction. |
| D06 | Rare | Reaction | Hủy Phép | Cancel a pending Attack targeted at self or owned property before it resolves. |
| D10 | Rare | Active | Giải Phong Tỏa | Remove one negative ongoing status on self/owned property; future only. |
| D07 | Epic | Reaction | Quỹ Cứu Trợ | When lacking cash for mandatory obligation, bank contributes shortfall up to 100k; remaining debt process unchanged. |
| D08 | Legendary | Reaction | Bất Khả Xâm Phạm | On rent payment, bank covers up to 200k and landlord receives full eligible rent; player pays excess. |

### UTILITY (10)

| ID | Rarity | Type | Name | Approved effect / limits |
|---|---|---|---|---|
| U01 | Common | Active | Xúc Xắc May Mắn | After roll but before movement, reroll and mandatorily use the new result; preserve double rules as defined. |
| U02 | Common | Active | Tăng Tốc | Before movement, add +2 steps to movement distance without modifying raw dice result; START grant follows actual movement helpers. |
| U03 | Common | Active | Phiếu Giảm Giá Đất | -15% on one legal unowned-property purchase that turn, max 50k; excludes auction/player trade. |
| U06 | Common | Active | Trao Đổi Vận May | With consenting target, mutually exchange one randomly selected inventory card; declined request retains U06 but uses Active allowance; U06 itself excluded from swap. |
| U09 | Common | Active | Phiếu Ưu Đãi Xây Dựng | -20% on next eligible build/upgrade once, cap 50k; expires after 2 owner's turns. |
| U04 | Rare | Active | **Hiến Tế Nâng Cấp** | Consume U04 + 2 other ingredient Power-ups of ANY rarities; receive random power-up one rarity ABOVE highest ingredient; Legendary ingredients prohibited; output sampling uniform by eligible category then definition, duplicates allowed. |
| U05 | Rare | Active | Định Hướng | After roll, before movement, vary steps from -3 to +3 while still moving at least 1; honor existing START hook. |
| U10 | Rare | Active | Tái Cấu Trúc Kho Thẻ | Transform another card into random new card of chosen category, preserving rarity, excluding original definition; excludes Legendary in V1. |
| U07 | Epic | Active | Đầu Tư Từ Xa | Buy legal unowned property at 125% of list price without moving; no tile activation / START trigger. |
| U08 | Legendary | Active | Dịch Chuyển Hoàng Gia | Replace movement with direct travel to any property; resolve destination rules, and preserve exact START grant behavior of the chosen movement helper. |

## 7. Technical findings requiring confirmation before Codex Phase 03D

The four P0 rows below are **owner-approved as of 26/10/2026**. Remaining P1 and later-phase details are not approved and do not license Codex to invent permanent game rules.

### 7.1 Phase 03D — P0 decisions closed, P1 design tasks

| Priority | Issue | Why important | Proposed resolution / action |
|---|---|---|---|
| CLOSED P0 | **U04 with Legendary ingredient** | Tier `Legendary+1` does not exist. | Forbid Legendary ingredients; reject before spending cards. APPROVED. |
| CLOSED P0 | **D03 eligibility** | Prevent overlap with mass/instant effects. | Valid A03/A04/A05/A07/A10 if defender or owned property is directly targeted; global A08 and instant A01/A06/A09 excluded. APPROVED. |
| CLOSED P0 | **Global defaults** | Phase 02 deliberately had no configured production defaults. | Capacity 3; weights 60/29/10/1; Active 1/turn; Reaction 1/responding player/event; duplicates allowed. APPROVED. |
| CLOSED P0 | **U04 output sampling** | Output has a fixed target rarity and variable categories. | Uniform eligible category, then uniform definition; duplicates including consumed `definitionId` permitted. APPROVED. |
| P1 | **Stable effectKey and typed parameters** | Definitions must be testable without writing effect behavior; 30 distinct names do not necessarily need 30 engine handlers. | Define generic stable effect keys (`TRANSFER_CASH`, `RENT_MODIFIER`, `RESTRICT_ACTION`, etc.) and strongly validated configuration payloads; reject unknown fields. |
| P1 | **Changing D03 semantics** | Phase 02 registry requires semantic identity immutability during a match. | Treat approved revised D03 as initial production definition (none live yet); never reuse ID after production semantic changes. |

### 7.2 Later-phase live integration gates (should be documented in 03D, not implemented then)

| Issue | Required decision / validation before live Phase 04–06 |
|---|---|
| Disconnect auto-select with full inventory | Specify deterministic preservation/replacement/decline; recommend discard new card. |
| Global FIFO vs offline owner | Determine scheduling without a stale offline FIFO head blocking another player; test against `deadlineScheduler` re-arm. |
| Bot | Define auto-choice and Reaction heuristics; no bot policy shipped in Phase 02. |
| 15s Reaction timing | Atomic race between response and expiry; reconnect, invalid action, clock anchoring, no nested windows. |
| D03/D05/D06 conflict | Fix compat matrix and prevent invalid redirection, blocked already-applied statuses, or redundant double Reaction. |
| U01/U02/U05/U08 movement | Pre-movement state and dice doubles, extra-turn rules, jailed rolls, START grants, replay prevention. |
| Mandatory shortfall + D07/D08 | Define precise before-commit payment hook, total owed, subsidies and bank transfer accounting. |
| Economic rounding and caps | Integer units, percentage rounding, caps, max simultaneous rent statuses; test edge values. |
| Duration | Count completed turns vs individual extra rolls/turns; owner removal, mortgage/property transfer, same-status stacking. |
| Lifecycle and cleanup | Elimination/revival/leave/end-match pending offers, inventory, statuses, winner determination. |
| Visibility and commands | Owner-only projection and authenticated socket commands; protocol/schema version plan; no client-side authorization. |
| Reward event ledger growth | Completed offer retention currently indefinite per match; stress long sessions without breaking occurrence dedupe. |

## 8. Non-goals and Phase 03D acceptance criteria

**Phase 03D is definition and validation work only**, not runtime effects. Do not connect START producer to live room commands, modify classic cards, enable new Socket.IO flows, implement `Reaction Window`, refactor roll/movement commands, implement new money or property changes, or create presentation UI.

**Phase 03D deliverables:**

1. Official immutable registry of 30 definitions with stable IDs (A01…A10, D01…D10, U01…U10), names, category, rarity, activation, effect keys and serializable typed parameter data.
2. Catalog manifest and owner-approved config separated from effect engine behavior. Preserve compatibility with Phase 02 interfaces.
3. Per-definition validation + tests for exact 10/10/10 groups; 5 Common/3 Rare/1 Epic/1 Legendary per group; unique IDs; unknown effect-key rejection; trigger/target/parameter validation; immutable copies; U04 valid/invalid recipes and boundary if approved; D03 compatibility matrix if approved.
4. Documentation mapping `ID -> behavior -> target -> timing -> duration -> cap -> reaction policy -> effectKey/parameters -> tests`, with `OPEN` items explicitly marked rather than silently guessed.
5. Run server tests, package typechecks, lint, documentation and release contract checks; report exact counts, changes and any regression.
6. Stop after Phase 03D and request approval before Phase 04.

**Exit criteria:** All P0 rules have been approved; Codex completes definition tests without gameplay regression, and the report identifies all prerequisites for Phase 04/05/06.

## 9. Owner sign-off record (26/10/2026)

The following P0 rules are **APPROVED**, not merely suggested:

- **Capacity/rarity/caps:** inventory=3, distribution per category=60/29/10/1, Active=1 per turn, Reaction=1 per responding player per event, duplicate instances allowed.
- **U04:** exactly two non-U04 ingredient cards, mixed rarities accepted; forbid Legendary as input; output must be one tier above highest. Uniformly draw eligible category then definition at resulting rarity. Allow same definition as consumed card (new instance), no reroll.
- **D03:** target-scoped future/persistent ATTACK effects only: A03, A04, A05, A07, A10; exclude global A08 and immediate A01/A06/A09. Interaction with D04 and D06 resolves with one Reaction opportunity per victim per originating event.
- **Offline full hand (P1 LIVE GATE, NOT PART OF P0 APPROVAL):** recommended auto-select among three pre-generated cards then discard selected new card when inventory is full, preserving old cards. Requires explicit approval before live phase.
- **No gameplay activation in 03D**, and all remaining P1/live-integration uncertainty documented.

## 10. Change control

Any change to an already approved card's rarity, monetary effect, activation or target semantics requires a Catalog amendment (and a new definition identity when production semantics change). The four Phase 03C user decisions above supersede earlier assistant suggestions; unapproved P1/live-integration details must remain visibly tagged `PROPOSED` or `OPEN`. All four P0 groups above are LOCKED.

## 11. Phase 03D handoff authorization

**Authorized scope:** implement official data-only 30-card catalog/manifest, approved configuration, typed serializable schema/validation, compatibility definitions and tests on existing Phase 02 foundation. Run applicable automated checks and provide evidence. **Stop after Phase 03D.**

**Not authorized:** START hook wiring, offer delivery, active in-match Power-up effects, money/property/movement changes, Reaction scheduler or live 15s windows, UI, animation, bot/disconnect integration. These require later-phase approval.

**Any technical ambiguity not decided here:** document an explicit `OPEN`/`P1` item, do not choose irreversible gameplay semantics silently.
