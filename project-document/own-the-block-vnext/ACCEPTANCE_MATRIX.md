# Acceptance matrix

Status at **R0** (2026-10-09). Every row is updated as waves complete; nothing is PASS because code exists.
Status words: `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, `NOT RUN (USER MANUAL)`, `N/A — verified absent`, `PLANNED`.
BOT-L0n = AC-L0n, BOT-A0n = AC-B0n, BOT-E0n = AC-E0n, NET-0n = AC-N0n.

## A. Lobby, roles, slots, start

| ID | Criterion | Implementation path | Automated test | Manual proof | Status |
| --- | --- | --- | --- | --- | --- |
| BOT-L01 | 4-slot hard cap under concurrency | `socket/bots.ts` (`add bot`), `playerSessionService` admission, room executor | `socket.bots.integration.test.ts` concurrent add/join race | LAN smoke | PLANNED |
| BOT-L02 | Start matrix | `socket/lobby.ts` start, `rooms.ts` `startBlockReason` | unit matrix (all 1H..4H × 0..3B), guest/unready/stale denials | — | PLANNED |
| BOT-L03 | Add exactly one per click, ≤ 3, host/lobby only, idempotent `requestId` | `socket/bots.ts`, `services/botRequestLedger.ts` | duplicate requestId, full room, in-progress denial | — | PLANNED |
| BOT-L04 | Remove host-only, frees one slot | `socket/bots.ts` | guest/stale/started denials, then human joins freed seat | — | PLANNED |
| BOT-L05 | Room full, no eviction | existing `ROOM_FULL` + bots counted | host+3 bots → join `ROOM_FULL`; remove → join succeeds | — | PLANNED |
| BOT-L06 | Mid-match lockdown, races vs start | executor serialization | start vs add/remove/join race; post-start denials; reconnect allowed | — | PLANNED |
| BOT-L07 | Stable unique bot identities, names, appearance | `rooms.ts` bot allocation + normalisation | unit allocation, re-add numbering, human selection untouched | — | PLANNED |
| BOT-L08 | Bots auto-Ready, no human toggles | normalisation in `commitRoomCommand` | mode switch/play again keep bots Ready; `set ready` acts on actor only | — | PLANNED |
| BOT-L09 | Lobby UX | `components/Lobby.tsx`, `lobby/LobbySeat.tsx` | `Lobby.test.tsx` bot cases, start-enabled tracking | desktop + touch layouts | PLANNED |

## B. Balanced bot behaviour

| ID | Criterion | Implementation path | Automated test | Manual proof | Status |
| --- | --- | --- | --- | --- | --- |
| BOT-A01 | One policy, offline | `server/src/bots/policy.ts` | no network imports; single exported policy | — | PLANNED |
| BOT-A02 | Strategic purchasing | `policy.ts` purchase | contrasting fixtures (buy / decline / set completion / reserve) | full game | PLANNED · full game NOT RUN (USER MANUAL) |
| BOT-A03 | Legal building with reserve | `policy.ts` development + server validation | build n, hotel, insufficient funds, illegal (server rejects) | — | PLANNED |
| BOT-A04 | Trading responses only | `policy.ts` trade response; driver never calls `make offer` | accept good / decline bad / stale offer / shortfall offer | human→bot trade | PLANNED |
| BOT-A05 | Jail choices | `policy.ts` jail | card, bail, roll, wait, insufficient funds, stale card | — | PLANNED |
| BOT-A06 | Every prompt answered, no deadlock | `bots/tasks.ts` + driver | one test per decision point (§4 of the bot spec) | full game | PLANNED · full game NOT RUN (USER MANUAL) |
| BOT-A07 | Fairness | `bots/view.ts` from projections only | view equals human projection; illegal bot command rejected like a human's; client cannot claim bot | — | PLANNED |
| BOT-A08 | Controlled variability, reproducible | seeded `mulberry32` | same seed same choice; near-threshold seeds differ; reserve still enforced | — | PLANNED |
| BOT-A09 | Presentation timing, no blocking | driver delays, `BOT_ACTION_DELAY_SCALE` | scale 0 acts once; logic independent of clients | watch a bot turn | PLANNED |
| BOT-A10 | Liveness / exactly-once | driver key, retries, fallback | duplicate fire, stale key, failing first choice → fallback, cancel on rematch/delete | — | PLANNED |

## C. Match lifecycle and recovery

| ID | Criterion | Implementation path | Automated test | Manual proof | Status |
| --- | --- | --- | --- | --- | --- |
| BOT-E01 | Human disconnect keeps seat, no takeover | existing session/presence | disconnect during bot match; seat/money unchanged; reconnect same id | real device | PLANNED |
| BOT-E02 | Grace + lawful fallback | `deadlineScheduler.ts` (+ revealed card) | revealed-card expiry dismisses once; reconnect before expiry clears | — | PLANNED |
| BOT-E03 | Host temporary network loss | helper keeps state; client overlay | client reconnect to live helper; unavailable message after 20 s | real network | PLANNED · real NOT RUN |
| BOT-E04 | Host exit/crash | existing terminal helper rule, lease revoke/TTL | existing packaged proof; new driver stop on shutdown | real quit/kill | PLANNED |
| BOT-E05 | Bankrupt bot | existing removal + driver ignores finished bots | bot bankruptcy fixture: out of order, shown Bankrupt, never replaced | full game | PLANNED |
| BOT-E06 | No hot join | existing spectator admission | join after start → spectator, no seat; foreign token rejected | — | PLANNED |
| BOT-E07 | Rematch | `play again` + `matchId` | bots retained & Ready, humans un-Ready, new matchId, old timer stale | full rematch | PLANNED |
| BOT-E08 | Persistence / restore | snapshot v11 `kind`, stateless driver | snapshot round-trip with bots; new driver over same store acts once (bot turn, before/after payment, finished, rematch) | — | PLANNED |

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
