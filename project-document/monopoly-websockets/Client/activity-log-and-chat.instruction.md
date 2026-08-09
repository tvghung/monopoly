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
- Submit có nội dung truthy emit `send chat(message)`, sau đó reset local state và form.
- Không có event chat response riêng. Server append log rồi emit `update`; client render mảng log mới.
- Effect theo dõi `state.boardState.logs` và cuộn vùng log xuống `scrollHeight` sau mỗi thay đổi.
- Không có chat service, pagination, persistence phía client hoặc channel riêng ngoài room hiện tại.

## Phạm vi UI

- Danh sách activity/game log của room.
- Dòng chat nằm chung trong cùng mảng log với message nghiệp vụ game.
- Input `Write message...` và nút `Send`.
- Animation xuất hiện cho từng dòng log; tắt animation khi user chọn reduced motion.

## Luồng hiện tại

1. Khi state chưa loaded, vùng log hiển thị `Loading...`.
2. Khi loaded, component map toàn bộ `boardState.logs` thành các dòng `<p>`.
3. Mỗi lần mảng log đổi, vùng log auto-scroll xuống cuối.
4. Người dùng nhập chat và submit.
5. Nếu chuỗi local `chat` truthy, client emit `send chat` nguyên giá trị đang có.
6. Client xóa input ngay, không chờ ACK.
7. Server escape nội dung do người dùng gửi, ghép name/color markup, append timestamped log và emit `update` cho room.
8. Client render dòng mới và auto-scroll.

## Rule và caveat

- Client không trim chat. Chuỗi chỉ gồm khoảng trắng vẫn truthy và được emit theo code hiện tại.
- Client không đặt `maxLength` và không sanitize nội dung trước emit.
- Log render bằng `dangerouslySetInnerHTML` vì server đưa markup màu/tên vào log. An toàn hiện tại phụ thuộc mọi dữ liệu do người dùng kiểm soát tiếp tục được escape/sanitize ở server.
- Server hiện escape chat text và sanitize player name; nếu đổi format/nguồn log phải kiểm tra lại boundary này trước khi render HTML.
- Component dùng array index làm React key cho log line; code hiện append log theo thứ tự.
- Form reset và local state xóa ngay cả khi server bỏ qua event hoặc socket mất kết nối; không có pending/error/retry UI.
- Active player, finished player và socket khác có thể nhận nhãn người gửi khác nhau từ server; client không tự xác định role đó.
- Không có route detail, permission key, message edit/delete hoặc history pagination.
- Các action game khác cũng append vào cùng log; thay schema log ảnh hưởng nhiều GameCore module.

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

- Chat rỗng không emit; xác nhận hành vi AS-IS với chuỗi chỉ có khoảng trắng.
- Message bình thường tới đúng room và không rò sang room khác.
- Active player, finished player và spectator nhận đúng label/name/color hiện tại.
- Payload chứa `<`, `>`, `&`, quote và script-like text chỉ hiển thị như text, không thực thi HTML/script.
- Game-generated markup vẫn render đúng sau mọi thay đổi sanitize/render.
- Input được xóa sau submit và log auto-scroll khi có dòng mới.
- Nhiều log liên tiếp giữ đúng thứ tự và không mất dòng khi full-state update đến.
- Reduced-motion không chạy entry animation.
- Listener `update` không bị nhân đôi sau rerender/reconnect.
- Chạy typecheck, build, lint và testcase được liên kết ở trên.
