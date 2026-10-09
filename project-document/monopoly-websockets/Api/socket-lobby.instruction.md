# Lobby, ready, start và leave Socket instruction

## Scope

`apps/server/src/socket/lobby.ts` handles `set appearance`, `set ready`, `start game`, `play again` and
`leave room`; `kick player` (lobby) also lives in `lobby.ts`; `apps/server/src/socket/bots.ts` handles `add bot`,
`remove bot` and `set bot difficulty` (CURRENT DEVELOPMENT, see below); `apps/server/src/socket/team.ts` handles the 2v2 lobby commands `set game mode`,
`set team name`, `set team color`, `move to seat`, `request seat swap`, `cancel seat swap`, `respond seat swap` and the in-game
`revive teammate` (rules: [../GameCore/team-play.instruction.md](../GameCore/team-play.instruction.md)).
All Player commands use authenticated stable actor, runtime schema where applicable,
per-room executor and typed ACK.

## Appearance

- `set appearance({characterId?, color?})` is accepted only from the authenticated
  active Player while the room is in `LOBBY`. The strict request is non-empty and
  permits character-only, color-only or combined updates; unknown keys and invalid
  IDs fail validation.
- Characters and colors may duplicate. Only an exact mascot plus color
  combination is unique among active lobby Players; a conflicting combination is
  rejected by the server, and a no-op selection is allowed.
- A changed appearance clears only that Player's ready flag. Appearance is committed
  before the public room update and is locked once the room starts.
- 2v2 (`gameMode = TEAM_2V2`): the colour is the team colour, so `color` is rejected; `characterId` must not equal a
  teammate's mascot (the other team may use it).

## Ready/start

- `set ready({ready})`: active lobby Player changes only own ready flag in the in-RAM room aggregate; becoming ready
  needs a chosen mascot without a conflict.
- `start game`: actor must be the room's host (`FORBIDDEN` otherwise); room must be `LOBBY` (`GAME_ALREADY_STARTED`
  otherwise); 2–4 active seats (Solo), at least one human, every seat Ready and present, with a valid character and unique
  mascot plus color combinations. Bots are always Ready (lobby normalisation) and always count as present, so in practice
  every human must be connected and Ready. 2v2 needs exactly four active seats, two per team (below).
- Successful start rolls server-side 2d6 for every active Player, rerolls tied
  highest group to one winner, stores that stable-ID turn order, initializes
  private decks/Standard Mode state, sets `IN_PROGRESS` and commits once before
  public update/ACK. The same command `now` is stored once as optional nullable
  `boardState.gameStartedAt` and exposed in the public projection; later commands
  preserve it. The board may keep this compatibility field without rendering a visible
  timer. Client supplies no dice/order.
- 2v2 start additionally needs exactly four active Players, exactly two per team, and a valid mascot with no duplicate inside a
  team; it then seats `slotOrder` (A1, B1, A2, B2) through `startTeamMatch`, taking each team in seat order (the opposing
  team's seat 0 plays right after the starter, its seat 1 last). Every open seat-swap request is cleared by the start.
- Repeat/non-host/spectator/offline/unready start returns explicit failure.

## Same-room Play Again

- `play again` has no business payload and is accepted only from an authenticated
  Player whose room is `FINISHED` and whose stable ID is the room's host.
  Unlike `start game`, it may reset a room with only one eligible active Player;
  `start game` still applies the full start rule above.
- The command runs inside the room executor, cancels all pending trade
  offers in the same transaction, reconstructs `freshState()` and canonical player
  defaults, preserves eligible IDs/appearance/join order/sessions, resets ready
  flags, and removes `LEFT` members from the next lobby.
- The room ID/code and eligible host remain stable. Winner/finished records,
  positions/balances/ownership/debt/card/presentation/log/activity state and roll
  identities are not carried into the next match. Commit emits the new `LOBBY`
  snapshot before the ACK; a repeated/in-flight command cannot reset twice.
- In 2v2 the reset keeps `gameMode`, `teams` (names and colours), each Player's `teamId` and the team colour, and clears
  `teamPlay`, `winningTeamId` and every revive window, and lays each team out again on seats 0 and 1 in join order
  (`normalizeTeamSlots`). The host may still switch mode before the next start.

## 2v2 lobby commands (`socket/team.ts`)

| Event | Payload | Actor | Rule |
| --- | --- | --- | --- |
| `set game mode` | `{mode}` | host | `LOBBY` only; a real change resets every Ready |
| `set team name` | `{name}` | active member | 2v2 `LOBBY`; renames the actor's **own** team only (the payload has no team: nobody, the host included, can name the other team); `sanitizeName`, at most 20 chars; Ready untouched |
| `set team color` | `{color}` | active member | own team only, not the other team's colour; resets that team's Ready |
| `move to seat` | `{teamId, teamSlot}` | active member | 2v2 `LOBBY`; the seat must be empty (`CONFLICT` when it is held, or is the actor's own); the move is immediate. Across teams: colour becomes the new team's, a mascot that clashes with the new teammate is cleared (the stayer keeps theirs) and only the mover's Ready resets; inside the team only the seat changes |
| `request seat swap` | `{targetPlayerId}` | active member | 2v2 `LOBBY`; asks another active member to exchange seats and moves nothing. One open request per requester (a new one replaces the old); stored in `boardState.seatSwapRequests`. A BOT target swaps at once in the same commit and no request is stored (`apps/server/src/socket/team.ts`) |
| `cancel seat swap` | no payload | requester | withdraws the actor's open request; nothing to cancel is a success |
| `respond seat swap` | `{requesterPlayerId, accept}` | target | only the target of an open request `requester → actor` (else `CONFLICT`); accept exchanges the two seats as they are now (across teams: colours, mascot clash and both Ready as for a move; inside a team nothing but the seats), decline closes the request |
| `kick player` | `{playerId}` | host | `LOBBY` only (Solo and 2v2); never the host themself; see below |
| `revive teammate` | no payload | survivor | `IN_PROGRESS`, own turn, window open, ≥ `REVIVE_COST`; see team-play |

The host has no command that moves another player: seats change only by their own holder's `move to seat`, by an accepted swap or by a swap with a bot (immediate).
A request is void (removed in the same commit) when either side moves, swaps, leaves or is removed, when the mode changes and when
the game starts; `assertRoomSnapshot` rejects a request outside a 2v2 lobby, a repeated requester and a request that names a player
who is not an active lobby member.

All of them use the authenticated actor, run in the room executor and ACK only after commit. Failures use Vietnamese messages
(`localizeAckError` shows them as written).

### `kick player`

Host only, `LOBBY` only, never the host, only an active member. In one transaction it revokes the target's session
(`revokeByPlayer`), deletes the member and player, rebuilds `boardState.players`, drops the target's seat-swap requests and adds a log
line. After commit the target's current connection (if any) receives `removed from room` `{code: 'REMOVED_BY_HOST', message}`, leaves
the `room:`/`player:` channels, is deactivated in the connection registry and has its `SocketData` cleared, so its next command fails
`UNAUTHENTICATED` and its old token fails `SESSION_REVOKED`; a disconnected target is simply removed. The removed player may join again
from the room code like anyone else. Everyone else receives the normal room update.

`kick player` refuses a bot seat (`CONFLICT`): bots are removed with `remove bot`.

### `add bot` / `remove bot` (protocol 12, `socket/bots.ts`)

| Command | Payload | Actor | Rules |
| --- | --- | --- | --- |
| `add bot` | `{requestId: uuid, seat?: {teamId, teamSlot}}` → ACK `{playerId}` | host | `LOBBY` only (`GAME_ALREADY_STARTED` otherwise); `ROOM_FULL` at four seats; at most three bots; a repeated `requestId` answers with the bot it already created; `seat` is used in 2v2 when still empty |
| `remove bot` | `{playerId}` | host | `LOBBY` only; the target must be a bot seat (`CONFLICT` for a human, `NOT_FOUND` when already gone) |
| `set bot difficulty` — CURRENT DEVELOPMENT (vNext, unreleased; commit 1937a73) | `{difficulty: VERY_EASY\|EASY\|MEDIUM\|HARD\|VERY_HARD}` | host | `LOBBY` only; one level for every bot of the room, stored as optional `boardState.botDifficulty` (absent = MEDIUM = the released v1.7.0 Balanced policy; the public projection always shows a value) and kept by `play again` |

All three commit through `commitRoomCommand` and broadcast the room; guests get `FORBIDDEN` and nothing changes. Rules:
[GameCore/bot-players.instruction.md](../GameCore/bot-players.instruction.md).

Release risk for `set bot difficulty`: it was added inside the same `SOCKET_PROTOCOL_VERSION` (no bump). A released v1.7.0
host has no listener and no schema for it, so the command gets no ACK at all; v1.7.0 has one Balanced bot policy and no
difficulty. Released v1.7.0 has only `add bot`/`remove bot`. Test: `apps/server/src/socket.bots.integration.test.ts`
("bot difficulty in the lobby"). Version history:
[socket-and-state-contracts](../Shared/socket-and-state-contracts.instruction.md).

First activated Seat is host. Temporary disconnect never transfers host or ready. Host succession and the "last member leaves"
rule count humans only: the last human to leave closes the room even when bots remain.

## Explicit leave

- Spectator: leave public Socket room and clear runtime SocketData; a spectator has no Seat.
- Lobby Player: revoke session, remove Seat, transfer host to lowest remaining join
  order; delete empty room.
- In-progress Player: confirmed forfeit records `LEFT`, revokes session, cancels
  its pending offers and, when the leaver is the active payer, auto-liquidates
  to the Bank to settle the creditor before removal. Remaining properties return to
  the Bank without proceeds or auction; payment/current turn/winner reconcile
  atomically.
- Finished room (any member): revoke the session, mark the member `LEFT`, cancel its pending offers; nothing is liquidated
  (V1.1: before this the handler rejected the command with `CONFLICT`). A bankrupt member keeps its finished-player record.
  In Solo the winner is the only live seat of a finished game; in 2v2 `winner` is one representative of the winning team, and a
  still-active teammate who is not that representative leaving a `FINISHED` room goes through `removePlayerFromGame` (reason
  `LEFT`, `apps/server/src/socket/lobby.ts`). The stored winner stays in the game state exactly as the game ended (cash, properties,
  turn slot) while its membership becomes `LEFT`, so everyone still in the room keeps a complete victory screen; the snapshot
  validator allows this one LEFT-but-live seat. When the host leaves, the lowest join order among the members that stay
  (finished members included) becomes host, so the replay always has a host; the room is deleted when every member has left.

When leave intersects a forced-sale proposal, cancel the proposal before deterministic
Bank liquidation. Ordinary pending offers are cancelled in the same unit of work and
notifications are emitted only after commit.

Host transfer only occurs on explicit leave. `leave room` success ACK precedes client
token clearing; disconnect/browser close is not leave. Successful Player/spectator
leave clears runtime binding/admission lock so the same Socket can join another room.

## Tests

- Own-ready only, ready kept across reconnect while the host process lives, 2/4 and connected gates.
- First host, non-host/repeated start and deterministic transfer.
- Successful start stores one ISO `gameStartedAt`; hydration/public projection and
  subsequent command storage do not reset it. Older snapshots without the field remain valid.
- Spectator/lobby/in-progress/finished leave branches and token revocation.
- Finished leave (`socket.integration.test.ts`): the winner leaves without liquidation and the host passes to a finished member,
  the replay then excludes the winner; a bankrupt member leaves and the last leave deletes the room (`rooms.test.ts`: the
  LEFT winner snapshot is valid, any other LEFT live seat or a LEFT winner without a live seat is rejected).
- Same-socket Player/spectator leave then fresh join.
- 2v2 lobby (`socket.teamplay.integration.test.ts`): mode change resets Ready and is host/lobby only, any member renames only their own
  team and Ready is kept, team colour is own-team only and resets that team, appearance rejects colour and teammate mascots,
  start needs four players and two per team, Play Again keeps mode/teams/names/colours.
- Seats and removal (`socket.lobbySeats.integration.test.ts`, `teamLobby.test.ts`): move to an empty seat across teams and inside a
  team, refusals (held seat, own seat, Solo, started game), two concurrent moves to one seat, request/accept/decline/cancel, one request per
  requester, only the target can answer, request voiding (move, leave, kick, mode change, start), a request visible after reconnect,
  seat order driving the match order, Play Again re-seating, kick (host-only, lobby-only, self, stranger, offline target, session revoked,
  `removed from room` event, seat freed, rejoin). Historical SQL migrations 010 and 011 are not part of the current RAM host.
  Seat arrangements and open requests last only for the lifetime of that host process.
- Current/non-current leave, property/offer cleanup and winner.
- Active-payer leave settles creditor and leaves no auction/proposal; non-payer leave
  returns assets without proceeds.
- Host-only replay, finished/non-finished authorization, same-room identity,
  finished-player return, explicit-LEFT exclusion, session/spectator continuity,
  fresh state, offer cancellation and second-match start.
- Phase 7.2 was written when the protocol was V8 (HISTORICAL context); the handlers
  have been extended since (2v2, seats, bots) and its contract
  (`apps/server/src/phase72HostContract.ts`) still drives them. The packaged Host proof
  adds 2–4-player capacity/host/reconnect evidence; the existing deterministic
  Socket/GameCore tests remain the `LOBBY → IN_PROGRESS → FINISHED → Play Again →
  LOBBY` authority gate.
