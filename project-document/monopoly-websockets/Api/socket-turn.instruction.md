# Turn, payment và bankruptcy Socket instruction

## Events

| Event | Payload | Authoritative mutation |
| --- | --- | --- |
| `roll dice` | none | current Player 2d6; movement/jail/doubles/full resolution |
| `buy property` | none | current `TurnInfo.pendingPropertyDecision`; revalidate/fund/award |
| `settle debt` | none | apply current debtor funds to active `DebtClaim`, then continue queue |
| `declare bankruptcy` | none | current active-claim debtor confirms correct creditor pipeline |

All require authenticated active Player, strict argument/ACK shape and room
`IN_PROGRESS`. `settle debt`/`declare bankruptcy` actor must equal
`PaymentQueue.orderedClaims[activeClaimIndex].debtorPlayerId`.

## Roll/continuation

- Reject if wrong turn, winner, auction, payment or blocking
  `TurnInfo.pendingPropertyDecision`.
- Server produces dice and updates `doublesStreak`. Third consecutive doubles goes
  direct jail without movement. Jail doubles never creates extra roll.
- Tile/card/payment/buy/auction resolution calls domain `completeTurnResolution`;
  handler does not directly handoff. `EXTRA_ROLL` clears roll gate for same Player;
  `ADVANCE_TURN` hands off once.

## Buy/debt/bankruptcy

- Buy revalidates canonical property/price/balance, applies award and continuation.
  Decline belongs to auction module.
- `settle debt` pays only active claim and preserves ordered cyclic queue/
  `activeClaimIndex`; no client amount/creditor payload.
- `declare bankruptcy` selects PLAYER versus BANK from active claim, never client
  input. PLAYER transfer uses `BANKRUPTCY_TO_PLAYER`; BANK uses return/Bank auction
  queue. Winner/finished transition occurs after assets/queue references reconcile.

## Durability/recovery

Doubles, dice required by jail third-fail, pending decision/continuation, payment,
Bank auction queue and recovery deadline persist in snapshot v2. Reconnect restores exact state;
stale deadline callback/CAS conflict/save failure cannot advance/apply twice.

## Tests

Actor/role/payload guards; normal/GO/doubles/jail; buy/decline; multi-claim settle;
both bankruptcy creditors; disconnect/restart/save-failure/no-broadcast.
