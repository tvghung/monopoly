# Phase 7.1 — Desktop Host Runtime + LAN Multiplayer

> **HISTORICAL / SUPERSEDED INPUT — NOT A PHASE 7.1 PASS.** Phase 7.1 never
> received exact-SHA Windows/macOS closure. Phase 7.2 absorbed this branch and
> removed its UDP advertiser/discovery path. All discovery results and scope
> statements below are retained only as evidence of the superseded branch; the
> current contract is `07C_PHASE_7_2_FINAL_ENGINEERING.md`.

## Historical branch status

**Final correction status: VERIFIED LOCALLY on Windows; Phase 7.1 remains open
for exact-SHA Windows/macOS CI and physical LAN acceptance.** The current
packaged LAN proof reports `coreStatus=PASS`, `lanHttp=PASS`,
`discovery=PASS` in this same-machine environment, and
`physicalLanAcceptance=MANUAL_REQUIRED`. The discovery result is not a
physical desktop-to-desktop acceptance result.

| Field | Value |
| --- | --- |
| Starting main SHA | `68c364d2b88aaa24edfafa16d9157672c3099e31` |
| Implementation branch | `overhaul/phase-7-1-lan-multiplayer` |
| Code-bearing implementation SHA | `1465ceb` |
| Correction pass starting SHA | `e6e3714bf93c22203730f14a8741d18e8955c8d6` |
| Correction code SHA | `98d68b12660f31b840f5a16c2aa53f12cfee6878` |
| Final correction pass starting SHA | `9e4afcf172fd424306577ba6ffd78a6eaeac535c` |
| Final correction code SHA | `72143cd5fd5eca1efeb3a7935af9490188b2197f` |
| Documentation closeout | Separate docs-only commit after the code-bearing SHA; final branch HEAD is reported with the delivery evidence |
| Scope | Windows/macOS desktop Host and Join over private LAN, automatic desktop discovery, manual fallback, reconnect hardening |
| Excluded | mobile/QR, Internet multiplayer, host migration, P2P authority, GameCore/protocol redesign, new gameplay migrations |

This document records the product-owner direction supplied for Phase 7.1. It
overrides the earlier Phase 7 discovery recommendation that deferred automatic
LAN discovery and placed QR/mobile work earlier. The resulting roadmap is:

- **Phase 7.1:** desktop Host runtime, desktop LAN multiplayer, automatic
  desktop discovery, manual address fallback, and reconnect hardening.
- **Phase 7.2:** mobile compatibility, QR join, cross-device/mobile recovery,
  and final hardening.

Historical evidence in `07A_PHASE_7_DISCOVERY_AND_OPTIONS.md` and
`07B_PHASE_7_IMPLEMENTATION.md` is not rewritten. Their current roadmap claims
are corrected only by this addendum.

## Approved boundaries and invariants

- The existing authoritative server, PostgreSQL persistence, Socket.IO
  protocol V8, room snapshot schema V8, GameCore, room lifecycle, and
  `PresentationController → AnimationQueue → PresentationStore` remain the
  authority and are unchanged.
- Electron main owns the desktop host lifecycle. It never creates rooms,
  players, snapshots, or gameplay state directly.
- PostgreSQL remains loopback-only. The game HTTP/Socket.IO server is the only
  LAN-facing service.
- A room code is onboarding metadata, not authentication.
- Disconnect remains presence loss, not leave. Host loss does not elect a new
  authority or migrate the server.

## Discovery technical gate

| Candidate | Decision | Evidence and limitation |
| --- | --- | --- |
| mDNS/DNS-SD | Not selected for 7.1 V1 | Would add a native/maintained service-discovery dependency and platform-specific packaging/firewall behavior. No existing dependency or daemon is present. |
| UDP broadcast | Selected for desktop V1 | Native Node `dgram`, no Internet/router/cloud dependency, multiple advertisements, explicit TTL, deterministic interface targets, and no administrator/root requirement in the implementation. Normal OS firewall policy can still block discovery. |
| Manual private IPv4 + port + room code | Required fallback | Works when broadcast is blocked, the interface is not discoverable, or the user is on a network that isolates peers. |

The discovery payload is onboarding metadata only: instance ID, app version,
protocol version, room code, game port, and private HTTP endpoints. It contains
no database information, token, token hash, private state, or gameplay state.
Repeated advertisements are keyed by instance ID and expire after five seconds.
Malformed, public, credential-bearing, non-HTTP, and non-private endpoints are
discarded. The host advertisement starts only after the host has joined and the
authoritative room exists.

## Implemented architecture

```text
Electron main
  ├─ HostRuntimeController
  │    ├─ ManagedPostgresController (127.0.0.1)
  │    └─ ServerHelperController (0.0.0.0:<game-port>)
  ├─ network interface resolver
  └─ LANDiscoveryController (UDP broadcast, TTL/dedupe/expiry)
        │ typed IPC through preload
        ▼
Desktop Multiplayer Launcher
  ├─ Create LAN Game → local endpoint → existing join/resume flow
  └─ Join LAN Game → discovery or validated manual endpoint → existing join/resume flow
        ▼
Existing App / admission / lobby / gameplay / reconnect state machine
```

`HostRuntimeController` states are `IDLE`, `STARTING_POSTGRES`,
`STARTING_SERVER`, `READY`, `HOSTING`, `STOPPING`, and `FAILED`. Starts and
stops are concurrent-call safe. Renderer reload does not own or stop the
runtime; application shutdown requests renderer confirmation first, then stops
advertisement, helper, PostgreSQL, and discovery exactly once. Returning to the
desktop launcher after an explicit leave does not stop the host runtime.

The V1 bind policy is explicit:

- game server: `0.0.0.0:<selected-game-port>`;
- host renderer: `127.0.0.1:<selected-game-port>`;
- advertised endpoints: private IPv4 candidates only;
- PostgreSQL: `127.0.0.1:<private-db-port>`.

The default game port is 8080. A busy or denied port is surfaced as an
actionable error; the runtime never silently changes the advertised port.
Virtual/VPN/Docker/VM addresses are retained as lower-preference candidates,
while normal Wi-Fi/Ethernet candidates sort first. Loopback, IPv6, link-local,
internal, invalid, and public addresses are excluded.

## Session and failure behavior

The client session record is now `monopoly.player-session.v3` and stores valid
reconnect tokens by canonical HTTP(S) origin plus canonical room code. V1 and
V2 records migrate as `roomCode: null` unscoped records; generic restore may
attempt them, but an explicit desktop target room accepts only an exact V3
authority-and-room match. Host A's token is therefore not sent to Host B, and a
different selected room cannot resume the old room. A successful resume rewrites
the authoritative room code. A terminal matching-resume failure clears the
session, shows safe recovery, and offers a deliberate return to the desktop LAN
launcher without silently fresh-joining as a spectator. Tokens do not enter
discovery, URLs, IPC status, diagnostics, or logs.

Successful desktop Leave/Forfeit clears client room/private state, stops local
advertising when hosting, disconnects the old gameplay socket, and returns to the
launcher. Spectator leave follows the same desktop path; web leave still returns
to the existing JoinForm.

Host runtime and discovery failures have bounded safe error states. Discovery
failure leaves the manual address path available. Host loss enters the existing
reconnect/host-unavailable boundary; it never promotes another player or starts
a hidden second server. Firewall changes are not automated.

### Final correction pass

- Advertiser startup uses a real `dgram` socket, binds `0.0.0.0:0`, enables
  broadcast only after bind, publishes active state only after setup, and rolls
  back sockets/timers on failure. Concurrent starts coalesce; pending starts can
  be cancelled safely by stop/dispose.
- Browsing also cancels pending bind work and closes a late socket without
  resurrecting timers or state.
- Packaged proof treats advertiser startup/bind/broadcast failure as a core
  failure. Only receiving an advertisement may be `PASS` or `NOT_RUN`; physical
  LAN acceptance remains manual.
- Legacy V2 cleanup preserves its `authority -> token` wire shape. V3 writes
  refresh existing authority order before enforcing the eight-entry limit.
- Release metadata supports endpoint-less LAN-first builds; an absolute HTTP(S)
  endpoint remains an optional configured override.

## Files changed

### Desktop runtime

- `apps/desktop/src/hostRuntime.ts`
- `apps/desktop/src/networkInterfaces.ts`
- `apps/desktop/src/lanDiscovery.ts`
- `apps/desktop/src/phase71LanProof.ts`
- `apps/desktop/src/desktopBootstrap.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/windowHandlers.ts`
- `apps/desktop/scripts/compile.mjs`
- `apps/desktop/scripts/runPackagedLanProof.mjs`
- `apps/desktop/package.json`

### Client

- `apps/client/src/components/DesktopMultiplayerLauncher.tsx`
- `apps/client/src/components/style/DesktopMultiplayerLauncher.css`
- `apps/client/src/runtime/lanEndpoint.ts`
- `apps/client/src/runtime/types.ts`
- `apps/client/src/app/bootstrap/AppBootstrap.tsx`
- `apps/client/src/app/bootstrap/bootstrap.ts`
- `apps/client/src/app/bootstrap/types.ts`
- `apps/client/src/playerSessionStorage.ts`
- `apps/client/src/App.tsx`

### Proof, workflow, and documentation

- `apps/server/src/phase71LanContract.ts`
- `apps/desktop/tests/hostRuntime.test.ts`
- `apps/desktop/tests/networkInterfaces.test.ts`
- `apps/desktop/tests/lanDiscovery.test.ts`
- `apps/client/src/runtime/lanEndpoint.test.ts`
- `apps/client/src/playerSessionStorage.test.ts`
- `apps/client/src/App.test.tsx`
- `.github/workflows/desktop-build.yml`
- `README.md`
- this document and the websocket runtime/join documentation addenda.

## Automated and packaged evidence

The exact local command results are recorded below. The packaged command
`pnpm --filter @monopoly/desktop proof:packaged:lan` is separate from the
existing Phase 7.0B proof. Its `coreStatus` can be `PASS` only after strict
resource, bind, readiness, protocol, admission, reconnect, privacy, and cleanup
checks, including mandatory advertiser startup. `lanHttp` and `discovery` are
environment evidence; discovery is `PASS` only after a listener receives an
actual advertisement. Physical desktop-to-desktop evidence is never inferred.

The proof checks external resources, loopback PostgreSQL, LAN-capable helper
bind, `/healthz`, `/readyz`, private endpoint reachability where available,
discovery serialization/round trip where available, two independent Socket.IO
clients, first-player host authority, same-room admission, guest disconnect,
same-token resume, same player ID, and cleanup. It does not claim physical
desktop-to-desktop interoperability.

### Local validation matrix

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm db:status` | BLOCKED | PostgreSQL at `127.0.0.1:5433` refused the connection (`ECONNREFUSED`). |
| `pnpm typecheck` | PASS | All workspace typechecks passed, including client, server, shared, and desktop. |
| `pnpm lint` | PASS | Workspace lint completed successfully. |
| `pnpm test` | PASS | Desktop 76 passed; client 517 passed; server 153 passed and 11 PostgreSQL-gated tests skipped. |
| `pnpm build` | PASS | Client build completed; only existing large-chunk warnings were emitted. |
| `pnpm desktop:package` | PASS | Windows x64 packaged Electron application created with endpoint-less LAN-first release configuration. |
| `pnpm desktop:make` | PASS | Windows x64 Squirrel maker completed successfully. |
| Existing Phase 7 packaged proof | PASS | Windows x64; PostgreSQL 17, migrations 001–009, locks, JSONB, sessions, restart, health/readiness, and loopback privacy checks passed. |
| Phase 7.1 packaged LAN core proof | `coreStatus=PASS`; `lanHttp=PASS`; `discovery=PASS`; `physicalLanAcceptance=MANUAL_REQUIRED` | Windows x64; mandatory advertiser bind/broadcast, helper `0.0.0.0` bind, strict health/readiness, protocol V8, two-client same-room/host authority, reconnect identity/room, discovery serialization/privacy, and clean shutdown passed; `interfaceCount=3`. |
| LAN-first release configuration contract | PASS | Endpoint-less and configured HTTP(S) release configurations validated; invalid `ws://` endpoint rejected. |
| `git diff --check` | PASS | No whitespace errors. |

The local proof does not substitute for a second physical desktop. macOS
packaging/runtime and the four physical Windows/macOS host/join pairs remain
manual or CI evidence, not local PASS claims.

## Manual acceptance boundary

Physical testing is **MANUAL ACCEPTANCE REQUIRED**, not automated PASS. The
required matrix is:

| Host | Join | Status |
| --- | --- | --- |
| Windows | Windows | MANUAL ACCEPTANCE REQUIRED |
| Windows | macOS | MANUAL ACCEPTANCE REQUIRED |
| macOS | Windows | MANUAL ACCEPTANCE REQUIRED |
| macOS | macOS | MANUAL ACCEPTANCE REQUIRED |

Each pair must cover packaged Create LAN Game, automatic discovery, join,
2/3/4-player lobby, real synchronized turns, temporary joiner disconnect and
resume, manual address fallback, and host loss without migration. Final
release readiness, signing, notarization, installation/uninstall, and OS
firewall behavior remain separate gates.

## Remaining Phase 7.2 work

- mobile browser compatibility and mobile-specific launcher UX;
- QR join;
- iPhone/iPad Safari and Android Chrome validation;
- mobile suspend/reconnect and sleep/Wi-Fi/IP-change recovery;
- touch, viewport, and landscape hardening;
- full cross-device match/torture matrix;
- final security, data retention, backup/repair, packaging, and release review.

## Frozen-change declaration

| Contract | Changed? |
| --- | --- |
| `SOCKET_PROTOCOL_VERSION` | NO |
| `ROOM_SNAPSHOT_SCHEMA_VERSION` | NO |
| New gameplay migrations | NO |
| GameCore rules/economy/trade semantics | NO |
| Local multiplayer | NO |
| Mobile/QR | NO |
| Host migration/election | NO |
