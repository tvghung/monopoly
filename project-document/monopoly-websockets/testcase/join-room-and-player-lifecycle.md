# Checklist — join, session, reconnect, host và leave

## Automated evidence

- `[AUTO]` Token storage parse/save/clear: `apps/client/src/playerSessionStorage.test.ts`.
- `[AUTO]` Newest-wins/generation registry: `apps/server/src/services/connectionRegistry.test.ts`.
- `[CLIENT]` App/lobby assertions: `apps/client/src/App.test.tsx`, `components/Lobby.test.tsx`.
- `[SOCKET-INTEGRATION]` `apps/server/src/socket.integration.test.ts` covers protocol,
  two-step stable admission, unknown-token rejection without Seat binding, reconnect,
  newest-wins, host/ready start, disconnect preservation, queued stale generation,
  deterministic host leave, forced-liquidation forfeit, Player/spectator same-socket
  leave-and-rejoin, spectator/reclaim and server recreation over the same test store.
- `[PG-INTEGRATION][SOCKET-INTEGRATION]` Its conditional PostgreSQL case recreates
  pools/persistence/server, then resumes both stable Players and persisted game state.

## Checklist

- [ ] First `join room` returns pending token but creates no Seat/host/color.
- [ ] Token hash is 32 bytes in DB; raw token is absent from DB/log/public state.
- [ ] `resume session` activates exactly one stable UUID Seat; lost ACK is resumable.
- [ ] Newest valid socket wins; old receives `session replaced`; stale disconnect no-ops.
- [ ] Refresh/network reconnect/new socket keeps Player ID, Seat, ready, money and assets.
- [ ] Protocol/snapshot v4 identity-preserving reset keeps room/code, stable Player
  IDs, join order/name/color/ready, host, `IN_PROGRESS` status and active reconnect
  token hashes while resetting incompatible gameplay to a fresh v4 turn.
- [ ] Existing tokens reclaim the same Seats after reset; pending old-game offers are
  cancelled and no room delete cascades session rows.
- [ ] Invalid/revoked/expired token is rejected, not spectator/new Player.
- [ ] First activated Seat is host; concurrent first joins produce one host/join order.
- [ ] Lobby capacity and start boundaries are 2–4; all connected/ready; host only.
- [ ] Start rolls/tie-breaks first Player server-side, persists order once and accepts
  no client dice/order.
- [ ] Host temporary disconnect does not transfer; explicit leave transfers deterministically.
- [ ] Disconnect preserves Seat/property/payment/session and does not delete room.
- [ ] Lobby leave removes Seat/revokes token; in-game leave is confirmed atomic forfeit.
- [ ] Active debtor forfeit auto-liquidates to Bank before creditor payment; other
  leavers return assets unowned while history reason remains `LEFT`.
- [ ] Successful Player/spectator leave may start a fresh admission on the same socket.
- [ ] Join after start without token is spectator; valid existing token reclaims Player.
- [ ] Public/private Socket.IO rooms isolate room updates and private session/offer data.
- [ ] All-offline room survives; explicit empty lobby/retention cleanup follows policy.

## Restart evidence boundary

The executable PostgreSQL Socket suite must prove fresh pool/persistence/server
recovery with both tokens and exact v4 game state, plus v2/v3→v4 reset identity
preservation, when `TEST_DATABASE_URL` is set. A real process-manager/container kill
and browser reload remains a separate deployment E2E.
