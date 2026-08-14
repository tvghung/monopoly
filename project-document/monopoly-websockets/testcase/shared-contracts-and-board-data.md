# Checklist — protocol/snapshot v3, board Việt Nam và decks

## Protocol/contracts/privacy

- [ ] `[AUTO][SOCKET]` Protocol v3 client/server works; older/mismatch gets
  `UPGRADE_REQUIRED`; every mutation has typed ACK and strict payload shape.
- [ ] `[AUTO]` Runtime schemas cover `TurnInfo.pendingPropertyDecision`,
  `PendingTurnContinuation`, `DebtClaim/PaymentQueue`, landing decisions,
  `TradeOfferRequest/TradeBundle`, transfer policies and IDs.
- [ ] `[AUTO]` Continuation schema accepts only the supported card/jail/payment
  resume kinds; stale operation IDs cannot advance another Player.
- [ ] `[AUTO]` Public projection contains no raw/hash token, session row, private
  offer terms or exact `DeckState`/next card; snapshot omits presence/socket/timer.
- [ ] `[AUTO]` Snapshot v3 deep validation rejects dangling player/card/creditor,
  invalid claim index, duplicate card, two landing decisions, malformed proposal
  binding and any removed auction/contention/Bank queue state.

## Board/card data

- [ ] `[AUDIT]` Exactly 40 indices match canonical Vietnamese table; index 17 is
  Khí Vận/chest; all special indices, types and eight color groups valid.
- [ ] `[AUDIT]` All numeric price/rent tiers/house costs retained; no player-facing
  English board/card label or `$`/`$M`.
- [ ] `[AUDIT]` Client has no duplicate 40-row metadata; presentation derives shared
  names/economy.
- [ ] `[AUTO]` Money formatter maps 60→`60.000 ₫`, 200→`200.000 ₫`,
  1500→`1.500.000 ₫`.
- [ ] `[AUTO]` Chance/Khí Vận Card IDs unique, Vietnamese content/effects/destinations
  valid; draw/rotate/jail-free source behavior deterministic with injected shuffle.

## v2 → v3 reset

- [ ] `[PG]` v2 IN_PROGRESS room resets transactionally to a fresh v3
  `IN_PROGRESS` turn while preserving room/code, stable IDs, join order/name/color/
  ready, host and active session hashes; old gameplay/offers/deadlines clear.
- [ ] `[SOCKET][PG]` Starting roll chooses only the first Player and rotates existing
  cyclic Seat order; existing tokens resume the same Seats with no session cascade.
- [ ] `[PG]` Reset rerun is idempotent and malformed/mid-failure transaction cannot
  leave mixed v2/v3 state.
