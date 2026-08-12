# Vòng đời room, Seat, host và presence

## Aggregate model

Room has internal UUID/code, lifecycle status, stable host ID, version, Seat/game
snapshot and durable deadlines. Runtime connection registry/command queue are not
the durable store.

Lifecycle only moves:

```text
LOBBY → IN_PROGRESS → FINISHED
```

Player Seat membership (`ACTIVE | FINISHED | LEFT`) is independent from runtime
presence (`CONNECTED | DISCONNECTED`).

## Admission/Seat

- Two-step pending admission creates a Seat only on `resume session` activation.
- Stable UUID Player identity is assigned once and reused across connections/restart.
- First activated active Seat is host; new Seat has `ready=false`.
- Lobby maximum is seven active Seats. Start requires 2–7.
- Seat/color/join order and game references are persisted in aggregate.
- Join without valid Player token after start is spectator and creates no Seat.

## Host/ready/start

- Player toggles only own ready flag in lobby.
- All active players, including host, must be connected and ready.
- Only persisted host may atomically transition lobby to in-progress.
- Start rolls server-side 2d6 for all active Player; tied highest rollers reroll
  until one winner, whose stable ID becomes first in persisted turn order. This
  happens inside start command; no client dice/order payload is accepted.
- Start cannot repeat and no reverse/rematch lifecycle exists.
- Temporary host disconnect preserves host. Explicit leave transfers host to lowest
  remaining active join order.

## Disconnect versus leave

Disconnect:

- Runtime presence only.
- Does not delete/release/revoke player, balance, property, listing, ready, host,
  session, offer or auction state.
- May persist a guarded current-turn reconnect deadline.

Explicit leave:

- Lobby: remove Seat, revoke session, transfer host; delete room if empty.
- In game: confirmed forfeit atomically revokes session, cancels stale listing/offer
  and resolves assets according to active `DebtClaim`. PLAYER creditor receives the
  same `BANKRUPTCY_TO_PLAYER` transfer; BANK/no-player-creditor uses surrender-to-Bank
  plus `BankPropertyAuctionQueue`. Auction/payment/turn continuation is reconciled
  before winner check; finished reason remains `LEFT`.
- Spectator: runtime room leave only.

Finished history records reason (`BANKRUPT | LEFT`); it is not erased by disconnect.

## Persistence/cleanup

- PostgreSQL JSONB aggregate is authority; commands load a fresh row into a draft
  and publish only the committed result.
- All-offline alone does not immediately delete a room; configured inactivity
  retention still applies.
- Empty lobby after explicit leave deletes immediately.
- Default inactivity retention: lobby 24h, in-progress 30d, finished 7d.
- Cleanup uses persisted expiry and cascades session/offer rows.

## Invariants

- All player references are stable IDs and must resolve to valid Seat/history state.
- Public connected flags derive from runtime registry after load/restart.
- Raw token, SocketData, presence, command queue and scheduler timer handles never
  enter snapshot.
- Snapshot v2 persists Standard Mode operations but not runtime handles: doubles,
  pending decision/continuation, ordered payments, private deck state, Bank auction
  queue and building contention.
- Room code is normalized/unique but is not password/credential.

## Tests

- Concurrent first activation/host and room-code unique behavior.
- Capacity/readiness/start lifecycle and deterministic host transfer.
- Reconnect same Seat; newest-wins/stale disconnect.
- Disconnect preserves all game state; explicit leave cleans atomically.
- Spectator versus reconnect after start.
- Retention cleanup and room restart from PostgreSQL.
