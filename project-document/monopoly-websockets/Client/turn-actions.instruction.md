# Turn actions: dice, mua property và jail

## Định danh màn hình

| Thuộc tính | Giá trị AS-IS |
|---|---|
| Menu | Không có |
| List route | Không có |
| Detail route | Không có |
| Vị trí UI | Các panel/modal trong Board tại entry `/` |
| Permission key | Không có |

Điều kiện đúng lượt, chưa roll, đang ở jail hoặc `canBuyProp` là state guard của UI; chúng không phải permission.

## Code và component path

- Dice và nút roll: `apps/client/src/components/Dice.tsx`.
- Tính token arrived/settled và delayed turn marker: `apps/client/src/components/Dashboard.tsx`.
- Modal buy/decline-to-auction: `apps/client/src/components/dashboard/BuyPrompt.tsx`.
- Panel jail: `apps/client/src/components/dashboard/JailPanel.tsx`.
- Display position: `apps/client/src/useSteppedPositions.ts`, `apps/client/src/displayPositionsContext.ts`.
- Socket function wrapper: `apps/client/src/App.tsx`.
- State/event types: `packages/shared/src/types.ts`, `packages/shared/src/events.ts`.

## Service, state, context và socket

- Các component đọc `state`, `playerId` và `socketFunctions` từ `stateContext`.
- Dice đọc thêm `displayPositionsContext` để xác định tất cả token đã settled.
- Dashboard truyền `tokenArrived` vào `BuyPrompt` cho riêng player hiện tại.
- Socket event emit:
  - `roll dice` từ nút `Roll Dice`.
  - `buy property` với payload literal `true` từ `Buy property`.
  - `decline property` từ `Auction it instead`.
  - `pay bail` từ `Pay $50M bail`.
  - `use jail card` từ nút dùng thẻ.
- Không có response event riêng cho các action trên; kết quả UI đến qua event `update` thay toàn bộ `GameState`.

## Phạm vi UI

- Nút roll, hai khối xúc xắc 3D, tổng kết quả và nhãn double.
- Modal mua property khi player vừa đáp xuống property chưa có chủ.
- Lựa chọn mua hoặc chuyển property sang auction.
- Panel jail với lựa chọn roll double, trả bail hoặc dùng Get Out Of Jail Free card.

## Luồng hiện tại

### Roll dice

1. Dice chỉ render panel khi `state.loaded && playerId`; trước đó hiển thị `loading...`.
2. `canRoll` chỉ true khi `currentPlayer.id === playerId`, `hasMoved === false` và mọi display position khớp authoritative position.
3. Click emit `roll dice`; client không tự sinh số và không tự di chuyển player.
4. Server cập nhật `diceValue`, position, turn info và gửi `update`.
5. UI render hai mặt dice, tổng và nhãn `DOUBLE` nếu hai giá trị bằng nhau và lớn hơn 0.

### Mua hoặc từ chối property

1. Server đặt `turnInfo.canBuyProp` sau khi resolve landing tile.
2. Modal chỉ hiện khi state loaded, đúng player hiện tại, `canBuyProp` truthy và token hiển thị đã tới tile đích.
3. `Buy property` emit `buy property(true)`.
4. `Auction it instead` emit `decline property`; auction sau đó được điều khiển bởi state server.

### Jail

1. Panel chỉ hiện khi state loaded, đúng lượt của socket hiện tại và player có `isJail`.
2. Player vẫn có thể dùng Dice để thử roll double.
3. Nút bail bị disable khi balance dưới 50.
4. Nút dùng jail card chỉ render khi `getOutOfJailCards > 0`.
5. Kết quả mọi action đến qua `update`.

## Rule và caveat

- Server là nguồn authoritative cho dice, movement, mua property, auction và jail. Không chuyển các phép kiểm tra này thành logic client-only.
- Roll bị trì hoãn đến khi animation token trước hoàn tất; thay movement timing ảnh hưởng trực tiếp việc bật nút.
- Buy prompt cũng bị trì hoãn theo token của chính player, dù `turnInfo.canBuyProp` đã đến từ server.
- `currentPlayer` có thể đã đổi trong state server khi token còn đang đi; Dashboard cố ý giữ marker cũ đến khi tất cả token settled.
- Dice spin counter chỉ tăng khi cặp chuỗi `dice1-dice2` thay đổi. Hai lần liên tiếp ra đúng cùng một cặp không tăng counter theo code hiện tại.
- Bail button chỉ mirror điều kiện balance; server vẫn kiểm tra player, lượt, trạng thái jail và tiền.
- Không có client error/feedback riêng khi action bị server bỏ qua; người dùng chỉ thấy state/log sau `update`.
- Không có permission key hoặc host role cho các hành động theo lượt.

## Tài liệu liên quan

- Rule nền Client: [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md)
- Rule nền API: [`../monopoly.api.instructions.md`](../monopoly.api.instructions.md)
- Rule nền GameCore: [`../monopoly.game-core.instructions.md`](../monopoly.game-core.instructions.md)
- Contract state/event: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Socket turn: [`../Api/socket-turn.instruction.md`](../Api/socket-turn.instruction.md)
- Socket jail: [`../Api/socket-jail.instruction.md`](../Api/socket-jail.instruction.md)
- Socket auction: [`../Api/socket-auction.instruction.md`](../Api/socket-auction.instruction.md)
- Turn/movement/bankruptcy: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md)
- Tile/card/jail resolution: [`../GameCore/tile-cards-and-jail-resolution.instruction.md`](../GameCore/tile-cards-and-jail-resolution.instruction.md)
- Property economy: [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md)
- Testcase: [`../testcase/turn-movement-buy-and-jail.md`](../testcase/turn-movement-buy-and-jail.md), [`../testcase/client-state-sync-motion-and-accessibility.md`](../testcase/client-state-sync-motion-and-accessibility.md)

## Quy tắc sửa và checklist kiểm thử

Khi sửa panel/action theo lượt, kiểm tra tối thiểu:

- Nút roll chỉ bật đúng player, trước khi đã move và sau khi token settled.
- Client không tự random dice hoặc tự thay authoritative position.
- Mặt dice, tổng và double render đúng cho 1–6 và trạng thái ban đầu 0.
- Buy prompt không hiện trước khi token tới đích; không hiện cho player khác hoặc spectator.
- Buy đủ tiền/thành công, buy không đủ tiền và decline-to-auction phản ánh đúng update/log.
- Player ở jail có thể roll; bail bị disable dưới 50 và hoạt động khi đủ tiền.
- Jail card chỉ hiện khi số thẻ lớn hơn 0 và giảm đúng sau khi dùng.
- Teleport/jail không làm kẹt trạng thái `tokensSettled` hoặc `tokenArrived`.
- Mỗi click chỉ emit đúng một event; không nhân listener sau rerender/reconnect.
- Chạy typecheck, build, lint và testcase được liên kết ở trên.

