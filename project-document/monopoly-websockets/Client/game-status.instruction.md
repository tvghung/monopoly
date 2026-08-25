# Lobby, roster, winner và branding

## Branding/language

- HTML title/metadata/manifest, loading/error/reconnect/replaced screens, join/lobby,
  center board, roster, winner và confirmations dùng “Cờ Tỷ Phú Việt Nam” và tiếng
  Việt. Technical repository/package/event names không cần rename.
- Host=`Chủ Phòng`, Ready=`Sẵn Sàng`, Spectator=`Khán Giả`, Online/Offline và
  bankruptcy/leave reasons đều có Vietnamese copy.

## Lobby/start

- Public roster hiển thị stable ID-backed name/color/host/ready/connected.
- 2–4 active Player, tất cả connected/ready; chỉ host có start action.
- Start success update chứa persisted first-player result từ server dice tie-break;
  UI không tự random/reorder roster.
- Temporary host disconnect không transfer; explicit leave transfer theo join order.

## In-game/finished/replay

- Roster/turn/payment/winner key bằng stable IDs. Temporary disconnect không
  xóa Seat/assets; spectator read-only.
- Finished reason phân biệt `BANKRUPT` và `LEFT`; forfeit confirmation mô tả asset
  destination theo active creditor/Bank nhưng không đổi reason.
- Winner set một lần, room `FINISHED`, and `WinnerBanner` shows only authoritative
  name/mascot/color/final cash/property/house/hotel facts. Reconnect hydrates this
  surface immediately without replaying stale presentation.
- The existing winner surface exposes `play again` only to the authenticated host.
  The command resets the same room to `LOBBY`; the server reuses canonical fresh
  state, keeps eligible stable IDs/appearance/join order/sessions, revives finished
  players, never revives `LEFT` members, and clears old offers and match state.

## Tests

- Vietnamese branding/copy/metadata and no player-facing English.
- Host/ready/2–4/first-player result/disconnect-transfer behavior.
- Bankruptcy versus forfeit reason, stable winner and reconnect/restart.
