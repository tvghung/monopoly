# Checklist — bankruptcy, forfeit, forced liquidation và winner

## Payment creditor

- [ ] `[AUTO]` Affordable claims settle in ordered `PaymentQueue` order without a
  negative balance; a shortfall exposes deterministic sellable gross values.
- [ ] `[AUTO]` A debtor can sell to Bank in ascending tile order or create one
  snapshot-bound forced-sale proposal; stale/replayed markers are no-ops.
- [ ] `[SOCKET]` If active debtor explicitly leaves, auto-liquidation pays the
  creditor where possible and finished reason remains `LEFT`.

## Bank liquidation

- [ ] `[AUTO]` Forced Bank sale clears ownership and buildings;
  it stops once the active claim is affordable.
- [ ] `[AUTO][PG]` Payment deadline recovery repeats deterministic sales after a
  fresh runtime, then continues later claims or eliminates only after assets end.

## Multi-claim/winner/reference safety

- [ ] `[AUTO]` Multiple debtors/claims/eliminations do not recurse through stale
  IDs, skip active claim or advance turn twice.
- [ ] `[AUTO]` Cleanup reconciles current Player, payment, proposal, private offers
  and deck holders with no dangling stable-ID reference.
- [ ] `[AUTO][SOCKET]` Last active Player becomes stable winner once; room FINISHED,
  all live operation/deadline state clear; bankruptcy and leave reasons differ.
- [ ] `[PG]` Finished/winner history restores and obeys retention; reconnect identity
  and credential privacy remain intact.
- [ ] `[AUTO][CLIENT]` WinnerBanner shows only authoritative winner name, mascot,
  color, final cash, owned-property count, houses and hotel count; level `5` counts
  as one hotel.
- [ ] `[AUTO][SOCKET]` `play again` is host-only and FINISHED-only; it preserves the
  room/code, eligible IDs/appearance/join order/sessions, resets ready and fresh
  gameplay state, revives finished players, excludes `LEFT`, clears offers, and
  permits a second normal start; a one-eligible-host replay remains valid while
  the normal start gate still requires 2–4 active ready Players.
- [ ] `[AUTO][CLIENT]` FINISHED reconnect hydrates the fact-only winner surface;
  replay update resets the existing presentation queue without reversal feedback.
- [ ] `[MANUAL-E2E]` Two-player/four-player finish, host replay, bankrupt return,
  explicit-left exclusion, spectator continuity, reconnect around replay, activity
  readability, reduced motion, WebGL fallback and one full second match.

## Victory dialog (visual overhaul V2, plan 04)

- [x] `[AUTO][CLIENT]` `WinnerBanner.test.tsx`: every role has "Về trang chủ" through the room exit context (spectators and
  non-hosts included), only the authenticated host has "Chơi lại", the primary action comes first in DOM/Tab order, the
  alertdialog is described by the winner and the next step, and a failed leave request (`RoomExitContextValue.error`) is shown
  inside the dialog.
- [x] `[AUTO][CLIENT]` `WinnerBanner.test.tsx`: a player without "Chơi lại" starts on the "Kết quả ván chơi" region (a tab
  stop that lets the keyboard scroll the body), never on "Về trang chủ"; the 128 px hero and `lg` buttons switch to 64 px and `md`
  in `SHORT_VIEWPORT_QUERY`.
- [x] `[AUTO][CLIENT]` `useVictoryVisibility.test.tsx`, `WinnerBanner.test.tsx`: a winner from a live update waits for the
  presentation queue to be idle (8 s fallback); a snapshot/reconnect shows at once; one confetti burst (`VictoryConfetti.test.tsx`,
  ≤ 1200 ms) only on a live appearance and never with reduced motion.
- [x] `[SOCKET]` `socket.integration.test.ts` (V1.1): the winner leaves a finished room (the leave used to fail with `CONFLICT`)
  without liquidation, the host passes to a finished member, the replay excludes the winner, a bankrupt member leaves and the last
  leave deletes the room; `rooms.test.ts` covers the LEFT-winner snapshot rule.
- [ ] `[MANUAL-E2E]` V1.1: on a real LAN game the winner and a bankrupt player press "Về trang chủ" and land on the launcher
  (desktop) or the join form (web) while the host can still replay.
- [ ] `[MANUAL-E2E]` G4: victory dialog at 360–1920 px in Chromium and WebKit (stats legible, others list scrolls on a short
  screen, confetti visible once), reduced motion, and a full replay from the host.
