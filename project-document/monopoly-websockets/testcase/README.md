# Testcase — Cờ Tỷ Phú Việt Nam Standard Mode

## Evidence labels

- `[AUTO]`: executable unit/schema gate with exact test file.
- `[SOCKET]`: real Socket.IO client/server integration.
- `[PG]`: requires disposable PostgreSQL via `TEST_DATABASE_URL`.
- `[CLIENT]`: Vitest + React Testing Library.
- `[AUDIT]`: deterministic repository/content audit implemented as test/script.
- `[MANUAL-E2E]`: browser/process validation; never called automated.

Không đánh dấu requirement đạt chỉ vì typecheck/build pass. Sau implementation, mỗi
checklist item phải map tới assertion executable hoặc giữ nhãn missing/manual rõ.

## Coverage map

| Area | Checklist | Primary executable layer |
| --- | --- | --- |
| Identity/lobby/reconnect/reset | [join lifecycle](./join-room-and-player-lifecycle.md) | Socket + PG restart |
| Turn/doubles/cards/jail/payment | [turn](./turn-movement-buy-and-jail.md) | GameCore + Socket + PG |
| Bankruptcy/forfeit/winner | [bankruptcy](./game-status-bankruptcy-and-winner.md) | GameCore + Socket + PG |
| Rent/build/mortgage/transfer | [property](./property-economy.md) | GameCore + Socket |
| `TradeBundle`/private offer | [trading](./trading-market-and-private-offers.md) | schema + Socket + PG |
| Property/building/Bank queue | [auction](./auction.md) | GameCore + scheduler + PG |
| Protocol/snapshot/board/decks | [shared](./shared-contracts-and-board-data.md) | schema + room + data audit |
| Vietnamese client/motion | [client](./client-state-sync-motion-and-accessibility.md) | client + audit |
| Chat/log safety | [chat](./chat-log-and-input-safety.md) | Socket + client |
| DB/runtime/deploy | [runtime](./http-runtime-and-deployment.md) | migration + HTTP + PG |

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
not satisfy v2 reset/recovery requirements.
