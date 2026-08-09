# Live property auction

## Định danh màn hình

| Thuộc tính | Giá trị AS-IS |
|---|---|
| Menu | Không có |
| List route | Không có |
| Detail route | Không có; auction là modal inline |
| Vị trí UI | Dashboard trong Board tại entry `/` |
| Permission key | Không có |

`auction.active`, `auction.passed` và `highestBidder` là state guard cho action UI, không phải permission key.

## Code và component path

- Auction modal: `apps/client/src/components/dashboard/AuctionPanel.tsx`.
- Nguồn khởi tạo auction từ lựa chọn không mua: `apps/client/src/components/dashboard/BuyPrompt.tsx`.
- Dashboard composition: `apps/client/src/components/Dashboard.tsx`.
- Format money: `apps/client/src/components/dashboard/format.ts`.
- Modal motion: `apps/client/src/components/dashboard/useModalMotion.ts`.
- Socket wrapper: `apps/client/src/App.tsx`.
- Auction types: `packages/shared/src/types.ts`.
- Event contract: `packages/shared/src/events.ts`.

## Service, state, context và socket

- `AuctionPanel` đọc `state.boardState.auction`, `playerId` và `socketFunctions` từ `stateContext`.
- Local state `bidInput` giữ giá đang nhập; không có auction service hoặc local countdown.
- Event emit:
  - `decline property` từ BuyPrompt để yêu cầu auction property vừa từ chối.
  - `place bid(amount)` khi submit form bid.
  - `pass bid` khi click `No bid`.
- Timer, participants, passed list, highest bid và winner auction đều đến trong `boardState.auction` qua full-state event `update`.
- Khi server set `auction = null`, modal biến mất.

## Phạm vi UI

- Tên property và list price.
- Highest bid/bidder hoặc trạng thái chưa có bid.
- Countdown giây còn lại.
- Form nhập bid cho participant active.
- Trạng thái leading bid, đã pass hoặc nút `No bid`.
- Watcher message cho client không có trong `auction.active`.

## Luồng hiện tại

1. Current player chọn `Auction it instead` trong BuyPrompt và emit `decline property`.
2. Server tạo auction trong state; `AuctionPanel` render khi `state.loaded && auction`.
3. Mọi client thấy thông tin auction.
4. Client có ID trong `auction.active` thấy form bid.
5. Submit emit numeric `bidInput`, reset local input về 0 và chờ `update`.
6. Nếu player đang dẫn đầu, UI hiện `You have the leading bid.` thay cho nút pass.
7. Nếu player có trong `passed`, UI báo đã decline nhưng form bid vẫn có, cho phép bid lại.
8. Participant chưa lead/chưa pass thấy `No bid`; click emit `pass bid`.
9. Client không active chỉ xem; khi server resolve và set auction null, modal đóng.

## Rule và caveat

- Auction state và countdown là authoritative từ server; client không tự giảm timer.
- Form input có `min={highestBid + 1}` nhưng không có `required`. `bidInput` khởi tạo/reset là 0 và submit handler vẫn emit giá hiện tại; server phải validate bid.
- Điều kiện `active.includes(playerId)` chỉ điều khiển form hiển thị. Backend vẫn xác định actor từ socket và validate balance/auction state.
- `passed` không loại player khỏi `active`; một bid mới có thể đưa player đã pass trở lại cuộc đấu theo state server.
- Player đang leading không có nút pass trong UI hiện tại.
- Modal không có nút đóng/backdrop dismiss; chỉ biến mất theo state auction.
- Client không hiển thị error riêng cho bid thấp, bid vượt balance hoặc pass không hợp lệ; kết quả chỉ thấy qua state/log mới.
- Spectator và player đã rời active list chỉ thấy watcher message.
- Không có route, auth role hoặc permission key cho auction.

## Tài liệu liên quan

- Rule nền Client: [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md)
- Rule nền API: [`../monopoly.api.instructions.md`](../monopoly.api.instructions.md)
- Contract auction/state: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Socket auction: [`../Api/socket-auction.instruction.md`](../Api/socket-auction.instruction.md)
- Auction GameCore: [`../GameCore/auction.instruction.md`](../GameCore/auction.instruction.md)
- Buy/decline flow: [`turn-actions.instruction.md`](turn-actions.instruction.md), [`../Api/socket-turn.instruction.md`](../Api/socket-turn.instruction.md)
- Testcase: [`../testcase/auction.md`](../testcase/auction.md), [`../testcase/turn-movement-buy-and-jail.md`](../testcase/turn-movement-buy-and-jail.md)

## Quy tắc sửa và checklist kiểm thử

Khi sửa auction, kiểm tra tối thiểu:

- Decline property tạo đúng auction và modal xuất hiện cho toàn room.
- Tile name, list price, highest bid/bidder và timer phản ánh đúng state.
- Active participant có form; spectator/non-active chỉ có watcher message.
- Bid phải lớn hơn highest bid và trong balance theo server; giá rỗng, 0, âm và thấp không làm lệch state.
- Submit reset input, không đóng modal trước khi auction kết thúc.
- Leading bidder thấy đúng message và không có `No bid`.
- Pass cập nhật `passed`; bid mới cho phép participant quay lại theo state mới.
- Participant disconnect, leading bidder disconnect và auction còn một người được phản ánh đúng.
- Hết timer chọn đúng winner hoặc kết thúc không winner; modal biến mất khi `auction = null`.
- Chạy typecheck, build, lint và testcase được liên kết ở trên.

