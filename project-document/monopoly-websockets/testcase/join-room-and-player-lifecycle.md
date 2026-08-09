# Checklist — join room và vòng đời player

## Nguồn hành vi

- [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md)
- [`../Api/socket-player.instruction.md`](../Api/socket-player.instruction.md)
- [`../Client/join-room.instruction.md`](../Client/join-room.instruction.md)
- Code: `apps/server/src/rooms.ts`, `apps/server/src/socket/player.ts`, `apps/client/src/components/JoinForm.tsx`.

## Coverage hiện tại

- `[AUTO-EXISTING]` `sanitizeName` strip ký tự markup, trim và cap 20 ký tự trong `apps/server/src/game.test.ts`.
- `[MISSING-AUTO]` Chưa có test cho normalize room, isolation, join/spectator/disconnect/room cleanup.

## Checklist

### Form và normalize

- [ ] `[MANUAL]` Name chỉ có whitespace làm nút Join disabled; name hợp lệ submit được.
- [ ] `[MANUAL]` Room rỗng vào `LOBBY`; chữ thường thành uppercase; ký tự ngoài chữ/số/`-` bị loại; kết quả tối đa 20 ký tự.
- [ ] `[AUTO-EXISTING]` Name có `<>&"'` không giữ ký tự markup; unit test hiện có cover strip/trim/cap.
- [ ] `[MANUAL]` Name sau sanitize rỗng dùng fallback `Player` trong join flow.

### Join và room isolation

- [ ] `[MANUAL]` Player đầu tiên nhận tile 0, balance 1500, chưa jail, `jailRounds = 0`, jail-card count 0.
- [ ] `[MANUAL]` Mỗi socket trước khi hết pool nhận một màu lấy từ room riêng; room khác bắt đầu với pool mới.
- [ ] `[MANUAL]` Hai room A/B không nhận state/log/broadcast của nhau.
- [ ] `[MANUAL]` Gửi lại `new player` từ cùng socket trong cùng room không tạo duplicate player.
- [ ] `[AS-IS CAVEAT]` Player thứ tám trở đi có thể nhận `grey`; code không có player-cap guard.

### Spectator và disconnect

- [ ] `[MANUAL]` Socket join sau khi `gameStarted` không xuất hiện trong active players nhưng nhận state và có thể chat với nhãn Spectator.
- [ ] `[MANUAL]` Disconnect active player xóa player, owned properties và listing của seller; màu được trả vào pool.
- [ ] `[MANUAL]` Disconnect finished player xóa record khỏi `finishedPlayers` và trả màu.
- [ ] `[MANUAL]` Player cuối cùng rời làm room bị xóa; auction interval đang chạy được clear.
- [ ] `[MANUAL]` Disconnect auction participant cập nhật `active`/`passed`; leader rời reset highest bid.
- [ ] `[AS-IS CAVEAT]` Disconnect current player không tự chọn current player mới và không chạy winner check; ghi nhận nguy cơ turn bị kẹt thay vì báo pass.
- [ ] `[AS-IS CAVEAT]` Refresh/disconnect không reconnect lại seat cũ; socket id mới được xem là player mới nếu game chưa start, spectator nếu đã start.

## Negative/edge cases cần automation khi sửa

- [ ] `[MISSING-AUTO]` Raw room id không phải string không throw và fallback `LOBBY`.
- [ ] `[MISSING-AUTO]` Hai room cùng lúc dùng cùng player name nhưng state vẫn cô lập theo socket/room.
- [ ] `[MISSING-AUTO]` Cleanup room không để auction interval tiếp tục emit sau delete.
- [ ] `[MISSING-AUTO]` Repeated `new player` không tiêu thêm màu hoặc reset player state.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`; Socket lifecycle hiện vẫn cần test manual hoặc integration harness riêng.
