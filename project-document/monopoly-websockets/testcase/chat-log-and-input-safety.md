# Checklist — chat, game log và input safety

## Coverage

GameCore sanitization assertions do not by themselves prove Socket role/room routing,
runtime schema or PostgreSQL failure behavior.

## Checklist

- [ ] Bound active Player and explicit spectator can chat in current room only.
- [ ] Unauthenticated/cross-room attempt fails; actor label is server-derived stable context.
- [ ] Blank/whitespace/over-500/non-string payload fails through ACK.
- [ ] `<`, `>`, `&`, quotes and script-like payload render as text, never execute.
- [ ] Authoritative game-log markup remains correctly rendered after escaping changes.
- [ ] Chat append commits before update/success ACK; DB failure creates no phantom line.
- [ ] Per-socket 750 ms throttle rejects spam attempts with ACK failure.
- [ ] Committed logs preserve ordering through reconnect/server restart and retain only
  the newest 500 entries.
- [ ] Client does not duplicate listeners, auto-retry timed-out chat or report failure as sent.
