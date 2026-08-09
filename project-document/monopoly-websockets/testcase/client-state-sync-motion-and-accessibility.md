# Checklist — client state sync, motion và accessibility

## Nguồn hành vi

- [`../Client/README.md`](../Client/README.md)
- [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Code: `apps/client/src/App.tsx`, `apps/client/src/components/Board.tsx`, `apps/client/src/useSteppedPositions.ts`, `apps/client/src/components/Dice.tsx`, `apps/client/src/components/Dashboard.tsx`, `apps/client/src/components/Tile.tsx`, `apps/client/src/components/BackOfCard.tsx`, `apps/client/src/components/Toast.tsx`, `apps/client/src/components/dashboard/useModalMotion.ts`.

## Coverage hiện tại

- `[MISSING-AUTO]` Client package không có test script; state sync, animation, keyboard và screen-reader cases đều chưa có automation.

## Checklist

### State và Socket sync

- [ ] `[MANUAL]` Trước update đầu tiên client có `loaded: false`; sau `update`, reducer thay state bằng payload server và UI render board.
- [ ] `[MANUAL]` `connect` cập nhật `playerId` theo socket id; cleanup gỡ `connect`/`update` listeners khi App unmount.
- [ ] `[MANUAL]` Join submit chuyển từ JoinForm sang Board và emit đúng name/room một lần.
- [ ] `[MANUAL]` Ownership, balance, turn, dice, logs, winner và auction trên hai browser trong cùng room đồng bộ sau mỗi broadcast.
- [ ] `[MANUAL]` Browser room khác không nhận state; refresh tạo socket/seat mới theo lifecycle AS-IS.

### Stepped positions và modal timing

- [ ] `[MANUAL]` Normal forward move 2–12 bước hiển thị từng tile với tick 200 ms và wrap index 39→0 đúng.
- [ ] `[MANUAL]` Teleport/backward hoặc forward distance >12 snap trực tiếp; player join/leave được add/drop không animate.
- [ ] `[MANUAL]` Roll của lượt kế bị disabled cho tới khi mọi displayed position khớp authoritative position.
- [ ] `[MANUAL]` Buy prompt chỉ mở sau khi token current player tới tile đích; Dashboard giữ active-player display cũ cho tới lúc token settle.
- [ ] `[MANUAL]` Dice spin vẫn chạy khi roll mới khác key; cùng cặp dice liên tiếp không tăng spin counter vì key không đổi — ghi nhận AS-IS khi kiểm tra animation.

### Reduced motion

- [ ] `[MANUAL]` Với `prefers-reduced-motion`, từng component đi qua nhánh reduced-motion đã khai báo: dice cube snap; tile/card/log/toast/modal bỏ hoặc rút gọn animation khởi tạo tương ứng.
- [ ] `[AS-IS CAVEAT]` `useSteppedPositions` không đọc reduced-motion preference; normal token walk 200 ms vẫn diễn ra.

### Keyboard/screen reader

- [ ] `[MANUAL]` Join labels liên kết đúng `join-name`/`join-room`; submit disabled khi name rỗng.
- [ ] `[MANUAL]` Native action buttons có thể focus/activate bằng keyboard và trạng thái disabled đúng.
- [ ] `[MANUAL]` Toast có `role=status`; thông báo offer được đọc mà không cần chuyển focus.
- [ ] `[AS-IS CAVEAT]` Tile/back-card và một số market/close actions dùng click handler trên element `role=presentation`; hiện không có keyboard equivalent nhìn thấy trong code.
- [ ] `[AS-IS CAVEAT]` Dashboard modals chưa khai báo `role=dialog`, `aria-modal`, accessible name hoặc focus trap/restore trong code.
- [ ] `[AS-IS CAVEAT]` Nhãn aria cho DOUBLE hiện chỉ là `emoji`, không mô tả kết quả.

## Viewport và edge cases

- [ ] `[MANUAL]` Board, dashboard, modal và toast không che action chính ở viewport desktop và mobile mục tiêu của project.
- [ ] `[MISSING-AUTO]` Chưa có component/browser coverage cho listener cleanup, stepped timer cleanup, prompt gating, reduced motion và keyboard navigation.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; sau đó browser manual vì repo chưa có client/E2E automation.
