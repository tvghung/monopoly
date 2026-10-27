# Phase 09D — Product Owner Manual UAT Checklist

**Status: NOT TESTED.** This checklist is prepared for the Product Owner. No manual UAT is claimed here.

Use the approved card rules in [03C](./03C_POWERUP_GAMEPLAY_RULES_SPEC_APPROVED.md), the official definitions in [03D](./03D_CARD_DEFINITIONS_REPORT.md), and the interaction notes in [08B](./08B_INTERACTION_MATRIX.md) when an effect has a compatibility edge case. Record observed behavior; do not change card mechanics during UAT. All monetary caps below are integer game units; **1 game unit = 1,000 VND**.

## A. Startup instructions

Use Node.js 24 and pnpm 11.15.1 from the repository root. If dependencies are not installed:

```sh
pnpm install --frozen-lockfile
```

**Recommended first UAT setup:** run the Windows Electron development host and join it from the browser on the same machine. The desktop host owns the local game server; browser clients cannot create a host room.

```sh
pnpm dev:desktop
```

This command compiles the desktop main process, starts the local server and Vite renderer, then opens Electron. Open a browser at **http://127.0.0.1:5173** for a second player. Do not run `pnpm dev:web` at the same time; both start the development server and browser renderer.

For separate server and browser terminals, use:

```sh
pnpm --filter @monopoly/server dev
pnpm --filter @monopoly/client dev
```

Or start both together, without Electron:

```sh
pnpm dev:web
```

The Vite client listens at **http://127.0.0.1:5173**. In this browser-only setup, join a room hosted by a desktop client; a browser cannot host a room.

To build and run the packaged Windows x64 application:

```sh
pnpm desktop:make
pnpm desktop:run:packaged
```

The first command creates the local Windows package and installer under `apps/desktop/out`; the second launches the packaged app found there. Use the packaged desktop host with a browser guest for a packaging-specific pass. For two physical devices, keep the desktop host running and use its LAN/online invitation flow; network and firewall access can affect that test.

**Protocol note:** this candidate uses socket protocol 16 and room snapshot schema 14. The published v1.10.0 release remains protocol 14 / schema 11. Use the candidate browser and desktop builds together; a released v1.10.0 client is not a compatibility substitute.

## B. START and inventory

Each row begins as **NOT TESTED**. Capture evidence and reproduction details for failures. Confirm the balance change from the displayed account balance; one valid START pass grants 200 game units.

| Test ID | Scenario and steps | Expected result | Actual result | PASS/FAIL | Screenshot/video evidence | Severity | Reproduction steps |
|---|---|---|---|---|---|---|---|
| PU-S01 | Start a match, move past START once, and note the balance and offer count. | Balance increases by exactly 200 game units and one offer is created for that reward occurrence. | Not tested | NOT TESTED | — | — | — |
| PU-S02 | Before revealing an offer, inspect the owner and another player's screen; then reveal as the owner. | Before reveal, candidate identity and rarity remain hidden. After reveal, only the owner can see the three identities. | Not tested | NOT TESTED | — | — | — |
| PU-S03 | Choose one of the three revealed cards and resolve the offer. | Exactly the chosen card is granted; the other two are discarded and the offer completes once. | Not tested | NOT TESTED | — | — | — |
| PU-S04 | Trigger duplicate delivery/reconnect around the same START occurrence. | The 200-unit reward and offer are not duplicated for one occurrence. | Not tested | NOT TESTED | — | — | — |
| PU-S05 | Fill inventory to capacity, then inspect the inventory panel and card details. | Three cards are shown at most; card identity, rarity, effect details and available actions match the owner’s inventory. | Not tested | NOT TESTED | — | — | — |
| PU-S06 | With a full inventory, choose a reward and replace one specific card. | The selected existing card is removed, the chosen reward is added, and the inventory remains at three. | Not tested | NOT TESTED | — | — | — |
| PU-S07 | With a full inventory, decline the selected reward. | Existing cards remain unchanged and the declined card is not granted. | Not tested | NOT TESTED | — | — | — |
| PU-S08 | Disconnect while an offer is pending, reconnect before the offline grace expires, and reopen the reward UI. | The pending offer and owner-only visibility recover; the server does not issue a second offer or cash reward. | Not tested | NOT TESTED | — | — | — |
| PU-S09 | Leave an owner offline through the configured reconnect grace while a START offer is pending. | Recovery does not stall the match: a locked choice is preserved; otherwise the server resolves a candidate. It grants it if inventory has room and automatically discards it if full; no replacement is chosen for the offline player. | Not tested | NOT TESTED | — | — | — |

## C. Attack scenarios

| Test ID | Scenario and steps | Expected result | Actual result | PASS/FAIL | Screenshot/video evidence | Severity | Reproduction steps |
|---|---|---|---|---|---|---|---|
| PU-A01 | Use A01 (Móc Túi) on an opponent with available cash; repeat with a smaller balance. | Theft is 10% of available cash, capped at 50 units, and the opponent receives the Reaction prompt before settlement. | Not tested | NOT TESTED | — | — | — |
| PU-A02 | Use A02 on an owned property, then attempt to add a second rent buff before the first is consumed. | The next eligible rent receives the 25% increase; an overlapping rent buff does not stack; the status expires by its approved limit. | Not tested | NOT TESTED | — | — | — |
| PU-A03 | Apply A04 to an opponent-owned property and collect rent across multiple turns. | Rent is reduced 25% for up to three owner turns or two successful reduced rents, whichever occurs first. | Not tested | NOT TESTED | — | — | — |
| PU-A04 | Apply A05 before the target's next turn; attempt a voluntary build/upgrade and separately trigger a mandatory debt resolution. | Voluntary building/upgrading is restricted for the next target turn; mandatory debt resolution remains available. | Not tested | NOT TESTED | — | — | — |
| PU-A05 | Use A06 (Trộm Thẻ) on an opponent with unplayed inventory cards and available capacity. | One random eligible unplayed card transfers; the target's inventory protection and capacity rules are respected. | Not tested | NOT TESTED | — | — | — |
| PU-A06 | Use legendary A08, then collect rent from an opponent and from one of the attacker's own properties. | Opponent property rent is reduced 50% until the attacker's next turn begins; the attacker's properties are unaffected. | Not tested | NOT TESTED | — | — | — |
| PU-A07 | Apply A10 to a target and make an eligible rent payment. | One 50% surcharge, capped at 100 units, is paid to the bank under the approved rent/protection rules. | Not tested | NOT TESTED | — | — | — |

## D. Defense and Reaction scenarios

| Test ID | Scenario and steps | Expected result | Actual result | PASS/FAIL | Screenshot/video evidence | Severity | Reproduction steps |
|---|---|---|---|---|---|---|---|
| PU-D01 | Trigger a Reaction-eligible event and wait without choosing a card. Measure the prompt window. | The prompt lasts 15 seconds; timeout auto-passes once and the pending event continues without a stuck turn or duplicate settlement. | Not tested | NOT TESTED | — | — | — |
| PU-D02 | Respond to an eligible rent event with D01. | One rent obligation is reduced by 40%, capped at 80 units, before settlement. | Not tested | NOT TESTED | — | — | — |
| PU-D03 | Respond to A01 with D02. | Direct Power-up cash theft is blocked up to 50 units; any amount beyond the cap follows the approved rule. | Not tested | NOT TESTED | — | — | — |
| PU-D04 | Respond to an eligible deferred Attack (A03, A04, A05, A07 or A10) with D03 before its status is created. | The eligible effect is blocked before status creation; global A08 and instant A01/A06/A09 are not offered as D03 targets. | Not tested | NOT TESTED | — | — | — |
| PU-D05 | Put D04 on one owned property, then apply compatible direct attacks to that property. | The shield blocks two compatible attacks or expires after three owner turns; remaining charges/status are visible and accurate. | Not tested | NOT TESTED | — | — | — |
| PU-D06 | Use D05 against a compatible single-target Attack selected from the approved interaction matrix. | The effect is reflected using its effect-specific direction; no Reaction-on-Reaction chain is created. | Not tested | NOT TESTED | — | — | — |
| PU-D07 | Respond to a pending eligible Attack with D06 before it resolves. | The pending Attack is cancelled before resolution and does not create its effect/status. | Not tested | NOT TESTED | — | — | — |
| PU-D08 | Trigger a mandatory cash shortfall and respond with D07. | The bank contributes up to 100 units to the shortfall; any remaining debt process is unchanged. | Not tested | NOT TESTED | — | — | — |
| PU-D09 | Trigger a rent payment and respond with legendary D08. | The bank covers up to 200 units; the landlord receives the full eligible rent and the payer covers any excess. | Not tested | NOT TESTED | — | — | — |
| PU-D10 | Have an opponent attempt an involuntary card theft/forced swap while D09 is held; separately try a voluntary U06 trade. | D09 blocks involuntary inventory interference but does not block a voluntary, consent-based U06 trade. | Not tested | NOT TESTED | — | — | — |
| PU-D11 | Apply a negative status, then use D10 on self or an owned property. | One eligible negative status is removed for future effects; completed payments/effects are not retroactively changed. | Not tested | NOT TESTED | — | — | — |

## E. Utility scenarios

| Test ID | Scenario and steps | Expected result | Actual result | PASS/FAIL | Screenshot/video evidence | Severity | Reproduction steps |
|---|---|---|---|---|---|---|---|
| PU-U01 | Use U01 after rolling but before movement; separately use U02 before movement. | U01 requires the new dice result; U02 adds two movement steps without changing the raw dice result. Existing doubles and START helpers remain consistent. | Not tested | NOT TESTED | — | — | — |
| PU-U02 | Use U03 on a legal unowned-property purchase; compare displayed price with list price. | One eligible purchase is discounted 15%, capped at 50 units; auctions and player trades are excluded. | Not tested | NOT TESTED | — | — | — |
| PU-U03 | Use U04 with two distinct eligible ingredient cards of mixed rarities. | U04 and both ingredients are consumed; a new card one tier above the higher ingredient is granted. Legendary or U04 ingredients are rejected. | Not tested | NOT TESTED | — | — | — |
| PU-U04 | Use U05 after rolling and select positive and negative movement adjustments in separate turns. | Selected movement delta is within −3 to +3, movement remains at least one step, and existing START handling is preserved. | Not tested | NOT TESTED | — | — | — |
| PU-U05 | Use U06 with an eligible opponent; test acceptance, explicit decline and timeout. | Acceptance exchanges one eligible random card each; decline/timeout keeps U06, consumes the Active allowance, and does not swap U06 itself. | Not tested | NOT TESTED | — | — | — |
| PU-U06 | Use U07 to buy an eligible unowned property remotely. | Purchase costs 125% of list price; the player does not move, activate the tile or trigger START. | Not tested | NOT TESTED | — | — | — |
| PU-U07 | Use legendary U08 to travel to an owned and an unowned property; include one route that crosses START if possible. | Destination rules resolve normally; START reward follows the existing selected movement helper exactly once where applicable. | Not tested | NOT TESTED | — | — | — |
| PU-U08 | Use U09 before an eligible build/upgrade; then attempt a second discounted build. | One eligible build/upgrade receives 20% discount capped at 50 units; the status expires within its approved two-owner-turn limit. | Not tested | NOT TESTED | — | — | — |
| PU-U09 | Use U10 to transform another non-Legendary card into a chosen category. | The original other card is consumed; output keeps its rarity, uses a different definition, and receives a new instance identity. Legendary input is rejected. | Not tested | NOT TESTED | — | — | — |

## F. Artwork and UI

| Test ID | Scenario and steps | Expected result | Actual result | PASS/FAIL | Screenshot/video evidence | Severity | Reproduction steps |
|---|---|---|---|---|---|---|---|
| PU-V01 | Browse every front: A01–A10, D01–D10 and U01–U10 in inventory and detail views. | All 30 IDs show their intended unique illustrations; no missing, duplicated, stale or fallback asset appears. | Not tested | NOT TESTED | — | — | — |
| PU-V02 | Inspect Attack, Defense and Utility backs before reveal and all rarity frames after reveal. | Three backs match category; Common/Rare/Epic/Legendary treatment matches the card definition and never leaks a hidden offer. | Not tested | NOT TESTED | — | — | — |
| PU-V03 | Inspect refined hand, coin and pawn details, including U10's rotated markers. | Pinching/supporting hands, closed coin rims, complete pawn bases and aligned U10 markers remain clear at card size. | Not tested | NOT TESTED | — | — | — |
| PU-V04 | Exercise selection, inventory, detail, activation, target highlight, Reaction, consent trade and result feedback. | Controls and target highlights match the current action; success/failure/status feedback is readable and appears once. | Not tested | NOT TESTED | — | — | — |
| PU-V05 | Repeat key dialogs with reduced motion enabled and at 1440×900, 1280×720 and 900×500; use windowed and fullscreen mode. | Motion respects the preference; dialogs remain readable/scrollable, controls stay reachable, and no horizontal clipping occurs. | Not tested | NOT TESTED | — | — | — |
| PU-V06 | Listen to card activation, Reaction, reveal and status audio in a full turn. | Sound and animation feedback are synchronized, understandable and do not repeat after reconnect. | Not tested | NOT TESTED | — | — | — |

## G. Multiplayer, reconnect and bot flows

| Test ID | Scenario and steps | Expected result | Actual result | PASS/FAIL | Screenshot/video evidence | Severity | Reproduction steps |
|---|---|---|---|---|---|---|---|
| PU-M01 | Run a two-human match with one desktop Host and one browser guest; use a targeted Attack and a Reaction. | Only the authorized owner can activate its card; only the intended target receives/responds to the prompt; public players do not see private inventory/offer identities. | Not tested | NOT TESTED | — | — | — |
| PU-M02 | Disconnect and reconnect the actor/target during a reward, pending Reaction, status duration and U06 consent flow. | Pending state resumes within the live host process, deadlines do not restart incorrectly, and no card, cash or effect is duplicated. | Not tested | NOT TESTED | — | — | — |
| PU-M03 | Add a bot in the lobby and play through its turn, including a human Reaction/consent window. | Bot decisions remain legal and bounded; the bot does not act through a human pending interaction. Bot Reactions may auto-pass as documented. | Not tested | NOT TESTED | — | — | — |
| PU-M04 | When two or more devices are available, join the desktop Host from a second device over the supported LAN/online invitation path; disconnect one guest and reconnect. | Both clients stay on the same authoritative match; reconnect returns to the live host session and does not restore a room after the host process exits. | Not tested | NOT TESTED | — | — | — |

## UAT closeout

For every failure, fill **Actual result**, change **PASS/FAIL** to PASS or FAIL, attach screenshot/video evidence, assign severity, and provide concise reproduction steps. If a case cannot be run, leave it NOT TESTED and record the environment limitation; do not count it as PASS.
