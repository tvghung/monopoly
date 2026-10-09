# Architecture decisions (current)

Status: CURRENT. Every decision below is verified against the code paths it names. "Rationale" is written only where a
document records it; otherwise it says *not recorded*. Scope labels follow the [Documentation Hub](../README.md#lifecycle-and-scope-labels):
**RELEASED** = shipped in a published version, **CURRENT DEVELOPMENT** = on this branch after the latest release, unreleased.

Latest release: **v1.7.0** (GitHub Release published 2026-10-09, tag `v1.7.0`, workflow `release-candidate.yml` run succeeded).
This branch (`feat/own-the-block-multiplayer-bots-vnext`) carries unreleased changes after it; see [ADR-13](#adr-13-released-contract-vs-current-development).

Unless the "Applies to" column says otherwise, a decision holds both in released v1.7.0 and on the vNext development branch.

| ID | Decision | Since | Applies to |
| --- | --- | --- | --- |
| [ADR-01](#adr-01-host-process-is-the-only-gameplay-authority) | Host process is the only gameplay authority | V1 | v1.7.0 and vNext |
| [ADR-02](#adr-02-desktop-hosted-server-helper) | Desktop-hosted server helper | V1 (helper model), v1.5.0 (RAM helper) | v1.7.0 and vNext |
| [ADR-03](#adr-03-ram-only-volatile-runtime-no-recovery-across-process-exit) | RAM-only volatile runtime, no recovery across process exit | v1.5.0 | v1.7.0 and vNext |
| [ADR-04](#adr-04-stable-identity-hashed-reconnect-token-newest-connection-wins) | Stable identity, hashed reconnect token, newest connection wins | V1 | v1.7.0 and vNext |
| [ADR-05](#adr-05-serialized-room-commands-commit-before-ack-and-broadcast) | Serialized room commands, commit before ACK and broadcast | V1 | v1.7.0 and vNext |
| [ADR-06](#adr-06-shared-runtime-validated-contracts-and-explicit-versions) | Shared runtime-validated contracts and explicit versions | V1 | v1.7.0 (protocol 12 / snapshot 11) and vNext (protocol 13 / snapshot 11; see ADR-13) |
| [ADR-07](#adr-07-public-and-private-projections) | Public and private projections | V1 | v1.7.0 and vNext |
| [ADR-08](#adr-08-lan-and-online-networking) | LAN and Online networking | v1.5.0 (Online), v1.7.0 (relink, registry) | v1.7.0 and vNext |
| [ADR-09](#adr-09-bots-are-host-played-seats-using-the-same-commands) | Bots are host-played seats using the same commands | v1.7.0 | v1.7.0 (one Balanced policy); difficulty levels vNext only |
| [ADR-10](#adr-10-presentation-never-replaces-authoritative-state) | Presentation never replaces authoritative state | V1 | v1.7.0 and vNext |
| [ADR-11](#adr-11-electron-security-boundary) | Electron security boundary | V1 | v1.7.0 and vNext |
| [ADR-12](#adr-12-packaging-update-policy-and-protocol-review) | Packaging, update policy and protocol review | v1.2.0 (updates) | v1.7.0 (update policy 1.7.0 / protocol 12); vNext reviewed for protocol 13 |
| [ADR-13](#adr-13-released-contract-vs-current-development) | Released contract vs current development | — | Differences between v1.7.0 and vNext (protocol 13); R-1 RESOLVED in code |

## ADR-01 Host process is the only gameplay authority

- **Decision.** The server process run by the hosting desktop app validates and applies every gameplay command. Clients send
  intents; the actor is always `socket.data.playerId`, never a client-supplied player, owner, seller or buyer.
- **Code.** `apps/server/src/socket/authority.ts` (`requirePlayer`), `apps/server/src/commands/gameplay.ts` (command objects used
  by socket handlers and bots), `apps/server/src/game/`.
- **Consequences.** Client UI gates (`canMutate`, host-only buttons) are convenience only; the server re-checks everything.
  Spectators are read-only.
- **Docs.** [monopoly.shared.instructions.md](./monopoly.shared.instructions.md), [monopoly.api.instructions.md](./monopoly.api.instructions.md).

## ADR-02 Desktop-hosted server helper

- **Decision.** Electron main starts one server helper (an Electron utility process) per hosted room and supervises it; the
  helper is the HTTP + Socket.IO server. Electron main holds no game logic.
- **Code.** `apps/desktop/src/hostRuntime.ts`, `apps/desktop/src/serverHelper.ts`, `apps/server/src/desktopServerHelper.ts`,
  `apps/server/src/authoritativeServer.ts`. `pnpm dev:web` runs the same server for development only.
- **Rationale.** Recorded in [RAM-HOSTING-DISCOVERY.md](./RAM-HOSTING-DISCOVERY.md): the desktop shell already owned helper start,
  stop, health polling and port selection.
- **Consequences.** The host must keep the app running; closing it ends the match for everyone (`app.closeHostMessage` in
  `apps/client/src/i18n/catalog.ts`).
- **Docs.** [Desktop/README.md](./Desktop/README.md), [Api/http-runtime.instruction.md](./Api/http-runtime.instruction.md).

## ADR-03 RAM-only volatile runtime, no recovery across process exit

- **Decision.** Rooms, sessions (token hashes), offers and absolute deadlines live only in the helper's RAM
  (`InMemoryPersistenceStore`). A helper exit or crash destroys every room and token permanently. A replacement helper starts
  empty and rejects old room codes and tokens; it is never restarted to fake recovery.
- **Code.** `apps/server/src/persistence/inMemory.ts`, `apps/server/src/authoritativeServer.ts` (always a fresh in-memory store),
  `apps/desktop/src/serverHelper.ts` (removes `DATABASE_URL` from the helper environment as a guard),
  `apps/desktop/scripts/checkPackagedBudget.mjs` (fails if a PostgreSQL runtime is packaged).
- **Rationale.** [RAM-HOSTING-DISCOVERY.md](./RAM-HOSTING-DISCOVERY.md) and the v1.5.0 release notes: simpler hosting without
  managed PostgreSQL; a helper loss must terminate its match.
- **Consequences.** "Reconnect" means a client returning to the *same living* process. Deadlines are recovered by the
  scheduler while the process lives, never across an exit. `DATABASE_UNAVAILABLE` is a deprecated compatibility code that the
  server never emits. The SQL files in `apps/server/migrations/` are historical artifacts that nothing loads.
- **Historical.** PostgreSQL persistence and cross-restart recovery (V1–v1.4.x) are recorded in
  [ui-ux-overhaul](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md) as history only.
- **Docs.** [Persistence/README.md](./Persistence/README.md).

## ADR-04 Stable identity, hashed reconnect token, newest connection wins

- **Decision.** `PlayerId` is a stable UUID; `socket.id` is a connection id. The raw reconnect token is returned only in the ACK
  and stored by the client; the server keeps its SHA-256 hash. Each player has at most one active connection: the newest wins and
  a connection generation blocks stale disconnects. `disconnect` changes presence only; only `leave room` revokes the session.
- **Code.** `apps/server/src/services/playerSessionService.ts`, `apps/server/src/services/connectionRegistry.ts`,
  `apps/server/src/socket/session.ts`, `apps/client/src/playerSessionStorage.ts`.
- **Docs.** [Api/socket-session.instruction.md](./Api/socket-session.instruction.md), [GameCore/room-lifecycle.instruction.md](./GameCore/room-lifecycle.instruction.md).

## ADR-05 Serialized room commands, commit before ACK and broadcast

- **Decision.** Commands for one room run one at a time on a cloned draft (per-room FIFO), commit with an expected-version
  check through one process-wide in-memory transaction queue, and only then ACK and broadcast. A failure discards the draft:
  no revision, no broadcast.
- **Code.** `apps/server/src/services/roomCommandExecutor.ts`, `apps/server/src/socket/roomCommands.ts`,
  `apps/server/src/socket/broadcast.ts`, `apps/server/src/socket/errors.ts` (error → ACK mapping).
- **Consequences.** Broadcast runs after the command resolves; clients order snapshots by `version`.
- **Docs.** [Persistence/README.md](./Persistence/README.md), [monopoly.api.instructions.md](./monopoly.api.instructions.md).

## ADR-06 Shared runtime-validated contracts and explicit versions

- **Decision.** Every network payload is parsed by a shared Zod schema; every state-changing command has a typed ACK. Socket
  handshakes carry `SOCKET_PROTOCOL_VERSION`; a mismatch is refused with `UPGRADE_REQUIRED`. Room snapshots carry
  `ROOM_SNAPSHOT_SCHEMA_VERSION` and must match exactly.
- **Code.** `packages/shared/src/types.ts` (`SOCKET_PROTOCOL_VERSION`), `packages/shared/src/socketSchemas.ts`,
  `packages/shared/src/events.ts`, `apps/server/src/socket/validation.ts`, `apps/server/src/socket/index.ts`,
  `apps/server/src/rooms.ts` (`ROOM_SNAPSHOT_SCHEMA_VERSION`, `assertSupportedRoomSnapshot`).
- **Consequences.** The constants in code are the only source for the current numbers; the history lives in
  [Shared/socket-and-state-contracts.instruction.md](./Shared/socket-and-state-contracts.instruction.md#version-history).
  `scripts/validateV1Contract.mjs` pins the protocol and requires `apps/desktop/update-policy.json` to be reviewed for it.

## ADR-07 Public and private projections

- **Decision.** Public state goes to `room:<roomId>`; private state (own private lane, held jail cards, forced-sale proposal,
  private offers) goes to `player:<playerId>`. Deck order, tokens, hashes and other players' private offer terms never leave the
  server.
- **Code.** `apps/server/src/services/publicState.ts`, `apps/server/src/services/privateOffers.ts`,
  `apps/server/src/socket/broadcast.ts`, `apps/server/src/bots/view.ts` (bots read only these projections).
- **Docs.** [Shared/socket-and-state-contracts.instruction.md](./Shared/socket-and-state-contracts.instruction.md).

## ADR-08 LAN and Online networking

- **Decision.** LAN guests reach the helper over the private network (UDP room discovery on port 41234 plus HTTP/Socket.IO).
  Online hosting runs a bundled `cloudflared` Quick Tunnel trusted only through pinned digests, with an empty `--config` and no
  `TUNNEL_*` variables. A complete invitation link needs no registry; the optional room registry (Cloudflare Worker) maps a bare
  room code to the current tunnel. Admission and HTTP limits are keyed by the TCP peer; `CF-Connecting-IP` is read only from the
  loopback peer of an Online Host (`OTB_ONLINE_ROOM_CODE`), never `X-Forwarded-For` or `True-Client-IP`.
- **Code.** `apps/desktop/src/lanFinder.ts`, `apps/server/src/lanDiscoveryResponder.ts`, `apps/desktop/src/online/connectivity.ts`,
  `apps/desktop/cloudflared-integrity.json`, `apps/desktop/src/online/discovery.ts`, `services/room-registry/src/index.js`,
  `apps/server/src/socket/clientIdentity.ts`, `apps/server/src/socket/admissionLimiter.ts`.
- **Rationale.** [RAM-HOSTING-DISCOVERY.md](./RAM-HOSTING-DISCOVERY.md) (measured Cloudflare behavior);
  [ONLINE_MULTIPLAYER_DESIGN](../own-the-block-vnext/ONLINE_MULTIPLAYER_DESIGN.md) (REFERENCE).
- **Consequences.** Quick Tunnel hostnames are temporary; a new hostname needs a new invitation or the relink flow
  (`/_otb/continuity`, `apps/client/src/runtime/hostContinuity.ts`).
- **Docs.** [Api/http-runtime.instruction.md](./Api/http-runtime.instruction.md), [Client/join-room.instruction.md](./Client/join-room.instruction.md).

## ADR-09 Bots are host-played seats using the same commands

- **Decision.** A bot is a room member with `kind: 'BOT'` and a UUID, no session, token or socket. The host process plays it
  through the same command objects as a human (`apps/server/src/commands/gameplay.ts`), reading only the public projection and its
  own private projection. Bots never propose trades and never replace a disconnected human.
- **Code.** `apps/server/src/bots/driver.ts`, `apps/server/src/bots/policy.ts`, `apps/server/src/bots/view.ts`,
  `apps/server/src/bots/botSeats.ts`, `apps/server/src/socket/bots.ts`.
- **Rationale.** [BOT_SYSTEM_SPEC](../own-the-block-vnext/BOT_SYSTEM_SPEC.md) and its decision log
  [IMPLEMENTATION_PLAN](../own-the-block-vnext/IMPLEMENTATION_PLAN.md) (REFERENCE).
- **Scope.** RELEASED in v1.7.0 with one Balanced policy. Bot difficulty levels are CURRENT DEVELOPMENT (see ADR-13).
- **Docs.** [GameCore/bot-players.instruction.md](./GameCore/bot-players.instruction.md).

## ADR-10 Presentation never replaces authoritative state

- **Decision.** The client applies each authoritative snapshot at once; animation runs on separate display state.
  `LIVE_UPDATE` is the only snapshot source that animates a diff; session, spectator and replay syncs reset and snap. The WebGL
  board renders a `BoardRenderModel` derived from authoritative plus presentation state; a 2D fallback and 40 semantic tile
  buttons remain the accessibility and compatibility boundary.
- **Code.** `apps/client/src/game/presentation/PresentationController.ts`, `apps/client/src/game/scene/GameScene.tsx`,
  `apps/client/src/components/legacy-board/`, `apps/client/src/components/BoardAccessibilityControls.tsx`.
- **Docs.** [Client/presentation-pipeline.instruction.md](./Client/presentation-pipeline.instruction.md), [Client/game-board.instruction.md](./Client/game-board.instruction.md).

## ADR-11 Electron security boundary

- **Decision.** Renderer windows keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; the preload bridge is a
  typed whitelist; packaged files load through `app://` with a path-traversal guard. Prompts use the central modal components,
  never `window.confirm`. Closing the window during an active game is a disconnect (reconnectable), not a leave.
- **Code.** `apps/desktop/src/desktopBootstrap.ts`, `apps/desktop/src/security.ts`, `apps/desktop/src/preload.ts`,
  `apps/desktop/src/ipc/`.
- **Docs.** [Desktop/electron-shell-and-packaging.instruction.md](./Desktop/electron-shell-and-packaging.instruction.md).

## ADR-12 Packaging, update policy and protocol review

- **Decision.** Electron Forge builds an unsigned Squirrel installer (Windows) and DMGs (macOS x64/arm64); releases are published
  by `.github/workflows/release-candidate.yml` from a version tag with an `update-manifest.json`. Windows updates in place through
  Squirrel; macOS updates are assisted. `apps/desktop/update-policy.json` sets the minimum supported version and records the socket
  protocol it was reviewed for; the release contract validator fails when the protocol changes without that review.
- **Code.** `apps/desktop/forge.config.cjs`, `apps/desktop/scripts/release.mjs`, `apps/desktop/src/update/`,
  `apps/desktop/update-policy.json`, `scripts/validateV1Contract.mjs`.
- **Docs.** [V1_RELEASE_CONTRACT](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md) (release source of truth),
  [Client/app-update.instruction.md](./Client/app-update.instruction.md).

## ADR-13 Released contract vs current development

- **Decision (documentation).** Docs must say whether a rule is RELEASED or CURRENT DEVELOPMENT whenever the two differ. Released
  history is never rewritten to match the branch.
- **Released v1.7.0** (tag `v1.7.0`, `f37a271`): socket protocol 12, room snapshot schema 11, Income Tax (tile 4) 200 and Luxury
  Tax (tile 38) 100 game units, one Balanced bot policy, no difficulty setting, update policy minimum 1.7.0.
- **CURRENT DEVELOPMENT** (unreleased; candidate for v1.8.0): socket protocol **13**, room snapshot schema 11 (unchanged).
  - Income Tax 150 (`packages/shared/src/tileState.ts`). **Approval evidence:** the project owner asked for it in the session
    "Cải tiến game board và lobby" on 2026-10-09 (user message: "…xuống từ 200k xuống 150k"; commit `1937a73`, Claude Code session
    `local_51f973e8-7b78-4ed1-be95-f19a8f787dd9`). It is an owner request recorded in a chat transcript, not a written decision
    in the repository; it departs from vNext decision D15 ("taxes stay 200/100"), which still describes the released v1.7.0 rule
    and is superseded for the next release by this owner request. Luxury Tax stays 100.
  - Host-only lobby command `set bot difficulty` and optional `BoardState.botDifficulty` (absent = MEDIUM = the released
    Balanced policy), profiles in `apps/server/src/bots/policy.ts`.
  - Client fixes: jail panel only at the start of the jailed player's own turn; trade-offer amounts survive board re-renders.
  - Multiplayer hardening: `sell house` and `make offer` carry a client `requestId` and are idempotent
    ([socket-building](./Api/socket-building.instruction.md), [socket-trading](./Api/socket-trading.instruction.md));
    `decline offer` requires an in-progress room; a removed player's jail-free cards return to their deck (a winning-team member
    can leave a finished 2v2 room); the desktop quit confirmation waits for the player instead of failing open after 2 s
    ([Desktop shell](./Desktop/electron-shell-and-packaging.instruction.md)).
- **R-1 (protocol compatibility) — RESOLVED in code, option A: protocol bump 12 → 13.** v1.7.0 and the earlier state of this branch
  were both protocol 12 but differed in a displayed rule (Income Tax 200 vs 150) and in the command contract. Facts checked in
  code, not guessed: the handshake compares `auth.protocolVersion` for strict equality (`apps/server/src/socket/index.ts`, same
  at tag `v1.7.0`), so a protocol-13 host answers a 1.7.0 client with `UPGRADE_REQUIRED` and a 1.7.0 host rejects a protocol-13
  client; a desktop guest renders tax text from its own bundled shared data while the host charges its own value (that mismatch is
  what the bump prevents); a 1.7.0 host never ACKs `set bot difficulty` and `sell house`/`make offer` payloads changed. Option B
  (stay on 12) was rejected because backward compatibility cannot be guaranteed: the displayed-rule mismatch of a desktop guest has
  no capability negotiation to fix it. Consequences: LAN discovery ignores hosts of another protocol (`LAN_DISCOVERY_SOCKET_PROTOCOL`),
  `apps/desktop/update-policy.json` `reviewedForSocketProtocol: 13`, and the next release raises `minimumSupportedVersion` to its
  own version so installed 1.7.0 apps are told to update (as for protocols 10 and 11; see
  [V1_RELEASE_CONTRACT](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md)). Desktop guests of another version see an "update both apps"
  message (`app.versionMismatchDesktop`). Snapshot schema stays 11: `botDifficulty` is optional and snapshots never leave one
  process's RAM. Tracked in [testcase/RELEASE_ACCEPTANCE_MATRIX.md](./testcase/RELEASE_ACCEPTANCE_MATRIX.md).
- **R-2 (release records) — RESOLVED.** `origin/main` (including `e88b959` and the v1.7.0 merge `f37a271`) was merged into this branch
  without conflicts.
