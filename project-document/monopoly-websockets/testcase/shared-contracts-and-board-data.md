# Checklist — contracts, runtime schemas và board/card data

## Contract/state

- [ ] Stable identity aliases and protocol version compile for client/server.
- [ ] `PublicRoomState` carries revision/lifecycle/host/limits/roster/game projection.
- [ ] `SocketData` has internal session context and ephemeral pending-admission lock,
  but no raw token.
- [ ] Every state-changing event has typed ACK; `new player`/dummy payloads absent.
- [ ] Runtime schemas reject malformed UUID/token, unknown object fields, invalid tile,
  non-positive/fractional/money above `2_147_483_647`, blank/oversize chat.
- [ ] Schema success does not bypass role/actor/domain guards.
- [ ] `[SOCKET-INTEGRATION]` Protocol mismatch, actor spoof and strict transport paths
  are exercised in `apps/server/src/socket.integration.test.ts`.
- [ ] `[AUTO]` `apps/server/src/rooms.test.ts` exercises exact snapshot version,
  non-UUID identity and active-member inverse-state rejection; other deep malformed
  host/auction/turn invariants still need direct assertions.
- [ ] Public serialization contains no raw/hash token, session row or private offers.
- [ ] Persisted snapshot omits `loaded`, presence, socket IDs and timer handles.
- [ ] Auction uses `auctionId/endsAt`; offers/actions use `offerId`; winner has player ID.

## Board/card invariants

- [ ] Exactly 40 tile indices `0..39`; color groups reference valid buildable streets.
- [ ] Railroad, utility, GO/jail and card destination hard-coded indices still align.
- [ ] Chance/Chest effects retain expected behavior.
- [ ] Shared/client duplicate tile presentation sources remain synchronized; document
  any existing tile-name mismatch rather than claiming typecheck proves equality.

## Gates

`pnpm typecheck`, schema unit tests, `pnpm test` and `pnpm build`. Typecheck proves
contract compatibility, not network validation/authority or static-data equality.
