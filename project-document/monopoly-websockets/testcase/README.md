# Test evidence index

`[AUTO]` means an executable assertion in a named test. `[SOCKET]` uses a real Socket.IO server and client. `[PACKAGED]` runs an actual packaged Electron/helper build on the reported OS/architecture. `[LIVE-TUNNEL]` opens an actual public Cloudflare Quick Tunnel from the test machine. `[MANUAL-E2E]` requires real devices or independent networks and is never inferred from a local probe.

| Area | Current evidence |
| --- | --- |
| GameCore and network protocol | `apps/server/src/socket.integration.test.ts`, room/game tests and shared schema tests |
| RAM transaction, CAS, expiry | `apps/server/src/persistence/inMemory.test.ts`, `roomCommandExecutor.test.ts`, deadline scheduler and Socket.IO tests |
| Host lifecycle and tunnel controller | `apps/desktop/tests/hostRuntime.test.ts`, `apps/desktop/src/online/*.test.ts` |
| Packaged Windows LAN authority | `pnpm desktop:proof:host`: real bundled helper, four clients, LAN reachability/discovery, reconnect and old room/token rejection after restart |
| Public Quick Tunnel from this machine | `scripts/proveQuickTunnel.mjs`: HTTPS client page, four Socket.IO clients, wrong-room/full-room behavior and reconnect |
| Physical LAN and cross-network play | `[MANUAL-E2E]` Windows/macOS hosts, Android/iOS/tablet browsers, independent Wi-Fi/cellular networks |

## Required checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm desktop:package
pnpm desktop:proof:host
```

The former `[PG]` label and PostgreSQL restart cases are retired. Old checklist pages may retain historical SQL wording; [RAM storage](../Persistence/README.md) and [HTTP hosting](../Api/http-runtime.instruction.md) supersede those parts. Do not convert old SQL migration or same-database restart entries into a current PASS.
