# Phase 7.2 - Final Engineering Record

## Status

**LOCAL AUTOMATED CANDIDATE PASS; EXACT-SHA WINDOWS/macOS CI PENDING.** This
record is the implementation and evidence ledger for the final Phase 7
engineering scope. It does not claim Phase 7.1 passed and it does not claim
real-device, installer, signing, or public-release acceptance.

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

## AS-IS implementation record

| Area | Status | Current implementation |
| --- | --- | --- |
| Desktop Host ownership | PASS | `HostRuntimeController` owns managed PostgreSQL then the external authoritative helper independently of `BrowserWindow`; duplicate starts share one promise, shutdown is helper-before-database, and actual app quit is bounded/idempotent. |
| Managed persistence | PASS | Packaged PostgreSQL 17.11 remains under Electron user data and bound only to `127.0.0.1`; migrations, pool/CAS/locking/rollback, retained data, and deadline recovery reuse the Phase 7.0 implementation and proof. |
| LAN address and port | PASS | Node network interfaces supply labeled non-internal IPv4 candidates; unusable loopback/link-local/unspecified values are rejected while VPN/virtual candidates remain selectable. Host binds the game server to `0.0.0.0`; port `0` returns the actual OS-selected port and recovery retains it. |
| Browser client delivery | PASS | Desktop profile requires an explicit absolute packaged client root and serves only that root, including assets and SPA fallback. Cloud-only proxy trust remains separate and dotfiles are denied. |
| Origin policy | PASS | Desktop accepts `app://own-the-block`, origin-less native clients, and exact browser origin/HTTP-Host matches. Unrelated browser origins are rejected; no wildcard CORS or request proxy was added. |
| Typed IPC and security | PASS | Sender-checked Host status/start/stop/network-refresh IPC exposes only safe primitive runtime state. No arbitrary path, environment, command, process, database URL/password, or reconnect token crosses preload. Existing context isolation, sandbox, disabled Node integration, and navigation guards remain. |
| Pre-socket Host/Join | PASS | Packaged startup with no endpoint opens `DesktopMultiplayerLauncher`. Host waits for runtime readiness and connects through loopback; Join validates an explicit IPv4/port before socket creation; leaving an error returns to the launcher and disposes the stale socket. |
| Session scoping | PASS | V3 local storage keys reconnect state by canonical authoritative endpoint plus room code. V1/V2 data migrates as unscoped, malformed/unavailable storage fails safely, and one authority cannot send another authority's token. |
| Sharing | PASS | Host-only lobby panel shows selected LAN URL, room code, Copy Link, QR, network selector, and refresh. The canonical invitation is `http://<IPv4>:<actual-port>/?room=<room-code>` and contains no session/database secret. |
| Mobile browser compatibility | PASS | Safe areas, dynamic viewport units, scrollable panels/modals, >=44 px primary controls, portrait guidance, landscape compression, visibility/pageshow/online recovery, WebGL context-loss/unavailable legacy fallback, and audio-unavailable no-op behavior use the existing game/presentation state. |
| Multiplayer and lifecycle | PASS | The existing protocol-V8 authoritative admission/room handlers remain the only implementation. In desktop profile only the loopback Host may activate an unused code; remote LAN peers receive typed `NOT_FOUND` for a wrong code. Automated tests cover 2–4 active players, fifth-player rejection, stable host, reconnect/newest-wins, spectator/leave rules, deterministic `FINISHED -> Play Again -> LOBBY`, and second-match start. |
| Packaging and CI | LOCAL PASS / REMOTE PENDING | Phase 7.0 proof is retained. A separate Phase 7.2 packaged Host proof and mobile Chromium/WebKit flow are wired into Windows/macOS Desktop Build; the self-contained Release Candidate keeps an optional endpoint and runs both packaged proofs. |

### Room-code collision strategy

Host codes use `crypto.getRandomValues()` and the user-friendly
`OTB-XXXXXX` pattern over a 32-character ambiguity-free alphabet: `32^6`
possible suffixes. The existing admission flow creates a room only when the code
is unused; a collision would otherwise resolve as that existing lobby. Because the
collision is negligible and cannot be detected before activation without adding a
new allocation protocol, V1 intentionally does not add a second create-room command.
The authoritative capacity/admission checks still prevent an extra seat when the
existing lobby is full.

## Local automated evidence

| Command / proof | Result | Evidence boundary |
| --- | --- | --- |
| `pnpm typecheck` | PASS | Workspace TypeScript, including new Host IPC/runtime and client contracts. |
| `pnpm lint` | PASS | Workspace ESLint. |
| `pnpm test` | PASS | Desktop 69, server 157, and client 525 tests passed; local server output retains 11 explicit `TEST_DATABASE_URL` skips. |
| `pnpm build` | PASS | Production renderer; existing large-chunk warning only. |
| `pnpm --filter @monopoly/desktop typecheck` | PASS | Desktop TypeScript. |
| `pnpm --filter @monopoly/desktop test` | PASS | Host lifecycle, IPC, networking, helper, security, packaging metadata, and existing desktop regressions. |
| `pnpm desktop:make` | PASS — Windows x64 | Squirrel artifacts built; this is build evidence, not a fresh installed/uninstalled acceptance test. |
| `pnpm --filter @monopoly/desktop proof:packaged` | PASS — Windows x64 | Retained Phase 7.0 PostgreSQL/helper/transaction/restart/deadline proof. |
| `pnpm desktop:proof:host` | PASS — Windows x64 LAN-equivalent | Actual packaged resources, managed database/helper, LAN-capable bind, real local IPv4 HTTP and remote-style Socket.IO `NOT_FOUND`, static renderer, origin policy, four clients, capacity, reconnect, helper/database restart, retention, redaction, and cleanup. The proof reports `physicalDeviceAcceptance: MANUAL_REQUIRED`. |
| `pnpm test:e2e:mobile` | PASS — Chromium + WebKit | Pixel 7/iPhone 15 browser profiles plus phone/tablet/desktop viewport boundaries; browser-engine evidence, not physical-device evidence. |
| `pnpm validate:release` | PASS with release blockers separated | Version `3.0.0`, LAN-first endpoint omitted, unsigned-validation mode; signing `BLOCKED`, notarization `NOT RUN`, installed-artifact validation false. |
| Packaged renderer secret scan | PASS | No `postgresql://`, `PGPASSWORD`, or `PGPASSFILE` match under the final packaged renderer root. |
| `pnpm db:status` | BLOCKED LOCALLY | `ECONNREFUSED 127.0.0.1:5433`; no developer PostgreSQL was running. Exact CI must run migrations and all PostgreSQL-gated tests. |
| `git diff --check` | PASS | Final code/documentation patch has no whitespace errors. |

### Local Windows distributables

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `apps/desktop/out/make/squirrel.windows/x64/OwnTheBlock-3.0.0-win32-x64-Setup.exe` | 235,710,464 | `AE2FD1A716F8AF4C420C6F92162851E454A5DD5ABCD68913E5054902EFCF59A6` |
| `apps/desktop/out/make/squirrel.windows/x64/own_the_block-3.0.0-full.nupkg` | 235,881,091 | `8D931D00D6D9504E20F50C2BDE0FF13A3ED2AD170ECEB9539B3DEB8389ABF0B9` |
| `apps/desktop/out/make/squirrel.windows/x64/RELEASES` | 84 | `ABCA0835FE9D53F71A8CFC951B207AFFF71A77A28F74180E1DD69A44159A151D` |

## Recovery matrix

| Scenario | Status | Evidence |
| --- | --- | --- |
| Browser socket drops | AUTOMATED PASS | Socket/App tests and browser offline/online flow resume without leave. |
| Browser reload | AUTOMATED PASS | Browser flow resumes the same player from endpoint-scoped storage. |
| Mobile-style page background | AUTOMATED PASS | visibility/pageshow/online handlers reconnect without leave. |
| Renderer reload | AUTOMATED PASS | Host controller ownership is renderer-independent; client reload resumes. |
| Helper dies | AUTOMATED PASS | Bounded helper restart reuses the database and session. |
| PostgreSQL stop/restart | AUTOMATED PASS | Managed database reuses the same data directory and retained room/session. |
| Host app/controller restarts | AUTOMATED PASS | Stop/start controller test plus packaged retained-data/session proof. |
| Server restart with deadlines | AUTOMATED PASS | Retained Phase 7.0 and Phase 7.2 packaged deadline recovery. |
| Wrong endpoint | AUTOMATED PASS | Strict endpoint parser plus timeout/unreachable launcher recovery copy and stale-socket disposal. |
| Wrong room | AUTOMATED PASS | Desktop loopback remains the room creator; a remote LAN admission for an unused code returns typed `NOT_FOUND` without a pending session or replacement room. |
| Room full | AUTOMATED PASS | Fifth active player receives `ROOM_FULL`. |
| Duplicate client session | AUTOMATED PASS | Newest authenticated connection wins; old socket receives `SESSION_REPLACED`. |
| Host network IP changes | AUTOMATED PASS | Network refresh selects a current candidate and regenerates the public URL. |
| WebGL unavailable/context lost | AUTOMATED PASS | Unit and browser flow switch to the existing legacy renderer. |
| Audio unavailable | AUTOMATED PASS | Web Audio absence is a tested no-op; settings/game remain usable. Audible output remains manual. |
| `FINISHED` | AUTOMATED PASS | Deterministic authoritative integration state and projection tests. |
| Play Again | AUTOMATED PASS | Host-only same-room `freshState()` reset, identity/session preservation, private reset, offer cancellation, non-host rejection, lobby broadcast, and second-match start. |

## Security review

| Boundary | Result |
| --- | --- |
| PostgreSQL network | PASS — managed PostgreSQL remains loopback-only; only the HTTP/Socket game server binds for LAN. |
| Renderer | PASS — `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP/custom-scheme boundary and external-navigation guards remain. |
| Host IPC | PASS — fixed typed channels, sender validation, shape validation, and safe status only; no arbitrary file/process/environment/URL-fetch capability. |
| Invitation/session | PASS — URL/QR contains only HTTP IPv4, actual port, and normalized room code; raw reconnect token remains in private ACK plus endpoint-scoped local storage. |
| Static files | PASS — explicit absolute client root, dotfiles denied, SPA fallback inside that root; no app-data, migrations, logs, helper source, or database files are served. |
| Protocol/public state | PASS — protocol and snapshot remain V8; existing public/private projection tests remain green; no Host metadata entered gameplay contracts. |
| Diagnostics | PASS — database URLs/password variables are redacted and bounded before renderer-safe diagnostic projection. |

## Exact-SHA remote evidence

| Workflow | Platform/job | SHA | Result |
| --- | --- | --- | --- |
| CI | PostgreSQL-backed Linux quality gate | Pending first code-bearing push | PENDING |
| Desktop Build | Windows x64 | Pending first code-bearing push | PENDING |
| Desktop Build | macOS runner architecture | Pending first code-bearing push | PENDING |

Remote PASS will be recorded only after each exact SHA reaches a final successful
conclusion and its distributable artifact upload plus both packaged proofs finish.

## Deferred manual matrix

| Physical/install scenario | Status |
| --- | --- |
| Fresh Windows installer test | MANUAL DEFERRED / NOT RUN |
| Fresh macOS installer test | MANUAL DEFERRED / NOT RUN |
| Windows Host -> Windows Join | MANUAL DEFERRED / NOT RUN |
| Windows Host -> macOS Join | MANUAL DEFERRED / NOT RUN |
| macOS Host -> Windows Join | MANUAL DEFERRED / NOT RUN |
| macOS Host -> macOS Join | MANUAL DEFERRED / NOT RUN |
| Windows/macOS Host -> real iPhone Safari | MANUAL DEFERRED / NOT RUN |
| Windows/macOS Host -> real iPad Safari | MANUAL DEFERRED / NOT RUN |
| Windows/macOS Host -> real Android Chrome | MANUAL DEFERRED / NOT RUN |
| Real OS firewall prompt behavior | MANUAL DEFERRED / NOT RUN |
| Real guest-Wi-Fi/client-isolation behavior | MANUAL DEFERRED / NOT RUN |
| Real machine sleep/wake | MANUAL DEFERRED / NOT RUN |
| Real Wi-Fi switch | MANUAL DEFERRED / NOT RUN |
| Real host IP change | MANUAL DEFERRED / NOT RUN |
| Real antivirus/UAC behavior | MANUAL DEFERRED / NOT RUN |
| Installer upgrade | MANUAL DEFERRED / NOT RUN |
| Uninstaller data-retention behavior | MANUAL DEFERRED / NOT RUN |

## Closeout decision

The only permitted final decisions are:

- `PHASE 7.2 ENGINEERING PASS` after every automated hard gate passes; or
- `PHASE 7.2 BLOCKED` with the exact failed automated gate.

Until that closeout is recorded, Own the Block must not be described as fully
engineering-complete or public-release validated.
