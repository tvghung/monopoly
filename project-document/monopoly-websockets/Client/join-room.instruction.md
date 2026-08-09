# Join room

## Định danh màn hình

| Thuộc tính | Giá trị AS-IS |
|---|---|
| Menu | Không có |
| List route | Không có |
| Detail route | Không có |
| URL entry | `/` |
| Điều kiện hiển thị | `joined === false` trong `App` |
| Permission key | Không có |

`joined` là local state của tab trình duyệt, không phải trạng thái route, auth hay permission.

## Code và component path

- Entry DOM và provider toast: `apps/client/src/index.tsx`.
- Chuyển Join/Board, khởi tạo socket và xử lý submit: `apps/client/src/App.tsx`.
- Form: `apps/client/src/components/JoinForm.tsx`.
- Style: `apps/client/src/components/style/JoinForm.css`.
- Kiểu socket/context: `apps/client/src/types.ts`.
- Socket URL và dev proxy: `apps/client/vite.config.ts`.

## Service, state, context và socket

- Không có service hoặc store riêng.
- `JoinForm` giữ local state `name` và `roomId`.
- `App` giữ `joined` và `playerId`; socket được tạo ở module scope.
- Submit gọi `onJoin(trimmedName, room)`; `App.handleJoin` emit `new player` qua `socketFunctions.newPlayer` rồi set `joined` thành `true` ngay.
- `App` nghe:
  - `connect` để cập nhật `playerId` từ `socket.id`.
  - `update` để thay toàn bộ `GameState` trong reducer.
- Contract event nằm tại `packages/shared/src/events.ts`; kiểu context nằm tại `apps/client/src/types.ts`.

## Phạm vi UI

- Tiêu đề và mô tả join room.
- Input `Your name`.
- Input `Room code`.
- Nút `Join game`.
- Sau submit hợp lệ, cùng component tree chuyển sang `Board`; không có navigation hoặc URL mới.

## Luồng hiện tại

1. Người dùng mở SPA và thấy `JoinForm` khi `joined` còn `false`.
2. Nút submit bị disable khi `name.trim()` rỗng.
3. Khi submit, client trim tên; tên rỗng không được gửi.
4. Client trim và uppercase room code; room rỗng thành `LOBBY`.
5. Client emit `new player(name, roomId)`.
6. Client set `joined = true` ngay và render `Board`.
7. Server gửi `update`; `App` thay toàn bộ state và các panel trên Board render theo state đó.

## Rule và caveat

- Cả hai input có `maxLength={20}` ở UI.
- Việc client uppercase/default room chỉ là chuẩn hóa đầu vào phía UI; server vẫn có normalize riêng.
- Không có ACK, success/error event hay màn lỗi join. Việc chuyển sang Board không chứng minh người chơi đã được thêm vào room.
- Nếu game trong room đã bắt đầu, backend hiện không thêm socket mới vào danh sách player; client vẫn ở Board và hoạt động như spectator theo state nhận được.
- Không có listener `disconnect`; `joined` không reset khi mất kết nối. Event `connect` kế tiếp cập nhật `playerId` mới.
- Không lưu name/room vào URL, localStorage hay sessionStorage; reload tạo lại màn Join.
- `window.onbeforeunload` được gắn trong `App`, nên việc rời/reload tab phụ thuộc hành vi cảnh báo mặc định của trình duyệt.
- Không được ghi permission giả cho Join; code không có auth, role hoặc permission key.

## Tài liệu liên quan

- Rule nền Client: [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md)
- Contract socket/state: [`../monopoly.contracts.instructions.md`](../monopoly.contracts.instructions.md), [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Socket player API: [`../Api/socket-player.instruction.md`](../Api/socket-player.instruction.md)
- Vòng đời room: [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md)
- Testcase: [`../testcase/join-room-and-player-lifecycle.md`](../testcase/join-room-and-player-lifecycle.md), [`../testcase/client-state-sync-motion-and-accessibility.md`](../testcase/client-state-sync-motion-and-accessibility.md)

## Quy tắc sửa và checklist kiểm thử

Khi sửa màn này, kiểm tra tối thiểu:

- Tên rỗng và chỉ có khoảng trắng không submit được.
- Tên hợp lệ được trim; giới hạn 20 ký tự vẫn đúng ở client và server.
- Room rỗng vào `LOBBY`; room có chữ thường/khoảng trắng được trim và uppercase.
- Hai browser cùng room nhận cùng state; hai room khác nhau không lẫn state.
- Submit chỉ emit event `new player` với đúng thứ tự `name, roomId`.
- Join room chưa start tạo player; join room đã start hiển thị state spectator đúng AS-IS.
- Mất kết nối/reconnect không làm listener `connect` hoặc `update` bị nhân đôi và `playerId` được cập nhật.
- Reload quay lại JoinForm vì không có persistence.
- Chạy typecheck, build, lint và hai testcase được liên kết ở trên.
