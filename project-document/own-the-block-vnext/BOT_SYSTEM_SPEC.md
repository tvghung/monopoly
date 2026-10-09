# Bot system specification (R1 + R2)

Rules of the game are not changed by this document. A bot is a seat that the host process plays with the
same commands, validation and transactions a human uses.

## 1. Identity and room model

- A bot is a room member with `kind: 'BOT'` (`RoomMember.kind`, room snapshot schema **v11**). Humans are
  `kind: 'HUMAN'`. The member key is a `randomUUID()` `PlayerId` like every human.
- A bot has **no** session, reconnect token, socket, Socket.IO room membership, account or browser tab. It
  is never registered in `ConnectionRegistry`.
- Display name `Bot N`, where N is the lowest of 1, 2, 3 not used by another non-LEFT bot of the room. A
  removed bot frees its number; the next added bot takes the lowest free one (predictable). Humans may still
  type any name; a bot is always distinguishable by its `kind` badge.
- Appearance: Solo — the colour `nextAvailableColor` gives on join and the first `CHARACTER_IDS` mascot whose
  `mascot:colour` combination is free (preferring a mascot nobody wears). 2v2 — the team colour and the first
  mascot no teammate wears. A human can never pick a combination a bot holds (existing
  `hasAppearanceCombinationConflict` counts every active member). When a lobby rule clears or invalidates a
  bot's mascot (mode switch, team move, team recolour, `dedupeTeamMascots`), the bot normalisation step
  reassigns it in the same transaction. Human selections are never changed for a bot.
- Ready: a lobby bot is always Ready. `normalizeLobbyBots(snapshot)` runs inside `commitRoomCommand` after
  every command, so a mode switch or `play again` that resets Ready cannot leave a bot un-Ready. No client
  command can toggle a bot (`set ready` acts on the authenticated actor only).
- Public projection: `RoomPlayerMeta.kind` (protocol **v12**); `connected` is `true` for an active bot.
- Host: always a human. Host succession (`successorHost`, lobby leave) skips bots. When no non-LEFT human
  member remains, the room is deleted in the same transaction (lobby, in progress or finished): bots never
  play on in an abandoned room.

## 2. Lobby commands (R1)

| Command | Payload | Rules |
| --- | --- | --- |
| `add bot` | `{ requestId: uuid }` | Host only, `LOBBY` only, active occupancy < 4, at most 3 bots. Adds exactly one bot. A `requestId` already applied in this room (bounded in-memory LRU, 64 ids / room, 10 min) returns the original success without adding. Concurrent adds are serialized by the room executor, so the fourth slot has exactly one winner; losers get `ROOM_FULL`. |
| `remove bot` | `{ playerId: uuid }` | Host only, `LOBBY` only, target must be an existing `BOT` member. Deletes the member and player, frees one slot, drops seat-swap requests that name it. A stale or repeated remove gets `NOT_FOUND`/`CONFLICT` and changes nothing. |
| `kick player` | unchanged | Refuses a bot target (`CONFLICT`, use `remove bot`). |
| `request seat swap` | unchanged | If the target is a bot the bot consents at once: the swap is applied in the same transaction (a bot never refuses and never requests). |
| `start game` | unchanged | 2–4 active members, **at least one human**, every human Ready, every member has a mascot and a unique combination, every *human* connected (bots count as present), host only, `LOBBY` only. 2v2 still needs exactly 2+2. |
| `play again` | unchanged | Non-LEFT humans and bots return; bots are Ready again through normalisation; a new `matchId` is created at the next start. |

Human join: a lobby whose four seats are taken by any mix of humans and bots answers `ROOM_FULL`; no bot is
evicted. After `remove bot` a human can take the freed seat. Joining a started room keeps the existing
read-only spectator admission (no seat, no hot join).

## 3. Match identity

`boardState.matchId: uuid | null` is created by `start game` and cleared by `play again`. Every scheduled bot
task and every decision seed include it, so work from a previous match can never apply to a rematch.

## 4. Decision points covered (R2)

| Situation (detected from state) | Bot command | Fallback (always legal) |
| --- | --- | --- |
| Own turn, not moved, no pending op, not jailed | `roll dice` | — (roll is the only action) |
| Own turn, jailed, not moved | `use jail card` / `pay bail` / `roll dice` / `wait in jail` | `roll dice` |
| `pendingPropertyDecision` for the bot | `buy property` / `do not buy` | `do not buy` |
| `pendingDevelopmentDecision` for the bot | `resolve development` (`BUILD_HOUSES n` / `UPGRADE_HOTEL` / `SKIP`) | `SKIP` |
| `pendingCardInteraction` REVEALED for the bot | `dismiss card` | `dismiss card` |
| Legacy `AWAITING_DRAW` for the bot | `draw card` | server deadline |
| Active payment claim with the bot as debtor, no rescue | `sell property to bank` (one tile per step) | server 120 s auto-liquidation |
| Rescue offer with the bot as rescuer (2v2) | `accept rescue` / `decline rescue` | `decline rescue` |
| Forced-sale proposal with the bot as buyer | `accept forced sale` / `reject forced sale` | `reject forced sale` |
| Pending trade offer to the bot | `accept offer` / `decline offer` | `decline offer` |
| Own turn before rolling with an open revive window (2v2) | `revive teammate` (then roll) | roll |

Bots never call `make offer` or `propose forced sale`, never `sell house` outside the debt flow (the debt
flow's bank sale already liquidates buildings), never chat, never `leave room`. Mortgage and auction do not
exist (verified absent) and are not created.

Turn end: there is no "end turn" command; `completeTurnResolution` hands the turn over once the last wait is
resolved, for bots exactly as for humans.

## 5. Information boundary (fairness)

The policy is a pure function `decideBotAction(view, rng)`. Its `view` is built only from:

1. `projectPublicRoomState(room)` — what every client receives;
2. `projectPrivatePlayerState(room, botId)` — what the bot's own browser would receive (its jail-free card
   ids, its forced-sale proposal, its private event stream);
3. pending trade offers whose recipient is the bot (`projectPrivateOffer`), which that player would receive.

It never reads `privateState.decks`, other players' private state, future dice or the room record. Dice and
decks come from the unchanged authoritative code path (`rollDice`, `createShuffledDecks`). A test asserts the
view of a bot equals what a human seat in the same position receives.

## 6. Balanced policy

One policy, no difficulty switch, no network access.

- **Reserve** `R = clamp(120 + 0.6 × maxOpponentRent, 120, 650)`, where `maxOpponentRent` is the highest rent
  any opponent street/station/utility (utility at 7 × multiplier) would charge at its current public level.
- **Tile value** `V = price × (1 + set bonus)`: completing an own colour set +0.9, second of a set +0.35,
  blocking an opponent's otherwise-complete set +0.5, each other owned station +0.25, utility −0.2.
- **Purchase:** buy when `cash − price ≥ R`; or when it completes/blocks a set and `cash − price ≥ 0.5 R`;
  decline otherwise. Inside ±8 % of the threshold the seeded RNG breaks the tie.
- **Development:** build the largest `n ≤ maxQuantity` with `cash − n × houseCost ≥ R + 40`; the reserve factor
  is 0.8 on a complete own set (higher rent multiplier). Hotel when `cash − houseCost ≥ R`. Team Investment
  on a teammate's street uses the same test with factor 1.1.
- **Jail:** use a held card when an opponent owns developed streets or it is past turn 20; pay bail when
  `cash − 25 ≥ R` and the board is not dangerous; otherwise roll; wait only when the board is dangerous
  (≥ 3 opponent streets with houses) and the bot holds no card.
- **Debt:** sell the property whose loss of value per unit raised is lowest, preferring one sale that covers
  the remainder; undeveloped, non-set tiles first.
- **Trade response:** accept when value gained ≥ 1.15 × value given, post-trade cash ≥ 0.5 R and the trade does
  not complete an opponent's set (unless gained ≥ 2 × given; tiles the proposer gives in the same trade no longer count
  as theirs). **In a shortfall** the whole bundle counts both ways: net cash, incoming tiles at Bank value (liquidity)
  must be ≥ the Bank value of the requested tiles and > 0; the debt must be payable afterwards (cash + liquidity + the
  rest still sellable); when the debt is payable without the trade it must also be fair by worth (cash + incoming worth
  incl. jail cards ≥ outgoing worth); a completed opponent set needs ≥ 2 × the outgoing worth.
- **Forced-sale buy:** accept when `price ≤ 0.9 × V` and `cash − price ≥ R`.
- **Rescue:** accept when `cash − amount ≥ max(100, 0.5 R)`.
- **Revive:** revive when `cash − 750 ≥ R + 200`.

Decisions are deterministic: `rng = mulberry32(hash(roomId, matchId, turnNumber, rollSequence, botId,
decisionKind))`. Same state + same seed ⇒ same decision.
Each decision logs one line (`[bot] room=<id> bot=<n> kind=<k> choice=<c> reason=<short>`), with no token,
offer terms of other players or deck order.

## 7. Driver, timing and liveness

`BotDriver` (server service on the runtime) is the only thing that acts for bots.

- **Trigger:** `broadcastRoom` (called after every commit, reconnect and disconnect) and `make offer` notify
  the driver; a 1 s sweep re-checks rooms that hold bots (covers missed notifications and offers).
- **Task:** `nextBotTask(room, offers)` returns at most one task `{botId, kind, key}`; the key is
  `matchId|aggregateVersion|botId|kind|operationId`. One timer per room; a different key cancels the old timer.
- **Delay (presentation only):** roll 1.1 s; decision after a move = normal-speed roll presentation
  (`estimateRollPresentationMs`: 0.78 s dice + 0.22 s lead + 0.18 s × steps + 0.24 s landing + 1 s when passing GO) +
  0.9 s thinking (≤ 6 s); card
  2.6 s; develop 1.5 s; jail 1.2 s; debt step 1.3 s; responses 1.5 s; `BOT_ACTION_DELAY_SCALE` (default 1,
  tests 0). Logic never waits on client animation, focus, visibility or rendering.
- **Execute:** inside `commitRoomCommand`, the task is recomputed from the current transaction state; a key
  mismatch is a no-op (stale). The command body is the same exported function the socket handler calls.
- **Failure (bounded recovery):** a refused first choice is retried with the fallback in §4 after 0.3 s, then decided
  afresh at most twice more (after 2 s and 8 s). Still refused: a turn-bound task (roll, purchase, development, revealed
  card) gets `turnRecovery` with an immediate deadline inside the room queue (only while the room still waits on exactly
  that task) and the server resolves it as for an absent player; a deadline-backed task (debt, rescue, forced sale,
  offer, legacy draw) is left to its deadline. The key is then parked with one journal line; bookkeeping is bounded. Exactly-once is guaranteed by
  per-room serialization, the key check and the domain's own operation-id / `hasMoved` guards.
- **Pause:** bots act only while at least one human member is connected; with every human disconnected the
  game waits (the existing 60 s human grace still skips absent humans), and resumes on reconnect.
- **Cancellation:** any commit changes `aggregateVersion`, so a timer for an older state is stale; room
  deletion, `play again` (new `matchId`), shutdown (`stop()` clears timers) and a removed/bankrupt bot all
  cancel pending work.
- **Restore:** the driver keeps no durable state. A new driver over the same store derives the same task from
  the room and acts once. Timers are never serialized; a host process exit destroys rooms (RAM design).

## 8. Disconnect, host loss, bankruptcy

- A disconnected human keeps their seat, id, money and holdings; no bot takes over. Grace and fallback are
  in decision D13 of `IMPLEMENTATION_PLAN.md` (60 s, revealed card now included).
- A bankrupt bot moves to `finishedPlayers` exactly like a human, leaves the turn order, stays listed as
  Bankrupt and is never replaced. Victory rules are unchanged.
- Host network loss: the helper keeps running, bots keep the authoritative game (paused if no human is
  connected). Host process exit: the room is gone (existing RAM rule); no migration.

## 9. Tests (focused, no complete matches)

Unit: identity/number/appearance allocation, normalisation, start matrix, view-boundary, every policy branch
(contrasting fixtures), RNG determinism, task derivation for each decision point, key staleness.
Integration (Socket.IO, in-process server): add/remove/start races, host-only denials, room full, play again,
each bot command dispatched once with exactly one effect, duplicate timer fire, bounded retry + fallback,
pause/resume on human presence, new driver instance does not duplicate. No test plays a game to its end.
