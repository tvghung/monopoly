# Checklist — chat, game log và input safety

## Nguồn hành vi

- [`../Api/socket-chat.instruction.md`](../Api/socket-chat.instruction.md)
- [`../Client/activity-log-and-chat.instruction.md`](../Client/activity-log-and-chat.instruction.md)
- Text helpers: `apps/server/src/game/text.ts`.
- Socket/render: `apps/server/src/socket/chat.ts`, `apps/client/src/components/Log.tsx`.

## Coverage hiện tại

- `[AUTO-EXISTING]` `sanitizeName` và `escapeHtml` có unit tests.
- `[MISSING-AUTO]` Chat roles, room isolation, broadcast và DOM/XSS integration chưa có automation.

## Checklist

- [ ] `[AUTO-EXISTING]` Name strip `<>&"'`, trim và cap 20; chat escape `& < > " '` thành entity.
- [ ] `[MANUAL]` Active player chat hiển thị name/color của active player.
- [ ] `[MANUAL]` Finished player còn record chat bằng name/color trong `finishedPlayers`.
- [ ] `[MANUAL]` Socket không thuộc hai nhóm trên chat với nhãn `Spectator` màu grey.
- [ ] `[MANUAL]` Message chỉ broadcast tới room hiện tại, không xuất hiện ở room khác.
- [ ] `[MANUAL]` Client submit message non-empty, clear input và log tự scroll xuống cuối.
- [ ] `[MANUAL]` Timestamp log có format locale time 24 giờ và message mới được append, không thay log cũ.
- [ ] `[MANUAL]` Payload `<img onerror=...>`/`<script>` hiển thị như text, không tạo element hoặc chạy script.
- [ ] `[MANUAL]` Game-generated markup (`bankrupt-message`, chat-name span) vẫn render style vì Log dùng `dangerouslySetInnerHTML`.

## Negative/edge cases cần automation khi sửa

- [ ] `[AS-IS CAVEAT]` Server không trim/cap chat length và không reject whitespace-only message; logs tăng không giới hạn trong room state.
- [ ] `[AS-IS CAVEAT]` Log renderer tin mọi chuỗi state là HTML. Mọi user-controlled field đưa vào log mới phải sanitize/escape trước `sendToLog`.
- [ ] `[MISSING-AUTO]` Chuỗi kết hợp entity/double-encoding không thoát khỏi text context.
- [ ] `[MISSING-AUTO]` Name/chat hostile từ raw Socket client không inject qua color/name/message.
- [ ] `[MISSING-AUTO]` Rapid messages giữ đúng ordering và không rò room.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; XSS/DOM behavior cần browser hoặc integration test.
