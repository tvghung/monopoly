# Implementation plan and decision log

## Decision log (R0 architecture freeze)

| # | Decision | Reason / conflict resolved |
| --- | --- | --- |
| D1 | Bot = `RoomMember.kind: 'BOT'` with a UUID `PlayerId`; humans `kind: 'HUMAN'`. Room snapshot schema 10 → **11**, `upgradeRoomSnapshotV10ToV11` adds `kind: 'HUMAN'` and `matchId: null`. No SQL migration: the SQL files are historical artifacts the RAM runtime never loads (project README). | Strict zod schemas require an explicit field; member (room) level survives elimination, `Player` does not. |
| D2 | Socket protocol 11 → **12**: `RoomPlayerMeta.kind`, `boardState.matchId`, commands `add bot`, `remove bot`. `update-policy.json` `minimumSupportedVersion` becomes the new version. | Public shape changes; older clients must be told to update, as in every earlier protocol bump. |
| D3 | Presence: a bot counts as present (`isMemberPresent = BOT ∨ connected`) for start, turn-recovery arming and projection. Room expiry and "only bots left" count humans only. | Bots have no socket; otherwise start is refused and every bot turn arms the 60 s grace. |
| D4 | The game rules of every bot-usable command move from the socket closure into exported command functions (`apps/server/src/commands/*.ts`), called by the socket handler **and** the bot driver inside the same `commitRoomCommand`. | "Same authoritative pipeline" without fake sockets; illegal bot commands fail with the same `CommandError`. |
| D5 | Bot policy is a pure function over the public projection + the bot's own private projection + offers addressed to it. | Fairness; no deck/dice peeking by construction. |
| D6 | One in-memory driver timer per room, derived from state each time; keys include `matchId` and `aggregateVersion`; no persisted timers. | Restore/rematch/cancellation safety; RAM-only store. |
| D7 | Bots act only while ≥ 1 human member is connected. | No unattended game racing on during a host network blip or when every human dropped. |
| D8 | Host is always human; when no non-LEFT human remains the room is deleted. Host succession skips bots. | No host migration, no bot-only rooms. |
| D9 | `add bot` idempotency through a client `requestId` remembered in a bounded per-room LRU (runtime, 64 ids, 10 min). | Socket.IO buffers emits across reconnects; a retry must not add a second bot. |
| D10 | Seat-swap request to a bot is applied immediately (bot consents); `kick player` refuses bots (`remove bot` is the bot path). | A bot cannot answer a dialog; keeps kick (session revoke) semantics for humans. |
| D11 | Start: 2–4 active members, ≥ 1 human, every human Ready, bots always Ready; 2v2 still exactly 2+2 (bots may fill seats). | Approved matrix; 2v2 rules unchanged. |
| D12 | `boardState.matchId` (UUID) set at start, cleared by `play again`. | "New match identity" for rematch; key for bot work. |
| D13 | Human grace stays **60 s** (`RECONNECT_GRACE_MS`). Fallback on expiry: purchase declined, development skipped, turn skipped (existing) and, **new**, a revealed card is dismissed (its mandatory effect applied, no choice involved). Payment shortfall keeps its 120 s auto-liquidation; rescue 30 s; forced sale 20 s; offers 20 s. A connected but idle human has no timer (unchanged, documented limitation). | Fixes the verified deadlock (a disconnected player's REVEALED card blocked the game forever) with the most conservative lawful action. |
| D14 | Trading exists → bots answer offers addressed to them (accept/decline). No counter-offer exists → none added. Bots never propose. Mortgage/auction absent → `N/A — verified absent`. | Do not invent mechanics. |
| D15 | Taxes stay 200 / 100 units (verified in `tileState.ts`); no rule changes anywhere. | AC-U09. |
| D16 | Quick Tunnel remains the connectivity adapter, labelled experimental. Named Tunnel = documented upgrade path (needs owner domain). | Verified Cloudflare docs: no uptime guarantee, 200 in-flight cap. |
| D17 | Registry: existing Worker; add public CORS on `GET /v1/rooms/:code`, a static `/join` page, wire its tests into `pnpm test`, build-time URL config. Deploying it is the owner's action (BLOCKED). | Lightweight discovery, no gameplay. |
| D18 | One shared endpoint policy module names allowed public origins; the client parser, server CORS and desktop adapter read it. | Provider abstraction (NET-04). |
| D19 | Same-host LAN+Online answers disambiguated by a non-secret per-process `instanceId` in `/_otb/room`. | Removes the false "ambiguous" error. |
| D20 | Endpoint refresh after tunnel rotation: registry lookup or a pasted new link for the same room code reconnects the same token; tokens never go into URLs. | AC-N08 without leaking secrets. |
| D21 | Destination highlight added for card relocation and go-to-jail; audio gains a Mute toggle and interruption recovery. Everything else in the UI audit is preserved. | Verified gaps only. |

## File-level change map

**R1**
- `packages/shared/src/types.ts`, `stateSchemas.ts`, `socketSchemas.ts`, `events.ts`: `PlayerKind`, `RoomPlayerMeta.kind`, `matchId`, `AddBotRequest`, `RemoveBotRequest`, ack codes; protocol 12.
- `apps/server/src/rooms.ts`: member `kind`, schema v11 + upgrade helper, bot allocation (`createBotSeat`, `nextBotNumber`, `chooseBotAppearance`, `normalizeLobbyBots`), invariants (host human, ≤ 3 bots, bot names unique).
- `apps/server/src/socket/bots.ts` (new), `socket/index.ts`, `socket/lobby.ts` (start matrix, presence, kick refusal, leave/host succession, play again), `socket/team.ts` (swap with bot), `socket/roomCommands.ts` (normalisation, presence), `services/publicState.ts` (`kind`, `connected`), `services/deadlineScheduler.ts` (presence, expiry counts humans), `services/botRequestLedger.ts` (new).
- Client: `App.tsx` wiring, `components/Lobby.tsx`, `lobby/LobbySeat.tsx`, `lobby/startReadiness.ts`, `lobby/lobbyTypes.ts`, `i18n/catalog.ts`, `game/ui/formatters.ts` ack codes, network emit types.
- Desktop: `lanFinder.ts` protocol literal; tests with literals.

**R2**
- `apps/server/src/commands/{turn,jail,card,debt,trading,team}.ts` (extracted bodies); socket handlers become thin wrappers.
- `apps/server/src/bots/{view,tasks,policy,rng,driver}.ts` (new); runtime wiring in `authoritativeServer.ts`, `services/runtime.ts`, `socket/broadcast.ts` notify; config `BOT_ACTION_DELAY_SCALE`.
- `services/deadlineScheduler.ts` + `socket/roomCommands.ts`: arm turn recovery for a revealed card; dismiss on expiry; `rooms.ts` `calculateNextActionAt` unchanged (turnRecovery deadline already counted).
- Client: bot badge in HUD player card, "thinking" indication reuses the center turn pill.

**R3**
- `packages/shared/src/endpointPolicy.ts` (new); `apps/client/src/runtime/joinTargetResolver.ts`, `components/JoinForm.tsx`, `components/DesktopMultiplayerLauncher.tsx`, `components/ConnectionOverlay.tsx`, `App.tsx` reconnect/endpoint refresh; `apps/server/src/createServer.ts` (`instanceId`, CORS via policy); `apps/desktop/src/hostRuntime.ts`, `online/discovery.ts`, `online/connectivity.ts`, packaging config for `online-config.json`; `services/room-registry/src/index.js` (+ tests, package script).

**R4**
- `game/presentation/executors/movementExecutor.ts`, `semanticExecutors.ts`; `audio/AudioEngine.ts`, `settings/*`; lobby polish and tests listed in the UI matrix.

**R5**
- Version 1.7.0 in the five `package.json`, `update-policy.json`, `scripts/validateV1Contract*.mjs` literals, `V1_RELEASE_CONTRACT.md`, `.github/release-notes/v1.7.0.md`, README/CLAUDE.md protocol lines, evidence index.

## Dependency order and wave gates

R1 shared contracts → server bot seats → client lobby → R1 gate (BOT-L tests + LAN smoke with the dev server).
R2 command extraction (behaviour-preserving, full existing server suite must stay green) → view/policy/tasks →
driver → revealed-card fallback → R2 gate (BOT-A/BOT-E focused tests, manual plan written).
R3 parser/policy → registry → host runtime fixes → overlay refresh → R3 gate (NET tests; real network rows BLOCKED).
R4 UI fixes → R4 gate. R5 freeze → full suite, builds, CI on the RC SHA.

## Rollback and compatibility

- RAM-only: no stored data to migrate or lose; rolling back means installing v1.6.1 again (Squirrel update or
  installer). Rooms of a running v1.7 host vanish on quit as today.
- Protocol 12 clients and servers refuse protocol 11 peers with `UPGRADE_REQUIRED` (existing handshake), so a
  mixed LAN gets a clear "update" message instead of corrupt state.
- `minimumSupportedVersion` in the update manifest moves to 1.7.0 so older apps update before joining.
- Each wave is a series of small commits on the feature branch; any wave can be reverted without touching `main`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Command extraction changes behaviour | pure move first, existing 455 server tests + integration suite as the oracle before adding bots |
| Bot loop spins or stalls | one timer per room, key de-dup, bounded retries, always-legal fallback, sweep backstop, tests per decision point |
| Timing makes bots feel slow/fast | delays are presentation-only and centrally tunable |
| Integration tests flaky under CPU load (known) | re-run single tests; delay scale 0 in tests |
| Registry undeployed | honest `DISCOVERY_DISABLED` state; link/QR path unaffected |

## Test environment needs

Windows machine (this one) for unit/integration/e2e/package; CI Linux + Windows + macOS runners for Desktop
Build; owner devices and networks for every real-world row; owner Cloudflare account for registry deployment.
