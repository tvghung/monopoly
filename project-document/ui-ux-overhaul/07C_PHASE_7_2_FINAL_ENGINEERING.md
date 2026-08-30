# Phase 7.2 - Final Engineering Record

## Status

**IN PROGRESS.** This record is the implementation and evidence ledger for the
final Phase 7 engineering scope. It does not claim Phase 7.1 passed and it does
not claim real-device, installer, signing, or public-release acceptance.

Phase 7.2 absorbs the still-unimplemented Desktop Host Runtime + LAN Multiplayer
work required from Phase 7.1 and then completes Mobile Compatibility + Recovery
+ Final Hardening.

## Repository baseline

| Field | Value |
| --- | --- |
| Starting `origin/main` | `68c364d2b88aaa24edfafa16d9157672c3099e31` |
| Phase 7.0 closure | `68c364d2b88aaa24edfafa16d9157672c3099e31` |
| Phase 7.0 code-bearing integration | `fa0461abe6496c54a864207f06ad3c99bd5e49b1` |
| Phase 7.1 source branch head | `f47c8d87004b338ea34aff7b2b5651bce6a5c570` |
| Phase 7.2 branch | `overhaul/phase-7.2-final-engineering` |
| Phase 7.1 carry-forward merge | `fbc6b2ad1fc5e3bbc986cf4f24e3efca64d75550` |

The Phase 7.2 branch was created from the clean, fetched `origin/main` baseline.
The six unmerged Phase 7.1 commits were then preserved through an auditable merge
into this branch. `main` was not modified.

### Exact-SHA remote baseline

| Gate | Status | Evidence |
| --- | --- | --- |
| CI | PASS | Origin repository run `33290697250`, job `99201692733`, exact SHA `68c364d2b88aaa24edfafa16d9157672c3099e31`. |
| Desktop Build | NOT RUN | The documentation-only starting SHA has no Desktop Build run. The last Phase 7.0 code-bearing Desktop Build is run `33290328403` at `fa0461abe6496c54a864207f06ad3c99bd5e49b1`. |

### Untouched local baseline

| Command | Result | Evidence boundary |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | Lockfile and worktree unchanged. The optional pnpm update metadata fetch failed, but installation exited zero and reported already up to date. |
| `pnpm db:status` | FAIL | `ECONNREFUSED 127.0.0.1:5433`; no developer PostgreSQL was running. No database was started, reset, or repaired during baseline capture. |
| `pnpm typecheck` | PASS | All workspace packages passed. |
| `pnpm lint` | PASS | Workspace ESLint passed. |
| `pnpm test` | PASS | Desktop 51, server 153 with 11 PostgreSQL-gated skips, and client 499 passed after serial host-path rerun. |
| `pnpm build` | PASS | Client production build passed with the existing large-chunk warning. |
| `pnpm --filter @monopoly/desktop typecheck` | PASS | Desktop TypeScript check passed. |
| `pnpm --filter @monopoly/desktop test` | PASS | 51 tests passed after rerunning outside the Windows sandbox following `spawn EPERM`. |
| `pnpm desktop:package` | PASS | Windows x64 package completed. |
| `pnpm --filter @monopoly/desktop proof:packaged` | PASS | Windows x64 managed PostgreSQL/helper proof passed migrations 001-009, PostgreSQL locking/CAS/rollback/restart/deadline checks, health/readiness, loopback binding, and private URL checks. |

The first parallel test attempt is retained as runner evidence only: one desktop
test hit Windows `spawn EPERM` and the simultaneous server suite lost a Vitest
worker. Both exact commands passed when rerun serially through the approved host
path. PostgreSQL-gated tests were not counted as local integration PASS.

## Proven Phase 7.0 primitives retained

- `ManagedPostgresController` with PostgreSQL 17.11 and app-data persistence.
- `ServerHelperController` using packaged `utilityProcess.fork()`.
- `startAuthoritativeServer()` with explicit migration resources.
- External server-helper, canonical migrations 001-009, and packaged resources
  outside `app.asar`.
- PostgreSQL transaction, CAS, rollback, row-lock, restart, deadline recovery,
  duplicate-start, graceful-shutdown, and credential-boundary proofs.

These primitives are reused. Phase 7.2 must not replace PostgreSQL, weaken pool or
locking semantics, move GameCore into Electron, or remove the Phase 7.0 proof.

## Frozen invariants

- Server and PostgreSQL remain authoritative.
- `SOCKET_PROTOCOL_VERSION = 8` and `ROOM_SNAPSHOT_SCHEMA_VERSION = 8`.
- Room lifecycle remains `LOBBY -> IN_PROGRESS -> FINISHED -> LOBBY` through
  authenticated host-only Play Again and canonical `freshState()`.
- Two to four active players, stable UUID identities, stable host, spectator
  behavior, disconnect-presence semantics, explicit leave, and newest-connection
  wins remain unchanged.
- Raw reconnect tokens stay in endpoint-scoped client storage and private session
  ACKs only. They never enter URL, QR, IPC, logs, screenshots, public state, or
  room metadata.
- PostgreSQL stays bound to `127.0.0.1`; only the game HTTP/Socket server may bind
  for LAN access.
- Client presentation remains `PresentationController -> AnimationQueue ->
  PresentationStore`; WebGL and legacy board render the same authoritative state.
- Electron retains `contextIsolation: true`, `nodeIntegration: false`, `sandbox:
  true`, typed IPC, navigation guards, and no gameplay authority.

## Scope consolidation and initial gap audit

The carried Phase 7.1 branch supplies an initial host controller, LAN interface
enumeration, typed host IPC, pre-socket launcher, endpoint-scoped sessions,
endpoint-less release configuration, and a Windows packaged LAN-equivalent proof.
It remains input to this phase, not a completed acceptance claim.

Phase 7.2 must close these code-backed gaps:

1. Remove the carried UDP broadcast discovery path. The final V1 contract is Node
   IPv4 interface enumeration, explicit candidate selection, and manual Host/Join
   endpoint entry. mDNS, UDP discovery, IPv6 discovery, NAT traversal, UPnP, and
   host migration are out of scope.
2. Make the desktop runtime serve only the explicit packaged client distribution,
   with static assets and SPA fallback, without cloud proxy assumptions.
3. Enforce the desktop Electron-origin and same-origin browser policy without
   wildcard CORS.
4. Complete application-owned host lifecycle, actual health/readiness gates,
   shutdown ordering, renderer independence, bounded helper/PostgreSQL recovery,
   network refresh, and retryable safe failures.
5. Complete pre-socket Host/Join UX, actual-port handling, stale-socket cleanup,
   actionable connection errors, host sharing, room URL prefill, Copy Link, and a
   secret-free QR payload.
6. Harden join, lobby, board, WebGL fallback, visibility/pageshow/online recovery,
   audio gesture behavior, safe-area handling, touch targets, and dynamic viewport
   behavior for mobile browser engines.
7. Add deterministic endpoint/session, LAN HTTP, multi-client, recovery,
   FINISHED/Play Again, browser-engine, and packaged-host proofs while preserving
   the existing PostgreSQL-gated suite.
8. Synchronize CI, release/package commands, source-of-truth documents, security
   review, and final evidence without inferring unexecuted platform/device results.

## Execution milestones

1. Desktop host runtime and safe IPv4 network policy.
2. Desktop server static delivery and explicit origin policy.
3. Typed IPC and pre-socket Host/Join resolution.
4. Endpoint-scoped sessions, room URL, sharing, QR, and copy behavior.
5. Mobile viewport, touch, renderer fallback, suspend, reconnect, and audio
   compatibility.
6. Helper/PostgreSQL/renderer/network recovery and local-data safety.
7. Multi-client, browser-engine, packaged-host, security, CI, and release proofs.
8. Documentation synchronization and exact-SHA closeout.

## Evidence rules

- Automated PASS requires an executable assertion or exact command output.
- Packaged PASS applies only to the platform and architecture actually executed.
- A LAN-equivalent loopback/private-interface proof is labeled as such and is not
  physical desktop-to-desktop or real-device LAN acceptance.
- PostgreSQL integration PASS requires `TEST_DATABASE_URL` and the conditional
  suites actually running, not being skipped.
- CI PASS requires the exact final SHA and completed successful conclusion.
- Manual and real-device rows remain `MANUAL DEFERRED / NOT RUN` unless directly
  exercised and recorded.
- Signing, notarization, and public production release remain a separate gate.

## Deferred manual matrix

The following remain `MANUAL DEFERRED / NOT RUN` unless later evidence in this
record explicitly replaces the status: fresh Windows/macOS install, every
Windows/macOS host/join pair, real iPhone/iPad/Android browsers, OS firewall
prompts, guest-Wi-Fi/client isolation, physical sleep/wake, Wi-Fi switch, physical
IP change, antivirus/UAC, installer upgrade, and uninstaller data retention.

## Closeout decision

The only permitted final decisions are:

- `PHASE 7.2 ENGINEERING PASS` after every automated hard gate passes; or
- `PHASE 7.2 BLOCKED` with the exact failed automated gate.

Until that closeout is recorded, Own the Block must not be described as fully
engineering-complete or public-release validated.
