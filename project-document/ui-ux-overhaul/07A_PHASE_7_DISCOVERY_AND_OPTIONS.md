# Phase 7 — LAN Multiplayer & Desktop Host Mode Discovery

**PHASE 7 PRODUCT DIRECTION: LAN MULTIPLAYER & DESKTOP HOST MODE**

**PHASE 7 DISCOVERY: COMPLETE**

**PHASE 7 IMPLEMENTATION: NOT STARTED**

This is the authoritative Phase 7 discovery record. It defines the product
boundary, current-code evidence, candidate architecture, risks, future
subphases, and approval decisions. It does not authorize Phase 7 source code,
database migrations, protocol changes, infrastructure, deployment, endpoint
creation, credentials, or production operations.

## 1. Approved product direction

Phase 7 is a private LAN/Wi-Fi multiplayer mode:

- A Windows or macOS desktop can host a room or join a room.
- The desktop host runs the authoritative Own the Block server for that LAN
  session and uses local durable persistence.
- iPhone, iPad, and Android devices join through the browser/PWA web client;
  mobile devices never host authority in this phase.
- A paid Internet multiplayer service, hosted PostgreSQL, OAuth/account system,
  and Internet matchmaking are not required for Phase 7.
- The server remains authoritative for room membership, GameCore rules,
  persistence, timers, reconnect sessions, public/private projection, and
  recovery. `SERVER OWNS TRUTH` remains unchanged.
- The existing V8 protocol, `freshState()` reset path, PostgreSQL aggregate
  semantics, and single presentation architecture remain frozen.

The host mode is a desktop lifecycle and network-delivery feature around the
existing server. It is not a second game implementation and it is not a
permission for Electron main or a browser client to decide gameplay.

## 2. Verified baseline

- Repository: `tvghung/monopoly`.
- Starting `main` and `origin/main`:
  `36adeac0bfae4beb025497455016b1d74890acc6`.
- Phase 6 merge: `c78dece5a307e815801972b2044d2093f2b78677`.
- `v3.0.0-phase6-stable^{}` resolves to
  `c78dece5a307e815801972b2044d2093f2b78677`.
- Phase 6 branch remains at
  `4c84e76bbbc3f502c536e658575fe09be20f71f6`.
- The previous discovery-only commit was
  `36adeac0bfae4beb025497455016b1d74890acc6`; this document corrects its
  product direction in a new documentation commit.
- Phase 6 engineering is complete. Production release readiness remains a
  separate approval gate; the Phase 6 documentation records the unrun manual,
  live multiplayer, signing, and production checks.

## 3. Current implementation evidence

### What already exists

- The server uses Express and Socket.IO over one HTTP server.
- Startup loads configuration, requires PostgreSQL for production, runs the
  existing migration path, checks readiness, constructs runtime services, and
  starts the deadline scheduler before listening.
- Room commands use server-side runtime validation, per-room FIFO execution,
  PostgreSQL transactions and aggregate-version CAS, then public/private
  projections and acknowledgements.
- Room/session identity is durable. Reconnect tokens are bearer credentials:
  the client keeps the raw token and the server stores only a SHA-256 hash.
- The persisted room snapshot is V8. `freshState()` is the canonical new-match
  reset path, including same-room Play Again.
- The server has `/healthz` and `/readyz`, graceful SIGINT/SIGTERM shutdown,
  durable deadlines, and reconnect/recovery behavior while the authority and
  database remain available.
- The client already has a responsive web/PWA shell, HTML join/lobby controls,
  a landscape board path, WebGL2 detection, a legacy board fallback, and a
  user-gesture audio unlock path.
- Electron already has a hardened `app://own-the-block` renderer shell and a
  typed preload bridge for runtime configuration, window state, external links,
  and quit confirmation.

### What does not exist yet

- Electron main does not start, stop, monitor, or recover a local server.
- The packaged desktop artifact contains the desktop shell and client assets,
  not a server helper, local PostgreSQL binaries, or a managed data directory.
- Server configuration has a port but no explicit LAN host/bind setting;
  current documented development behavior is loopback.
- The server has no local-IP selection, interface labeling, LAN discovery,
  QR generation, room URL parsing, or host/join mode flow.
- There is no embedded database adapter or desktop PostgreSQL manager.
- The current JoinForm is one name/room-code flow; it has no Host/Join mode,
  LAN address, QR, or host lifecycle state.
- The current blank room-code behavior targets the shared normalized `LOBBY`
  room; Phase 7 still needs an explicit host-room code allocation decision.
- Existing tests use loopback sockets and test persistence, with PostgreSQL
  integration gated by `TEST_DATABASE_URL`. There is no cross-device LAN or
  mobile acceptance evidence.

These gaps are discovery findings, not implementation failures in the Phase 6
scope.

## 4. Frozen constraints

Every Phase 7 implementation subphase must preserve:

1. Server/GameCore authority and the existing room/session contracts.
2. PostgreSQL transaction, CAS, JSONB snapshot, migration, deadline, and
   recovery semantics unless a separately approved persistence decision changes
   the storage implementation without changing those observable contracts.
3. Protocol V8 and the existing public/private state boundary.
4. `PresentationController → AnimationQueue → PresentationStore` as the only
   client presentation path. No second event bus, animation queue, cache, or
   log-derived game event path.
5. WebGL and the legacy renderer as presentation concerns only.
6. Electron main as shell and process-lifecycle authority only; it must not
   execute gameplay rules or become a second server authority.
7. Private reconnect tokens never appearing in URLs, QR payloads, logs,
   screenshots, IPC arguments, or user-visible room data.
8. No OAuth/accounts, Internet dependency, horizontal scaling, auto-update, or
   production cloud multiplayer in this phase.

## 5. Desktop host lifecycle discovery

### Recommended lifecycle

The preferred model is one Electron main process supervising one packaged
server-helper child process, with a desktop-managed local PostgreSQL instance as
a separate child/service concern:

```text
IDLE
  └─ start LAN host
       ↓
STARTING_LOCAL_SERVER ── failure ──> FAILED
       ↓ /readyz + /healthz
READY / HOSTING ── stop or quit ──> STOPPING ──> IDLE
```

The host flow should:

1. Have Electron main receive a narrow typed request to start or stop the LAN
   server. Repeated start requests must not create duplicate children.
2. Start the existing server bootstrap and GameCore path as a packaged helper;
   do not copy rules into Electron main.
3. Supply explicit production runtime configuration: packaged client assets,
   local database connection, LAN bind policy, chosen port, and the packaged
   renderer origin allowlist.
4. Wait for readiness before mounting or connecting the host gameplay client.
   `/readyz` must be the database/schema gate; `/healthz` is liveness.
5. Return only non-secret runtime data to the renderer: state, actual port,
   advertised LAN address(es), and user-facing error codes/messages.
6. On stop or application quit, stop the server child cleanly with a bounded
   wait. If a child remains after the bounded wait, terminate that child only;
   do not send a gameplay leave command or fabricate player disconnects.
7. Keep the child alive across a renderer reload. A renderer reload is not a
   host shutdown.

The current packaged runtime endpoint mechanism is designed for an explicit
external HTTP(S) endpoint. It must not be silently repurposed as a dynamic LAN
host endpoint. A future host flow should establish the local endpoint first,
then initialize the normal client socket against that endpoint.

### Desktop host options

| Option | Fit with current code | Complexity and risk | Decision |
| --- | --- | --- | --- |
| Package the existing server as a supervised helper child | Reuses startup, Socket.IO, GameCore, persistence, migrations, and recovery | Requires a server build/helper artifact, child supervision, readiness IPC, logs, and packaging tests | **Recommended** |
| Ask users to run a separate server and PostgreSQL | Smallest Electron change | Poor normal-user experience, separate lifecycle, address setup, and failure ownership | Defer; useful only as a developer fallback |
| Move server/GameCore into Electron main | No separate helper | Breaks authority boundaries, couples gameplay to shell lifecycle, and risks a second implementation | Reject |
| Use a remote/cloud server for host mode | Existing endpoint configuration can connect to one | Violates the private LAN/no-paid-server direction and adds Internet dependency | Future Internet Multiplayer only |

The recommended option still needs a packaging proof. Current Forge config does
not package the server, Node helper runtime, PostgreSQL binaries, or a local data
directory, so the existing desktop installer cannot yet be called a LAN host.

## 6. Local persistence options

### Existing persistence contract

The current production repository is PostgreSQL-backed. It persists room
metadata and versioned JSONB snapshots, player sessions, offers, deadlines, and
schema migration checksums. The in-memory store is a test adapter, not a
desktop production fallback. The room command executor relies on transaction
boundaries and aggregate-version CAS.

### Options

| Option | Package/OS impact | Data safety and migration | GameCore impact | Assessment |
| --- | --- | --- | --- | --- |
| A. Require a user-installed PostgreSQL | Low product packaging work; high setup/support burden across Windows/macOS | Existing migrations and recovery remain intact; users must install, configure, and preserve the database | Minimal | Good developer fallback, not a normal-user V1 |
| B. Bundle and manage a private local PostgreSQL instance | High: platform binaries, data directory, init, port, credentials, upgrades, AV/UAC, clean stop, and repair | Best preservation of current transaction/CAS/migration semantics if data lives under app data and is never treated as an app resource | Minimal | **Recommended for a normal desktop host** |
| C. Replace or add an embedded database such as SQLite | New adapter, locking/CAS behavior, migration path, backup/recovery proof, and platform edge cases | High risk of semantic drift and migration/data-loss defects | Likely changes repository assumptions and tests | Reject for Phase 7 |
| D. Use hosted PostgreSQL/cloud storage | Low local packaging work; requires network/service operations | Existing semantics can remain, but LAN mode becomes cloud-dependent | Minimal | Future Internet Multiplayer only |

Recommendation: use a desktop-managed private PostgreSQL sidecar/data directory
for the intended V1 user experience. Phase 7.0 must prove this choice on the
supported Windows and macOS packaging targets before host UX is built. The
database must be initialized and migrated through the existing startup path,
with generated local credentials kept out of UI, QR data, command-line logs,
and ordinary diagnostics. Data belongs under the platform application-data
directory, not inside a read-only packaged resource or temporary directory.

The lifecycle order should be database start/ready → server migration/readiness
→ host client connect, and the reverse on shutdown. Upgrade, backup/repair,
uninstall-retention, and interrupted-migration behavior require explicit
acceptance cases; deleting a user's local room data must never be an incidental
installer action.

## 7. LAN binding and runtime configuration

Current `apps/server/src/index.ts` calls `server.listen(config.port)` and
`apps/server/src/config.ts` has no explicit bind-address setting. Development
documentation and integration tests use loopback. A future host mode must make
LAN exposure an explicit runtime mode.

Recommended V1 behavior:

- Keep normal web/development mode on `127.0.0.1` unless the operator explicitly
  selects LAN host mode.
- In LAN host mode, bind explicitly to IPv4 `0.0.0.0` or to a selected private
  interface address. Never advertise `0.0.0.0` as a join address.
- Use one actual HTTP port for the static client, health endpoints, and
  Socket.IO. Default to the existing port policy, but report the actual bound
  port to the host UI.
- If the requested port is occupied or the interface cannot bind, fail with an
  actionable error and let the user retry or choose a port. Do not silently
  change the port and leave an old QR/link looking valid.
- Serve the built client from the host server so mobile browsers use one
  same-origin HTTP URL. Desktop `app://own-the-block` still needs its explicit
  CORS allowance; CORS is browser authorization, not client authentication.
- Keep `/healthz` and `/readyz` available only as status endpoints. Readiness
  must not be treated as proof that a remote client is authorized.
- Apply an OS firewall rule scoped to the private/home network profile, the
  selected program, and the actual port. Do not use UPnP, public NAT exposure,
  or an Internet-facing bind.

The server currently accepts player authority through the existing session
protocol, not through CORS. A LAN warning is therefore required: room codes are
not credentials and any reachable client may be able to request spectator or
admission behavior allowed by the existing contract.

## 8. Local IP detection and LAN discovery

No local-IP or service-discovery helper currently exists. The preferred host
implementation is a small Electron-main adapter over the standard Node network
interface API:

- enumerate non-internal IPv4 addresses;
- exclude loopback from advertised join choices;
- rank private Wi-Fi/Ethernet addresses ahead of VPN and virtual adapters where
  the platform exposes enough metadata, without assuming one adapter naming
  convention;
- retain all valid candidates and show the interface label when there is more
  than one;
- provide a manual copy path for every candidate and an explicit “local only”
  state when no usable private address exists;
- refresh the advertised address when the network changes or the server
  rebinds; stale QR/link data must be visibly invalidated.

IPv6 and link-local address support are deferred for V1 to avoid address-format
and browser-compatibility ambiguity. The selection algorithm must be
deterministic for equal candidates and must never turn a VPN/virtual adapter
into a hidden production assumption.

Discovery choices:

| Choice | V1 value | Risk/decision |
| --- | --- | --- |
| Manual private IP + room code | Universal fallback and easiest to explain | **Required** |
| QR containing the host URL and room code | Fastest phone onboarding; no daemon needed | **Recommended convenience** |
| mDNS/Bonjour | Friendly hostname discovery | Defer: platform permissions, captive/client-isolated Wi-Fi, and browser behavior |
| UDP broadcast discovery | Can find hosts without typing an address | Defer: firewall, network isolation, spoofing, and mobile restrictions |

QR is a convenience layer, not an authority or discovery protocol. Manual IP
entry must remain available.

## 9. QR join URL and room prefill

Recommended V1 payload shape:

```text
http://<advertised-private-ip>:<actual-port>/?room=<normalized-room-code>
```

The exact route/query syntax is a small product decision, but the existing SPA
has no room-query prefill, so this is a future minimum client change rather than
an existing capability. The browser should load the host-served client,
validate the room code, and prefill the current join form. It must not bypass
the normal admission/resume protocol.

The QR payload may contain only the LAN HTTP origin and a normalized room code.
It must not contain a raw reconnect token, token hash, database URL, generated
credential, player name, private state, or session snapshot. The host UI must
show the same URL and room code as copyable text for accessibility and QR
failure fallback. QR generation is not currently a repository dependency; no
dependency is added during discovery.

If the host IP or port changes, the host must regenerate the displayed URL and
QR, mark the old value stale, and explain that clients may need to reconnect.

## 10. Mobile browser/PWA join compatibility

The minimum Phase 7 mobile scope is browser join and play, not a native mobile
application and not mobile hosting:

- Target iPhone/iPad Safari and Android Chrome over the same private LAN.
- Join through the QR/manual host URL, with room-code prefill when available.
- Support name entry, admission, lobby, reconnect, and the existing game flow;
  a mobile player is still governed by the server and stable session token.
- Keep the current responsive join/lobby controls and landscape board boundary;
  the current portrait board notice is an explicit compatibility fallback, not
  a reason to redesign the whole visual system.
- Verify touch-sized HTML buttons/inputs, scroll/keyboard behavior, modal and
  activity-log layout, and that no hover-only interaction is required.
- Keep WebGL2 as the primary board path and the existing legacy board fallback
  as the compatibility path. A browser without WebGL2 must receive an explicit
  fallback state, not a blank board.
- Treat audio as optional and non-blocking. Existing audio unlock requires a
  trusted user gesture; blocked autoplay or missing audio must not prevent play.
- The manifest already provides a PWA shell, but there is no service worker or
  offline game mode. Installation/offline play is not a Phase 7 promise.

The host must be a Windows/macOS desktop. A mobile browser must never receive a
host control that creates server authority or starts a second room server.

## 11. Host/join UX state model

No UI implementation is authorized by this document. The following states are
the minimum contract for a later design and implementation review.

### Host

```text
Host unavailable
  → Starting local database/server
  → Ready to host
  → Room lobby
  → Game
  → Stopping / Host unavailable
```

The host screen must expose room code, actual LAN URL/IP candidates, QR/copy
fallback, server readiness, current connection/error state, and a clear
private-LAN warning. It must say when the server is starting, blocked, stopped,
or no longer reachable. “Host” is a lifecycle role, not a second player
authority; the host player still uses the normal session protocol.

### Join

```text
Enter host URL and/or room code
  → Connecting
  → Admission pending / resume session
  → Lobby or Game
  → Reconnecting / explicit failure
```

Join should reuse the current name/room admission and stable-token resume path.
It must distinguish at least: invalid room code, room full, game already in
progress, host unreachable, wrong network, port blocked, stale URL, protocol
mismatch, session replaced, and host stopped. A spinner without a recovery
action is not an acceptable terminal state.

## 12. Failure handling

| Failure | Required V1 behavior |
| --- | --- |
| Local PostgreSQL missing, corrupt, locked, or migration failed | Do not show the host room as ready; show a repair/support action and preserve the data directory |
| Server helper failed to start or exited | Show explicit failed state with a safe diagnostic; never silently fall back to an in-memory production store |
| Port occupied or bind denied | Explain the port/address, offer retry/change-port, and invalidate any old URL/QR |
| Windows/macOS firewall blocks the port | Explain private-network firewall permission and provide manual retry/check guidance; do not claim the client failed authentication |
| Wi-Fi/Ethernet is different, client isolation is enabled, or VPN routes traffic elsewhere | Report host unreachable and show the current advertised interface/address; retain manual fallback |
| Host IP changes | Re-enumerate addresses, refresh URL/QR, and tell connected/returning clients to use the new address |
| Wrong room code, full lobby, or active game | Return the existing server admission result; do not create a second hidden room or bypass lifecycle rules |
| Host quits or explicitly stops | Peers receive a clear host-unavailable state. There is no silent host transfer or fake leave/forfeit command |
| Player loses Wi-Fi or reloads renderer | Use the existing session reconnect/resume behavior while the authority remains available |
| Host renderer crashes while helper remains alive | Keep the helper supervised by Electron main; show recovery on renderer restart rather than stopping the game because the view reloaded |
| Server child crashes | Mark host unavailable. Restart may be a guarded user action after readiness and persistence checks; never spawn duplicate helpers |
| Local storage/token unavailable | Explain that player resume cannot be guaranteed; never put the token in the QR or ask the user to copy it |

## 13. Host restart and recovery policy

### MUST for the first usable LAN host

- A peer can reconnect after a temporary network loss while the host server and
  local database remain alive, using the existing stable session/reconnect
  contract.
- A renderer reload does not stop the helper or discard the local database.
- Server shutdown remains graceful and does not manufacture player leave,
  forfeit, or turn-resolution commands.
- Host quit, child failure, and unreachable network are visible, bounded
  failure states. No seamless-host-transfer promise is made.
- A restarted host cannot claim readiness until database and server health are
  proven.

### SHOULD after the core host flow is proven

- A user can explicitly restart the helper against the same managed data
  directory and recover a retained room/session under the existing scheduler
  and retention rules.
- Sleep/Wi-Fi recovery refreshes interfaces and reconnects without making stale
  addresses look valid.
- Host status survives renderer re-creation through main-process lifecycle state,
  with safe diagnostics that do not expose credentials.

### Deferred

- Seamless host migration or transfer of authority to a peer.
- Automatic host launch after machine restart.
- Guaranteed recovery after deleting/corrupting the local data directory.
- Multi-host coordination, replicas, horizontal scaling, and cloud failover.

The existing server can recover durable room deadlines after a database/process
restart, but that does not prove a packaged desktop restart experience. The
packaged data directory, credentials, IP changes, and client reconnection path
must be tested before making a restart claim.

## 14. Security and trust boundary

- LAN mode is a trusted-network product assumption, not Internet security.
  Room codes identify rooms; they are not passwords.
- QR and copied URLs are onboarding data only. Reconnect tokens remain private
  client/server session material and are never embedded in them.
- The server continues to derive player authority from authenticated session
  data and to validate every command. Electron main only supervises processes
  and reports runtime status.
- Generated local PostgreSQL credentials and connection strings stay in the
  private application-data boundary. They do not appear in QR, renderer state,
  ordinary logs, screenshots, or IPC command arguments.
- LAN exposure must be limited to private interface/firewall policy. No public
  bind, NAT traversal, UPnP, Internet endpoint, or cloud credential is part of
  this phase.
- Packaged `app://own-the-block` navigation and preload restrictions remain in
  force. A dynamic LAN endpoint must not weaken Electron origin or external
  navigation checks.
- CORS allowlisting remains a browser-origin control only. It must not be
  presented as authentication or as proof that a LAN client is safe.

## 15. Recommended target architecture

```text
Windows/macOS Electron renderer
  - host/join presentation and existing game UI
  - normal Socket.IO client after endpoint is ready
          │ typed host-lifecycle IPC only
          ▼
Electron main process
  - start/stop/status/health supervision
  - local IP enumeration and safe host diagnostics
          │ child process
          ▼
Packaged existing server bootstrap
  - Express + Socket.IO + GameCore + V8 persistence contract
          │ local connection
          ▼
Desktop-managed private PostgreSQL + app-data directory

iPhone/iPad/Android browser
  ── HTTP + Socket.IO over the private LAN ──► the same server authority
```

The host player's game socket and every mobile/desktop joiner use the same
server protocol. The existing server remains the only authority and the
existing client presentation path remains the only animation/state path. No
new client event bus, gameplay cache, or Electron-side GameCore is needed.

## 16. Proposed implementation subphases

These are reviewable future scopes, not authorization to implement them now.

### 7.0 — LAN architecture and persistence proof

- **Objective:** prove the packaged server-helper and recommended local
  PostgreSQL strategy on the supported Windows/macOS targets.
- **In scope:** helper artifact shape, managed data-directory lifecycle,
  generated local credentials, migration/startup/readiness, stop/repair behavior,
  explicit bind/port configuration, and a minimal persistence/restart proof.
- **Excluded:** host/join redesign, QR, mobile UX, protocol/game-rule changes,
  cloud deployment, and production release claims.
- **Prerequisites:** PO approval of managed local PostgreSQL and supported OS/
  architecture matrix.
- **Acceptance:** a clean packaged host can initialize/migrate local data,
  reach `/readyz`, stop without data loss, restart against the same data, and
  show safe failure states; no client or GameCore authority moves into main.
- **Risks:** platform binaries, AV/UAC, licensing, data-directory permissions,
  interrupted migration, and installer/uninstaller behavior.

### 7.1 — Desktop host runtime

- **Objective:** add one supervised local server lifecycle to Electron.
- **In scope:** typed start/stop/status IPC, no-duplicate guard, readiness
  handshake, child exit handling, quit ordering, explicit host mode, and
  endpoint handoff before the gameplay socket connects.
- **Excluded:** gameplay rules, host migration, remote/cloud endpoint support,
  and a second authoritative state store.
- **Prerequisites:** 7.0 helper/persistence proof.
- **Acceptance:** Windows/macOS host can start one ready server, host a normal
  room, reload the renderer without stopping it, and stop cleanly with bounded
  failure handling.
- **Risks:** deadlocks during quit, orphaned children, renderer/main timing,
  and accidental reuse of static release endpoint configuration.

### 7.2 — LAN join, IP, QR, and network UX

- **Objective:** make a private-LAN room joinable without service discovery.
- **In scope:** explicit IPv4 bind, deterministic interface candidates, actual
  port reporting, manual IP + room code, QR/copy URL, query prefill, firewall
  and wrong-network messages, and stale-link handling.
- **Excluded:** mDNS, UDP discovery, IPv6 V1 support, public exposure, and
  Internet matchmaking.
- **Prerequisites:** 7.1 and a final URL/room-prefill decision.
- **Acceptance:** a second desktop and a browser device can join through manual
  entry and QR, with explicit errors for blocked/occupied/unreachable cases.
- **Risks:** multiple adapters, client isolation, changing addresses, QR
  accessibility, and CORS being mistaken for authentication.

### 7.3 — Mobile browser join compatibility

- **Objective:** validate mobile join/play without creating a native client.
- **In scope:** iOS/iPadOS Safari and Android Chrome target flows, landscape
  join/lobby/game, touch/keyboard/scroll checks, WebGL2 fallback, reconnect,
  and non-blocking audio behavior.
- **Excluded:** mobile host, offline gameplay, native apps, whole visual
  redesign, and PWA service-worker delivery.
- **Prerequisites:** 7.2 reachable host URL and a device/browser support list.
- **Acceptance:** supported mobile browsers can join a real LAN room, play a
  complete server-authoritative match, reconnect within the existing contract,
  and report unsupported WebGL/network/audio states clearly.
- **Risks:** browser privacy/network restrictions, mobile viewport changes,
  WebGL2 differences, autoplay policy, and touch-only regressions.

### 7.4 — Recovery, cross-device acceptance, and hardening

- **Objective:** prove the failure/recovery matrix before calling LAN host mode
  usable.
- **In scope:** 2/3/4-player permutations, spectator behavior where the current
  contract permits it, disconnect/reconnect, Play Again, FINISHED, renderer and
  helper restart, host quit, IP change, firewall/port errors, logs, and final
  security/data-safety review.
- **Excluded:** host transfer, horizontal scale, cloud failover, signing,
  auto-update, and production Internet release.
- **Prerequisites:** 7.1–7.3 and explicit PO decisions below.
- **Acceptance:** the matrix in Section 17 is executed on real supported
  devices/OSes, with PASS/FAIL evidence; no discovery document is used as a
  substitute for manual acceptance.
- **Risks:** environment-specific Wi-Fi/firewall behavior and overclaiming
  recovery after a host process or machine is gone.

## 17. Cross-device acceptance matrix

This discovery pass does not run or pass these checks. Every row is a future
test gate and must retain exact OS/browser/device, host address, port, commit,
and evidence.

| Area | Required scenarios | Discovery status |
| --- | --- | --- |
| Desktop host/join | Windows host → Windows join; Windows → macOS; macOS → Windows; macOS host → macOS join | NOT RUN |
| Mobile join | Windows host → iPhone Safari; Windows → iPad Safari; Windows → Android Chrome; macOS host → each of those targets | NOT RUN |
| Lobby/game size | 2, 3, and 4 active players; valid spectator/late-join behavior under the current contract | NOT RUN |
| Session continuity | Player Wi-Fi loss, browser reload, renderer reload, reconnect token resume, session replacement | NOT RUN |
| Match lifecycle | Start, normal turn flow, FINISHED, host-only Play Again, fresh reset, retained history/privacy | NOT RUN |
| Host lifecycle | Host stop, desktop quit, helper failure/restart, renderer crash/reload, machine sleep/restart policy | NOT RUN |
| Network errors | Wrong room, full/active room, occupied port, firewall block, different Wi-Fi/client isolation, VPN, IP change | NOT RUN |
| Presentation compatibility | Landscape/portrait boundary, touch controls, WebGL2 fallback, audio gesture/autoplay failure, activity/log overflow | NOT RUN |
| Data safety | Migration failure, restart against same data directory, no token/credential leakage in QR/log/IPC, uninstall policy | NOT RUN |

Existing automated tests provide useful server/contract evidence but are not
cross-device acceptance. Loopback, `InMemoryPersistenceStore`, and
`TEST_DATABASE_URL`-gated PostgreSQL tests must remain labeled as such.

## 18. Product-owner decisions required before implementation

1. Approve managed private PostgreSQL as the intended desktop host persistence
   model, or explicitly accept the setup burden of user-installed PostgreSQL.
2. Approve IPv4-only V1, the default port, and “fail with an actionable error”
   when that port is occupied.
3. Approve host-room code allocation, the room URL/prefill syntax, and whether
   the host shows one selected IP or all valid private interface candidates.
4. Approve the host-quit policy: peers see host unavailable; no host transfer.
5. Approve whether explicit host restart may reattach to a retained room, with
   no promise of seamless client recovery after machine restart.
6. Approve the supported iOS/iPadOS Safari and Android Chrome device/browser
   matrix and the landscape-first mobile game boundary.
7. Approve whether a late mobile/browser join follows the current spectator
   behavior when a game is already in progress.
8. Approve local data retention, backup/repair, and uninstall behavior before
   packaging a database manager.

## 19. Deferred and separate work

The following must not be mixed into Phase 7 LAN implementation:

- Internet multiplayer, production endpoints, hosted PostgreSQL, cloud
  operations, accounts, OAuth, matchmaking, and horizontal scaling;
- signed distribution and public release readiness, which remain separate
  release gates after the Phase 6 engineering checkpoint;
- auto-update, native mobile applications, offline gameplay, mDNS/UDP/IPv6
  discovery, host migration, and multi-host failover;
- GameCore rules, protocol V8, snapshot schema, room lifecycle semantics,
  server authority, and the existing presentation/audio architecture.

## 20. Evidence map

| Evidence path | Finding used in this discovery |
| --- | --- |
| `CLAUDE.md` | Authority, V8, `freshState()`, reconnect/session privacy, PG/CAS, lifecycle, presentation, and Electron security invariants |
| `README.md` | Current dev loopback ports, PostgreSQL requirement, packaged endpoint policy, health/readiness, and one-process cloud deployment notes |
| `project-document/monopoly-websockets/` | Server bootstrap, API, room lifecycle, client join/resume, persistence, recovery, and authority contracts |
| `apps/server/src/config.ts` | Database/port configuration; no LAN host setting |
| `apps/server/src/index.ts` | Migration/readiness/startup, `server.listen(config.port)`, scheduler, and graceful shutdown |
| `apps/server/src/createServer.ts` | Same HTTP/Socket.IO server, static client, `/healthz`, `/readyz`, and CORS behavior |
| `apps/server/src/persistence/` and `apps/server/src/migrations/` | PostgreSQL repositories, transaction/CAS semantics, migration checksums, V8 snapshot path, and test-only in-memory adapter |
| `apps/server/src/socket/` and `apps/server/src/services/` | Admission/resume, host/lobby rules, connection registry, deadlines, reconnect, and recovery behavior |
| `apps/desktop/src/main.ts` and `desktopBootstrap.ts` | Secure Electron shell and current absence of server lifecycle ownership |
| `apps/desktop/src/runtimeConfig.ts`, `preload.ts`, `ipc/`, `forge.config.cjs` | Explicit packaged endpoint, typed IPC boundary, and current package contents; no server/PG helper artifact |
| `apps/desktop/scripts/` | Development wrapper owns separate web processes; packaged shell does not |
| `apps/client/src/App.tsx` and `components/` | Current join/resume state machine, single JoinForm, lobby, quit behavior, and missing host/QR flow |
| `apps/client/src/Board.tsx`, `GameScene`, CSS, `public/manifest.json` | WebGL2/fallback, landscape/touch-responsive boundaries, audio unlock, and existing PWA shell |
| `apps/server/src/**/*.test.ts` | Loopback/in-memory/integration evidence; no cross-device LAN acceptance |
| `compose.yaml`, `.env.example`, `Dockerfile`, `render.yaml` | Developer/production PostgreSQL and cloud packaging assumptions; none is a desktop LAN-host package |
| `project-document/ui-ux-overhaul/06A_PHASE_6_0_RELEASE_READINESS_AUDIT.md`, `06B_PHASE_6_2_RELEASE_VERIFICATION.md` | Phase 6 engineering-complete checkpoint and separate production/signing/manual validation boundary |

**Final gate:** Phase 7 discovery is complete in this document. Phase 7
implementation remains **NOT STARTED** until the decisions in Section 18 are
approved and a specific subphase is separately scoped.
