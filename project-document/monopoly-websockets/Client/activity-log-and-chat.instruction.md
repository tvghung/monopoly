# Activity log và chat

## Định danh màn hình

| Thuộc tính | Giá trị AS-IS |
|---|---|
| Menu | Không có |
| List route | Không có |
| Detail route | Không có |
| Vị trí UI | Center panel của Board tại entry `/` |
| Permission key | Không có |

## Code và component path

- Log/chat UI: `apps/client/src/components/Log.tsx`.
- Board composition: `apps/client/src/components/Board.tsx`.
- Socket wrapper: `apps/client/src/App.tsx`.
- Log/chat style: `apps/client/src/components/style/Log.css`.
- Server chat handler liên quan: `apps/server/src/socket/chat.ts`.
- Escape/sanitize và append log: `apps/server/src/game/text.ts`.
- State/event contract: `packages/shared/src/types.ts`, `packages/shared/src/events.ts`.

## Service, state, context và socket

- `Log` đọc `state.boardState.logs` và `socketFunctions` từ `stateContext`.
- Local state `chat` giữ nội dung input; `scrollRef` trỏ tới vùng log.
- `getLogActivitySignature()` dùng `[logs.length, logs.at(-1)]`; broadcast tạo array
  mới nhưng giữ nguyên nội dung log không được coi là activity mới.
- Root overlay giữ local active/idle state. Mount, log cuối thay đổi, typing, submit,
  focus hoặc pointer interaction gọi `markActive()`; timeout ref duy nhất chuyển sang
  idle sau `3000ms` và được clear khi unmount.
- Idle chỉ giảm opacity toàn bộ root overlay xuống `0.2` (log, input, nền, border và
  nút `Gửi` cùng fade), không dùng `display:none`/`visibility:hidden` và vẫn nhận
  pointer events để wake ngay.
- Submit có nội dung truthy emit `send chat(message)`, sau đó reset local state và form.
- `send chat` có request-scoped ACK. Server append log trong room command rồi phát committed `update`; client render mảng log mới.
- Server giới hạn một chat attempt mỗi socket trong 750 ms và chỉ giữ 500 log entries
  mới nhất trong durable snapshot.
- Effect theo dõi activity signature và cuộn vùng log xuống `scrollHeight` sau mỗi
  log signature mới. Vùng log vẫn `overflow-y:auto` nhưng ẩn scrollbar ở Firefox và
  Chromium/WebKit.
- Không có chat service, pagination, persistence phía client hoặc channel riêng ngoài room hiện tại.

## Phạm vi UI

- Danh sách activity/game log của room.
- Dòng chat nằm chung trong cùng mảng log với message nghiệp vụ game.
- Input/nút/chat role/loading/empty state đều dùng tiếng Việt.
- Game amounts dùng formatter VNĐ; không còn `$`, `$M` hoặc copy tiếng Anh.
- Animation xuất hiện cho từng dòng log; tắt animation khi user chọn reduced motion.

## Luồng hiện tại

1. Khi state chưa loaded, vùng log hiển thị `Loading...`.
2. Khi loaded, component map toàn bộ `boardState.logs` thành các dòng `<p>`.
3. Activity signature mới làm overlay sáng lại, reset countdown và auto-scroll xuống cuối.
4. Sau đúng 3 giây không có activity, root overlay chuyển opacity về `0.2`.
5. Người dùng nhập chat và submit; typing hoặc pointer/focus interaction cũng wake overlay.
6. Nếu chuỗi local `chat` truthy, client emit `send chat` nguyên giá trị đang có.
7. Client xóa input sau emit; ACK failure được App hiển thị qua toast và không tự retry message.
8. Server escape nội dung do người dùng gửi, ghép authoritative actor markup, commit log và emit `update` cho room.
9. Client render dòng mới, wake overlay và auto-scroll.

## Rule và caveat

- Client UI validation không phải safety boundary. Runtime schema server từ chối chuỗi rỗng/chỉ khoảng trắng và message trên 500 ký tự.
- Chat gửi nhanh hơn 750 ms bị ACK failure; giới hạn log 500 dòng có nghĩa các dòng
  cũ nhất bị loại khi server append dòng mới.
- Log render bằng `dangerouslySetInnerHTML` vì server đưa markup màu/tên vào log. An toàn hiện tại phụ thuộc mọi dữ liệu do người dùng kiểm soát tiếp tục được escape/sanitize ở server.
- Server hiện escape chat text và sanitize player name; nếu đổi format/nguồn log phải kiểm tra lại boundary này trước khi render HTML.
- Component dùng array index làm React key cho log line; code hiện append log theo thứ tự.
- Disconnected client khóa form; failure ACK không tạo phantom log entry dù input local đã được xóa.
- Idle overlay không khóa input/nút; pointer interaction trên overlay mờ phải wake lại ngay.
- Actor là stable authenticated Player hoặc explicit spectator label, không lấy từ client payload/socket ID.
- Active player, finished player và socket khác có thể nhận nhãn người gửi khác nhau từ server; client không tự xác định role đó.
- Không có route detail, permission key, message edit/delete hoặc history pagination.
- Các action game khác cũng append vào cùng log; thay schema log ảnh hưởng nhiều GameCore module.
- Card/turn/payment/bankruptcy log giữ deterministic order từ committed
  `PaymentQueue`/continuation; Client không tự dựng translated gameplay result.

## Tài liệu liên quan

- Rule nền Client: [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md)
- Rule nền API: [`../monopoly.api.instructions.md`](../monopoly.api.instructions.md)
- Contract state/event: [`../monopoly.contracts.instructions.md`](../monopoly.contracts.instructions.md), [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Socket chat: [`../Api/socket-chat.instruction.md`](../Api/socket-chat.instruction.md)
- Room lifecycle/log actor: [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md)
- Gameplay log nguồn: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md), [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md)
- Testcase: [`../testcase/chat-log-and-input-safety.md`](../testcase/chat-log-and-input-safety.md), [`../testcase/client-state-sync-motion-and-accessibility.md`](../testcase/client-state-sync-motion-and-accessibility.md)

## Quy tắc sửa và checklist kiểm thử

Khi sửa activity log/chat, kiểm tra tối thiểu:

- Chat rỗng/chỉ khoảng trắng/quá 500 ký tự không trở thành committed log.
- Message bình thường tới đúng room và không rò sang room khác.
- Active player, finished player và spectator nhận đúng label/name/color hiện tại.
- Payload chứa `<`, `>`, `&`, quote và script-like text chỉ hiển thị như text, không thực thi HTML/script.
- Game-generated markup vẫn render đúng sau mọi thay đổi sanitize/render.
- Input được xóa sau submit và log auto-scroll khi có dòng mới.
- Overlay active ban đầu, idle sau đúng `3000ms`, wake khi có log mới/typing/submit/focus/pointer;
  state broadcast giữ nguyên `[count,last]` không reset timer.
- Log body còn scroll được bằng wheel/touchpad nhưng không có vertical scrollbar nhìn thấy.
- Nhiều log liên tiếp giữ đúng thứ tự và không mất dòng khi committed public snapshot đến.
- Reduced-motion không chạy entry animation.
- Listener `update` không bị nhân đôi sau rerender/reconnect.
- Audit không còn player-facing English/USD trong chat hoặc game-generated log.
- Chạy typecheck, build, lint và testcase được liên kết ở trên.
