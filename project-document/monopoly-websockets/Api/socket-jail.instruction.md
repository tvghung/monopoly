# Jail Socket instruction

`pay bail` and `use jail card` remain no-business-payload typed commands for the
authenticated current jailed Player. Spectator/other player/blocking state fails.

- `pay bail`: enqueue/settle 50-unit BANK claim, clear jail only after payment, then
  Player may roll. Third failed jail roll reuses its persisted dice after forced
  bail settles and moves/resolves without a new roll.
- `use jail card`: choose an authoritative held `GameCardId`, remove it from holder and
  return to end of correct source deck; no client card/source payload.
- Jail doubles are handled by `roll dice`, move/resolve destination and always
  `ADVANCE_TURN` after resolution rather than extra roll.

Jail/card/debt/dice state commits before update/ACK and restores exactly across
reconnect/restart. Tests cover invalid balance/card/state, all three escape paths,
third fail, card source return and save failure.
