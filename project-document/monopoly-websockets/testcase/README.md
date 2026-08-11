# Testcase — mục lục và coverage contract

## Nhãn

- `[AUTO]`: có executable assertion/gate; luôn ghi file/lệnh thật.
- `[PG-INTEGRATION]`: cần PostgreSQL thật và chỉ đạt khi suite tương ứng chạy.
- `[SOCKET-INTEGRATION]`: cần server + `socket.io-client`, không được suy từ pure unit.
- `[CLIENT]`: Vitest/React Testing Library executable assertion.
- `[MANUAL-E2E]`: browser/process scenario thủ công; không gọi là automated.
- `[MISSING]`: requirement quan trọng chưa có executable coverage.

## Test files hiện có

- `apps/server/src/game.test.ts`: GameCore unit/regression.
- `apps/server/src/config.test.ts`: environment validation/defaults.
- `apps/server/src/createServer.test.ts`: liveness/readiness/shutdown-state HTTP behavior.
- `apps/server/src/rooms.test.ts`: snapshot version, UUID identity and active-member
  inverse-state validation.
- `apps/server/src/services/connectionRegistry.test.ts`: newest-wins/generation registry.
- `apps/server/src/services/roomCommandExecutor.test.ts`: serialization/commit boundary.
- `apps/server/src/services/deadlineScheduler.test.ts`: expired auction, buy-decision
  recovery and expired empty-room cleanup.
- `apps/server/src/persistence/inMemory.test.ts`: terminal-session retention behavior
  of the test adapter.
- `apps/server/src/persistence/migrations.test.ts`: migration file ordering, checksum
  and required-table SQL presence.
- `apps/server/src/persistence/postgres.integration.test.ts`: PostgreSQL repository,
  CAS/hash/rollback/session-retention integration when a test database is supplied.
- `apps/server/src/socket.integration.test.ts`: 22 default real-Socket.IO scenarios
  over the injected in-memory repository, including a failed-commit rollback case,
  plus one opt-in PostgreSQL restart scenario using fresh pools/persistence/server
  when `TEST_DATABASE_URL` is supplied.
- `apps/client/src/playerSessionStorage.test.ts`: versioned token storage.
- `apps/client/src/App.test.tsx`, `components/Lobby.test.tsx`: client session/lobby UI.

The default Socket recreation case deliberately reuses the in-memory test repository.
The conditional PostgreSQL case separately recreates the pool, persistence adapter
and HTTP/Socket server over one database schema. Neither is a browser/process-manager
deployment E2E.

## Mapping

| Chức năng | Checklist |
| --- | --- |
| Join/session/reconnect/host/leave | [join-room-and-player-lifecycle.md](./join-room-and-player-lifecycle.md) |
| Turn/buy/jail/recovery | [turn-movement-buy-and-jail.md](./turn-movement-buy-and-jail.md) |
| Bankruptcy/winner | [game-status-bankruptcy-and-winner.md](./game-status-bankruptcy-and-winner.md) |
| Property economy | [property-economy.md](./property-economy.md) |
| Trading/private offers | [trading-market-and-private-offers.md](./trading-market-and-private-offers.md) |
| Auction/deadline | [auction.md](./auction.md) |
| Chat/input safety | [chat-log-and-input-safety.md](./chat-log-and-input-safety.md) |
| Contracts/schemas/data | [shared-contracts-and-board-data.md](./shared-contracts-and-board-data.md) |
| Client state/accessibility | [client-state-sync-motion-and-accessibility.md](./client-state-sync-motion-and-accessibility.md) |
| DB/runtime/deployment | [http-runtime-and-deployment.md](./http-runtime-and-deployment.md) |

## Baseline

```bash
pnpm db:status
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Persistence release additionally requires clean migration, PostgreSQL integration
and restart E2E using the same database.

Both PostgreSQL repository tests and the Socket restart case create/drop isolated
schemas, but Vitest skips them unless `TEST_DATABASE_URL` is present in the shell
environment. Point that variable at a disposable PostgreSQL database when validating
a persistence release.
