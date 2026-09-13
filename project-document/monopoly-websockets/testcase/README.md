# Testcase — Cờ Tỷ Phú Việt Nam Standard Mode

## Evidence labels

- `[AUTO]`: executable unit/schema gate with exact test file.
- `[SOCKET]`: real Socket.IO client/server integration.
- `[PG]`: requires disposable PostgreSQL via `DATABASE_URL` and `TEST_DATABASE_URL`.
- `[CLIENT]`: Vitest + React Testing Library.
- `[BROWSER]`: automated Playwright browser-engine flow; not a physical device.
- `[PACKAGED]`: packaged Electron/helper/PostgreSQL process proof, scoped to the
  reported OS/architecture.
- `[AUDIT]`: deterministic repository/content audit implemented as test/script.
- `[MANUAL-E2E]`: browser/process validation; never called automated.

Không đánh dấu requirement đạt chỉ vì typecheck/build pass. Sau implementation, mỗi
checklist item phải map tới assertion executable hoặc giữ nhãn missing/manual rõ.

## Coverage map

| Area | Checklist | Primary executable layer |
| --- | --- | --- |
| Identity/lobby/reconnect/reset | [join lifecycle](./join-room-and-player-lifecycle.md) | Socket + PG restart |
| Turn/cards/jail/payment | [turn](./turn-movement-buy-and-jail.md) | GameCore + Socket + PG |
| Bankruptcy/forfeit/winner | [bankruptcy](./game-status-bankruptcy-and-winner.md) | GameCore + Socket + PG |
| Rent/build/transfer | [property](./property-economy.md) | GameCore + Socket |
| `TradeBundle`/private offer | [trading](./trading-market-and-private-offers.md) | schema + Socket + PG |
| Property/building/forced sale | [payment-shortfall](./payment-shortfall-and-forced-sale.md) | GameCore + Socket + scheduler + PG |
| Protocol/snapshot/board/decks | [shared](./shared-contracts-and-board-data.md) | schema + room + data audit |
| Vietnamese client/motion | [client](./client-state-sync-motion-and-accessibility.md) | client + audit |
| Chat/log safety | [chat](./chat-log-and-input-safety.md) | Socket + client |
| Activity/victory/replay | [game status](./game-status-bankruptcy-and-winner.md), [client sync](./client-state-sync-motion-and-accessibility.md) | Activity schema + Socket + client |
| DB/runtime/deploy | [runtime](./http-runtime-and-deployment.md) | migration + HTTP + PG |
| Desktop Host/LAN/mobile | [runtime](./http-runtime-and-deployment.md), [join lifecycle](./join-room-and-player-lifecycle.md) | packaged Phase 7.0/7.2 + Chromium/WebKit |

## Full gates

```bash
pnpm db:status
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Persistence release additionally runs PostgreSQL migration/integration and fresh
pool/server restart against the same disposable DB. Conditional/skipped suites do
not satisfy V5 appearance/reset/recovery requirements. CI parity means both
database variables are set before `pnpm db:migrate` and `pnpm test`; an unset
`TEST_DATABASE_URL` is an explicitly skipped/conditional run.

Phase 5.2 additionally distinguishes structured Activity Feed assertions from
legacy string-log compatibility, and marks browser/Electron replay, reduced-motion,
WebGL fallback and long-session audio checks as `[MANUAL-E2E]` unless executed live.

Phase 7.2 runs `pnpm desktop:proof:host` separately from the retained Phase 7.0
proof and `pnpm test:e2e:mobile` on mobile Chromium/WebKit profiles. Browser-engine
PASS does not convert real iPhone/iPad/Android or physical LAN rows to PASS.
