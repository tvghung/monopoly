# OB-11 contextual Power-up validation

CURRENT DEVELOPMENT: version 1.11.2, protocol 17, RAM snapshot 15. No release published. OB-8 movement is already on main via PR #34; OB-11 reuses it.

## Result

U03 purchase and U09 development show eligible owned cards in the original decision sheet: side column at wide desktop, integrated section on short/small screens. Use and Skip preserve the operation and require explicit purchase/build confirmation. Server quotes drive purchase and per-quantity development affordability, including the existing discount cap. Activation binds the exact operation, instance, owner and legal timing. Pending activation locks competing confirmation; stale ACKs are invalidated. Inventory retains complete 3D owned cards and loses only the Power-up detail entry/dialog/state.

## Card × timing × surface × eligible target

| Cards | Timing and surface | Target/authority |
| --- | --- | --- |
| U01, U02, U05, U08 | Existing post-roll, pre-movement checkpoint (OB-8), inline activation and Continue | Pending owner/operation; U05 delta and U08 eligible unowned tile validated by runtime |
| U03 | Purchase sheet context panel | Exact pending purchase, owner and eligible unowned pending tile |
| U09 | House/hotel development sheet context panel | Exact pending development and acting lander; original ownership/team rules remain server validated |
| D01, D08 | Existing RENT Reaction | Current eligible debtor and rent event |
| D07 | Existing SHORTFALL Reaction | Current debtor and exact payment claim |
| D02, D03, D05, D06, D09 | Existing ATTACK Reaction | Exact responder/event, attack-specific block/reflection/redirection rules and targets |
| A01–A10 | Manual Active inventory activation before movement | Current player, allowance, opponent/team/property eligibility from existing selectors/runtime; A08 has no target |
| D04, D10 | Manual Active before movement | Eligible owned property / removable owned status |
| U04, U07, U10 | Manual Active before movement | Two legal owned ingredients / eligible remote-buy tile / legal owned transform card and category |
| U06 | Manual Active initiator before movement, existing target consent decision | Eligible other player and exact requestId; server-random private selection; decline retains card under existing allowance rules |

This matrix is a source/runtime review, not a fresh visual run for every card. Mandatory Reaction deadlines/order and consent are unchanged. No eligible card creates no extra decision. Manual contexts retain inventory because no corresponding purchase/build transaction exists to embed into.

## Executed checks

- Client full suite: 2,751 passed; final focus change also passed 38 targeted decision/panel tests.
- Server Power-up/all-card suites: 512 passed across nine files including seeded endurance games. New contextual quote/operation tests: two passed. Existing runtime tests cover house/hotel; the new UI harness transacts four houses.
- Full ESLint, production renderer build and Windows Electron package passed with normal production settings.
- Chromium and packaged Electron each passed U03 Use 1440×900, U03 Skip 1280×720, U09 Use 900×500, U09 Skip 740×360 in English/reduced motion, plus complete inventory/no-detail and no-card purchase.
- Real Socket.IO/state checks verify Use double-click consumes once, Skip consumes nothing, exact operation remains pending until original confirmation, and transaction double-click charges once. U03 400→350 and U09 four houses 800→750 use server totals. Injected transaction rollback verifies recoverable denial and preserved inventory/operation; reconnect retries successfully. The deliberate rollback log is expected test injection.
- One dialog, Tab/Shift+Tab/Escape, focus after snapshot-before-ACK, no opponent panel, modal bounds/document overflow and no overlap with transaction buttons are asserted. Wide/small native screenshots were inspected. The initial wide layout failed visual review and was widened before final passing runs.

Reproduce from repository root after dependencies: pnpm desktop:package, then node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpContextAcceptance.check.mjs; add --native for packaged Electron. Evidence: [browser JSON](ob11-evidence/browser/evidence.json), [native JSON](ob11-evidence/native/evidence.json), [wide native purchase](ob11-evidence/native/context-U03-true-1440.png), [small English native development](ob11-evidence/native/context-U09-false-740.png).

## Owner UAT handoff

Use the merge commit recorded in Jira, install dependencies, run pnpm desktop:package and pnpm desktop:run:packaged locally. Test purchase/build with and without U03/U09 (Use, Skip, insufficient cash, hotel and teammate investment); verify the original transaction stays open and displayed totals equal committed charges. Test U01/U02/U05/U08 and no-card dice under OB-8 instructions. Inspect complete 3D inventory cards and confirm no detail entry. Repeat denial/reconnect, keyboard and small-screen flows on the Owner device.

Owner UAT has not run. Physical GPU/refresh-rate, cross-device LAN, macOS packaging and full-match subjective acceptance remain manual. Automated/browser/native results are not Owner sign-off.
