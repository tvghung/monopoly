# Phase 03D — Official Card Definitions & Validation

> **CURRENT DEVELOPMENT — IMPLEMENTED, AWAITING OWNER ACCEPTANCE.** 26/10/2026. Repository: monopoly-v1.10.0-refactor. This phase delivers static definitions and pure validation; Phase 04 has not started.

## Authority and source verification

Primary source: [03C APPROVED V1.1](./03C_POWERUP_GAMEPLAY_RULES_SPEC_APPROVED.md), all P0 groups signed off. Foundation: [Phase 02 design](./02_TECHNICAL_DESIGN.md), [canonical Power-up contract](../monopoly-websockets/GameCore/power-ups.instruction.md), current shared/GameCore conventions and F53 traceability. The attached approved file was copied byte-for-byte to its required repository path; SHA-256: `50d53c8bd4a0781fc0a09db209e2e9892c338d9fb04a783b8c6b2b68fa1e99c8`. Its §6 contains the complete approved Catalog V1.1, so a separate 03B file was not necessary to reconstruct or invent any card. Automated tests compare all 30 identities and descriptions directly with that table.

**Additional owner clarification in this task:** §9 “two non-U04 ingredient cards” excludes **every definitionId U04** as an ingredient, including a second U04 instance. This resolves the narrower wording in §3; the supplied approved file itself is preserved unchanged. U04 may still be randomly produced as output from two Common ingredients, matching the consumed activator definition with a new future instance identity.

The checkout already contained uncommitted Phase 02 and unrelated refactor/audit work. Those changes were preserved. The following inventory describes this task's delta against the initial workspace, rather than treating every existing untracked file as newly created here.

## Files created and modified

Created in this task:

- `packages/shared/src/powerUpConfig.ts`
- `packages/shared/src/powerUpEffects.ts`
- `apps/server/src/game/powerUps/catalog.ts`
- `apps/server/src/game/powerUps/validation.ts`
- `apps/server/src/game/powerUps/catalog.test.ts`
- `apps/server/src/game/powerUps/config.test.ts`
- `project-document/powerups/03C_POWERUP_GAMEPLAY_RULES_SPEC_APPROVED.md`
- `project-document/powerups/03D_CARD_DEFINITIONS_REPORT.md`

Modified in this task:

- `packages/shared/src/index.ts`
- `apps/server/src/game/powerUps/registry.ts`
- `apps/server/src/game/powerUps/foundation.ts`
- `project-document/README.md`
- `project-document/monopoly-websockets/GameCore/power-ups.instruction.md`
- `project-document/monopoly-websockets/testcase/power-ups.md`
- `project-document/monopoly-websockets/GameCore/README.md`
- `project-document/monopoly-websockets/Shared/README.md`
- `project-document/monopoly-websockets/FEATURE_TRACEABILITY.md`
- `project-document/monopoly-websockets/ARCHITECTURE_DECISIONS.md`

No dependency/lockfile, room initialization, network DTO, protocol version, snapshot shape, command, scheduler, money/property/movement routine, Chance/Chest deck, UI, animation or bot implementation was changed. The foundation change makes owner projection definitions deep detached copies now that definitions contain nested parameter/rule objects.

## Registry and configuration

`apps/server/src/game/powerUps/catalog.ts` exports `OFFICIAL_POWER_UP_CATALOG_MANIFEST`, `OFFICIAL_POWER_UP_DEFINITIONS`, `OFFICIAL_POWER_UP_REGISTRY`, `validateOfficialPowerUpCatalog` and `createOfficialPowerUpRegistry`. The manifest identifies catalog 1.1 / OTB-PU-03C 1.1. Registry data is process-static, fully serializable and deeply frozen after parsing detached copies. A JavaScript private map prevents external access to registry storage; returned lists are frozen. No definition contains an executable handler.

The official factory rejects unknown/missing fields, unknown effects/IDs, duplicate IDs, missing/wrong parameters and deviations from the approved contract. The generic registry remains usable with Phase 02 fixture definitions and defaults to its original base schema; extended typed definitions require their matching parser. Registry identity must remain stable during a match. These are the first official definitions; the obsolete D03 name is never registered.

| Item | Approved value | Implementation |
| --- | --- | --- |
| Definitions | 30; ATTACK 10 / DEFENSE 10 / UTILITY 10 | Official manifest |
| Rarity counts | Each category: Common 5 / Rare 3 / Epic 1 / Legendary 1 | Catalog validation |
| Rarity draw weights | Each category: 60 / 29 / 10 / 1 | Immutable config, no live START sampler |
| Inventory capacity | 3 | Explicit config; Phase 02 capacity primitive unchanged |
| Active allowance | 1 per player turn | Config only, runtime enforcement deferred |
| Reaction allowance | 1 per responding player per originating event | Config only |
| Reaction Window | 15 seconds | Config only; no timer installed |
| Duplicate definitions | Allowed across distinct instances | Config and inventory compatibility test |

`packages/shared/src/powerUpConfig.ts` validates the exact approved V1 configuration, rejects missing/unknown fields and changed values, and freezes both root and rarity weights. This is separate from future runtime enforcement. The 15-second response window does not replace the existing disconnected-player recovery duration.

## Official 30-card registry and typed effects

Source: `apps/server/src/game/powerUps/catalog.ts`. Schemas/types: `packages/shared/src/powerUpEffects.ts`. There are **28 effect keys**; A02/A04/A08 share RENT_MODIFIER. Parameters are discriminated by effectKey, strict at all object levels and constrained to serializable supported values. All amounts below are **integer game units, 1 unit = 1,000 VND**; percentages remain percentages.

The approved behavior text is retained in each definition's description and verified against 03C §6. Conditions are typed data, covering current actor/ownership, legal transaction, spare capacity, shortfall, consent and ingredient eligibility. They describe the relevant activation/application checkpoint; no generic runtime evaluator or new eligibility rule is installed here.

| ID | Name | Category | Rarity | Activation | effectKey / typed parameters (game units) |
| --- | --- | --- | --- | --- | --- |
| A01 | Móc Túi | ATTACK | COMMON | ACTIVE | `TRANSFER_CASH` `{"percentOfAvailableCash":10,"capUnits":50}` |
| A02 | Tăng Phí Đột Xuất | ATTACK | COMMON | ACTIVE | `RENT_MODIFIER` `{"percent":25,"noRentBuffStacking":true}` |
| A03 | Hợp Đồng Bất Lợi | ATTACK | COMMON | ACTIVE | `PURCHASE_SURCHARGE` `{"percent":20,"capUnits":50,"recipient":"BANK","unownedOnly":true}` |
| A04 | Tung Tin Đồn | ATTACK | COMMON | ACTIVE | `RENT_MODIFIER` `{"percent":-25,"noRentBuffStacking":false}` |
| A05 | Phong Tỏa Xây Dựng | ATTACK | RARE | ACTIVE | `RESTRICT_ACTION` `{"actions":["BUILD","UPGRADE"],"mandatoryDebtActsAllowed":true}` |
| A06 | Trộm Thẻ | ATTACK | RARE | ACTIVE | `STEAL_CARD` `{"selection":"UNIFORM_RANDOM_UNPLAYED","spareCapacityAtActivation":true}` |
| A07 | Chiếm Đoạt Doanh Thu | ATTACK | EPIC | ACTIVE | `RENT_SHARE` `{"percent":50,"capUnits":100,"extraPayerCharge":false}` |
| A08 | Khủng Hoảng Thị Trường | ATTACK | LEGENDARY | ACTIVE | `RENT_MODIFIER` `{"percent":-50,"noRentBuffStacking":false}` |
| A09 | Thanh Tra Bất Ngờ | ATTACK | COMMON | ACTIVE | `BUILDING_LEVY` `{"unitsPerHouse":10,"capUnits":50,"hotelHouseEquivalent":5,"recipient":"BANK"}` |
| A10 | Gánh Nặng Tiền Thuê | ATTACK | RARE | ACTIVE | `RENT_SURCHARGE` `{"percent":50,"capUnits":100,"recipient":"BANK","independentOfRentProtection":true}` |
| D01 | Bảo Hiểm Tiền Thuê | DEFENSE | COMMON | REACTION | `RENT_DISCOUNT` `{"percent":40,"capUnits":80}` |
| D02 | Ví Chống Trộm | DEFENSE | COMMON | REACTION | `BLOCK_CASH_THEFT` `{"capUnits":50,"powerUpDirectCashOnly":true}` |
| D03 | Phá Mưu | DEFENSE | COMMON | REACTION | `BLOCK_DEFERRED_ATTACK` `{"supportedAttackIds":["A03","A04","A05","A07","A10"],"beforeStatusCreation":true}` |
| D04 | Lá Chắn Bất Động Sản | DEFENSE | COMMON | ACTIVE | `PROPERTY_SHIELD` `{"charges":2}` |
| D05 | Phản Đòn | DEFENSE | RARE | REACTION | `REFLECT_ATTACK` `{"singleTargetOnly":true,"effectSpecificDirectionRequired":true,"reactionOnReaction":false}` |
| D06 | Hủy Phép | DEFENSE | RARE | REACTION | `CANCEL_ATTACK` `{"beforeResolutionOnly":true}` |
| D07 | Quỹ Cứu Trợ | DEFENSE | EPIC | REACTION | `SHORTFALL_SUBSIDY` `{"capUnits":100,"contributor":"BANK","remainingDebtUnchanged":true}` |
| D08 | Bất Khả Xâm Phạm | DEFENSE | LEGENDARY | REACTION | `RENT_SUBSIDY` `{"capUnits":200,"contributor":"BANK","landlordReceivesFullEligibleRent":true,"playerPaysExcess":true}` |
| D09 | Khóa Kho Thẻ | DEFENSE | COMMON | REACTION | `BLOCK_INVENTORY_INTERFERENCE` `{"theft":true,"forcedSwap":true,"voluntaryTrade":false}` |
| D10 | Giải Phong Tỏa | DEFENSE | RARE | ACTIVE | `REMOVE_STATUS` `{"count":1,"futureOnly":true,"retroactiveCompensation":false}` |
| U01 | Xúc Xắc May Mắn | UTILITY | COMMON | ACTIVE | `REROLL_DICE` `{"mustUseNewResult":true,"preserveExistingDoubleRules":true}` |
| U02 | Tăng Tốc | UTILITY | COMMON | ACTIVE | `MOVEMENT_BONUS` `{"steps":2,"changesRawDice":false,"startPolicy":"EXISTING_MOVEMENT_HELPER"}` |
| U03 | Phiếu Giảm Giá Đất | UTILITY | COMMON | ACTIVE | `PURCHASE_DISCOUNT` `{"percent":15,"capUnits":50,"unownedOnly":true,"auctionAllowed":false,"playerTradeAllowed":false}` |
| U04 | Hiến Tế Nâng Cấp | UTILITY | RARE | ACTIVE | `UPGRADE_CARDS` `{"ingredientCount":2,"consumeActivator":true,"excludedIngredientDefinitionIds":["U04"],"legendaryIngredientsAllowed":false,"outputTier":"HIGHEST_INGREDIENT_PLUS_ONE","sampling":"UNIFORM_CATEGORY_THEN_DEFINITION","duplicateDefinitionsAllowed":true}` |
| U05 | Định Hướng | UTILITY | RARE | ACTIVE | `ADJUST_MOVEMENT` `{"minDelta":-3,"maxDelta":3,"minSteps":1,"startPolicy":"EXISTING_MOVEMENT_HELPER"}` |
| U06 | Trao Đổi Vận May | UTILITY | COMMON | ACTIVE | `CONSENSUAL_SWAP` `{"selection":"UNIFORM_RANDOM_EACH_INVENTORY","excludeActivatorInstance":true,"declinedConsumesActivator":false,"declinedUsesActiveAllowance":true}` |
| U07 | Đầu Tư Từ Xa | UTILITY | EPIC | ACTIVE | `REMOTE_PURCHASE` `{"listPricePercent":125,"unownedOnly":true,"movesPlayer":false,"activatesTile":false,"triggersStart":false}` |
| U08 | Dịch Chuyển Hoàng Gia | UTILITY | LEGENDARY | ACTIVE | `REPLACE_MOVEMENT` `{"destination":"ANY_PROPERTY","resolveDestination":true,"startPolicy":"EXISTING_MOVEMENT_HELPER"}` |
| U09 | Phiếu Ưu Đãi Xây Dựng | UTILITY | COMMON | ACTIVE | `BUILD_DISCOUNT` `{"percent":20,"capUnits":50}` |
| U10 | Tái Cấu Trúc Kho Thẻ | UTILITY | RARE | ACTIVE | `TRANSFORM_CARD` `{"preserveRarity":true,"chosenCategory":true,"excludeOriginalDefinition":true,"excludeActivatorInstance":true,"legendaryAllowed":false,"selectionWithinCategory":"OPEN"}` |

## Per-card timing, target, duration and compatibility mapping

Duration data names the expiry clock and successful-use/charge cap. For turns plus uses, expire at whichever bound comes first. Exact boundary counting, transfer/removal cleanup, rounding and unresolved stacking remain OPEN. Immediate resolution is single-use. No timer or status collection is created.

| ID | Target / conditions | Timing → trigger | Duration / use cap | Compatibility / reaction policy | OPEN |
| --- | --- | --- | --- | --- | --- |
| A01 | `OPPONENT_PLAYER`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `REACTABLE` | ACTIVE_TIMING, ROUNDING |
| A02 | `OWNED_PROPERTY`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `NEXT_ELIGIBLE_RENT_RECEIVED` | `{"basis":"OWNER_TURNS","turns":2,"maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING, ROUNDING, DURATION_LIFECYCLE |
| A03 | `OPPONENT_PLAYER`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `NEXT_ELIGIBLE_UNOWNED_PURCHASE` | `{"basis":"TARGET_TURNS","turns":2,"maxUses":1}` | `NOT_APPLICABLE` / `BEFORE_STATUS_CREATION` | ACTIVE_TIMING, ROUNDING, STATUS_STACKING, DURATION_LIFECYCLE |
| A04 | `OPPONENT_PROPERTY`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `ELIGIBLE_PROPERTY_RENT` | `{"basis":"PROPERTY_OWNER_TURNS","turns":3,"maxUses":2}` | `NOT_APPLICABLE` / `BEFORE_STATUS_CREATION` | ACTIVE_TIMING, ROUNDING, STATUS_STACKING, DURATION_LIFECYCLE |
| A05 | `OPPONENT_PLAYER`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `NEXT_TARGET_TURN_BUILD_OR_UPGRADE` | `{"basis":"TARGET_NEXT_TURN"}` | `NOT_APPLICABLE` / `BEFORE_STATUS_CREATION` | ACTIVE_TIMING, STATUS_STACKING, DURATION_LIFECYCLE |
| A06 | `OPPONENT_PLAYER`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE`, `SPARE_INVENTORY_CAPACITY_AT_ACTIVATION`, `TARGET_HAS_UNPLAYED_CARD` | `DECLARED_ACTIVE_POINT_OPEN` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING |
| A07 | `OPPONENT_PLAYER`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `NEXT_ELIGIBLE_RENT_RECEIVED` | `{"basis":"TARGET_TURNS","turns":2,"maxUses":1}` | `NOT_APPLICABLE` / `BEFORE_STATUS_CREATION` | ACTIVE_TIMING, ROUNDING, STATUS_STACKING, DURATION_LIFECYCLE |
| A08 | `ALL_OPPONENT_PROPERTIES`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `ELIGIBLE_PROPERTY_RENT` | `{"basis":"UNTIL_ATTACKER_NEXT_TURN_BEGINS"}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING, ROUNDING, STATUS_STACKING, DURATION_LIFECYCLE |
| A09 | `OPPONENT_PLAYER`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING |
| A10 | `OPPONENT_PLAYER`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `NEXT_ELIGIBLE_RENT_PAID` | `{"basis":"TARGET_TURNS","turns":2,"maxUses":1}` | `NOT_APPLICABLE` / `BEFORE_STATUS_CREATION` | ACTIVE_TIMING, ROUNDING, STATUS_STACKING, DURATION_LIFECYCLE |
| D01 | `SELF`; `ACTOR_OWNS_INSTANCE`, `PRE_COMMIT_ONLY` | `BEFORE_RENT_SETTLEMENT` → `CURRENT_RENT_OBLIGATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `RENT_ONLY` / `RESPONSE_TO_EVENT` | ROUNDING, PAYMENT_HOOK |
| D02 | `SELF`; `ACTOR_OWNS_INSTANCE`, `PRE_COMMIT_ONLY` | `BEFORE_DIRECT_CASH_THEFT` → `INCOMING_DIRECT_CASH_THEFT` | `{"basis":"IMMEDIATE","maxUses":1}` | `DIRECT_POWER_UP_CASH_THEFT` / `RESPONSE_TO_EVENT` | — |
| D03 | `SELF_OR_OWNED_PROPERTY`; `ACTOR_OWNS_INSTANCE`, `PRE_COMMIT_ONLY` | `BEFORE_TARGETED_STATUS_CREATION` → `INCOMING_TARGETED_STATUS` | `{"basis":"IMMEDIATE","maxUses":1}` | `D03_APPROVED_SET` / `RESPONSE_TO_EVENT` | — |
| D04 | `OWNED_PROPERTY`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `INCOMING_COMPATIBLE_PROPERTY_ATTACK` | `{"basis":"PROPERTY_OWNER_TURNS","turns":3,"maxUses":2}` | `DIRECT_PROPERTY_ATTACKS_OPEN` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING, D04_COMPATIBILITY, STATUS_STACKING, DURATION_LIFECYCLE |
| D05 | `SELF_OR_OWNED_PROPERTY`; `ACTOR_OWNS_INSTANCE`, `PRE_COMMIT_ONLY` | `BEFORE_TARGETED_ATTACK_RESOLUTION` → `INCOMING_TARGETED_ATTACK` | `{"basis":"IMMEDIATE","maxUses":1}` | `SINGLE_TARGET_ATTACKS_OPEN` / `NO_REACTION_ON_REACTION` | D05_DIRECTION_AND_COMPATIBILITY |
| D06 | `SELF_OR_OWNED_PROPERTY`; `ACTOR_OWNS_INSTANCE`, `PRE_COMMIT_ONLY` | `BEFORE_TARGETED_ATTACK_RESOLUTION` → `INCOMING_TARGETED_ATTACK` | `{"basis":"IMMEDIATE","maxUses":1}` | `TARGETED_ATTACKS_OPEN` / `RESPONSE_TO_EVENT` | D06_COMPATIBILITY |
| D07 | `SELF`; `ACTOR_OWNS_INSTANCE`, `PRE_COMMIT_ONLY`, `MANDATORY_CASH_SHORTFALL` | `BEFORE_MANDATORY_SHORTFALL_SETTLEMENT` → `MANDATORY_CASH_SHORTFALL` | `{"basis":"IMMEDIATE","maxUses":1}` | `MANDATORY_OBLIGATION` / `RESPONSE_TO_EVENT` | PAYMENT_HOOK |
| D08 | `SELF`; `ACTOR_OWNS_INSTANCE`, `PRE_COMMIT_ONLY` | `BEFORE_RENT_SETTLEMENT` → `CURRENT_RENT_OBLIGATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `RENT_ONLY` / `RESPONSE_TO_EVENT` | PAYMENT_HOOK |
| D09 | `SELF`; `ACTOR_OWNS_INSTANCE`, `PRE_COMMIT_ONLY` | `BEFORE_INVENTORY_INTERFERENCE` → `INCOMING_INVENTORY_INTERFERENCE` | `{"basis":"IMMEDIATE","maxUses":1}` | `INVOLUNTARY_INVENTORY_ONLY` / `RESPONSE_TO_EVENT` | — |
| D10 | `SELF_OR_OWNED_PROPERTY`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NEGATIVE_STATUSES_OPEN` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING, D10_STATUS_ELIGIBILITY |
| U01 | `SELF`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `POST_ROLL_PRE_MOVEMENT` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | MOVEMENT_CHECKPOINT |
| U02 | `SELF`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `PRE_MOVEMENT` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | MOVEMENT_CHECKPOINT |
| U03 | `UNOWNED_PROPERTY`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE`, `ELIGIBLE_UNOWNED_PURCHASE` | `BEFORE_ELIGIBLE_PURCHASE` → `NEXT_ELIGIBLE_UNOWNED_PURCHASE` | `{"basis":"CURRENT_TURN","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | ROUNDING |
| U04 | `TWO_OWN_OTHER_CARDS`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE`, `TWO_DISTINCT_OTHER_OWNED_NON_LEGENDARY_INSTANCES` | `DECLARED_ACTIVE_POINT_OPEN` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING |
| U05 | `SELF`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `POST_ROLL_PRE_MOVEMENT` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | MOVEMENT_CHECKPOINT |
| U06 | `CONSENTING_OPPONENT`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE`, `TARGET_CONSENT`, `BOTH_HAVE_ELIGIBLE_SWAP_CARD` | `DECLARED_ACTIVE_POINT_OPEN` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `CONSENT_REQUIRED` | ACTIVE_TIMING, CONSENT_FLOW |
| U07 | `UNOWNED_PROPERTY`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE`, `ELIGIBLE_UNOWNED_PURCHASE` | `DECLARED_ACTIVE_POINT_OPEN` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING, ROUNDING |
| U08 | `ANY_PROPERTY`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE` | `LEGAL_MOVEMENT_POINT_OPEN` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | MOVEMENT_CHECKPOINT, MOVEMENT_HELPER |
| U09 | `SELF`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE`, `ELIGIBLE_BUILD_OR_UPGRADE` | `DECLARED_ACTIVE_POINT_OPEN` → `NEXT_ELIGIBLE_BUILD_OR_UPGRADE` | `{"basis":"OWNER_TURNS","turns":2,"maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING, ROUNDING, DURATION_LIFECYCLE |
| U10 | `ONE_OWN_OTHER_CARD`; `CURRENT_PLAYER`, `ACTOR_OWNS_INSTANCE`, `OTHER_OWNED_NON_LEGENDARY_INSTANCE` | `DECLARED_ACTIVE_POINT_OPEN` → `ON_ACTIVATION` | `{"basis":"IMMEDIATE","maxUses":1}` | `NOT_APPLICABLE` / `COMPATIBILITY_OPEN` | ACTIVE_TIMING, U10_SAMPLING |

**Test mapping for every row:** `apps/server/src/game/powerUps/catalog.test.ts` contains (1) approved-table identity/description comparisons, (2) parameter/schema validation for every ID, (3) explicit approved effect/cap/duration assertions and (4) recursive immutability tests. Specialized U04/D03 groups below add behavioral contract checks without applying effects. `apps/server/src/game/powerUps/config.test.ts` owns config and duplicate/capacity compatibility checks.

## D03 compatibility

`canD03BlockAttack` is a pure predicate over server-resolved target facts. It permits only **A03/A04/A05/A07/A10 before status creation**. A04 must target a property owned by the defender; A03/A05/A07/A10 must target the defender as a player. It rejects incorrect target kinds, another owner, global targets, unknown IDs, Defense/Utility cards and already applied/committed events. Tests cover every Attack ID for both player/property scope and global scope.

A01/A06/A09 are immediate and excluded. A08 is global and excluded. A02 is the attacker's own rent buff and is also excluded. This helper neither creates a Reaction Window nor consumes D03/allowance. D04 charge interactions, D05 effect-specific redirection and the detailed D06 matrix are not inferred from this whitelist.

## U04 recipes and output sampling

`validateU04Recipe` validates an owned U04 activator and exactly two distinct other owned inventory instances, with independent instance/grant identity, known definitions and no Legendary or U04 ingredient definitions. It returns a frozen consumption plan and `outputTier = max(ingredient tiers) + 1`. Common+Common gives Rare; mixed Common/Rare gives Epic; any valid Epic pair gives Legendary. Activator rarity is not included in the maximum. All 16 ordered rarity combinations are tested, including both Legendary positions. Invalid recipes throw before randomness, without changing inventory.

`sampleU04Output` uses an unbiased server `node:crypto.randomInt` index provider by default, injected for deterministic tests. It draws uniformly among categories that contain the fixed target rarity, then uniformly among definitions in that category. It does not draw from START rarity weights and does not exclude consumed definition IDs. Tests enumerate every eligible Rare/Epic/Legendary definition and verify draw bounds; unequal/sparse pools prove categories are selected before definitions rather than flattening the pool. Invalid RNG output is rejected without retries.

`planU04Upgrade` combines these pure operations for validation/preview only. **No cards are spent, no allowance is used, no reward is granted and no instance UUID is created in 03D.** Later runtime must revalidate on the authoritative transaction draft, consume three cards, grant one new instance UUID and commit atomically; a preview cannot authorize a later mutation. Duplicate output definitions are legal.

## Validation and regression evidence

Commands ran on Node 24.22.0 using the existing installed dependencies. The PowerShell launcher failed at startup with the Windows CET error; cmd.exe and pnpm.cmd worked. No dependencies were installed or changed.

| Check | Status | Evidence |
| --- | --- | --- |
| Power-up suites | PASS | 3 files, **92/92 tests**: 17 original foundation + 4 config + 71 catalog/recipe/compatibility tests |
| Full `pnpm test` | PASS | Root prechecks plus desktop, server and client suites completed with exit 0 |
| Server regression | PASS | 39 files, **731 passed, 2 existing skipped**, 733 total |
| Client regression | PASS | 268 files, **2,693 passed** |
| Desktop regression | PASS | 41 files, **629 passed** |
| Root contract/tool/asset prechecks | PASS | V1 contract 34; perf tools 27; room registry 5; music validator 1; card-art 1; landmark-art 2 |
| `pnpm typecheck` | PASS | Shared, server, client and desktop |
| Repository ESLint | PASS | `node node_modules/eslint/bin/eslint.js .`, zero errors/warnings |
| `pnpm build` | PASS | TypeScript + Vite + 26 audio / 28 card-art / 22 landmark-art build validations |
| `pnpm validate:docs` | PASS | 206 Markdown files validated |
| `pnpm test:docs` | PASS | 10/10 validator self-tests; validator code unchanged |
| `pnpm validate:v1-contract` | PASS | Own the Block 1.10.0 / protocol 14 |
| `git diff --check` | PASS | No whitespace errors |
| Live START / socket / Reaction / playable effects / UI acceptance | NOT RUN | Explicitly outside Phase 03D |

The two existing skips remain in `apps/server/src/hostAdmission.integration.test.ts` (isolated non-loopback peer fixtures). No existing tests were modified or newly skipped. Build retains its Vite advisory for chunks above 500 kB; asset validations pass.

Existing full regressions cover Monopoly rules, classic cards, money/movement, team play, serialized RAM transactions, deadlines, reconnect, sockets and private projections. New tests additionally prove official definitions can flow through the Phase 02 offer helper and deep-detached owner projection while ordinary START movement still leaves Power-ups uninitialized. These checks do not imply live Power-up acceptance.

## Open P1 and live-integration gates

| Item | Status / consequence |
| --- | --- |
| Stable effect keys / typed parameters | Implemented as technical data contracts in this phase; no balance/rarity change. Owner may review names at 03D acceptance. |
| D03 revised semantic identity | Closed for first production catalog: D03 = Phá Mưu. Never register old Phá Bẫy semantics under the same live ID later. |
| Offline full inventory | OPEN, blocks live rollout. Random choice from stored candidates at recovery is approved; discard-new vs replacement is not approved. No default chosen. |
| FIFO vs offline/noncurrent owner | OPEN; prevent head-of-queue deadlock and recovery re-arm. No scheduler changes here. |
| Bots | OPEN: selection and Reaction heuristics, separate from disconnected-human rule. |
| Reaction runtime | OPEN: authoritative deadline, reconnect, response/expiry races, per-event cap/idempotency, no redundant response and anti-chain scope. 15 seconds is approved data only. |
| D04/D05/D06/D10 | OPEN: compatible direct property attacks, per-effect reflection direction/beneficiaries, exact cancellation/status-removal eligibility and shield/reaction priority. No full matrix invented. |
| Economic modifiers | OPEN: integer rounding, simultaneous modifiers/stacking and detailed payment hooks for D07/D08. A10 independent capped bank surcharge is preserved. |
| Duration | OPEN: precise turn boundaries, transferred/mortgaged property and removed owner handling. Existing doubles do not grant extra turns; no Monopoly turn rule changes. |
| Movement | OPEN: post-roll/pre-movement checkpoint, jailed-roll legality, raw dice vs modified movement, U08 helper choice and destination resolution. Existing START semantics stay unchanged. |
| Full-hand manual flow / visibility / trading | PROPOSED or OPEN per 03C: no new replacement/decline policy, opponent metadata or free-form trading chosen here. U06 approved consent/decline behavior remains typed data. |
| U10 selection | OPEN: exact within-category random distribution and empty eligible-pool handling not explicitly signed off; metadata records OPEN. Preserve rarity, exclude original definition and Legendary inputs as approved. |
| Lifecycle | OPEN: elimination, revival, resignation, match-end and rematch behavior for pending offers, inventories and statuses. |
| Ledger growth | OPEN: retained completed offers grow for the match; stress-test before rollout without expiring dedupe identities. |
| Transport/versioning | OPEN for later integration: authenticated commands, owner-only delivery, privacy and protocol/schema review. Current protocol **14**, snapshot **11** unchanged. |

## Phase 04 readiness and handoff

**Definition/config foundation: READY FOR OWNER ACCEPTANCE.** The complete approved catalog and P0 contracts are available to subsequent phases with regression evidence. **Live START rollout: BLOCKED pending the open full-hand/FIFO/bot/lifecycle decisions and a separately authorized integration phase.**

Phase 04 can consume the registry/config once 03D is accepted, but this report does not authorize Phase 04 or choose its product policies. START candidate sampling is still a future provider: approved rarity weights per category, uniform definitions within drawn rarity, exactly one candidate per category, generated once on the same transaction draft as the existing PASS_GO occurrence. Runtime must connect completion and recovery safely before activation.

**Stop here for Phase 03D acceptance. No Phase 04+ implementation has been performed.**
