# Join, resume và connection lifecycle

Player-facing product name là **Cờ Tỷ Phú Việt Nam**. Join, restore, reconnect,
replacement, leave/forfeit confirmations và mọi ACK error được render bằng tiếng
Việt. Internal phase/event/error codes vẫn giữ English.

## Định danh màn hình

SPA entry `/`; không có Router/menu/permission key. Join/restore/lobby/board được chọn
bằng application session state, không bằng `socket.id` hay optimistic `joined` flag.

## Code

- `apps/client/src/App.tsx`
- `apps/client/src/playerSessionStorage.ts`
- `apps/client/src/components/JoinForm.tsx`
- `apps/client/src/components/ConnectionOverlay.tsx`
- `apps/client/src/components/SpectatorBanner.tsx`
- Shared types/events/schemas under `packages/shared/src/`

## First join

1. Form trim/validate name và room code.
2. Client emit `join room({name, roomCode})` và ở state `JOINING`.
3. Running game may ACK explicit `SPECTATOR`; spectator gets no Player session/token.
4. Lobby admission ACK returns `PENDING` raw token/expiry; no Seat yet.
5. Client writes versioned record `monopoly.player-session.v3` under the
   selected server authority origin with the canonical room code; a token from
   another LAN host or another explicitly selected room is never sent to this
   endpoint.
6. Client immediately emits `resume session({token})`.
7. Success ACK supplies stable `playerId`, role, public room and pending offers.
8. Only then App renders Lobby/Board.

Two-step activation prevents lost first ACK from consuming a Seat. Lost activation
ACK is resumable because token was stored first.

## Startup/refresh/reconnect

- Startup with stored token enters `RESTORING` before JoinForm.
- A desktop launch with `targetRoomCode` resumes only an exact authority + room
  match; that token wins over its fresh `initialJoin`. A different room, or an
  unscoped V1/V2 token, performs the selected fresh join instead.
- Every new Socket.IO connection resumes token before enabling mutation.
- During transport loss, last snapshot remains visible under `RECONNECTING` overlay;
  actions are disabled.
- `DATABASE_UNAVAILABLE` and network errors retain token for retry.
- Invalid/revoked/expired/room-gone terminal errors clear the invalid local record
  and show safe recovery without silently issuing a fresh `join room`. In desktop
  mode the deliberate recovery action returns to the LAN launcher;
  `GAME_ALREADY_STARTED`/`ROOM_FULL` during the pending activation race are also
  terminal for that admission token and clear it.
- `session replaced` moves old tab to terminal `REPLACED`, stops reconnect and does
  not clear shared localStorage.

## Duplicate/role rules

- Newest valid connection for a token wins.
- Reconnect preserves stable Player/Seat/host/ready/assets.
- Valid Player token is resolved before spectator branch.
- Join without valid token after start is an explicit read-only gameplay spectator;
  the bound spectator may still use room chat.
- Spectator has no durable identity/token; a temporary transport reconnect reissues
  the remembered room request and receives a fresh spectator admission.
- Refresh never derives identity from a new `socket.id`.
- Desktop Host/Join resolves the endpoint before creating the gameplay socket.
  Host admission still uses the ordinary `join room` → `resume session` flow;
  the host runtime never creates a room or player directly.
- Configured-server Join uses the supplied valid HTTP/HTTPS endpoint as
  informational, keeps the room code editable, and does not apply private-LAN
  address normalization.

## Explicit leave

`leave room` has success ACK. Only after success does client clear its Player token
or in-memory spectator request. Desktop Player, spectator, and hosting leave stop
local advertising when applicable, disconnect the gameplay socket, and return to
the LAN launcher without stopping the host runtime. Web leave returns to JoinForm.
In-game Player requires explicit forfeit confirmation. Browser close, refresh and
network loss are not leave.

## Security

- Never put token in URL, public state, error text, log or DOM.
- Room code/name/public player ID are not credential.
- Client-side storage is versioned as V3, stores canonical room codes, and rejects
  malformed entries safely. V1/V2 migrations remain unscoped until a successful
  authoritative resume supplies the room code.
- Legacy V2 cleanup preserves its `authority -> token` wire shape; V3 writes
  refresh existing authority order before the eight-entry retention limit.

## Required tests

- No optimistic Board/Lobby transition.
- Pending token is stored before resume; lost ACK recovery.
- Refresh/new socket returns same stable Player.
- Invalid/revoked/retryable errors handle storage correctly.
- Newest-wins/old tab does not clear token.
- Spectator versus valid reconnect after start.
- StrictMode listener cleanup and mutation controls disabled while reconnecting.
