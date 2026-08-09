# Property detail và quản lý tài sản

## Định danh màn hình

| Thuộc tính | Giá trị AS-IS |
|---|---|
| Menu | Không có |
| List route | Không có |
| Detail route | Không có; detail mở inline bằng click tile |
| Vị trí UI | Mặt sau tile trên Board tại entry `/` |
| Permission key | Không có |

Owner/non-owner và các điều kiện build/mortgage là state guard, không phải permission key.

## Code và component path

- Chuyển mặt trước/mặt sau tile: `apps/client/src/components/Tile.tsx`.
- Nội dung detail và action property: `apps/client/src/components/BackOfCard.tsx`.
- Context lật tile: `apps/client/src/cardFlipContext.ts`.
- Context mở modal sale/offer: `apps/client/src/sellPromptContext.ts`, provider tại `apps/client/src/components/Board.tsx`.
- Dữ liệu card hiển thị: `apps/client/src/components/backOfCards.ts`.
- Dữ liệu rule property: `packages/shared/src/tileState.ts`.
- State types: `packages/shared/src/types.ts`.
- Style: `apps/client/src/components/style/BackOfCard.css`, `Board.css`.

## Service, state, context và socket

- `BackOfCard` đọc `state`, `playerId`, `socketFunctions` từ `stateContext`.
- `cardFlipContext` cung cấp card đang mở; `BackOfCard` lấy dữ liệu card theo tile `id`.
- `sellPromptContext` cung cấp `handlePutOpenMarket` và `handleMakeOffer` để mở modal trading.
- `ownership` là local state được đồng bộ từ `state.boardState.ownedProps[id]` trong effect.
- Socket event emit trực tiếp:
  - `build house(tileID)`.
  - `sell house(tileID)`.
  - `mortgage property(tileID)`.
  - `unmortgage property(tileID)`.
- Click `Sell` hoặc `Make offer` chưa emit ngay; nó mở prompt trong trading flow.
- Kết quả property action đến qua event `update` toàn state.

## Phạm vi UI

- Tên, màu, giá, base rent, rent tier, house cost/mortgage text từ card data.
- Trạng thái `MORTGAGED` và house/hotel từ `ownedProps` realtime.
- Với property thuộc người khác: nút `Make offer`.
- Với property của player hiện tại: `Build`, `Sell house`, `Mortgage`/`Unmortgage`, `Sell` tùy loại và state.
- Special tile vẫn có mặt sau thông tin nhưng không có owner action khi không có ownership.

## Luồng hiện tại

1. Click mặt trước tile dispatch `FLIP_CARD`; một tile được mở tại một thời điểm.
2. `BackOfCard` xác định owner từ `ownedProps[id]` và tile rule từ shared `tileState[id]`.
3. Nếu property thuộc player khác, UI cho mở private-offer prompt.
4. Nếu property thuộc player hiện tại:
   - Street chưa mortgage render `Build` và `Sell house`.
   - Property chưa mortgage render `Mortgage`.
   - Property đã mortgage render `Unmortgage`.
   - Luôn render `Sell` để mở open-market prompt.
5. Click build/sell-house/mortgage/unmortgage dừng propagation để card không bị đóng và emit event tương ứng.
6. Server validate, mutate state và gửi `update`; UI cập nhật balance/ownership/building/mortgage.

## Rule hiển thị action

- `canBuild` cần:
  - Tile là street có `houseCost`.
  - Player sở hữu toàn color group.
  - Không property nào trong group bị mortgage.
  - Tile hiện tại chưa mortgage, có dưới 5 level building, đang ở mức thấp nhất group và đủ tiền.
- `canSellHouse` cần street, có building và tile đang ở mức cao nhất group.
- `canMortgage` cần tile chưa mortgage và chính tile đó có 0 building.
- `canUnmortgage` cần tile đang mortgage và balance đủ chi phí `ceil(half price * 1.1)`.
- House level `5` được render là hotel.

## Caveat dễ sai

- Các rule enable/disable ở client chỉ mirror rule. Socket handler/GameCore vẫn là nguồn authoritative và có thể bỏ qua event.
- Property economics dùng `packages/shared/src/tileState.ts`; card text dùng `backOfCards.ts`. Hai nguồn có dữ liệu lặp và phải giữ đúng tile index.
- Tên/giá còn lặp trong `BoardInitState.ts`; xem caveat tile 28 trong [`game-board.instruction.md`](game-board.instruction.md).
- Nút `Sell` mở listing cho mọi property do player sở hữu theo code hiện tại; client không chặn theo mortgage/building/open-listing.
- Nút `Make offer` không kiểm tra balance hoặc giá tại thời điểm mở prompt.
- `ownership` được cập nhật trong effect, nên visibility action phụ thuộc chu kỳ render sau khi `ownedProps` đổi.
- Card detail không có URL/deep link và click ngoài card sẽ đóng nó.
- Không thêm permission/role vào tài liệu nếu code chỉ so sánh owner ID với `playerId`.

## Tài liệu liên quan

- Rule nền Client: [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md)
- Rule nền GameCore: [`../monopoly.game-core.instructions.md`](../monopoly.game-core.instructions.md)
- Board và tile data: [`game-board.instruction.md`](game-board.instruction.md), [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md)
- Socket building: [`../Api/socket-building.instruction.md`](../Api/socket-building.instruction.md)
- Property economy: [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md)
- Trading UI: [`trading-market.instruction.md`](trading-market.instruction.md)
- Contract state/event: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Testcase: [`../testcase/property-economy.md`](../testcase/property-economy.md), [`../testcase/shared-contracts-and-board-data.md`](../testcase/shared-contracts-and-board-data.md)

## Quy tắc sửa và checklist kiểm thử

Khi sửa property card/action, kiểm tra tối thiểu:

- Card mở đúng tile index và chỉ một card mở; click ngoài đóng card.
- Owner, non-owner và unowned property thấy đúng nhóm action.
- Build chỉ bật khi sở hữu đủ group, build đều, không mortgage, dưới hotel và đủ tiền.
- Sell house chỉ bật tại tile có mức building cao nhất group; refund/state cập nhật đúng.
- Mortgage/unmortgage enable đúng theo building, mortgage state, balance và chi phí.
- House 1–4 và hotel level 5 hiển thị đúng cả mặt trước lẫn detail.
- Event mang đúng numeric `tileID`; server từ chối event không hợp lệ mà không làm lệch UI state.
- Bán/open market và private offer mở đúng prompt, không đồng thời làm đóng card ngoài ý muốn.
- Kiểm tra đồng bộ `tileState.ts`, `BoardInitState.ts`, `backOfCards.ts` khi đổi metadata.
- Chạy typecheck, build, lint và testcase được liên kết ở trên.

