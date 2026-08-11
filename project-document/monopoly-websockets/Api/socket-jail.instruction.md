# Jail Socket instruction

## Events/authority

`pay bail` and `use jail card` have no business payload and use typed ACK. Actor is
authenticated stable current Player; spectators/other players fail.

- Pay bail revalidates jailed state and at least 50 balance, clears jail/rounds and
  deducts money.
- Use card revalidates jailed state and positive card count, decrements card and
  clears jail/rounds.
- Jail dice flow remains under `roll dice`/GameCore.

## Durability/reconnect

Jail state, balance, card count and current turn commit before update/ACK. Temporary
disconnect preserves them. Reconnect within turn grace resumes exact state; expiry
follows current-turn recovery policy. Database failure emits no false success/update.

## Tests

Wrong player/role/state/balance/card rejection; committed valid mutation; reconnect
and server restart preservation; ACK/save-failure behavior.
