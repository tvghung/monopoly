# Chat Socket instruction

## Event/role

`send chat(message)` is available to authenticated Players and explicit spectators
already bound to a room. Runtime schema requires nonblank string up to 500 characters.
It has typed ACK.

Each socket may submit at most one chat attempt per 750 ms. The durable game
log keeps the newest 500 entries, bounding snapshot growth.

## Safety/authority

- Sender label/name/color derives from bound stable Player or spectator context,
  never client payload.
- User-controlled name/message is escaped before insertion into HTML-formatted log.
- CORS/room code are not authentication; unbound sockets cannot select arbitrary room.
- Chat cannot carry actor/player ID.

## Persistence

Chat append is a serialized room command and becomes public only after committed
aggregate update. DB failure returns retryable ACK without a phantom log entry.
Reconnect/restart retains committed logs.

## Tests

Player/spectator labels, room isolation, blank/oversize/malformed payload, HTML/script
escaping, commit-before-update and save-failure behavior.
