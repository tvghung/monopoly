# OB-15 — Per-turn Journal timing

## Scope and root cause

[OB-15](https://tvghung.atlassian.net/browse/OB-15), based on main `74a34d5ce6ab712b5aaab26361f8fecaed1e8f55`. Work is confined to the client presentation gate and tests/docs.

The server increments turnNumber on each handoff; it does not batch the activity feed by anchor cycle. App applies each accepted public snapshot synchronously to PresentationController. Previously the controller retained one gate while the queue was busy and flushed only at queue idle; a sequence of handoffs could therefore withhold already completed events.

The controller now publishes the committed handoff tail immediately on player-ID change or turn-number advance, and publishes the terminal tail on game finish. The following active turn gets its own gate. If an incoming handoff state is already moved/pending, only the preceding accepted tail is proven complete; that prefix is published while the incoming tail remains gated under the incoming turn. Within-turn queue/pending rules and reset/sync behavior remain unchanged.

No gameplay command, bot pacing, animation duration, event source, protocol18/snapshot16, product/minimum1.11.2, privacy, locale copy or player-color mapping changes.

## Failing-before evidence

- Baseline source/main: `74a34d5ce6ab712b5aaab26361f8fecaed1e8f55`. All seven initial controller regressions FAIL before the production patch; they cover four continuous handoffs in Solo/2v2, next-turn purchase/card/payment, terminal/same-player handoff and legacy history. Raw [test log](./ob15-turn-log-evidence/before/controller-fail.txt).
- Production Chromium baseline also FAILS at the first handoff: the committed landing row remains absent past the 650ms deadline while dice/walk presentation is still active. [JSON](./ob15-turn-log-evidence/before/browser-fail.json), [screenshot](./ob15-turn-log-evidence/before/browser-fail.png). This verifies the queue-idle delay; it does not claim every reported Owner session was reproduced identically.

## Validation and reproduction

Automated controller and live-store Journal tests cover the handoff boundary without queue idle, retained current-turn holds, Host/Guest/Spectator views, chat immediacy, OB-14 name spans, reconnect hydration, duplicate/old snapshots and leave/bankruptcy snaps. PASS: final focused suite 73/73 (10 turn-boundary controller tests, 20 existing controller tests, 27 Journal tests, 16 ticker/chat tests). PASS: workspace typecheck/full lint, production build/Windows package and docs validation (209 files). Full desktop 629 and server 1,188/2 existing skips passed. Final full client/CI results are recorded on OB-15/its PR before merge.

From repo root with Node24/pnpm11.15.1 and frozen dependencies:

```sh
pnpm --filter @monopoly/client test src/game/presentation/PresentationController.turnLogs.test.ts src/game/presentation/PresentationController.test.ts src/components/Log.test.tsx src/game/ui/hud/tickerAndBubbles.test.tsx
pnpm build
pnpm --filter @monopoly/server exec node --import tsx ../../scripts/activityTurnAcceptance.check.mjs
pnpm desktop:package
pnpm --filter @monopoly/server exec node --import tsx ../../scripts/activityTurnAcceptance.check.mjs --native
```

The acceptance harness uses server-validated Dev transactions, real nextTurn/moveBy domain helpers and typed activity, broadcast to four joined players plus a spectator. It checks each of four handoffs on Host, Guest and Spectator within 650ms, while the controller tests separately prove the queue remains busy. A pending purchase fixture verifies previous history remains visible, new current-turn gameplay remains held, and chat is immediate. It then completes the turn, reconnects the Guest, checks event identity/order/count and switches VI/EN while preserving player name colors. Native mode uses a packaged app:// Electron Guest against Chromium Host/other seats/Spectator. These fixtures test the public snapshot-to-presentation path; they are not an automated human-driven full match.

## Production acceptance results

PASS: Chromium and packaged Electron each complete all four acceptance groups, with no page errors. Each handoff was observed on all three viewer roles in 57–338ms in the recorded runs, under the 650ms regression deadline. These are test-machine observations, not a physical-device performance guarantee. The after image shows all four actor landing lines while earlier board presentation is still running.

Raw results: [browser JSON](./ob15-turn-log-evidence/browser/evidence.json), [native JSON](./ob15-turn-log-evidence/native/evidence.json), [passing controller log](./ob15-turn-log-evidence/controller-pass.txt). Screenshots: [native four handoffs](./ob15-turn-log-evidence/native/four-handoffs.png), [native English reconnect](./ob15-turn-log-evidence/native/english-history.png), [browser four handoffs](./ob15-turn-log-evidence/browser/four-handoffs.png). Images were visually reviewed.

## Owner UAT local

OB-15 Owner UAT is NOT RUN. Automated Dev results do not establish Owner sign-off, other physical GPUs, macOS, independent network or full-match acceptance. No release/tag/publication is performed.

Use the exact merge SHA recorded on OB-15 after PR merge, preserving personal changes in another checkout. From a clean checkout: Node24/pnpm11.15.1, `pnpm install --frozen-lockfile`, `pnpm desktop:package`, `pnpm desktop:run:packaged`. Close the app to stop; keep Host running during Guest reconnect. Matching protocol18 clients are required.

Play four seats including bots with slow presentation: verify each B/C/D turn appears before anchor A returns, even as presentation carries across handoffs. Exercise purchase/card/payment holds, skips/disconnect timeout, bankruptcy/leave, 2v2 and finish. Verify previous completed history stays visible, pending results remain held, chat/unread/scroll/ticker, VI/EN, safe legacy strings, Power-up privacy and OB-14 name colors. Reconnect/sync must preserve order without duplicate events.
