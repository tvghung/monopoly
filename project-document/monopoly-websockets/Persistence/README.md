# Volatile room storage and lifecycle

`apps/server/src/persistence/inMemory.ts` is the production authority. Each `startAuthoritativeServer` call constructs a fresh instance; no database URL, migration directory, filesystem snapshot or cloud service is consulted. The store holds rooms, versioned game snapshots, hashed player sessions, offers and absolute deadlines in process RAM.

Pending sessions also carry an admitted room ID for Guests or an explicit room-creation grant for the desktop Host. Activation runs in the same RAM transaction as seat creation. If the admitted room disappears, the pending Guest receives `ROOM_GONE`; a reused code cannot change that grant. Transaction rollback discards both draft room and session changes.

The store serializes transactions and direct writes on one queue. A transaction works on a structured clone and publishes it only when its callback succeeds. A thrown error leaves rooms, sessions, offers and revisions unchanged. `close()` (called at the end of a graceful shutdown) ends the store's life: later transactions, direct writes and health checks fail with `RuntimeUnavailableError`, and a transaction that was still queued behind the running one never commits after shutdown began, so nothing can revive state on a closing process. `RoomCommandExecutor` adds per-room FIFO ordering and expected-version compare-and-swap before ACK/broadcast. A direct expiry or cleanup write waits behind an active transaction. The scheduler processes room, offer and session deadlines while this process remains alive.

Raw reconnect tokens belong only to the client; the server keeps SHA-256 token hashes in RAM. Room deletion removes its sessions and offers. Expired/revoked sessions are purged by the scheduler. Public projection excludes session hashes, credentials, hidden deck order and private offer details.

## Failure semantics

| Event | Result |
| --- | --- |
| Client disconnect or refresh | Seat and room remain in RAM; valid token can resume while the same helper lives. |
| Tunnel interruption | The match remains in RAM; the current public link is hidden until a route is ready. A new hostname needs a new link. |
| Host stops or helper crashes | Match and all tokens are permanently lost. Desktop reports `FAILED` on unexpected helper loss and does not restart behind the old session. |
| Host starts again | New empty store and independent match universe. Old room and token lookup fail. |

Snapshot schema version 10 and protocol version 11 still validate the aggregate shape and network contract. The old SQL migrations under `apps/server/migrations/` are retained only as historical source; they are not runtime inputs. The former `postgres-and-recovery.instruction.md` has been removed because its cross-restart guarantees contradict the current product lifecycle.

Evidence: `apps/server/src/persistence/inMemory.test.ts` (rollback, serialization, closed store), `apps/server/src/hostAdmission.integration.test.ts` (pending-admission lifecycle, closed runtime), Socket.IO integration tests, `apps/desktop/tests/hostRuntime.test.ts`, and the packaged host proof. Physical device and independent-network verification are tracked in [testcases](../testcase/README.md).
