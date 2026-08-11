# Checklist — start, turn, buy, jail và reconnect grace

## Automated evidence

`[AUTO]` GameCore dice/movement/tile/jail/turn assertions are in
`apps/server/src/game.test.ts`. `[AUTO]` deadline recovery of an expired buy decision
is in `apps/server/src/services/deadlineScheduler.test.ts`. `[SOCKET-INTEGRATION]`
covers host/ready start, an already-offline successor grace, unaffordable buy/bail,
no-payload shape and queued stale-generation rejection; other paths below remain
separate requirements.

## Start

- [ ] Only host starts `LOBBY`; 2–7 active Players all connected/ready.
- [ ] Non-host, spectator, one Player, offline/unready roster and repeated start fail.
- [ ] Start has no dummy payload and commits status/first turn once.

## Roll/buy/tile/jail

- [ ] Stable current Player alone can roll once; dice/movement are server-authoritative.
- [ ] All tile/rent/tax/card/jail outcomes retain existing domain behavior.
- [ ] Buy has no dummy payload and revalidates unowned tile/balance/current decision.
- [ ] Decline creates durable auction; no decision path deadlocks turn.
- [ ] Pay/card jail action derives actor; invalid balance/card/state fails.
- [ ] Every command ACKs only after commit; failure does not commit a revision or broadcast.

## Current-player disconnect

- [ ] Disconnect persists the configured guarded marker (default 60 seconds) without
  deleting Player/state.
- [ ] A command handing the turn to an already-offline Player arms the same grace at
  the centralized commit boundary.
- [ ] Reconnect committed before expiry clears marker and preserves exact turn/jail/buy state.
- [ ] Expiry on buy decision starts auction; otherwise advances turn.
- [ ] Active auction owns progression and ignores generic grace callback.
- [ ] Reconnect-expiry race follows serialized commit order; stale recovery rolls
  back without revision/update and cannot reapply the turn effect.
- [ ] Server restart restores/processes genuine deadline exactly once and does not create
  artificial grace solely because process restarted.
