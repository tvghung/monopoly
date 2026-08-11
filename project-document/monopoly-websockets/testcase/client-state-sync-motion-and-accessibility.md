# Checklist — client session state, sync, motion và accessibility

## Automated evidence

- `[CLIENT]` `apps/client/src/App.test.tsx`.
- `[CLIENT]` `apps/client/src/components/Lobby.test.tsx`.
- `[CLIENT]` `apps/client/src/playerSessionStorage.test.ts`.

## Checklist

- [ ] App does not enter Lobby/Board before join/resume success ACK.
- [ ] Startup token shows restoring state rather than flashing JoinForm.
- [ ] Reconnecting keeps last snapshot visible and disables all mutation controls.
- [ ] Retryable errors preserve token; terminal session errors clear invalid record.
- [ ] Pending activation losing the lobby-capacity/start race clears its token on
  `ROOM_FULL`/`GAME_ALREADY_STARTED` rather than retrying a dead admission.
- [ ] `session replaced` stops old tab without clearing token used by new tab.
- [ ] Stale public revision is ignored; committed newer revision replaces state.
- [ ] Player role sees lobby/game actions; spectator sees banner/read-only gameplay
  controls while room chat remains available.
- [ ] Pending offers restore/key by `offerId`; countdown derives from `expiresAt`.
- [ ] StrictMode does not duplicate connect/update/private-offer listeners or timers.
- [ ] Token stepped movement, buy prompt and turn marker still wait for settled position.
- [ ] Reduced motion, keyboard focus, labels and error announcements remain usable.
- [ ] Mobile/desktop viewports show Join/Lobby/Board/overlay without hidden critical action.
