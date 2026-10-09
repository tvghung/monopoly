# Volatile room storage and lifecycle

`apps/server/src/persistence/inMemory.ts` is the production authority. Each `startAuthoritativeServer` call constructs a fresh instance; no database URL, migration directory, filesystem snapshot or cloud service is consulted. The store holds rooms, versioned game snapshots, hashed player sessions, offers and absolute deadlines in process RAM.

Pending sessions also carry an admitted room ID for Guests or an explicit room-creation grant for the desktop Host. Activation runs in the same RAM transaction as seat creation. If the admitted room disappears, the pending Guest receives `ROOM_GONE`; a reused code cannot change that grant. Transaction rollback discards both draft room and session changes.

The store serializes transactions and direct writes on one queue. A transaction works on a structured clone and publishes it only when its callback succeeds. A thrown error leaves rooms, sessions, offers and revisions unchanged. `close()` (called at the end of a graceful shutdown) ends the store's life: later transactions, direct writes and health checks fail with `RuntimeUnavailableError`, and a transaction that was still queued behind the running one never commits after shutdown began, so nothing can revive state on a closing process. `RoomCommandExecutor` adds per-room FIFO ordering and expected-version compare-and-swap before ACK/broadcast. A direct expiry or cleanup write waits behind an active transaction. The scheduler processes room, offer and session deadlines while this process remains alive.

Raw reconnect tokens belong only to the client; the server keeps SHA-256 token hashes in RAM. Room deletion removes its sessions and offers. Expired/revoked sessions are purged by the scheduler. Public projection excludes session hashes, credentials, hidden deck order and private offer details.

## Command ordering

Two layers of ordering, both in process RAM:

1. **Per-room FIFO** — `apps/server/src/services/roomCommandExecutor.ts` chains every command for one room behind the previous one. Inside the FIFO a command loads the room, works on a `structuredClone` draft of its snapshot, then saves with `expectedVersion` = the loaded `aggregateVersion` (compare-and-swap; mismatch → `RoomVersionConflictError` → `CONFLICT`, retryable). An optional `afterCommit` hook runs after the commit but before the FIFO admits the room's next command. An explicit lifecycle deletion skips the save.
2. **One process-wide transaction queue** — `apps/server/src/persistence/inMemory.ts` runs every `transaction()` one at a time on a `structuredClone` of the whole store state (rooms, sessions, offers) and publishes the draft only when the callback returns; a thrown error leaves the store unchanged, so the failed command's draft is discarded. Direct writes (`rooms.create/save/delete`, session `createPending/activate/touch/revoke/revokeByPlayer/expireDue/purgeTerminal`, offer `create/resolve`) are wrapped to go through the same queue.

ACK and room broadcast happen after commit and, in the socket handlers, after `commitRoomCommand` returns, i.e. outside the per-room FIFO (for example `apps/server/src/socket/bots.ts`). Session writes in `apps/server/src/services/playerSessionService.ts` call `persistence.transaction` directly, outside the room FIFO; they are safe only because the global transaction queue serializes them with room commands. The deadline scheduler (`apps/server/src/services/deadlineScheduler.ts`, 1 s poll) expires sessions and offers through those serialized writes and recovers due rooms through the room command path, so expiry also runs under the global lock.

Error mapping on ACK (`mapCommandError` in `apps/server/src/socket/errors.ts`; a domain `CommandError` keeps its own code; `UnsupportedRoomSnapshotVersionError` → `INTERNAL_ERROR`, non-retryable): `RoomNotFoundError` → `ROOM_GONE`; `RoomVersionConflictError` → `CONFLICT` (retryable); `RuntimeUnavailableError` (closed store) → `INTERNAL_ERROR` (non-retryable); any other error → `INTERNAL_ERROR` (retryable). `DATABASE_UNAVAILABLE` is deprecated and never emitted.

## Request ledgers

Runtime-memory ledgers of client request ids make retransmitted emits idempotent without touching the durable-looking room aggregate: `runtime.botRequests` (`add bot`, `apps/server/src/services/botRequestLedger.ts`, 64 ids per room), and
`runtime.sellHouseRequests` / `runtime.makeOfferRequests` (`apps/server/src/services/commandRequestLedger.ts`, CURRENT DEVELOPMENT, protocol 13; keyed by room, actor, event and
id; 128 ids per room, 10 minutes, 1024 rooms, oldest first). They are written in `afterCommit` (a refused or rolled-back command records nothing), are never persisted or
snapshotted, and die with the helper like every room, so a restarted host has no memory of old request ids (its rooms and tokens are gone too).

## Failure semantics

| Event | Result |
| --- | --- |
| Client disconnect or refresh | Seat and room remain in RAM; valid token can resume while the same helper lives. |
| Tunnel interruption | The match remains in RAM; the current public link is hidden until a route is ready. A new hostname needs a new link. |
| Host stops or helper crashes | Match and all tokens are permanently lost. Desktop reports `FAILED` on unexpected helper loss and does not restart behind the old session. |
| Host starts again | New empty store and independent match universe. Old room and token lookup fail. |

The current snapshot schema version (`ROOM_SNAPSHOT_SCHEMA_VERSION` in `apps/server/src/rooms.ts`) and protocol version (`SOCKET_PROTOCOL_VERSION` in `packages/shared/src/types.ts`) still validate the aggregate shape and network contract; values and history: [Version history](../Shared/socket-and-state-contracts.instruction.md#version-history). The snapshot upgrade helpers in `apps/server/src/rooms.ts` are exercised only by tests; `assertSupportedRoomSnapshot` requires the current version. The old SQL migrations under `apps/server/migrations/` are retained only as historical source; they are not runtime inputs. The former `postgres-and-recovery.instruction.md` has been removed because its cross-restart guarantees contradict the current product lifecycle.

Evidence: `apps/server/src/persistence/inMemory.test.ts` (rollback, serialization, closed store), `apps/server/src/hostAdmission.integration.test.ts` (pending-admission lifecycle, closed runtime), Socket.IO integration tests, `apps/desktop/tests/hostRuntime.test.ts`, and the packaged host proof. Physical device and independent-network verification are tracked in [testcases](../testcase/README.md).
