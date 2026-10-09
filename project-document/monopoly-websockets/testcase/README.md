# Test evidence index

Status: CURRENT. Feature checklists live in this folder; release-level status is in the
[release acceptance matrix](./RELEASE_ACCEPTANCE_MATRIX.md). Which checklist belongs to which feature is listed in
[FEATURE_TRACEABILITY.md](../FEATURE_TRACEABILITY.md).

## Checklists

| Checklist | Covers |
| --- | --- |
| [RELEASE_ACCEPTANCE_MATRIX.md](./RELEASE_ACCEPTANCE_MATRIX.md) | Per-version and per-platform acceptance, open release risks |
| [join-room-and-player-lifecycle.md](./join-room-and-player-lifecycle.md) | Join, resume, reconnect, spectator, leave/forfeit, launcher, host capability |
| [http-runtime-and-deployment.md](./http-runtime-and-deployment.md) | RAM host, LAN, Online tunnel, registry, packaging, in-app update |
| [turn-movement-buy-and-jail.md](./turn-movement-buy-and-jail.md) | Roll, movement, purchase, jail, cards |
| [property-economy.md](./property-economy.md) | Rent, building, selling, transfers |
| [payment-shortfall-and-forced-sale.md](./payment-shortfall-and-forced-sale.md) | Debt, bank sales, forced-sale proposals |
| [game-status-bankruptcy-and-winner.md](./game-status-bankruptcy-and-winner.md) | Lobby/game status, bankruptcy, winner, play again |
| [trading-market-and-private-offers.md](./trading-market-and-private-offers.md) | Trade offers and private delivery |
| [team-play.md](./team-play.md) | 2v2 lobby, team rules, rescue, revive |
| [bot-players.md](./bot-players.md) | Bot seats, policy, driver, difficulty |
| [chat-log-and-input-safety.md](./chat-log-and-input-safety.md) | Chat, activity log, input sanitization |
| [client-state-sync-motion-and-accessibility.md](./client-state-sync-motion-and-accessibility.md) | Presentation sync, motion, audio, accessibility, responsive UI |
| [shared-contracts-and-board-data.md](./shared-contracts-and-board-data.md) | Shared schemas, versions, board and card data |

## Evidence labels

A checkbox records whether the item was confirmed (`[x]`) or not (`[ ]`); the label says what kind of evidence it needs or has.
An automated label on an unchecked item means the item is meant to be automated but is not confirmed in this file. Never tick an
item or change its label without an executed assertion or recorded manual result.

| Label | Meaning |
| --- | --- |
| `[AUTO]`, `[AUTOMATED]` | Executable assertion in a named, committed test (the two spellings are equivalent) |
| `[CLIENT]` | Client unit/component test (Vitest + jsdom) |
| `[SOCKET]`, `[SOCKET-INTEGRATION]` | Real Socket.IO server and clients in a server integration test |
| `[RAM]` | Behavior of the in-RAM runtime while the host process lives (process exit loses everything) |
| `[E2E]`, `[BROWSER]` | Playwright browser run (`e2e/`); emulated devices, not physical ones |
| `[PACKAGED]` | An actual packaged Electron/helper build on the reported OS/architecture |
| `[DESKTOP]`, `[CONFIGURED]` | Desktop configuration or desktop-only test; `[CONFIGURED]` means configured, not executed |
| `[LIVE-TUNNEL]` | A real public Cloudflare Quick Tunnel opened from the test machine |
| `[SAME-NETWORK]` | Run from one machine/network; not cross-network evidence |
| `[PROBE]` | Throwaway local script whose result is written down; not a committed test |
| `[AUDIT]` | Manual code or data review |
| `[MANUAL-E2E]` | Real devices or independent networks; never inferred from a local probe |
| `[PASS]`, `[PASS-WINDOWS]`, `[WINDOWS-X64]` | Recorded result of a dated run on the named platform |
| `[NOT RUN]` | Not exercised |
| `[RELEASE]` | Requirement for a release claim |
| `[HISTORICAL]`, `[PG]` | Retired PostgreSQL-era items; never convert them into a current PASS |

## Evidence by area

| Area | Current evidence |
| --- | --- |
| GameCore and network protocol | `apps/server/src/socket.integration.test.ts`, room/game tests and shared schema tests; Host capability, Guest-first and stale pending admission, visitor limits and closed-runtime errors in `apps/server/src/hostAdmission.integration.test.ts` |
| Bot seats, policy and difficulty | `apps/server/src/socket.bots.integration.test.ts`, `apps/server/src/socket.botDriver.integration.test.ts`, `apps/server/src/bots/policy.test.ts`, `apps/server/src/bots/driver.test.ts`; checklist [bot-players.md](./bot-players.md); complete games are `[MANUAL-E2E]` |
| RAM transaction, CAS, expiry, closed store | `apps/server/src/persistence/inMemory.test.ts`, `apps/server/src/services/roomCommandExecutor.test.ts`, `apps/server/src/socket/errors.test.ts`, deadline scheduler and Socket.IO tests |
| Host lifecycle and tunnel controller | `apps/desktop/tests/hostRuntime.test.ts`, `apps/desktop/src/online/connectivity.test.ts` and `apps/desktop/src/online/hostLifecycle.test.ts` (Quick Tunnel isolation and lifecycle), `apps/desktop/tests/prepareCloudflared.test.ts` and `apps/desktop/tests/checkPackagedBudget.test.ts` (pinned cloudflared preparation and package integrity), `apps/desktop/tests/windowHandlers.test.ts` (capability IPC) |
| Packaged Windows LAN authority | `pnpm desktop:proof:host`: real bundled helper, four clients, LAN reachability/discovery, reconnect and old room/token rejection after a helper restart |
| Public Quick Tunnel from this machine | `scripts/proveQuickTunnel.mjs`: HTTPS client page, four Socket.IO clients, wrong-room/full-room behavior and reconnect |
| Physical LAN and cross-network play | `[MANUAL-E2E]` Windows/macOS hosts, Android/iOS/tablet browsers, independent Wi-Fi/cellular networks |

## Required checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:docs
pnpm desktop:package
pnpm desktop:proof:host
```

The former `[PG]` label and PostgreSQL restart cases are retired. Old checklist pages may retain historical SQL wording;
[RAM storage](../Persistence/README.md) and [HTTP hosting](../Api/http-runtime.instruction.md) supersede those parts. Do not convert
old SQL migration or same-database restart entries into a current PASS. Tests that restart a server object while reusing the same
in-memory store are in-process harness restarts, not host process restarts.
