# Jail Socket instruction

`pay bail` and `use jail card` remain no-business-payload typed commands for the
authenticated current jailed Player. Spectator/other player/blocking state fails.

- `pay bail`: require balance >= shared `BAIL_AMOUNT=25`, deduct directly, clear
  jail and let the Player roll. An unaffordable bail attempt is a conflict with no
  mutation; it never opens a compulsory payment queue.
- `use jail card`: choose an authoritative held `GameCardId`, remove it from holder and
  return to end of correct source deck; no client card/source payload.
- Jail doubles are handled by `roll dice`, move/resolve destination and always
  hand off after resolution rather than granting an extra roll. A failed jail roll
  auto-handoffs; `wait in jail` remains only for protocol compatibility and is not
  exposed as a client action.

Jail/card/dice state commits before update/ACK and restores exactly across
reconnect/restart. Tests cover invalid/exact balance, duplicate/stale bail, card
state, compatibility wait, double escape, opponent-round counter and card source
return.
