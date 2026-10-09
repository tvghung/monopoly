# Acceptance matrix

Status at **R0** (2026-10-09); section A updated at the R1 gate, sections B and C at the R2 gate, section D at the R3 gate, section E at the R4 gate, section F at the R5 gate on candidate `648d4ca`, section G at RC hardening on `548c551` (2026-10-09). Verdict: RC READY FOR USER MANUAL QA — NOT RELEASE READY ([RELEASE_CANDIDATE.md](./RELEASE_CANDIDATE.md)). Every row is updated as waves complete; nothing is PASS because code exists.
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
| NET-01 | Desktop hosts real game, no paid server | existing helper + Quick Tunnel; no gameplay server anywhere | Desktop Build run 37827396086 (Windows x64 + macOS arm64 packaged proofs) on `7e22c5f`; RC run pending | macOS/Windows host by a person | PASS (CI packaged proofs) · real host sessions NOT RUN (USER MANUAL) |
| NET-02 | LAN without Internet/registry | LAN path unchanged; registry only reserved in ONLINE mode | `apps/desktop/tests/hostRuntime.test.ts` LAN cases, `lanFinder` / `lanDiscoveryContract` tests, packaged `proof:packaged:host` (LAN discovery, four clients) in Desktop Build | offline LAN with two machines | PASS (automated/packaged on CI) · physical offline LAN NOT RUN |
| NET-03 | True different-network join | tunnel link / registry code / `/join` page | `scripts/proveQuickTunnel.mjs` live run 2026-10-09 on `c764135` (real Cloudflare edge, protocol 12: four public clients, wrong room, room full, reconnect, newest connection, edge refuses a visitor `CF-Connecting-IP`) — **same machine and network, so not cross-network proof** | independent Wi-Fi/cellular devices | BLOCKED (needs owner devices on independent networks); live tunnel path PASS |
| NET-04 | Provider abstraction | `packages/shared/src/endpointPolicy.ts` (single provider list, Quick Tunnel `experimental`); server CORS and client parser use it; desktop adapter mirrors it | `apps/server/src/endpointPolicy.test.ts` (accept/refuse table, provider label, scan: provider hostnames only in policy/adapter/registry); `apps/desktop/tests/lanDiscoveryContract.test.ts` policy parity | — | PASS |
| NET-05 | Unified Join parser | `runtime/joinTargetResolver.ts` used by the desktop launcher **and** the browser `JoinForm` | `JoinForm.test.tsx` "room code or invitation link" (lower case/spaces, same page, other Host, malicious/foreign/duplicate-room links, desktop refusal); existing `joinTargetResolver.test.ts`, launcher tests | — | PASS |
| NET-06 | Sharing: code, link, QR without secrets | `Lobby.tsx` copy code, `HostLanSharing.tsx` link + QR (unchanged) | existing `HostLanSharing.test.tsx` / `Lobby.test.tsx` QR payload = origin + room only; registry `/join` page contains no secret (`index.test.mjs`) | phone scan and clipboard on devices | PASS (automated) · scan NOT RUN (USER MANUAL) |
| NET-07 | Discovery correctness | registry Worker (lease, proof, TTL, CORS lookup, `/join`), `hostRuntime.ts` (CODE_TAKEN fails start, honest states), `discovery.ts` | `services/room-registry/src/index.test.mjs` (5, now in `pnpm test`), `hostLifecycle.test.ts` discovery cases (CODE_TAKEN, reservation failure, activation failure, renewal recovery, no registry), `discovery.test.ts` | deployed registry | PASS (automated) · deployment BLOCKED (owner Cloudflare account) |
| NET-08 | Lifecycle: rotation, shutdown, loss, stale | `hostRuntime.ts` rotation/suspend/revoke (existing) + discovery states; overlay relink + desktop registry refresh (`App.tsx`, `ConnectionOverlay.tsx`) | `hostRuntime.test.ts` rotation tests (existing), `hostLifecycle.test.ts`, `ConnectionOverlay.test.tsx`, `App.test.tsx` "after a long outage follows a pasted new link…" | real tunnel rotation with a phone | PASS (automated) · real rotation NOT RUN |
| NET-09 | Reconnect/session safety | sessions unchanged; relink moves the token in the device's own storage only, same room code required | existing session tests (replay, revoked, replaced, cross-room), `ConnectionOverlay.test.tsx` (wrong room refused, no token in payload), `App.test.tsx` relink | simultaneous real reconnects | PASS (automated) |
| NET-10 | Cost/capacity honesty + 20–50 users target | `ONLINE_MULTIPLAYER_DESIGN.md` §2/§7, `services/room-registry/README.md` (free-plan limits, ~30 rooms/day write budget, 200 in-flight per tunnel) | — | multi-host remote load | BLOCKED (no remote load infrastructure); docs PASS |

## E. UI/UX, accessibility, audio

| ID | Criterion | Implementation path | Automated test | Manual proof | Status |
| --- | --- | --- | --- | --- | --- |
| AC-U01 | Legible board/player UI, card for observers | existing SDF labels, HUD, dice callout; card overlay from public `revealedCardId` | `CardInteractionOverlay.test.tsx` spectator + non-actor now assert title, message and artwork; existing SDF/HUD tests | packaged Windows/macOS render on real machines | PASS (automated) · packaged visual NEEDS MANUAL ACCEPTANCE |
| AC-U02 | Destination highlight incl. card/jail relocation | `movementExecutor.ts` (SNAP shows the destination just before the snap), `semanticExecutors.ts` (jail marked during transfer, cleared on landing/abort) | `movementExecutor.test.ts` (WALK and SNAP cleared by LAND), `semanticExecutors.test.ts` "jail destination" (shown while travelling, cleared after, cleared on abort) | watch a card move | PASS (automated) · feel NEEDS MANUAL ACCEPTANCE |
| AC-U03 | Chat toggle/unread | unchanged | existing `Log.test.tsx` unread/99+/clear, e2e chat counts | — | PASS (regression suites green: client 2264+) |
| AC-U04 | Activity log | unchanged; bot names flow through the same activity events | `Log.test.tsx`, `activityText.test.ts`; bot decisions appear as normal events (integration) | — | PASS |
| AC-U05 | Icons + My Assets cash | unchanged UI; tests added | `App.test.tsx` toolbar glyphs (settings, flag), `Board.test.tsx` roll glyph (dices), `OwnedPropertiesControl.test.tsx` cash | — | PASS |
| AC-U06 | Title, names, language selector, eye toggle | unchanged | existing launcher/brand, `formatters.test.ts`, `LanguageSelector.test.tsx`, `Modal.peek.test.tsx` | — | PASS (regression) |
| AC-U07 | Responsive gameplay incl. lobby + jail | lobby seats 2x2 on phones, one row on tablets; seat X now has a 44 px touch area | browser check 2026-10-09: 375x812 and 768x1024 no horizontal scroll, Add bot 146x44, seat X 36 px drawn / 44 px hit area (elementFromPoint); e2e viewport sweep runs at R5 | physical phones/tablets | PASS (emulated) · devices NOT RUN (USER MANUAL) |
| AC-U08 | Audio | `settings` `muted`, Settings "Tắt tiếng" switch, `AudioEngine` resume on page return + `statechange` resync | `SettingsPanel.test.tsx` mute keeps levels; `AudioEngine.test.ts` interrupted context resumed with one music source, browser self-resume never duplicates; existing unlock/visibility tests | iPhone/Android/desktop listening | PASS (automated) · devices NOT RUN (USER MANUAL) |
| AC-U09 | Rule non-regression | no rule changed (taxes 200/100 units verified in `tileState.ts`) | `rulesContract.test.ts`, `v3.simplifiedRules.test.ts`, `game.test.ts`, full server suite 505 green | full game | PASS (automated) · full game NOT RUN (USER MANUAL) |
| AC-U10 | Accessibility/error affordances | Bot badge + `data-kind`, Bot chip on HUD with screen-reader text, add/remove keys with names, join/relink/sharing messages | `Lobby.test.tsx` bot seats, `PlayerCardList.test.tsx` bot summary, `JoinForm.test.tsx` errors, `ConnectionOverlay.test.tsx`, `HostLanSharing.test.tsx` | practical review on devices | PASS (automated) · NEEDS MANUAL ACCEPTANCE |

## G. RC hardening (five review findings, candidate code `548c551`)

Automated evidence: `pnpm typecheck`, `pnpm lint`, `pnpm test` (desktop 479, server 522, client 2294 + node suites),
`pnpm build`, `pnpm test:e2e:mobile` (4 passed; one earlier run had a WebKit music-lifecycle failure that passed on
re-run, unrelated to these changes) on this Windows x64 machine, 2026-10-09. CI could not run: GitHub Actions is disabled
for the repository (dispatch answered HTTP 422).

| ID | Criterion | Implementation | Automated test | Status |
| --- | --- | --- | --- | --- |
| SEC-01 | An endpoint copying the public id / room code gets no token | pinned P-256 key + signed challenge (`runtime/hostContinuity.ts`, `App.tsx switchEndpoint`) | `hostContinuity.test.ts` "original attack", `App.test.tsx` "never hands the token…" | PASS |
| SEC-02 | Token moves only after verification | verify before `writePlayerSessionForRoom`; seat re-checked after the await | `App.test.tsx` "follows a pasted new link…" | PASS |
| SEC-03 | Replayed / expired / altered / invalid proofs rejected | fresh 32-byte challenge per check, exact field match, 5 s timeout | `hostContinuity.test.ts` replay, altered, garbage, version, late answer; server test reverse signature | PASS |
| SEC-04 | Wrong room / other Host / relay rejected | Host signs only for its own addresses (`services/hostContinuity.ts`) | `hostContinuity.integration.test.ts` 403 relay, 404 room; client other-room, other-address | PASS |
| SEC-05 | Legitimate tunnel rotation still works | Electron main posts `public-endpoints` to the helper on every onlineEndpoint change | desktop `hostRuntime.test.ts` (first → withdrawn → second); server "published tunnel" test | PASS (automated); live rotation on a real tunnel NOT RUN |
| SEC-06 | Host restart is not continuity | key exists only in RAM per process | "different identity after a restart"; App "restarted Host" | PASS |
| SEC-07 | No secrets in codes, links, QR, public APIs, logs | key public, challenge random, token never sent | proof body keys only; App asserts the token is in no request | PASS |
| SEC-08 | LAN + Online compatible | own IPv4/127.0.0.1 + port, tunnel origin; no WebCrypto (`http://` LAN page) fails closed with a message | server LAN test; App "no WebCrypto" | PASS (automated); real LAN browser relink NOT RUN |
| SEC-09 | Tests show the original attack and the fix | — | as above | PASS |
| TRADE-01 | Cash paid back counts (original bug) | `acceptsDebtOffer` net cash | "300 in and 40 out…" | PASS |
| TRADE-02 | Incoming properties count (liquidity) | incoming tiles at Bank value | "counts incoming properties…" | PASS |
| TRADE-03 | Jail cards and worth count | bundle worth incl. 50 per card when debt payable without the trade | "counts Get-Out-of-Jail cards…" | PASS |
| TRADE-04 | Outstanding debt considered | must be payable afterwards | "never trades into bankruptcy anyway" | PASS |
| TRADE-05 | Completing an opponent set guarded (swaps handled) | ≥ 2 × worth; tiles the proposer gives away excluded | "does not hand an opponent a full colour set", swap case | PASS |
| TRADE-06 | Cannot pay cash it lacks; empty bundle declined | early check | "refuses to pay cash…", "raises nothing" | PASS |
| TRADE-07 | Non-debt trades unchanged | same path | existing trade tests + bot integration offer test | PASS |
| BR-01 | No infinite retries | 1 fallback + 2 re-decisions, then recovery and park | driver "bounded number of refusals" (exactly 4 refusals) | PASS |
| BR-02 | No timer/CPU/log flooding | one timer per room, backoff 0.3/2/8 s, park, bounded maps | journal length stable 300 ms after park | PASS |
| BR-03 | Recovery is authoritative and legal | `turnRecovery` armed inside the room queue, resolved by `recoverRoomIfDue` | turn passed without a roll, cash unchanged | PASS |
| BR-04 | Deterministic recovery path | turn-bound → turn recovery; deadline-backed → its deadline | driver tests (TURN, OFFER) | PASS |
| BR-05 | Stale tasks never execute | key re-derived in queue before arming | "never recovers a task that changed…" | PASS |
| BR-06 | Reconnect / rematch / completion cancel | key includes matchId; non-IN_PROGRESS cancels | existing driver integration tests | PASS |
| BR-07 | Meaningful error when no recovery | one journal line per outcome | "resolves it at its deadline" line once | PASS |
| BR-08 | Tests | — | `bots/driver.test.ts` | PASS |
| BA-01..03 | Dice completes, mascot lands, flag only after landing + purchase | `displayOwnership` hold until PROPERTY_TRANSFER plays | `ownershipHold.test.ts` order walk → landing → flag | PASS (automated) |
| BA-04 | Decline shows nothing | no ownership change, no hold | "holds nothing when declined" | PASS |
| BA-05 | Development ordered | existing `displayDevelopmentLevels` hold | PresentationController test | PASS |
| BA-06 | Natural thinking delay | bot waits shared roll budget + 0.9 s | server pacing test, client drift-guard `botPacing.test.ts` | PASS (automated) |
| BA-07 | All animation speeds | hold is queue-ordered, independent of speed | speed 2 test; 0.75 covered by the hold (pause shrinks, order kept) | PASS (automated) |
| BA-08 | Reduced motion | hold still applies | reduced-motion case | PASS |
| BA-09 | Multiplayer coherent, never waits on slow clients | server timing fixed, each client gates locally | by design + tests | PASS (automated); multi-device NOT RUN |
| BA-10 | Special movement (GO, card move, chained transfers) | per-tile pending set | GO pacing test, "changes hands twice" | PASS |
| BA-11 | No gameplay regression | presentation only | full suites | PASS |
| BA-12 | Reconnect / reset / skip safe | hold cleared on reset, released in `finish` | "never leaves a stale flag" | PASS |
| BA-13 | Visual check in the real app | — | — | OWNER-REPORTED MANUAL QA: PASS (plan D1–D4; no per-case log) |
| MP-01..03 | Toggle stays in place; Eye-Off visible state, Eye hidden state; no visible text | anchored `ModalPeekRestore`, icons `hideDialog`/`showDialog` | "Modal peek toggle (MP)" | PASS |
| MP-04..05 | Hidden content/backdrop do not obstruct or intercept; independent layer | overlay `display:none`; restore portal on body | existing peek tests + layer assertion | PASS |
| MP-06 | State preserved | content stays mounted | typed value test | PASS |
| MP-07..08 | 44 px target, responsive (resize clamp, fallback) | min 44, clamp to window | anchored size test, fallback test | PASS (automated); phones NOT RUN |
| MP-09 | Keyboard a11y | focus moves hide ↔ restore, accessible name kept | focus test | PASS |
| MP-10..12 | Multi-layer, lifecycle cleanup, decision replaced | registry unchanged | existing peek tests, close-while-hidden test | PASS |
| MP-13..14 | Compatibility (all dialogs using `peek`), tests | shared Modal | 249 design-system + DecisionPeek tests | PASS |
| MP-15 | Visual check on devices | — | — | OWNER-REPORTED MANUAL QA: PASS (plan D5–D8; devices not itemised by the owner) |

## F. Tests, devices, operations, release

| ID | Criterion | Status |
| --- | --- | --- |
| AC-R01 | Requirement trace (this file) | PASS: every row has an implementation path, a test or manual proof and an outcome; manual rows stay NOT RUN/BLOCKED |
| AC-R02 | Deterministic automated tests, no playthroughs | PASS: `pnpm test` on `548c551` (desktop 479, server 522, client 2294 + node suites); seeded single-decision fixtures only; no complete match simulated |
| AC-R03 | User-owned manual gameplay matrix | OWNER-REPORTED MANUAL QA: PASS (2026-10-09, owner statement; no per-case log supplied) — plan in USER_MANUAL_BOT_TEST_PLAN.md |
| AC-R04 | Real device/network matrix | BLOCKED/NOT RUN: physical Windows/macOS hosts, phones/tablets, independent networks need the owner; same-machine live tunnel proof PASS |
| AC-R05 | Packaged binaries | PASS for automated scope: local `desktop:make` + packaged host proof + packaged UI bot check (Windows x64); CI packaged proofs Windows x64 and macOS arm64, RC builds incl. macOS x64; clean install/upgrade on owner machines NOT RUN; unsigned (signing BLOCKED) |
| AC-R06 | Security and robustness | PASS (review in RELEASE_CANDIDATE.md; relink token leak and CODE_TAKEN swallow found and fixed with tests) |
| AC-R07 | Performance measurement 20–50 remote users | BLOCKED (no remote infrastructure); no capacity claimed |
| AC-R08 | CI/provenance for the RC SHA | Superseded: `548c551` could not be run while Actions was disabled (HTTP 422); Actions was re-enabled and the release SHA is validated in the release report. Previous candidate `648d4ca`: CI 37857669544, Desktop Build 37857673483, Release Candidate 37857677473 all success |
| AC-R09 | Upgrade/rollback | PASS (documented): RAM-only, protocol refusal of 1.6.x, minimum 1.7.0, reinstall v1.6.1 to roll back; LAN independent of registry |
| AC-R10 | Release gate | NO-GO for release / **RC READY FOR USER MANUAL QA — NOT RELEASE READY** |
| AC-R11 | Branch isolation | PASS: all work on `feat/own-the-block-multiplayer-bots-vnext`; `origin/main` still `77953b6`, local `main` still `bffc0da`; no commit, push, merge or tag on `main` |
