# Acceptance matrix

Status at **R0** (2026-10-09); section A updated at the R1 gate, sections B and C at the R2 gate (2026-10-09). Every row is updated as waves complete; nothing is PASS because code exists.
Status words: `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, `NOT RUN (USER MANUAL)`, `N/A — verified absent`, `PLANNED`.
BOT-L0n = AC-L0n, BOT-A0n = AC-B0n, BOT-E0n = AC-E0n, NET-0n = AC-N0n.

## A. Lobby, roles, slots, start

| ID | Criterion | Implementation path | Automated test | Manual proof | Status |
| --- | --- | --- | --- | --- | --- |
| BOT-L01 | 4-slot hard cap under concurrency | `socket/bots.ts`, `bots/botSeats.ts`, admission `ROOM_FULL`, room executor | `socket.bots.integration.test.ts` "gives the last seat to exactly one of a racing human join and bot additions", "answers Room full…" | dev-server browser smoke 2026-10-09 | PASS (automated); physical LAN NOT RUN |
| BOT-L02 | Start matrix | `socket/lobby.ts` start (≥ 1 human, humans connected, bots present) | `socket.bots.integration.test.ts` "refuses a host alone, an unready human and a guest…", "starts every allowed mix…", play-again restart; existing human-only start tests | browser smoke 1H+1B | PASS (1H+0B refused, unready human refused, guest FORBIDDEN, 1H+1B, 1H+3B, 2H+1B; human-only by existing suites) |
| BOT-L03 | Add exactly one per click, ≤ 3, host/lobby only, idempotent `requestId` | `socket/bots.ts`, `services/botRequestLedger.ts` | `socket.bots.integration.test.ts` "answers a repeated request id…" (sequential and racing copies), 4th add `ROOM_FULL`, add after start refused | browser smoke | PASS |
| BOT-L04 | Remove host-only, frees one slot | `socket/bots.ts` `remove bot` | `socket.bots.integration.test.ts` "never lets a guest add or remove a bot…", "removes only an existing bot…", "…admits them after a bot is removed" | browser smoke | PASS |
| BOT-L05 | Room full, no eviction | existing `ROOM_FULL`; bots are active seats | `socket.bots.integration.test.ts` "answers Room full to a human when host and bots fill the four seats…" | — | PASS |
| BOT-L06 | Mid-match lockdown, races vs start | executor serialization; `GAME_ALREADY_STARTED` | `socket.bots.integration.test.ts` "starts every allowed mix and locks the seats afterwards" (newcomer = spectator), "resolves a start racing a bot addition…" | — | PASS |
| BOT-L07 | Stable unique bot identities, names, appearance | `rooms.ts` `nextBotNumber`, `chooseBotCharacter`, `normalizeLobbyBots`; humans keep mascot priority in `teamLobby.ts` | `socket.bots.integration.test.ts` "adds one Ready bot per request, named Bot 1..3…", "keeps the bot numbers predictable…", 2v2 switch, clicked-seat test | browser smoke | PASS |
| BOT-L08 | Bots auto-Ready, no human toggles | normalisation in `commitRoomCommand`; invariant "lobby bot Ready" | 2v2 switch and play again keep bots Ready (`socket.bots.integration.test.ts`); `set ready` acts on the authenticated actor only (unchanged code) | — | PASS |
| BOT-L09 | Lobby UX | `components/Lobby.tsx`, `lobby/LobbySeat.tsx`, `lobby/TeamZone.tsx` | `Lobby.test.tsx` "Lobby bot seats" (badge, host-only Add bot, full room, remove without question, start with a bot) | browser smoke at desktop width; touch layouts NOT RUN | PASS (automated + desktop smoke); touch NEEDS MANUAL ACCEPTANCE |

## B. Balanced bot behaviour

| ID | Criterion | Implementation path | Automated test | Manual proof | Status |
| --- | --- | --- | --- | --- | --- |
| BOT-A01 | One policy, offline | `apps/server/src/bots/policy.ts` (only `@monopoly/shared`, `./rng`, `./view` imports) | `bots/policy.test.ts` "one offline policy" (imports, no fetch/Math.random/URLs, one `decide` export, no difficulty) | — | PASS |
| BOT-A02 | Strategic purchasing | `policy.ts` purchase (reserve, set completion/blocking, seeded near-threshold tie-break) | `policy.test.ts` "Balanced purchases" (cheap buy, reserve decline, cannot afford, set stretch vs ordinary, danger reserve); `socket.botDriver.integration.test.ts` buys Bạc Liêu | browser smoke: Bot 1 bought Bạc Liêu, Bot 2 bought Mũi Né | PASS (decisions) · full game NOT RUN (USER MANUAL B1–B3) |
| BOT-A03 | Legal building with reserve | `policy.ts` development; server `resolveDevelopmentCommand` validates | `policy.test.ts` "Balanced development" (4 / 2 houses, skip when short, hotel, skip fallback); illegal requests refused by the shared command (`commands/gameplay.ts`, existing development tests) | — | PASS |
| BOT-A04 | Trading responses only | `policy.ts` `acceptsOffer`; driver has no `make offer` / `propose forced sale` mapping | `policy.test.ts` trade cases (gain, loss, hands a set, debtor vs Bank 70 %), forced-sale buy/reject; `socket.botDriver.integration.test.ts` accepts 400-for-Cà Mau, declines 5-for-Landmark 81 | human→bot trade in a real game | PASS (decisions + integration) · NOT RUN (USER MANUAL B7–B8) |
| BOT-A05 | Jail choices | `policy.ts` TURN in jail | `policy.test.ts` "Balanced jail choices" (card, bail, roll, wait on dangerous board, roll fallback); integration "pays bail in a safe board, then rolls and buys" | — | PASS |
| BOT-A06 | Every prompt answered, no deadlock | `bots/policy.ts` `botTaskOf` (turn, purchase, development, card, legacy draw, debt, rescue, forced sale, offer, revive) + `bots/driver.ts` | `policy.test.ts` task derivation; integration: roll/buy, bail, card dismiss, liquidation to bankruptcy, offers; `driver.test.ts` fallback + park | — | PASS (each decision point) · full game NOT RUN (USER MANUAL B1–B6) |
| BOT-A07 | Fairness | `bots/view.ts` builds views from `projectPublicRoomState` + `projectPrivatePlayerState(bot)` + offers to the bot; dice/decks unchanged | `driver.test.ts` "sees the public projection every client gets…" (no `drawPile`, no hidden card ids); integration "is refused an illegal command exactly like a human would be"; bots have no socket so no client can act as one | — | PASS |
| BOT-A08 | Controlled variability, reproducible | `bots/rng.ts` seeded from room/match/turn/roll/bot/kind | `policy.test.ts` "is reproducible for one seed, varies only near its threshold, and never breaks liquidity for any seed" (40 seeds); decision journal per room (`driver.journal`), `OTB_BOT_LOG=1` | — | PASS |
| BOT-A09 | Presentation timing, no blocking | `policy.ts` `botActionDelayMs` (1.1–5.8 s), `BOT_ACTION_DELAY_SCALE`; center pill "Bot N đang đi…", Bot chip | integration tests run at scale 0 with no client; `PlayerCardList.test.tsx` Bot chip | browser smoke: "Bot 1 đang đi…" visible, moves animated | PASS (automated + smoke) · feel NEEDS MANUAL ACCEPTANCE |
| BOT-A10 | Liveness / exactly-once | driver: one timer per room, in-queue guard re-deriving the task, retry once with fallback, park, pause without humans, cancel on rematch/stop | integration "never repeats an effect for duplicate notifications or a second driver", "drops a pending bot action when the match ends…", "waits while every human is disconnected…"; `driver.test.ts` retry/park | — | PASS |

## C. Match lifecycle and recovery

| ID | Criterion | Implementation path | Automated test | Manual proof | Status |
| --- | --- | --- | --- | --- | --- |
| BOT-E01 | Human disconnect keeps seat, no takeover | existing session/presence; driver never acts for humans | integration "waits while every human is disconnected and plays on when one comes back" (seat resumed by token); revealed-card test keeps membership ACTIVE | real device | PASS (automated) · NOT RUN (USER MANUAL C1–C2) |
| BOT-E02 | Grace + lawful fallback | 60 s `RECONNECT_GRACE_MS`; `deadlineScheduler.ts` now also arms and resolves a REVEALED card (dismiss = apply its mandatory effect) | integration "applies the card once the reconnect grace expires instead of blocking the game"; existing grace tests (decline, skip) unchanged | — | PASS |
| BOT-E03 | Host temporary network loss | helper keeps state; client overlay | client reconnect to live helper; unavailable message after 20 s | real network | PLANNED · real NOT RUN |
| BOT-E04 | Host exit/crash | existing terminal helper rule, lease revoke/TTL | existing packaged proof; new driver stop on shutdown | real quit/kill | PLANNED |
| BOT-E05 | Bankrupt bot | existing removal; `playingBotIds` excludes finished bots | integration "liquidates, goes bankrupt and is left out of the game without being replaced" (FINISHED member, winner, no new seat) | full game | PASS (automated) · NOT RUN (USER MANUAL B2, B6) |
| BOT-E06 | No hot join | existing spectator admission; `add bot` refused after start | `socket.bots.integration.test.ts` "starts every allowed mix and locks the seats afterwards"; existing foreign-token tests | — | PASS |
| BOT-E07 | Rematch | `play again` keeps `kind`, bots Ready via normalisation, `matchId` cleared then new at start | `socket.bots.integration.test.ts` play-again test (bots Ready, humans not, cash reset, new matchId); driver test "drops a pending bot action when the match ends…" | full rematch | PASS (automated) · NOT RUN (USER MANUAL C6) |
| BOT-E08 | Persistence / restore | snapshot v11 (`RoomMember.kind`, `matchId`), invariants (host human, ≤ 3 bots, lobby bots Ready); driver stateless | `socket.bots.integration.test.ts` "bot seats in the room snapshot" (JSON round trip lobby + running, no timers stored, invalid host/unready rejected); second-driver test acts once; RAM-only: no cross-process restore by design | — | PASS |

## D. Online multiplayer

| ID | Criterion | Implementation path | Automated test | Manual proof | Status |
| --- | --- | --- | --- | --- | --- |
| NET-01 | Desktop hosts real game, no paid server | existing helper | packaged proofs (Windows CI + macOS CI) | macOS/Windows host | PLANNED · real NOT RUN |
| NET-02 | LAN without Internet/registry | existing LAN path | LAN host start with registry unreachable; LAN join | offline LAN | PLANNED · real NOT RUN |
| NET-03 | True different-network join | tunnel + link/code | — (mocks insufficient) | independent Wi-Fi/cellular | BLOCKED (devices/networks) |
| NET-04 | Provider abstraction | `ConnectivityProvider`, `endpointPolicy.ts` | no provider hostnames outside the policy (grep test) | — | PLANNED |
| NET-05 | Unified Join parser | `runtime/joinTargetResolver.ts` | table of valid/invalid inputs, both join surfaces | — | PLANNED |
| NET-06 | Sharing: code, link, QR without secrets | `HostLanSharing.tsx`, `Lobby.tsx` | QR/link payload contains only origin + room | phone scan | PLANNED · scan NOT RUN |
| NET-07 | Discovery correctness | registry Worker + `discovery.ts` | registry node tests in `pnpm test`; unknown/expired/closed/reused code | deployed registry | PLANNED · deploy BLOCKED (owner account) |
| NET-08 | Lifecycle: rotation, shutdown, loss, stale | `hostRuntime.ts`, overlay endpoint refresh | rotation re-lease, activation failure keeps link, stale lease, endpoint refresh | real rotation | PLANNED |
| NET-09 | Reconnect/session safety | existing sessions + endpoint refresh | replay, cross-room token, simultaneous reconnect, link ≠ seat | — | PLANNED |
| NET-10 | Cost/capacity honesty + 20–50 users target | docs + measurement | — | multi-host remote load | BLOCKED (infrastructure) |

## E. UI/UX, accessibility, audio

| ID | Criterion | Implementation path | Automated test | Manual proof | Status |
| --- | --- | --- | --- | --- | --- |
| AC-U01 | Legible board/player UI, card for observers | existing (U1) + card-text assertion | `CardInteractionOverlay.test.tsx` spectator text | packaged Windows/macOS render | PLANNED |
| AC-U02 | Destination highlight incl. card/jail relocation | `movementExecutor.ts`, `semanticExecutors.ts` | relocation and jail highlight + clear | — | PLANNED (NEEDS FIX) |
| AC-U03 | Chat toggle/unread | existing | existing `Log.test.tsx`, e2e | — | PLANNED (regression) |
| AC-U04 | Activity log | existing | existing tests + bot names | — | PLANNED (regression) |
| AC-U05 | Icons + My Assets cash | existing + tests | toolbar/roll icon tests | — | PLANNED |
| AC-U06 | Title, names, language selector, eye toggle | existing | existing tests | — | PLANNED (regression) |
| AC-U07 | Responsive gameplay incl. lobby + jail | existing + lobby bot controls | e2e viewport sweep incl. lobby | physical phones/tablets | PLANNED · devices NOT RUN |
| AC-U08 | Audio | `AudioEngine.ts` mute + interruption | unit tests | iPhone/Android/desktop | PLANNED (NEEDS FIX) · devices NOT RUN |
| AC-U09 | Rule non-regression | rules unchanged | `rulesContract`, `v3.simplifiedRules`, game tests | full game | PLANNED · full game NOT RUN (USER MANUAL) |
| AC-U10 | Accessibility/error affordances | catalog + LobbySeat/PlayerCard statuses | status text tests per state, new ack codes localized | practical review | PLANNED |

## F. Tests, devices, operations, release

| ID | Criterion | Status |
| --- | --- | --- |
| AC-R01 | Requirement trace (this file) | PLANNED |
| AC-R02 | Deterministic automated tests, no playthroughs | PLANNED |
| AC-R03 | User-owned manual gameplay matrix | NOT RUN (USER MANUAL) — plan written in R2 |
| AC-R04 | Real device/network matrix | BLOCKED (hardware/networks owner-side) |
| AC-R05 | Packaged binaries | PLANNED (CI Desktop Build) · install/upgrade on owner machines NOT RUN |
| AC-R06 | Security and robustness | PLANNED |
| AC-R07 | Performance measurement 20–50 remote users | BLOCKED (infrastructure) |
| AC-R08 | CI/provenance for the RC SHA | PLANNED |
| AC-R09 | Upgrade/rollback | PLANNED |
| AC-R10 | Release gate | NO-GO until all mandatory rows PASS |
| AC-R11 | Branch isolation | PASS at R0: branch `feat/own-the-block-multiplayer-bots-vnext` created from `origin/main` `77953b6` before any edit; `main` untouched (local `bffc0da`, remote `77953b6`) |
