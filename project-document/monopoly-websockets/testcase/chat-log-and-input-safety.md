# Checklist — chat, game log và input safety

## Coverage

GameCore sanitization assertions do not by themselves prove Socket role/room routing,
runtime schema or RAM transaction failure behavior.

## Checklist

- [ ] Bound active Player and explicit spectator can chat in current room only.
- [ ] Unauthenticated/cross-room attempt fails; actor label is server-derived stable context.
- [ ] Blank/whitespace/over-500/non-string payload fails through ACK.
- [ ] `<`, `>`, `&`, quotes and script-like payload render as text, never execute.
- [ ] Authoritative game-log markup remains correctly rendered after escaping changes.
- [ ] Structured player-facing role/action/card/payment/forced-sale/bankruptcy activity
  renders in selected VI/EN locale; user names and chat remain unchanged, and every
  amount uses VNĐ formatting. Legacy freeform logs remain as stored for compatibility.
- [ ] Multi-claim `PaymentQueue` and forced-sale continuation append logs in
  deterministic committed order without recovery/retry duplicates.
- [ ] Chat append commits in the RAM transaction before update/success ACK; a failed command discards its draft, so it
  creates no phantom line.
- [ ] Per-socket 750 ms throttle rejects spam attempts with ACK failure.
- [ ] Committed logs preserve ordering through reconnect while the host process lives and retain only
  the newest 500 entries; host process exit loses the log with the room.
- [x] `[CLIENT][AUTOMATED]` Chat bubbles on the sender's card are plain text (markup never becomes elements),
  truncated to 80 characters, only for other players, never replayed after a reset epoch or a sequence restart, hidden
  while the drawer is open, and not held back by the presentation queue; the drawer and its unread count use the
  authoritative chat while gameplay entries follow the presentation (`tickerAndBubbles.test.tsx`, `Log.test.tsx`).
- [x] `[CLIENT][AUTOMATED]` Closing the activity drawer discards a half-typed message, so reopening it never sends
  text the player cannot see (`Log.test.tsx`).
- [ ] Client does not duplicate listeners, auto-retry timed-out chat or report failure as sent.

## OB-12 Power-up activity regression

Check generic reward/REPLACE/automatic receipts with no card metadata in the payload; no receipt for offer/reveal/full-hand wait/decline/failure. Use U02 through checkpoint and Active/Reaction/contextual commands: exact actor/catalog name once, no phantom entry on rollback/skip/denial, no replay on reconnect. A06/reflection credits actual receiver; U04/U10 log activator use plus one unnamed output; U06 accepted logs initiator use and two generic receipts, pending/declined/expired logs neither. Verify 128-event/500-line bounds, two independent identical actions, Host/Guest/spectator, VI/EN text escaping, presentation gate and unchanged OB-7 feedback. Refuse protocol17/older and snapshot15/older under current18/16 contract.


## OB-14 Player colors in the Journal

- [ ] Verify each gameplay actor/target name uses its player ID color, including transfers, teammate development, rescue/revival and Solo winner. Matching names must still use their respective colors; matching text in card names or descriptions stays ordinary.
- [ ] Generic Power-up receipts reveal no card metadata; uses retain exact official card names. CHAT, team/bank names and legacy/freeform strings are unchanged; unknown ID/color stays plain.
- [ ] Switch VI/EN, reopen the Journal and reconnect Host/Guest: same history, identities and order without duplicates or replay. Finished-player colors remain available.
- [ ] Check long unbroken names, identical names, braces and HTML-like characters in wide and phone landscape layouts; no injected HTML, horizontal overflow or unreadable colors on V1 white/V2 paper.
- [ ] Owner Electron UAT is recorded separately from automated Dev checks. Automated formatter/component/contrast coverage lives in `activityText.test.ts`, `Log.test.tsx` and `activityPlayerColor.test.ts`; production browser/packaged Electron checks use `scripts/powerUpActivityAcceptance.check.mjs --player-colors` (add `--native` for Electron).
