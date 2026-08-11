# Lobby, roster, start game và winner

## Định danh

Lobby/Board panels tại `/`; không có route/menu/permission key. Host/current-player
visibility is UX only; server enforces authority.

## Code

- `apps/client/src/components/Lobby.tsx`
- `apps/client/src/components/Dashboard.tsx`
- `apps/client/src/components/dashboard/PlayerList.tsx`
- `apps/client/src/components/dashboard/WinnerBanner.tsx`
- `apps/client/src/App.tsx`

## Lobby behavior

- Public roster shows stable Player, color, host badge, ready and connected state.
- New active Player starts unready; ready persists through reconnect.
- Player may toggle only own ready state through ACKed `set ready`.
- Lobby capacity/start rule is 2–7 active Players, all connected and ready.
- Only host sees/enables authoritative start action. `start game` has no dummy payload
  and waits for success ACK/update.
- New join does not reset existing ready flags; their own false ready blocks start.
- Start is idempotently rejected after room leaves `LOBBY`.

First activated Seat becomes host. Temporary host disconnect only marks disconnected
and blocks start; it does not transfer host. Explicit host leave transfers to the
lowest remaining join order.

## In-game roster/winner

- Player list keys and turn marker use stable IDs.
- Connected is runtime presence projection and may be false after restart until
  session resumes.
- Finished player reason distinguishes bankruptcy and explicit leave/forfeit; UI
  must not label all finished records as bankrupt.
- Winner includes stable `playerId`, name and color and is committed once when room
  transitions to `FINISHED`.
- No rematch/reverse lifecycle is provided.

## Spectator/reconnect

Spectator can view roster/game/chat but cannot ready/start or mutate game. A valid
Player reconnect restores normal Player controls after resume ACK.

## Required tests

- First host, simultaneous join order and deterministic host transfer.
- Ready persistence, connected gating and 2/7 boundaries.
- Non-host/spectator/repeated start rejection.
- Host disconnect/reconnect without transfer.
- Finished reason/winner stable ID and UI.
- Reconnecting disables lobby/game commands.
