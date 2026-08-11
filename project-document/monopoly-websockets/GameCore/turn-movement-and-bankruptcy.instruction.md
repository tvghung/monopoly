# Turn, movement, bankruptcy, winner và reconnect grace

## Scope

Dice/movement live in `game/dice.ts`; turn/bankruptcy/winner in `game/turn.ts`;
transport/recovery orchestration uses room executor and deadline scheduler.

## Stable-ID invariants

- Turn order/current Player, active/finished maps, ownership/market/auction and winner
  reference stable `PlayerId` values.
- Dice and movement remain server-authoritative; client sends no dice/position.
- `nextTurn` resets moved/buy decision and increments/uses persisted turn number.
- Bankruptcy removes all insolvent players safely without iterating stale keys or
  re-entering into an already-deleted Player.
- Released property becomes unowned; it is not automatically listed on open market.
- Winner includes stable player ID/name/color and is set once when one active Player
  remains, transitioning room to `FINISHED`.

## Current-player disconnect

Temporary disconnect does not delete Player or advance immediately. The disconnect
path and centralized room-commit boundary both re-check the authoritative current
Player; this also covers a command that hands the turn to a Player already offline.
If no active auction owns progression, persist:

```text
{ turnNumber, playerId, deadlineAt = now + RECONNECT_GRACE_MS }
```

`RECONNECT_GRACE_MS` defaults to 60 seconds.

- Reconnect committed before expiry clears marker and preserves exact `hasMoved`,
  `canBuyProp`, jail and position state.
- Expiry recovery captures and then requires the exact turn/player/deadline marker
  under the locked command; stale recovery rolls back and save uses aggregate CAS.
- If waiting to buy, expiry revalidates tile then starts auction.
- Otherwise expiry advances/skips turn; an offline jailed Player's `jailRounds`
  remains unchanged because no jail roll occurred.
- Active auction ignores generic turn-grace callback and follows `endsAt`.
- Process shutdown/restart must not create artificial disconnect grace for all Seats.

## Existing rules

GO reward, dice 2–12, tile resolution, no doubles-extra-turn and bankruptcy threshold
remain governed by current GameCore. Buy initializes unbuilt/unmortgaged ownership.

## Durability

GameCore mutates draft only. Aggregate snapshot/turn recovery commits before public
update. Save failure leaves current room unchanged. Lazy room load resolves due
deadline before returning resume state.

## Tests

- Movement/GO/turn wrap/buy valid and rejected paths.
- Multiple bankrupt players in one balance check does not throw or skip survivor.
- Winner stable ID/set-once and finished reasons.
- Disconnect before/after grace, buy-decision expiry, auction interaction and
  duplicate-recovery safety.
- Restart same DB preserves or resolves turn deadline exactly once.
