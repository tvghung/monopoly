# Trading: open market và private offer

## Định danh màn hình

| Thuộc tính | Giá trị AS-IS |
|---|---|
| Menu | Không có |
| List route | Không có; open market là bảng inline trong Dashboard |
| Detail route | Không có; sell/offer là modal inline |
| Vị trí UI | Dashboard và property card tại entry `/` |
| Permission key | Không có |

Seller/owner/buyer ID được dùng để chọn action UI; đây không phải permission framework.

## Code và component path

- Bảng open market: `apps/client/src/components/MarketPlace.tsx`.
- Modal tạo listing và private offer: `apps/client/src/components/dashboard/SellPrompts.tsx`.
- Modal offer đến owner: `apps/client/src/components/dashboard/IncomingOffers.tsx`.
- State/listener private offer: `apps/client/src/components/dashboard/useIncomingOffers.ts`.
- Mở prompt từ property card: `apps/client/src/components/BackOfCard.tsx`.
- Prompt provider/state: `apps/client/src/components/Board.tsx`, `apps/client/src/sellPromptContext.ts`.
- Toast kết quả: `apps/client/src/components/Toast.tsx`.
- Tên tile trong prompt: `apps/client/src/components/BoardInitState.ts`.
- Style: `apps/client/src/components/style/MarketPlace.css`, `Dashboard.css`, `Toast.css`.

## Service, state, context và socket

- Open market authoritative nằm tại `state.boardState.openMarket` trong `stateContext`.
- `sellPromptContext` giữ `openSale` và `privateSale`, mỗi giá trị gồm `tileID` và `playerId` hoặc `false`.
- `SellPrompts` giữ local `priceInput` và `offer`.
- `useIncomingOffers` giữ local array offer có thêm countdown `timer`.
- Socket event emit:
  - `put on open market` với `{ tileID, playerId, price }`.
  - `remove sale` với tile key dạng string lấy từ `Object.keys(openMarket)`.
  - `make sale` với tile key dạng string.
  - `make offer` với `{ tileID, playerId, price }`.
  - `accept offer` và `decline offer` với offer đang chọn.
- Socket event listen trong `useIncomingOffers`:
  - `offer on prop` thêm offer với timer 20 giây.
  - `offer declined` và `offer accepted` hiển thị toast cho buyer.
- Mọi thay đổi ownership/balance/open market authoritative đến qua `update`.

## Phạm vi UI

- Open market có các cột Seller, Property, Price và action.
- Seller thấy biểu tượng remove trên listing của mình; client khác thấy biểu tượng mua.
- Owner mở modal nhập giá để đưa property lên open market.
- Non-owner mở modal nhập giá private offer từ mặt sau property.
- Owner nhận modal danh sách offer pending với buyer, tile, giá, countdown và Accept/Decline.
- Buyer nhận toast khi offer được accepted hoặc declined.

## Luồng hiện tại

### Open market

1. Owner click `Sell` trên property card; Board set `openSale`.
2. Khi state loaded và `openSale` truthy, SellPrompts render modal.
3. Submit emit listing, reset `priceInput` về 0 và đóng modal ngay.
4. Listing chỉ xuất hiện khi server gửi `update` có entry trong `openMarket`.
5. Seller click remove; người khác click buy; kết quả đến qua `update` và game log.

### Private offer

1. Non-owner click `Make offer`; Board set `privateSale`.
2. Submit emit offer, reset local input và đóng modal ngay.
3. Owner nhận `offer on prop`; hook thêm timer 20 giây và modal IncomingOffers hiện.
4. Accept/Decline xóa local offer theo `tileID` rồi emit action tương ứng.
5. Buyer nhận toast result; nếu accept hợp lệ, toàn room nhận state ownership/balance mới qua `update`.

## Rule và caveat

- Cả input listing và private offer có `type=number`, `min=20` nhưng không có `required`; local giá khởi tạo là 0. HTML constraint không phải validation Socket.IO.
- Server chỉ kiểm tra listing `price > 0`; mức `min=20` là rule UI, không phải rule server.
- Handler `make offer` hiện không validate giá. Handler `accept offer` tin lại `playerId`, `price` và `tileName` trong payload owner gửi; không chặn rõ ràng giá âm/NaN hoặc fabricated offer. Đây là boundary AS-IS cần đọc cùng Api instruction, không được mô tả thành validation đã có.
- Form đóng ngay sau emit, không chờ ACK và không có error message riêng khi server bỏ qua event.
- Open-market buy button không bị disable theo balance ở client; server kiểm tra affordability.
- `playerId` có trong payload prompt, nhưng server hiện lấy identity của actor từ socket cho các kiểm tra cần thiết; không coi ID client gửi là permission.
- Incoming offer countdown là local 20 giây. Không có timestamp/expiry state authoritative từ server cho private offer.
- IncomingOffers dùng `tileID` làm React key; accept/decline filter toàn bộ local offer cùng `tileID`. Nhiều offer đồng thời cho cùng property có thể dùng key trùng và bị xóa cùng lúc theo code hiện tại.
- Countdown filter entry khi timer bằng 0; offer hết hạn chỉ biến mất ở client, không phát event hết hạn.
- Toast tự đóng sau 5 giây theo `ToastProvider`.
- Market iteration bắt đầu từ `Object.keys(openMarket)`; thứ tự hiển thị theo thứ tự key object hiện tại, không có sort riêng.
- Khi private sale được accept, listing cùng tile có thể biến mất trong state server; UI chỉ phản ánh `update` mới.

## Tài liệu liên quan

- Rule nền Client: [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md)
- Rule nền API: [`../monopoly.api.instructions.md`](../monopoly.api.instructions.md)
- Contract trading/state: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Socket trading: [`../Api/socket-trading.instruction.md`](../Api/socket-trading.instruction.md)
- Property economy: [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md)
- Property card nguồn action: [`property-management.instruction.md`](property-management.instruction.md)
- Activity log: [`activity-log-and-chat.instruction.md`](activity-log-and-chat.instruction.md)
- Testcase: [`../testcase/trading-market-and-private-offers.md`](../testcase/trading-market-and-private-offers.md), [`../testcase/property-economy.md`](../testcase/property-economy.md)

## Quy tắc sửa và checklist kiểm thử

Khi sửa trading, kiểm tra tối thiểu:

- Owner mở đúng listing prompt; non-owner mở đúng private-offer prompt.
- Backdrop/close icon đóng modal; click trong card không đóng modal.
- Giá hợp lệ được emit đúng payload; bao phủ cả giá rỗng, 0, âm, dưới min, fractional, NaN/Infinity và ghi nhận đúng guard/rủi ro AS-IS của listing so với private offer.
- Listing chỉ cho seller remove; client khác mua; mua không đủ tiền không đổi ownership/balance.
- Remove, buy và accepted private sale cập nhật openMarket, owner color và balances đúng sau `update`.
- Offer đến đúng owner; accept/decline gửi toast đúng buyer và đúng tile/price/owner name.
- Countdown bắt đầu 20, giảm mỗi giây, xóa offer tại 0 và cleanup interval/listener khi unmount.
- Kiểm tra nhiều offer khác tile và nhiều offer cùng tile theo hành vi AS-IS.
- Listener `offer on prop`, `offer declined`, `offer accepted` không bị đăng ký trùng sau rerender.
- Chạy typecheck, build, lint và testcase được liên kết ở trên.
