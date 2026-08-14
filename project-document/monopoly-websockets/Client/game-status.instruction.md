# Lobby, roster, winner và branding

## Branding/language

- HTML title/metadata/manifest, loading/error/reconnect/replaced screens, join/lobby,
  center board, roster, winner và confirmations dùng “Cờ Tỷ Phú Việt Nam” và tiếng
  Việt. Technical repository/package/event names không cần rename.
- Host=`Chủ Phòng`, Ready=`Sẵn Sàng`, Spectator=`Khán Giả`, Online/Offline và
  bankruptcy/leave reasons đều có Vietnamese copy.

## Lobby/start

- Public roster hiển thị stable ID-backed name/color/host/ready/connected.
- 2–7 active Player, tất cả connected/ready; chỉ host có start action.
- Start success update chứa persisted first-player result từ server dice tie-break;
  UI không tự random/reorder roster.
- Temporary host disconnect không transfer; explicit leave transfer theo join order.

## In-game/finished

- Roster/turn/payment/winner key bằng stable IDs. Temporary disconnect không
  xóa Seat/assets; spectator read-only.
- Finished reason phân biệt `BANKRUPT` và `LEFT`; forfeit confirmation mô tả asset
  destination theo active creditor/Bank nhưng không đổi reason.
- Winner set một lần, room `FINISHED`, không rematch/reverse lifecycle.

## Tests

- Vietnamese branding/copy/metadata and no player-facing English.
- Host/ready/2–7/first-player result/disconnect-transfer behavior.
- Bankruptcy versus forfeit reason, stable winner and reconnect/restart.
