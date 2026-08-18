# Lobby, ready, start và leave Socket instruction

## Scope

`apps/server/src/socket/lobby.ts` handles `set ready`, `start game` and `leave room`.
All Player commands use authenticated stable actor, runtime schema where applicable,
per-room executor and typed ACK.

## Appearance

- `set appearance({characterId?, color?})` is accepted only from the authenticated
  active Player while the room is in `LOBBY`. The strict request is non-empty and
  permits character-only, color-only or combined updates; unknown keys and invalid
  IDs fail validation.
- Characters may duplicate. Colors are unique among active lobby Players; a
  conflicting color is rejected by the server, and a no-op selection is allowed.
- A changed appearance clears only that Player's ready flag. Appearance is committed
  before the public room update and is locked once the room starts.

## Ready/start

- `set ready({ready})`: active lobby Player changes only own durable ready flag.
- `start game`: actor must be persisted host; room must be `LOBBY`; 2–4 active
  Players must all be connected and ready, with a valid character and unique colors.
- Successful start rolls server-side 2d6 for every active Player, rerolls tied
  highest group to one winner, persists that stable-ID turn order, initializes
  private decks/Standard Mode state, sets `IN_PROGRESS` and commits once before
  public update/ACK. The same command `now` is stored once as optional nullable
  `boardState.gameStartedAt` and exposed in the public projection; later commands
  preserve it. The board may keep this compatibility field without rendering a visible
  timer. Client supplies no dice/order.
- Repeat/non-host/spectator/offline/unready start returns explicit failure.

First activated Seat is host. Temporary disconnect never transfers host or ready.

## Explicit leave

- Spectator: leave public Socket room and clear runtime SocketData; no durable Seat.
- Lobby Player: revoke session, remove Seat, transfer host to lowest remaining join
  order; delete empty room.
- In-progress Player: confirmed forfeit records `LEFT`, revokes session, cancels
  stale listings/offers and, when the leaver is the active payer, auto-liquidates
  to the Bank to settle the creditor before removal. Remaining properties return to
  the Bank without proceeds or auction; payment/current turn/winner reconcile
  atomically.
- Finished Player: mark left/revoke and preserve finished game history.

When leave intersects a forced-sale proposal, cancel the proposal before deterministic
Bank liquidation. Ordinary pending offers are cancelled in the same unit of work and
notifications are emitted only after commit.

Host transfer only occurs on explicit leave. `leave room` success ACK precedes client
token clearing; disconnect/browser close is not leave. Successful Player/spectator
leave clears runtime binding/admission lock so the same Socket can join another room.

## Tests

- Own-ready only, persistence through reconnect, 2/4 and connected gates.
- First host, non-host/repeated start and deterministic transfer.
- Successful start persists one ISO `gameStartedAt`; hydration/public projection and
  subsequent command storage do not reset it. Older snapshots without the field remain valid.
- Spectator/lobby/in-progress/finished leave branches and token revocation.
- Same-socket Player/spectator leave then fresh join.
- Current/non-current leave, property/listing/offer cleanup and winner.
- Active-payer leave settles creditor and leaves no auction/proposal; non-payer leave
  returns assets without proceeds.
