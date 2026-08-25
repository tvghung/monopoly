# Chat Socket instruction

## Event/role

`send chat(message)` is available to authenticated Players and explicit spectators
already bound to a room. Runtime schema requires nonblank string up to 500 characters.
It has typed ACK.

Player/spectator labels and all generated player-facing copy are tiếng Việt; game
amounts use VNĐ formatting and no `$`/`$M`. Each socket may submit at most one chat
attempt per 750 ms. The durable compatibility string log keeps the newest 500
entries and V8 keeps a separate bounded typed public activity tail.

## Safety/authority

- Sender label/name/color derives from bound stable Player or spectator context,
  never client payload.
- User-controlled name/message is escaped before insertion into the compatibility
  HTML-formatted log. The typed `CHAT` activity retains plain text and is rendered
  as text by the client.
- CORS/room code are not authentication; unbound sockets cannot select arbitrary room.
- Chat cannot carry actor/player ID.

## Persistence

Chat append is a serialized room command and becomes public only after committed
aggregate update. DB failure returns retryable ACK without a phantom string or
typed activity entry. Reconnect/restart retains the committed public activity tail.

## Tests

Player/spectator labels, room isolation, blank/oversize/malformed payload, legacy
HTML/script escaping, typed text rendering, commit-before-update and save-failure
behavior.
