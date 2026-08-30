# Phase 7.1 — Desktop Host Runtime + LAN Multiplayer

## Final engineering status

**Implementation status: in progress until the final validation and commit below.**

| Field | Value |
| --- | --- |
| Starting main SHA | `68c364d2b88aaa24edfafa16d9157672c3099e31` |
| Implementation branch | `overhaul/phase-7-1-lan-multiplayer` |
| Final branch SHA | recorded at closeout |
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
runtime; application shutdown stops advertisement, helper, then PostgreSQL.

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

The client session record is now `monopoly.player-session.v2` and stores valid
reconnect tokens by canonical HTTP(S) origin. The old web v1 record migrates
only in a web origin; an `app://` packaged renderer never imports an unscoped
legacy token. Host A's token is therefore not sent to Host B, while returning
to Host A can resume its scoped token. Tokens do not enter discovery, URLs,
IPC status, diagnostics, or logs.

Host runtime and discovery failures have bounded safe error states. Discovery
failure leaves the manual address path available. Host loss enters the existing
reconnect/host-unavailable boundary; it never promotes another player or starts
a hidden second server. Firewall changes are not automated.

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

The exact command results are filled in at closeout. The new packaged command
is `pnpm --filter @monopoly/desktop proof:packaged:lan`, and it is separate
from the existing Phase 7.0B proof. It reports `PASS` only when a real private
interface endpoint and discovery round trip are reachable in that environment;
otherwise it reports `PARTIAL` while still failing on helper, readiness,
admission, or reconnect errors.

The proof checks external resources, loopback PostgreSQL, LAN-capable helper
bind, `/healthz`, `/readyz`, private endpoint reachability where available,
discovery serialization/round trip where available, two independent Socket.IO
clients, first-player host authority, same-room admission, guest disconnect,
same-token resume, same player ID, and cleanup. It does not claim physical
desktop-to-desktop interoperability.

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
