# Chat Socket instruction

## Event/role

`send chat(message)` is available to authenticated Players and explicit spectators
already bound to a room. Runtime schema requires nonblank string up to 500 characters.
It has typed ACK.

Server compatibility string logs retain their canonical Vietnamese copy; the client
localizes typed activity for VI/EN display. Game amounts use VNĐ formatting and no
`$`/`$M`. Each socket may submit at most one chat attempt per 750 ms; the slot is
consumed when the handler starts, before the actor check and the handler's own payload
parse (a payload rejected earlier by the inbound schema middleware never reaches the
handler and consumes nothing). A throttled attempt gets retryable `CONFLICT`. The
compatibility string log in the room aggregate keeps the newest 500 entries
(`MAX_GAME_LOG_ENTRIES`) and V8 keeps a separate bounded typed public activity tail
(`ACTIVITY_FEED_MAX_EVENTS`). Handler: `apps/server/src/socket/chat.ts`. Chat is not
idempotent: a repeated emit appends another message.

## Safety/authority

- Sender label/name/color derives from bound stable Player or spectator context,
  never client payload.
- The message is escaped with `escapeHtml` before insertion into the compatibility
  HTML-formatted log. The sender name is inserted as stored: it is not escaped at chat
  time but was sanitized at admission (`sanitizeName` in `apps/server/src/game/text.ts`
  strips `<>&"'`). The color comes from the stored player record. The typed `CHAT`
  activity retains plain text and is rendered as text by the client.
- Players pass `requirePlayer`; spectators pass `requireRoom` and are labelled
  `Khán giả`. An eliminated player who is still bound as a Player chats under their
  finished-player name.
- CORS/room code are not authentication; unbound sockets cannot select arbitrary room.
- Chat cannot carry actor/player ID.

## Commit and failure

Chat append is a serialized room command and becomes public only after it is committed
to the in-RAM room aggregate. A failed commit discards the draft and returns retryable
`INTERNAL_ERROR` without a phantom string or typed activity entry and without an
`update`. The committed activity tail survives reconnect while the host process lives
and is lost when the host process exits.

## Tests

- Failed commit: no `update`, retryable `INTERNAL_ERROR`, room unchanged
  (`apps/server/src/socket.integration.test.ts`, "does not revise or broadcast a draft
  when the RAM transaction fails").
- An eliminated, still-revivable 2v2 player may chat
  (`apps/server/src/socket.teamplay.integration.test.ts`).
- `escapeHtml`/`sanitizeName` unit tests (`apps/server/src/game.test.ts`).
- Typed `CHAT` rendering on the client (`apps/client/src/components/Log.test.tsx`,
  `apps/client/src/game/ui/hud/activityText.test.ts`).
- Spectator label, room isolation, blank/oversize payload and the 750 ms throttle at
  socket level: NOT VERIFIED (no Socket.IO test found). Manual checklist:
  [chat-log-and-input-safety](../testcase/chat-log-and-input-safety.md).
