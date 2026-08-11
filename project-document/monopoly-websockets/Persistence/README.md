# Persistence — mục lục database, session và recovery

## Phạm vi

Khối này mô tả durable storage và orchestration tại:

- `apps/server/migrations/`
- `apps/server/src/persistence/`
- `apps/server/src/services/`
- `apps/server/src/config.ts`

## Invariants

- PostgreSQL là durable authority; không có production in-memory fallback.
- Room/game snapshot chỉ được publish sau committed transaction.
- `aggregate_version` bảo vệ compare-and-swap; command cùng room còn được serialize
  trong process để giảm contention.
- Raw session token không được persist; chỉ SHA-256 hash được lookup/index.
- Runtime presence/socket/queue/scheduler timer không nằm trong database.
- SQL migration version và JSON snapshot schema version được quản lý riêng.

## Bảng ánh xạ

| Nhóm | Code | Instruction/testcase |
| --- | --- | --- |
| SQL schema, repository, CAS | `migrations/`, `persistence/postgres.ts` | [postgres-and-recovery.instruction.md](./postgres-and-recovery.instruction.md) |
| Test adapter | `persistence/inMemory.ts` | Chỉ dependency-injected tests |
| Sessions/token | `services/playerSessionService.ts` | Cùng instruction và join lifecycle testcase |
| FIFO/CAS boundary | `services/roomCommandExecutor.ts` | Cùng instruction và persistence tests |
| Connection registry | `services/connectionRegistry.ts` | Socket lifecycle testcase |
| Public projection | `services/publicState.ts` | Shared/privacy testcase |
| Runtime/recovery | `services/runtime.ts` và deadline scheduler | Restart/deadline testcase |

## Kiểm tra

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm db:status
pnpm --filter @monopoly/server test
```

PostgreSQL integration tests có thể require test database environment. Không thay
chúng bằng in-memory tests khi thay SQL/schema/CAS/recovery.
