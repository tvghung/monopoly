# Lobby, ready, start và leave Socket instruction

## Scope

`apps/server/src/socket/lobby.ts` handles `set ready`, `start game` and `leave room`.
All Player commands use authenticated stable actor, runtime schema where applicable,
per-room executor and typed ACK.

## Ready/start

- `set ready({ready})`: active lobby Player changes only own durable ready flag.
- `start game`: actor must be persisted host; room must be `LOBBY`; 2–7 active
  Players must all be connected and ready.
- Successful start rolls server-side 2d6 for every active Player, rerolls tied
  highest group to one winner, persists that stable-ID turn order, initializes
  private decks/Standard Mode state, sets `IN_PROGRESS` and commits once before
  public update/ACK. Client supplies no dice/order.
- Repeat/non-host/spectator/offline/unready start returns explicit failure.

First activated Seat is host. Temporary disconnect never transfers host or ready.

## Explicit leave

- Spectator: leave public Socket room and clear runtime SocketData; no durable Seat.
- Lobby Player: revoke session, remove Seat, transfer host to lowest remaining join
  order; delete empty room.
- In-progress Player: confirmed forfeit records `LEFT`, revokes session, cancels
  stale listings/offers and resolves assets by active `DebtClaim`: PLAYER creditor
  gets `BANKRUPTCY_TO_PLAYER`; BANK/no-player-creditor uses Bank surrender and
  `BankPropertyAuctionQueue`. Payment/auction/current turn/winner reconcile atomically.
- Finished Player: mark left/revoke and preserve finished game history.

When leave intersects an auction:

- Remove leaver from active/passed.
- If leaver was leader, reset unrecoverable high bid; remaining unpassed participants
  may continue.
- If leader remains and nobody else needs action, finalize immediately.
- Auction owns turn handoff; current-player leave cannot advance once and then let
  auction advance a second time.

Host transfer only occurs on explicit leave. `leave room` success ACK precedes client
token clearing; disconnect/browser close is not leave. Successful Player/spectator
leave clears runtime binding/admission lock so the same Socket can join another room.

## Tests

- Own-ready only, persistence through reconnect, 2/7 and connected gates.
- First host, non-host/repeated start and deterministic transfer.
- Spectator/lobby/in-progress/finished leave branches and token revocation.
- Same-socket Player/spectator leave then fresh join.
- Current/non-current leave, property/listing/offer cleanup and winner.
- Auction leader/nonleader/no-bid leave with exactly-one turn handoff.
