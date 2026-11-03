# OB-14 — Journal player colors

## Scope and implementation

[OB-14](https://tvghung.atlassian.net/browse/OB-14), [PR 38](https://github.com/tvghung/monopoly/pull/38), based on main `8df02f23132d7a429ec8f1ca5cb4f7c3ce6f0acd`. Application source was committed at `0cd1ab3ed71861016f67fa930f0c6bf5ca17e3c0`; subsequent acceptance-fixture/docs changes do not alter production source.

The formatter interpolates catalog placeholders into typed text/player segments. Journal resolves player color by stable ID from public roster/finished-player records, with explicit join/winner event colors as fallback. Equal names remain distinct, names stored on historical events remain unchanged, and unknown identities/colors remain plain text. Bank/team/card text, chat and legacy strings are not searched for player names. React text rendering prevents HTML injection.

Text colors derive from the existing player palette; hues are darkened only enough for at least 4.5:1 contrast on both supported white/paper Journal backgrounds. Inline name spans inherit typography and allow unbroken names to wrap. Game payload, protocol18/snapshot16, product/minimum1.11.2, event ordering, privacy, presentation gate and history bounds remain unchanged.

Changed application paths: `apps/client/src/components/Log.tsx`, `apps/client/src/components/style/Log.css`, `apps/client/src/game/ui/hud/activityText.ts`, `apps/client/src/game/ui/hud/activityPlayerColor.ts`. Canonical behavior and manual checklist are linked from F38 in feature traceability.

## Dev validation

- PASS: 62 focused Log/formatter/contrast/ticker tests. Includes both locales, duplicate/overlapping names, multiple endpoints, owner/revival/rescue/winner references, placeholder-like names, escaping, unknown/legacy fallback, roster color replacement, reopen/rerender stability, and ten palette colors on both backgrounds.
- PASS: workspace typecheck, full lint, production build and Windows package.
- PASS: full desktop suite (629 tests); full server suite (1,188 tests, 2 existing skips).
- Final full client suite and PR CI results are recorded on the linked OB-14 issue and PR38, against the final head before merge.

## Production browser and packaged Electron

Reproduce from repo root using Node24 and pnpm11.15.1, after `pnpm install --frozen-lockfile` and `pnpm build`:

```sh
pnpm --filter @monopoly/server exec node --import tsx ../../scripts/powerUpActivityAcceptance.check.mjs --player-colors
pnpm desktop:package
pnpm --filter @monopoly/server exec node --import tsx ../../scripts/powerUpActivityAcceptance.check.mjs --player-colors --native
```

The existing harness starts an isolated in-memory Host and two real clients. Chromium mode uses the production build; native mode uses a packaged app:// Electron acting player with a Chromium opponent. Real reward CLAIM and U02 use verify one generic receipt/exact official card use on both viewers, no receipt metadata, double-click safety, VI/EN and reconnect identity/order. A server-validated Dev fixture adds two equal player names with distinct IDs/colors, a matching card name and ordinary chat. It verifies no colored card/chat text or injected HTML, plus horizontal layout bounds.

The real-server fixture uses the maximum legal 20-character unbroken name `<img>{playerName}XYZ`. An earlier oversized fixture was rejected by snapshot validation; it was corrected without changing schema. Component tests separately exercise longer hostile text defensively. Native layout tests unmaximize the window and relax only its test window minimum size, then require actual innerWidth/innerHeight within one pixel of 1440×900 or 667×375 before assertions. Native Windows rounds the narrow width to 668px; raw evidence records this. V1 white and V2 paper are both checked.

Raw evidence/screenshots: [browser](./ob14-evidence/browser/evidence.json), [native](./ob14-evidence/native/evidence.json). Both modes PASS all seven acceptance groups. Final browser viewports are 1440×900/667×375; native viewports are 1440×900/668×375. The evidence records actual viewport sizes. Images include real receipt/use, English history, wide and phone layouts. Screenshot review checks name-only colors, wrapping, visible content and unchanged card/chat text.

## Owner UAT local

Owner/Tester UAT is NOT RUN for OB-14. Dev acceptance does not establish Owner sign-off, other physical GPUs, macOS or cross-device/full-match acceptance. No release/tag/publication is performed.

Use the exact PR38 merge SHA recorded on OB-14, keeping personal changes safe in another checkout. Node24/pnpm11.15.1; run `pnpm install --frozen-lockfile`, `pnpm desktop:package`, then `pnpm desktop:run:packaged`. Close the app to stop; retain the Host while testing Guest reconnect. Do not mix protocol16/17 desktop clients with this protocol18 build.

Check actor colors in receipt/use, purchases/transfers, teammate development, rescue/revival and Solo win. Two matching player names must use the right ID colors; card/action words must remain ordinary. Check generic receipt privacy, VI/EN, open/close, reconnect/resync with unchanged order/count, and maximum legal names/characters in wide and landscape layouts. Legacy/unknown references stay plain, chat/toast are unchanged.
